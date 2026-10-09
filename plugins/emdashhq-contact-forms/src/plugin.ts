import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdminInteraction } from "./admin";
import { handleCapacityRoute, handleExportRoute, handleFormRoute, handleSubmitRoute } from "./public";
import { recoverCapacity } from "./capacity";
import { readSettings } from "./types";

const plugin: SandboxedPlugin = {
	routes: {
		capacity: {
			public: true,
			methods: ["GET"],
			request: { body: "none" },
			response: "raw",
			handler: handleCapacityRoute,
		},
		// Public: the site's contact form block fetches the form definition with this.
		form: {
			public: true,
			methods: ["GET"],
			request: { body: "none" },
			handler: handleFormRoute,
		},
		// Public: browser form posts land here; response is a same-origin 303 redirect.
		submit: {
			public: true,
			methods: ["POST"],
			request: { body: "form-data", maxBytes: 64 * 1024, headers: ["accept"] },
			response: "raw",
			handler: handleSubmitRoute,
		},
		// Private: CSV export of submissions for admins.
		export: {
			request: { body: "none" },
			response: "raw",
			handler: handleExportRoute,
		},
		// Private: Block Kit admin pages and the dashboard widget.
		admin: {
			handler: handleAdminInteraction,
		},
	},
	hooks: {
		"plugin:activate": async (_event, ctx) => {
			await ctx.cron?.schedule("prune", { schedule: "0 * * * *" });
		},
		"plugin:deactivate": async (_event, ctx) => {
			await ctx.cron?.cancel("prune").catch(() => {});
		},
		"plugin:uninstall": async (_event, ctx) => {
			await ctx.cron?.cancel("prune").catch(() => {});
		},
		cron: async (event, ctx) => {
			if (event.name !== "prune") return;
			let cursor: string | undefined;
			do {
				const page = await ctx.storage.capacity.query({ limit: 100, cursor });
				for (const item of page.items) {
					try { await recoverCapacity(ctx, item.id); }
					catch (error) { ctx.log.error("Capacity recovery failed", { formId: item.id, error: String(error) }); }
				}
				cursor = page.hasMore ? page.cursor : undefined;
			} while (cursor);
			const settings = await readSettings(ctx);
			if (settings.retentionDays <= 0) return;
			const cutoff = new Date(Date.now() - settings.retentionDays * 864e5).toISOString();
			for (const collection of ["submissions", "email_log"] as const) {
				for (;;) {
					const { items } = await ctx.storage[collection].query({
						where: { createdAt: { lt: cutoff } },
						limit: 100,
					});
					if (items.length === 0) break;
					await ctx.storage[collection].deleteMany(items.map((item) => item.id));
					ctx.log.info(`Pruned ${items.length} ${collection} older than ${settings.retentionDays}d`);
				}
			}
		},
	},
};

export default plugin;
