import { defineMiddleware } from "astro:middleware";
import type { PageFragmentContribution } from "emdash";

const SCRIPTS_TAG = "site-scripts";
const SETTINGS_PATH = "/_emdash/api/admin/plugins/site-scripts/settings";

export const onRequest = defineMiddleware(async (context, next) => {
	const publicPage = !context.url.pathname.startsWith("/_emdash/");
	if (publicPage && context.cache.enabled) context.cache.set({ tags: [SCRIPTS_TAG] });
	if (publicPage && context.locals.emdash) {
		// Head and body components create equivalent SEO contexts with distinct
		// identities. Share their fragment read within this request, including null
		// contributions, without caching plugin settings across requests.
		const runtime = context.locals.emdash;
		const collect = runtime.collectPageFragments.bind(runtime);
		const fragments = new Map<string, Promise<PageFragmentContribution[]>>();
		runtime.collectPageFragments = (page) => {
			const key = JSON.stringify(page);
			let result = fragments.get(key);
			if (!result) {
				result = collect(page);
				fragments.set(key, result);
			}
			return result;
		};
	}
	const response = await next();
	if (context.request.method === "PUT" && context.url.pathname.replace(/\/$/, "") === SETTINGS_PATH && response.ok) {
		try {
			// Only purge after the CMS authenticates and successfully saves settings.
			if (import.meta.env.PROD) {
				// Installed Workers module typings omit the newer cache export.
				const { cache } = await import("cloudflare:workers") as unknown as {
					cache: { purge(options: { tags: string[] }): Promise<{ success: boolean; errors: unknown[] }> };
				};
				const result = await cache.purge({ tags: [SCRIPTS_TAG] });
				// The installed Astro provider discards this platform result. Check it
				// here so a rejected/rate-limited purge is not reported as success.
				if (!result.success) throw new Error("Cloudflare rejected the Site Scripts purge", { cause: result.errors });
			} else {
				await context.cache.invalidate({ tags: [SCRIPTS_TAG] });
			}
		} catch (error) {
			console.error("Site Scripts settings saved, but public cache purge failed", error);
			return Response.json({ success: false, error: {
				code: "CACHE_PURGE_FAILED",
				message: "Settings saved, but the public cache could not be refreshed. Retry saving to refresh it.",
			} }, {
				status: 503, headers: { "Cache-Control": "private, no-store" },
			});
		}
	}
	if (publicPage && context.url.protocol === "https:") {
		response.headers.set("Strict-Transport-Security", "max-age=31536000");
	}
	return response;
});
