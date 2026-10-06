import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { refreshSiteStats } from "./lib/site-stats";

export { PluginBridge };

const emdashScheduled = createScheduledHandler({ generalCron: "0 * * * *" });

export default {
	...handler,
	// Must match triggers.crons in wrangler.jsonc; other expressions are ignored.
	scheduled: async (event, env, ctx) => {
		const e = env as Env;
		await emdashScheduled(event, e, ctx);
		// Re-ups the site_stats table (npm downloads, catalog counts) at most
		// once a day; the table self-creates on first run.
		ctx.waitUntil(refreshSiteStats(e.DB).catch((error) => console.error("stats refresh failed", error)));
	},
} satisfies ExportedHandler;
