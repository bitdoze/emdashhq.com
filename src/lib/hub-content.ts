import type { APIContext } from "astro";
import { getEmDashCollection, type CollectionFilter } from "emdash";
import type { PageContentBlock } from "../../emdash-env";
import { parseYouTubeId } from "./youtube";

type HubCollection = "tutorials" | "videos" | "resources" | "services" | "posts";
type HubBlock = Extract<PageContentBlock, { _type: `site_${HubCollection}` }>;
type Context = Pick<APIContext, "locals" | "cache">;
type Entries<T extends HubCollection> = Awaited<ReturnType<typeof getEmDashCollection<T>>>["entries"];
const requests = new WeakMap<object, Map<string, Promise<unknown>>>();

/** Query exactly the bounded list, or walk cursors for the editor's "0 = all". */
export async function getHubEntries<T extends HubCollection>(context: Context, collection: T, block: HubBlock): Promise<Entries<T>> {
	let pending = requests.get(context.locals);
	if (!pending) {
		pending = new Map();
		requests.set(context.locals, pending);
	}
	const key = JSON.stringify([collection, block]);
	let result = pending.get(key) as Promise<Entries<T>> | undefined;
	if (!result) {
		result = loadEntries(context, collection, block);
		pending.set(key, result);
	}
	return result;
}

async function loadEntries<T extends HubCollection>(context: Context, collection: T, block: HubBlock): Promise<Entries<T>> {
	const limit = Math.max(0, Math.trunc(block.limit ?? (collection === "services" || collection === "videos" ? 3 : 6)));
	const where: NonNullable<CollectionFilter["where"]> = {};
	// Boolean fields are persisted as SQLite integers; WhereValue accepts strings.
	if (block.featured_only) where.featured = "1";
	if (block._type === "site_resources") {
		if (block.kind && block.kind !== "all") where.kind = block.kind;
		if (block.price && block.price !== "all") where.price_type = block.price;
	}
	const entries: Entries<T> = [];
	const seen = new Set<string>();
	let cursor: string | undefined;
	do {
		const result = await getEmDashCollection(collection, {
			status: "published", where,
			orderBy: collection === "services" ? { sort_order: "asc" } : { published_at: "desc" },
			limit: limit > 0 ? Math.min(100, limit - entries.length) : 100,
			cursor,
		});
		if (result.error) throw new Error(`Unable to load ${collection}`, { cause: result.error });
		if (context.cache.enabled) context.cache.set(result.cacheHint);
		for (const entry of result.entries) {
			if (collection === "videos" && !parseYouTubeId((entry.data as { youtube_url?: string }).youtube_url)) continue;
			entries.push(entry);
		}
		if (limit > 0 && entries.length >= limit) return entries.slice(0, limit);
		cursor = result.nextCursor;
		if (cursor) {
			if (seen.has(cursor)) throw new Error(`Repeated pagination cursor for ${collection}`);
			seen.add(cursor);
		}
	} while (cursor);
	return entries;
}

/** Complete data fetching before Astro can stream a successful document. */
export async function preloadHubBlocks(context: Context, blocks: PageContentBlock[]) {
	await Promise.all(blocks.map((block) => {
		switch (block._type) {
			case "site_tutorials": return getHubEntries(context, "tutorials", block);
			case "site_posts": return getHubEntries(context, "posts", block);
			case "site_videos": return getHubEntries(context, "videos", block);
			case "site_resources": return getHubEntries(context, "resources", block);
			case "site_services": return getHubEntries(context, "services", block);
			default: return undefined;
		}
	}));
}
