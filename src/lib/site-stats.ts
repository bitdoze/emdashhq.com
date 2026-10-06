/*
 * Site stats counters, refreshed at most once a day and read from the
 * `site_stats` table. Sources: the npm downloads API for installs, the
 * official plugin registry for the plugin count, and a manually-kept
 * sites figure. Each row also carries `prev_value`/`prev_at` — a weekly
 * baseline — so the strip can show how much a number grew in a week.
 * The worker's scheduled handler refreshes proactively; page reads
 * refresh lazily when stale so dev works without cron.
 */

export interface SiteStat {
	key: string;
	label: string;
	value: number;
	suffix: string;
	source: "api" | "count" | "manual";
	updatedAt: string | null;
	weekDelta: number | null;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * TTL_MS;
const NPM_DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-month/emdash";
const PLUGIN_REGISTRY_URL = "https://plugins.emdashcms.com/";

const DEFAULT_STATS: Array<Omit<SiteStat, "updatedAt" | "weekDelta">> = [
	{ key: "npm_downloads", label: "npm installs · last 30 days", value: 0, suffix: "", source: "api" },
	{ key: "plugins", label: "plugins in the registry", value: 0, suffix: "", source: "api" },
	{ key: "sites", label: "sites on EmDash", value: 1, suffix: "+", source: "manual" },
];

const KNOWN_KEYS = DEFAULT_STATS.map((s) => s.key);

/* Minimal D1 surface so the lib works without generated binding types. */
interface D1Prepared {
	bind(...args: unknown[]): D1Prepared;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	run(): Promise<unknown>;
}
export interface D1Like {
	prepare(sql: string): D1Prepared;
	batch(statements: D1Prepared[]): Promise<unknown>;
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS site_stats (
	key TEXT PRIMARY KEY,
	label TEXT NOT NULL,
	value INTEGER NOT NULL DEFAULT 0,
	suffix TEXT NOT NULL DEFAULT '',
	source TEXT NOT NULL DEFAULT 'manual',
	updated_at TEXT,
	prev_value INTEGER,
	prev_at TEXT
)`;

async function ensureTable(db: D1Like) {
	await db.prepare(CREATE_TABLE).run();
	// Older installs of the table lack the weekly-baseline columns.
	const { results: cols } = await db.prepare("PRAGMA table_info(site_stats)").all<{ name: string }>();
	const names = new Set(cols.map((c) => c.name));
	if (!names.has("prev_value")) await db.prepare("ALTER TABLE site_stats ADD COLUMN prev_value INTEGER").run();
	if (!names.has("prev_at")) await db.prepare("ALTER TABLE site_stats ADD COLUMN prev_at TEXT").run();

	const { results } = await db.prepare("SELECT key FROM site_stats").all<{ key: string }>();
	const missing = DEFAULT_STATS.filter((s) => !results.some((r) => r.key === s.key));
	const staleKeys = results.map((r) => r.key).filter((k) => !KNOWN_KEYS.includes(k));
	const writes: D1Prepared[] = [
		...missing.map((s) =>
			db
				.prepare("INSERT INTO site_stats (key, label, value, suffix, source, updated_at) VALUES (?,?,?,?,?,NULL)")
				.bind(s.key, s.label, s.value, s.suffix, s.source),
		),
		/* Keep labels in sync with the defaults (rows persist across edits). */
		...DEFAULT_STATS.filter((s) => !missing.includes(s)).map((s) =>
			db.prepare("UPDATE site_stats SET label=? WHERE key=? AND label<>?").bind(s.label, s.key, s.label),
		),
		...staleKeys.map((k) => db.prepare("DELETE FROM site_stats WHERE key=?").bind(k)),
	];
	if (writes.length) await db.batch(writes);
}

async function countRegistryPlugins(): Promise<number | null> {
	const res = await fetch(PLUGIN_REGISTRY_URL, { headers: { Accept: "text/html" } });
	if (!res.ok) return null;
	const html = await res.text();
	const n = new Set(html.match(/href="\/plugins\/@[^"]+"/g) ?? []).size;
	return n > 0 ? n : null;
}

async function fetchNpmDownloads(): Promise<number | null> {
	const res = await fetch(NPM_DOWNLOADS_URL, { headers: { Accept: "application/json" } });
	if (!res.ok) return null;
	const body = (await res.json()) as { downloads?: number };
	return typeof body.downloads === "number" && body.downloads > 0 ? body.downloads : null;
}

export async function refreshSiteStats(db: D1Like): Promise<void> {
	await ensureTable(db);
	const now = new Date().toISOString();
	const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
	const writes: D1Prepared[] = [];

	/*
	 * Maintain the weekly baseline on every refresh. A row with no
	 * baseline stamps prev_at only — prev_value stays NULL, so the delta
	 * stays hidden until a real week of history exists. Once prev_at is
	 * a week old the current value becomes the new baseline and the
	 * clock restarts.
	 */
	const rotate = (key: string) => [
		db
			.prepare("UPDATE site_stats SET prev_value=value, prev_at=? WHERE key=? AND prev_at < ?")
			.bind(now, key, weekAgo),
		db.prepare("UPDATE site_stats SET prev_at=? WHERE key=? AND prev_at IS NULL").bind(now, key),
	];
	const set = (key: string, value: number) =>
		db.prepare("UPDATE site_stats SET value=?, updated_at=? WHERE key=?").bind(value, now, key);

	for (const s of DEFAULT_STATS) writes.push(...rotate(s.key));

	try {
		const downloads = await fetchNpmDownloads();
		if (downloads !== null) writes.push(set("npm_downloads", downloads));
	} catch {
		// Keep the last good value; a failed fetch must never blank the counters.
	}

	try {
		const plugins = await countRegistryPlugins();
		if (plugins !== null) writes.push(set("plugins", plugins));
	} catch {
		// Same — registry unreachable this run.
	}

	if (writes.length) await db.batch(writes);
}

export async function getSiteStats(db: D1Like, waitUntil?: (p: Promise<unknown>) => void): Promise<SiteStat[]> {
	await ensureTable(db);
	let { results } = await db
		.prepare("SELECT key, label, value, suffix, source, updated_at, prev_value, prev_at FROM site_stats")
		.all<{
			key: string;
			label: string;
			value: number;
			suffix: string;
			source: SiteStat["source"];
			updated_at: string | null;
			prev_value: number | null;
			prev_at: string | null;
		}>();

	const tracked = results.filter((r) => r.source !== "manual");
	const newest = Math.max(0, ...tracked.map((r) => new Date(r.updated_at ?? 0).getTime()));
	const stale = tracked.length === 0 || Date.now() - newest > TTL_MS;

	if (stale) {
		const job = refreshSiteStats(db).catch(() => {});
		// Never-refreshed rows are zero — fill them inline so the first
		// render shows real numbers; later refreshes can run in the
		// background because the previous values are still good enough.
		if (waitUntil && tracked.every((r) => r.updated_at)) waitUntil(job);
		else await job;
		({ results } = await db
			.prepare("SELECT key, label, value, suffix, source, updated_at, prev_value, prev_at FROM site_stats")
			.all());
	}

	const order = KNOWN_KEYS;
	return results
		.map((r) => ({
			key: r.key,
			label: r.label,
			value: r.value,
			suffix: r.suffix,
			source: r.source,
			updatedAt: r.updated_at,
			weekDelta: r.prev_value !== null ? r.value - r.prev_value : null,
		}))
		.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
