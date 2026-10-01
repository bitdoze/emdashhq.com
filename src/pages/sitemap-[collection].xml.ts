import type { APIRoute } from "astro";
// The installed EmDash route preserves noindex exclusion, dates and SEO images.
// Override its URL mapping here so existing databases need no reseeding.
import { GET as emdashSitemap } from "emdash/internal/routes/sitemap-_collection_.xml";

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const response = await emdashSitemap(context);
	if (!response.ok) {
		context.cache.set(false);
		response.headers.set("Cache-Control", "no-store");
		return response;
	}
	if (context.params.collection !== "pages") return response;
	if (context.cache.enabled) context.cache.set({ tags: ["pages", "emdash:settings"] });
	const xml = (await response.text()).replace(/<loc>([^<]+)<\/loc>/g, (_match: string, loc: string) => {
		// Rewrite only page locations; leave SEO image URLs untouched.
		const url = new URL(loc);
		const path = url.pathname.replace(/^\/pages\//, "/").replace(/\/+$/, "");
		url.pathname = path === "/home" || path === "" ? "/" : `${path}/`;
		return `<loc>${url.href}</loc>`;
	});
	const headers = new Headers(response.headers);
	headers.delete("Content-Length");
	return new Response(xml, { status: response.status, headers });
};
