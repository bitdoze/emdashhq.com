import type { APIContext } from "astro";

export const PLUGIN_ID = "emdashhq-widgets";

export interface WidgetConfig {
	youtubeNoCookie: boolean;
	affiliateDisclosure: string;
	postsCollection: string;
}

export interface WidgetPostItem {
	title: string;
	url: string;
	excerpt?: string;
	publishedAt?: string;
	collection: string;
}

const DEFAULTS: WidgetConfig = {
	youtubeNoCookie: true,
	affiliateDisclosure:
		"This post contains affiliate links. If you buy through them, the site may earn a commission at no extra cost to you.",
	postsCollection: "posts",
};

const pending = new WeakMap<object, Map<string, Promise<unknown>>>();

function once<T>(locals: object, key: string, load: () => Promise<T>): Promise<T> {
	let map = pending.get(locals);
	if (!map) {
		map = new Map();
		pending.set(locals, map);
	}
	let result = map.get(key) as Promise<T> | undefined;
	if (!result) {
		result = load();
		map.set(key, result);
	}
	return result;
}

async function callRoute(
	locals: APIContext["locals"],
	origin: string,
	route: "config" | "posts",
	search: string,
): Promise<unknown> {
	const emdash = locals.emdash;
	if (!emdash?.handlePublicPluginApiRoute) return null;
	const res = await emdash.handlePublicPluginApiRoute(
		PLUGIN_ID,
		"GET",
		route,
		new Request(`${origin}/_emdash/api/plugins/${PLUGIN_ID}/${route}${search}`),
	);
	return res.success ? res.data : null;
}

type Context = Pick<APIContext, "locals" | "url">;

/** Shared widget settings, fetched once per request through the plugin route. */
export function getWidgetConfig(context: Context): Promise<WidgetConfig> {
	return once(context.locals, "config", async () => {
		const data = (await callRoute(
			context.locals,
			context.url.origin,
			"config",
			"",
		)) as { config?: WidgetConfig } | null;
		return data?.config ?? DEFAULTS;
	});
}

/** Latest published entries for the Latest posts widget. */
export function getWidgetPosts(
	context: Context,
	options: { collection?: string; limit?: number; exclude?: string },
): Promise<WidgetPostItem[]> {
	const params = new URLSearchParams();
	if (options.collection) params.set("collection", options.collection);
	if (options.limit) params.set("limit", String(options.limit));
	if (options.exclude) params.set("exclude", options.exclude);
	return once(context.locals, `posts:${params}`, async () => {
		const data = (await callRoute(
			context.locals,
			context.url.origin,
			"posts",
			`?${params}`,
		)) as { items?: WidgetPostItem[] } | null;
		return data?.items ?? [];
	});
}
