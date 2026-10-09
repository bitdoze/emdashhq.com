import type { PluginContext, SandboxedRouteContext } from "emdash/plugin";

import {
	readSettings,
	toPublicConfig,
	type PluginSettings,
	type PublicPostItem,
	type PublicWidgetConfig,
} from "./types";

const SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/;
const MAX_LIMIT = 20;
// Excerpt fields vary by site; try the common names in order.
const EXCERPT_FIELDS = ["excerpt", "summary", "description"];

function queryInput(routeCtx: SandboxedRouteContext): Record<string, string> {
	const input = (routeCtx.input ?? {}) as Record<string, string | string[]>;
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(input)) {
		out[key] = Array.isArray(value) ? value[0] : value;
	}
	return out;
}

export async function handleConfigRoute(
	_routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<{ config: PublicWidgetConfig }> {
	return { config: toPublicConfig(await readSettings(ctx)) };
}

async function resolveCollection(
	ctx: PluginContext,
	settings: PluginSettings,
	raw: string | undefined,
): Promise<string | null> {
	const slug = (raw ?? "").trim() || settings.postsCollection;
	if (!SLUG_PATTERN.test(slug)) return null;
	if (ctx.schema) {
		const collection = await ctx.schema.getCollection(slug);
		if (!collection) return null;
	}
	return slug;
}

export async function handlePostsRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<{ items: PublicPostItem[] }> {
	if (!ctx.content) return { items: [] };
	const input = queryInput(routeCtx);
	const settings = await readSettings(ctx);
	const collection = await resolveCollection(ctx, settings, input.collection);
	if (!collection) return { items: [] };

	const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(Number(input.limit) || 5) || 5));
	const exclude = (input.exclude ?? "").trim();
	// Fetch one extra row so excluding the current post still fills the list.
	const { items } = await ctx.content.list(collection, {
		where: { status: "published" },
		orderBy: { publishedAt: "desc" },
		limit: exclude ? limit + 1 : limit,
	});

	const posts: PublicPostItem[] = [];
	for (const item of items) {
		if (posts.length >= limit) break;
		if (exclude && (item.slug === exclude || item.id === exclude)) continue;
		const url = ctx.content.getPublicUrl
			? await ctx.content.getPublicUrl(collection, item.id)
			: null;
		if (!url) continue;
		const data = item.data ?? {};
		const excerpt = EXCERPT_FIELDS.map((field) => data[field])
			.find((value): value is string => typeof value === "string" && value.trim().length > 0)
			?.trim();
		posts.push({
			title: typeof data.title === "string" ? data.title : (item.slug ?? item.id),
			url,
			excerpt,
			publishedAt: item.publishedAt ?? undefined,
			collection,
		});
	}
	return { items: posts };
}
