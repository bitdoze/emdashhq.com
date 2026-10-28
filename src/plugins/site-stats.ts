/*
 * Site stats plugin — exposes the `site_stats` counters to private API
 * routes and MCP tools. Runs in-process so it can reach `env.DB`
 * directly; sandboxed plugins have no raw database access.
 *
 * Enable the MCP surface under Admin → Plugins → Site Stats → MCP
 * tools; callers then need `mcp:tools:emdashhq-site-stats` (or
 * `mcp:tools`) plus the route permission.
 */

import { definePlugin } from "emdash";
import { z } from "zod";

import { getSiteStats, refreshSiteStats, type D1Like } from "../lib/site-stats";

const STAT_KEYS = ["npm_downloads", "plugins", "sites"] as const;

const updateInput = z.object({
	values: z
		.object({
			npm_downloads: z.number().int().min(0).optional(),
			plugins: z.number().int().min(0).optional(),
			sites: z.number().int().min(0).optional(),
		})
		.refine((v) => Object.values(v).some((n) => n !== undefined), {
			message: "Provide at least one stat value",
		}),
});

const statOutput = z.looseObject({
	ok: z.boolean(),
	stats: z
		.array(
			z.object({
				key: z.string(),
				label: z.string(),
				value: z.number(),
				suffix: z.string(),
				source: z.string(),
				updatedAt: z.string().nullable(),
				prevAt: z.string().nullable(),
				weekDelta: z.number().nullable(),
			}),
		)
		.optional(),
	error: z.string().optional(),
});

/*
 * This module is imported by astro.config.mjs, which Node loads outside
 * the worker runtime — so `cloudflare:workers` can't be a static import.
 * A computed dynamic specifier is left alone by every bundler and
 * resolves inside workerd at call time.
 */
const WORKERS_MODULE = "cloudflare:workers";

async function db(): Promise<D1Like | null> {
	try {
		const mod = (await import(/* @vite-ignore */ WORKERS_MODULE)) as { env?: { DB?: D1Like } };
		return mod.env?.DB ?? null;
	} catch {
		return null;
	}
}

/*
 * Purge the cached homepage so a stats change shows on the next request.
 * The Cloudflare cache provider tags every page `astro-path:<pathname>`
 * and the strip only renders on `/`. Best-effort: the rows are already
 * correct, so a purge failure doesn't fail the route.
 */
async function purgeHomePage(): Promise<void> {
	try {
		const mod = (await import(/* @vite-ignore */ WORKERS_MODULE)) as {
			cache?: { purge?: (opts: { tags: string[] }) => Promise<void> };
		};
		await mod.cache?.purge?.({ tags: ["astro-path:/"] });
	} catch {
		/* no edge cache in this environment */
	}
}

/*
 * The astro integration imports { createPlugin } from this file via the
 * descriptor's entrypoint (native format) — see astro.config.mjs.
 */
export function createPlugin() {
	return definePlugin({
		id: "emdashhq-site-stats",
		version: "1.0.0",
		capabilities: [],
		routes: {
		"stats/get": {
			permission: "settings:read",
			handler: async () => {
				const d1 = await db();
				if (!d1) return { ok: false, error: "DB_UNAVAILABLE" };
				return { ok: true, stats: await getSiteStats(d1) };
			},
		},
		"stats/refresh": {
			permission: "settings:manage",
			methods: ["POST"],
			handler: async () => {
				const d1 = await db();
				if (!d1) return { ok: false, error: "DB_UNAVAILABLE" };
				// Push counted rows past the 24 h staleness gate so the
				// normal refresh path re-fetches them right now.
				await d1
					.prepare("UPDATE site_stats SET updated_at = ? WHERE source <> 'manual'")
					.bind(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
					.run();
				await refreshSiteStats(d1);
				await purgeHomePage();
				return { ok: true, stats: await getSiteStats(d1) };
			},
		},
		"stats/update": {
			permission: "settings:manage",
			methods: ["POST"],
			input: updateInput,
			handler: async (routeCtx) => {
				const parsed = updateInput.safeParse(routeCtx.input);
				if (!parsed.success) {
					return { ok: false, error: "INVALID_INPUT", issues: parsed.error.issues };
				}
				const d1 = await db();
				if (!d1) return { ok: false, error: "DB_UNAVAILABLE" };
				const now = new Date().toISOString();
				const writes = Object.entries(parsed.data.values)
					.filter(([key, value]) => value !== undefined && STAT_KEYS.includes(key as never))
					.map(([key, value]) =>
						d1
							.prepare("UPDATE site_stats SET value=?, updated_at=? WHERE key=?")
							.bind(value, now, key),
					);
				if (writes.length === 0) return { ok: false, error: "NOTHING_TO_UPDATE" };
				await d1.batch(writes);
				await purgeHomePage();
				return { ok: true, stats: await getSiteStats(d1) };
			},
		},
	},
	mcp: {
		tools: {
			siteStats: {
				description:
					'Read the emdashhq.com "By the numbers" counters (npm downloads, registry plugins, sites on EmDash).',
				route: "stats/get",
				input: z.object({}).strict(),
				output: statOutput,
				destructive: false,
			},
			siteStatsRefresh: {
				description:
					"Force-refresh the emdashhq.com stats counters from their sources (npm downloads API, plugin registry aggregator), bypassing the daily staleness window.",
				route: "stats/refresh",
				input: z.object({}).strict(),
				output: statOutput,
				destructive: false,
			},
			siteStatsUpdate: {
				description:
					"Set emdashhq.com stats counter values by hand (e.g. sites: 751). Counted sources (npm_downloads, plugins) overwrite themselves on the next refresh — use it for the manual 'sites' figure or corrections.",
				route: "stats/update",
				input: updateInput,
				output: statOutput,
				destructive: true,
			},
		},
	},
	});
}
