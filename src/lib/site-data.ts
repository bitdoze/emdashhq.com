import type { APIContext } from "astro";
import { getMenuWithCacheHint, getSiteSettingsWithCacheHint } from "emdash";

type Context = Pick<APIContext, "locals" | "cache">;

// Request-scoped: never share settings or preview content between visitors.
const chrome = new WeakMap<object, ReturnType<typeof loadChrome>>();

async function loadChrome() {
	return Promise.all([
		getSiteSettingsWithCacheHint(),
		getMenuWithCacheHint("primary"),
		getMenuWithCacheHint("header_cta"),
		getMenuWithCacheHint("footer_learn"),
		getMenuWithCacheHint("footer_resources"),
		getMenuWithCacheHint("footer_company"),
	]);
}

export async function getSiteChrome(context: Context) {
	let pending = chrome.get(context.locals);
	if (!pending) {
		pending = loadChrome();
		chrome.set(context.locals, pending);
	}
	const results = await pending;
	if (context.cache.enabled) {
		for (const result of results) context.cache.set(result.cacheHint);
	}
	return results;
}
