/*
 * Site stats counters, refreshed at most once a day and read from the
 * `site_stats` table. Sources: the npm downloads API for installs, the
 * resources collection for theme/plugin counts, and a manually-kept
 * sites figure. The worker's scheduled handler refreshes proactively;
 * page reads refresh lazily when stale so dev works without cron.
 */

export interface SiteStat {
	key: string;
	label: string;
	value: number;
	suffix: string;
	source: "api" | "count" | "manual";
	updatedAt: string | null;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const NPM_DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-month/emdash";

const DEFAULT_STATS: Array<Omit<SiteStat, "updatedAt">> = [
	{ key: "npm_downloads", label: "npm installs · last 30 days", value: 0, suffix: "", source: "api" },
	{ key: "plugins", label: "plugins", value: 0, suffix: "", source: "count" },
	{ key: "themes", label: "themes", value: 0, suffix: "", source: "count" },
	{ key: "sites", label: "sites on EmDash", value: 1, suffix: "+", source: "manual" },
];

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
	updated_at TEXT
)`;

async function ensureTable(db: D1Like) {
	await db.prepare(CREATE_TABLE).run();
	const { results } = await db.prepare("SELECT key FROM site_stats").all<{ key: string }>();
	const missing = DEFAULT_STATS.filter((s) => !results.some((r) => r.key === s.key));
	if (missing.length) {
		await db.batch(
			missing.map((s) =>
				db
					.prepare("INSERT INTO site_stats (key, label, value, suffix, source, updated_at) VALUES (?,?,?,?,?,NULL)")
					.bind(s.key, s.label, s.value, s.suffix, s.source),
			),
		);
	}
}

export async function refreshSiteStats(db: D1Like): Promise<void> {
	await ensureTable(db);
	const now = new Date().toISOString();
	const writes: D1Prepared[] = [];

	try {
		const res = await fetch(NPM_DOWNLOADS_URL, { headers: { Accept: "application/json" } });
		if (res.ok) {
			const body = (await res.json()) as { downloads?: number };
			if (typeof body.downloads === "number" && body.downloads > 0) {
				writes.push(
					db.prepare("UPDATE site_stats SET value=?, updated_at=? WHERE key='npm_downloads'").bind(body.downloads, now),
				);
			}
		}
	} catch {
		// Keep the last good value; a failed fetch must never blank the counters.
	}

	try {
		const { results } = await db
			.prepare(
				"SELECT kind, COUNT(*) AS n FROM ec_resources WHERE status='published' AND deleted_at IS NULL GROUP BY kind",
			)
			.all<{ kind: string; n: number }>();
		for (const row of results) {
			const key = row.kind === "plugin" ? "plugins" : row.kind === "theme" ? "themes" : null;
			if (key) writes.push(db.prepare(`UPDATE site_stats SET value=?, updated_at=? WHERE key=?`).bind(row.n, now, key));
		}
	} catch {
		// Table shape differs (older schema); counts stay at their last values.
	}

	if (writes.length) await db.batch(writes);
}

export async function getSiteStats(db: D1Like, waitUntil?: (p: Promise<unknown>) => void): Promise<SiteStat[]> {
	await ensureTable(db);
	const { results } = await db
		.prepare("SELECT key, label, value, suffix, source, updated_at FROM site_stats")
		.all<{ key: string; label: string; value: number; suffix: string; source: SiteStat["source"]; updated_at: string | null }>();

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
		const fresh = await db
			.prepare("SELECT key, label, value, suffix, source, updated_at FROM site_stats")
			.all<{ key: string; label: string; value: number; suffix: string; source: SiteStat["source"]; updated_at: string | null }>();
		results.length = 0;
		results.push(...fresh.results);
	}

	const order = DEFAULT_STATS.map((s) => s.key);
	return results
		.map((r) => ({ key: r.key, label: r.label, value: r.value, suffix: r.suffix, source: r.source, updatedAt: r.updated_at }))
		.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
