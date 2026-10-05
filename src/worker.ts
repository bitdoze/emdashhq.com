import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

export default {
	...handler,
	// Must match triggers.crons in wrangler.jsonc; other expressions are ignored.
	scheduled: createScheduledHandler({ generalCron: "0 * * * *" }),
} satisfies ExportedHandler;
