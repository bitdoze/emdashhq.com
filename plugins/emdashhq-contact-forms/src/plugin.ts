import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdminInteraction } from "./admin";
import { handleExportRoute, handleFormRoute, handleRecoveryRoute, handleSubmitRoute } from "./public";
import { IDEM_PREFIX, IDEM_TTL_MS, RATE_PREFIX, readSettings, RECOVERY_PREFIX, RECOVERY_TTL_MS } from "./types";

const plugin: SandboxedPlugin = {
	routes: {
		// Public: the site's contact form block fetches the form definition with this.
		form: {
			public: true,
			request: { body: "none" },
			handler: handleFormRoute,
		},
		// Public: browser form posts land here; response is a same-origin 303 redirect.
		submit: {
			public: true,
			methods: ["POST"],
			request: { body: "form-data", maxBytes: 64 * 1024 },
			response: "raw",
			handler: handleSubmitRoute,
		},
		// Public: one-time read of a rejected submission's draft so the block can
		// re-render fields with values and per-field errors after the redirect.
		recovery: {
			public: true,
			request: { body: "none" },
			handler: handleRecoveryRoute,
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
			const now = Date.now();

			// Transient KV keys are short-lived regardless of the retention
			// setting: rate-limit buckets one hour back, recovery drafts one
			// hour, idempotency claims one day.
			const hourBucket = Math.floor(now / 3600e3);
			for (const { key } of await ctx.kv.list(RATE_PREFIX)) {
				const bucket = Number(key.split(":").pop());
				if (!Number.isFinite(bucket) || bucket < hourBucket - 1) await ctx.kv.delete(key);
			}
			for (const [prefix, ttl] of [
				[RECOVERY_PREFIX, RECOVERY_TTL_MS],
				[IDEM_PREFIX, IDEM_TTL_MS],
			] as const) {
				for (const { key, value } of await ctx.kv.list(prefix)) {
					const at = new Date((value as { createdAt?: string })?.createdAt ?? 0).getTime();
					if (!Number.isFinite(at) || now - at > ttl) await ctx.kv.delete(key);
				}
			}

			const settings = await readSettings(ctx);
			if (settings.retentionDays <= 0) return;
			const cutoff = new Date(now - settings.retentionDays * 864e5).toISOString();
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
