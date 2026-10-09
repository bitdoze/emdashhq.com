import type { APIRoute } from "astro";
import { getEmDashCollection, getSiteSettingsWithCacheHint } from "emdash";
import { sanitizeHref } from "emdash";

const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const RFC822 = (d: Date) => d.toUTCString();

/*
 * The hub's owned feed: one item per published post, tutorial, video and
 * resource, newest first. Blog posts link to /blog/<slug>/; hub entries
 * point at their real destinations (bitdoze.com, YouTube, npm, GitHub).
 */
export const GET: APIRoute = async ({ site, url, cache }) => {
	const base = (site?.toString() ?? url.origin).replace(/\/$/, "");

	const settingsResult = await getSiteSettingsWithCacheHint();
	if (cache.enabled) cache.set(settingsResult.cacheHint);
	const settings = settingsResult.data;
	const channelTitle = settings?.title || "EmDash HQ";
	const channelDesc = settings?.tagline || "Tutorials, videos, themes and plugins for EmDash CMS";

	const collections = [
		{ slug: "posts" as const, linkField: "", tag: "Post" },
		{ slug: "tutorials" as const, linkField: "url", tag: "Tutorial" },
		{ slug: "videos" as const, linkField: "youtube_url", tag: "Video" },
		{ slug: "resources" as const, linkField: "url", tag: "Resource" },
	];

	const items: { title: string; link: string; desc: string; date: Date; tag: string }[] = [];
	for (const { slug, linkField, tag } of collections) {
		const result = await getEmDashCollection(slug, {
			status: "published",
			orderBy: { published_at: "desc" },
			limit: 100,
		});
		if (result.error) throw new Error(`Unable to load ${slug} for the feed`, { cause: result.error });
		if (cache.enabled) cache.set(result.cacheHint);
		for (const entry of result.entries) {
			// entry.data carries the system dates as createdAt/publishedAt.
			const data = entry.data as unknown as Record<string, string | undefined>;
			// Posts are own content: the entry routes at /blog/<slug>/.
			const link =
				slug === "posts"
					? `/blog/${entry.id}/`
					: sanitizeHref(data[linkField]) || `${base}/${slug}/`;
			items.push({
				title: data.title || entry.id,
				link: /^https?:\/\//i.test(link) ? link : `${base}${link.startsWith("/") ? "" : "/"}${link}`,
				desc: data.summary || data.excerpt || "",
				date: new Date(data.publishedAt ?? data.createdAt ?? 0),
				tag,
			});
		}
	}
	items.sort((a, b) => +b.date - +a.date);

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>${escapeXml(channelTitle)}</title>
		<link>${escapeXml(base)}/</link>
		<description>${escapeXml(channelDesc)}</description>
		<language>en</language>
		<managingEditor>dragos@emdashhq.com (Dragos)</managingEditor>
		<lastBuildDate>${RFC822(items[0]?.date ?? new Date())}</lastBuildDate>
${items
	.map(
		(item) => `		<item>
			<title>${escapeXml(item.title)}</title>
			<link>${escapeXml(item.link)}</link>
			<guid isPermaLink="true">${escapeXml(item.link)}</guid>
			<category>${escapeXml(item.tag)}</category>
			<pubDate>${RFC822(item.date)}</pubDate>
			<description>${escapeXml(item.desc)}</description>
		</item>`,
	)
	.join("\n")}
	</channel>
</rss>
`;

	return new Response(xml, {
		headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
	});
};
