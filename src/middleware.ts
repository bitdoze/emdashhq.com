import { defineMiddleware } from "astro:middleware";
import type { PageFragmentContribution } from "emdash";

// Public pages register these tags for the plugin-owned data they render so a
// completed admin write can purge the affected HTML.
const SCRIPTS_TAG = "site-scripts";
const CONTACT_FORMS_TAG = "contact-forms";
const WIDGETS_TAG = "emdashhq-widgets";

const PLUGIN_SETTINGS = "/_emdash/api/admin/plugins";
const CONTACT_FORMS_ADMIN = "/_emdash/api/plugins/emdashhq-contact-forms/admin";

/**
 * Block Kit posts reads and writes to the same private plugin route. Only
 * interactions that change a form's definition (slug, fields, enabled state)
 * alter what public pages render — submission/log actions do not. An
 * unparseable body is treated as a write.
 */
function formDefWrite(body: unknown): boolean {
	if (!body || typeof body !== "object") return true;
	const b = body as { type?: string; action_id?: string; value?: unknown };
	const action = typeof b.action_id === "string" ? b.action_id.split(":")[0] : "";
	if (b.type === "form_submit") return ["form_create", "form_save", "field_save"].includes(action);
	if (b.type === "block_action") {
		if (action === "delete_form") return true;
		const cmd = typeof b.value === "string" ? b.value.split(":")[0] : "";
		if (action === "form_menu") return cmd === "toggle";
		if (action === "field_menu") return ["del", "up", "down"].includes(cmd);
	}
	return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const publicPage = !context.url.pathname.startsWith("/_emdash/");
	if (publicPage && context.cache.enabled) context.cache.set({ tags: [SCRIPTS_TAG] });
	if (publicPage && typeof context.locals.emdash?.collectPageFragments === "function") {
		// Head and body components create equivalent SEO contexts with distinct
		// identities. Share their fragment read within this request, including null
		// contributions, without caching plugin settings across requests.
		// locals.emdash is a minimal { storage } facade on /_image requests.
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

	// Tags to purge when the request turns out to be a successful admin write.
	// The contact-forms admin route multiplexes Block Kit reads and writes over
	// one POST endpoint, so the small JSON body decides — clone it before the
	// handler consumes it.
	const path = context.url.pathname.replace(/\/$/, "");
	const tags: string[] = [];
	if (context.request.method === "PUT") {
		if (path === `${PLUGIN_SETTINGS}/emdashhq-site-scripts/settings`) tags.push(SCRIPTS_TAG);
		if (path === `${PLUGIN_SETTINGS}/emdashhq-contact-forms/settings`) tags.push(CONTACT_FORMS_TAG);
		if (path === `${PLUGIN_SETTINGS}/emdashhq-widgets/settings`) tags.push(WIDGETS_TAG);
	} else if (context.request.method === "POST" && path === CONTACT_FORMS_ADMIN) {
		const body = await context.request
			.clone()
			.json()
			.catch(() => null);
		if (formDefWrite(body)) tags.push(CONTACT_FORMS_TAG);
	}

	const response = await next();
	// Only purge after the CMS authenticates and successfully saves the write.
	if (tags.length && response.ok) {
		try {
			if (import.meta.env.PROD) {
				// Installed Workers module typings omit the newer cache export.
				const { cache } = await import("cloudflare:workers") as unknown as {
					cache: { purge(options: { tags: string[] }): Promise<{ success: boolean; errors: unknown[] }> };
				};
				const result = await cache.purge({ tags });
				// The installed Astro provider discards this platform result. Check it
				// here so a rejected/rate-limited purge is not reported as success.
				if (!result.success) throw new Error("Cloudflare rejected the cache purge", { cause: result.errors });
			} else {
				await context.cache.invalidate({ tags });
			}
		} catch (error) {
			console.error("Admin write saved, but public cache purge failed", error);
			return Response.json({ success: false, error: {
				code: "CACHE_PURGE_FAILED",
				message: "Saved, but the public cache could not be refreshed. Retry saving to refresh it.",
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
