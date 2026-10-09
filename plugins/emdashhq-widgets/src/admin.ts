import { blocks } from "@emdash-cms/blocks/server";
import type { Block, BlockResponse, PageLoad } from "@emdash-cms/blocks/server";
import type { PluginContext, SandboxedRouteContext } from "emdash/plugin";

import { readSettings } from "./types";

interface WidgetDoc {
	type: string;
	name: string;
	description: string;
	fields: string;
	needsPlugin: boolean;
}

const WIDGETS: WidgetDoc[] = [
	{
		type: "widget_prose",
		name: "Prose",
		description: "Rich text section. Stack it between other widgets to write an article.",
		fields: "body (rich text)",
		needsPlugin: false,
	},
	{
		type: "widget_notice",
		name: "Notice",
		description: "Colored callout for tips, warnings, prerequisites and pitfalls.",
		fields: "kind, title, body (rich text)",
		needsPlugin: false,
	},
	{
		type: "widget_accordion",
		name: "Accordion",
		description: "Collapsible question/answer or step sections.",
		fields: "heading, items[] { title, body (rich text) }",
		needsPlugin: false,
	},
	{
		type: "widget_tabs",
		name: "Tabs",
		description: "Tabbed panels — for example one tab per OS or per package manager.",
		fields: "items[] { label, body (rich text) }",
		needsPlugin: false,
	},
	{
		type: "widget_checklist",
		name: "Checklist",
		description: "Checkmarked bullet list for requirements or takeaways.",
		fields: "title, items[] { text }",
		needsPlugin: false,
	},
	{
		type: "widget_steps",
		name: "Steps",
		description: "Numbered how-to steps with a connected rail — setup guides, walkthroughs.",
		fields: "title, items[] { title, body }",
		needsPlugin: false,
	},
	{
		type: "widget_button",
		name: "Button",
		description: "Standalone call-to-action button or download link with an optional icon.",
		fields: "label, url, icon, variant, align, new tab",
		needsPlugin: false,
	},
	{
		type: "widget_youtube",
		name: "YouTube",
		description: "Click-to-play YouTube facade. Loads no player until the visitor asks.",
		fields: "url, title, caption",
		needsPlugin: true,
	},
	{
		type: "widget_embed",
		name: "Embed",
		description: "Generic iframe embed (CodePen, maps, players) with a fixed aspect ratio.",
		fields: "url, title, aspect ratio",
		needsPlugin: false,
	},
	{
		type: "widget_image",
		name: "Image",
		description: "A figure with an optional caption — screenshots, diagrams, photos.",
		fields: "image, caption, wide",
		needsPlugin: false,
	},
	{
		type: "widget_code",
		name: "Code block",
		description: "Code sample on the dark plate surface with language label, filename and copy button.",
		fields: "language, filename, code",
		needsPlugin: false,
	},
	{
		type: "widget_cards",
		name: "Link cards",
		description: "A grid of linked cards — related tools, further reading, resources.",
		fields: "title, items[] { icon, title, url, description }",
		needsPlugin: false,
	},
	{
		type: "widget_product",
		name: "Product box",
		description: "Review/affiliate card with rating, pros, cons and a buy button.",
		fields: "name, image, rating, description, pros[], cons[], url, cta label, price",
		needsPlugin: true,
	},
	{
		type: "widget_quote",
		name: "Pull quote",
		description: "Highlighted quotation with attribution.",
		fields: "quote, attribution, role",
		needsPlugin: false,
	},
	{
		type: "widget_facts",
		name: "Facts table",
		description: "Key/value spec sheet — pricing, versions, limits.",
		fields: "title, items[] { label, value }",
		needsPlugin: false,
	},
	{
		type: "widget_toc",
		name: "Table of contents",
		description: "Auto-filled list of the article's headings, built in the browser.",
		fields: "title",
		needsPlugin: false,
	},
	{
		type: "widget_series",
		name: "Series nav",
		description: "Ordered list of posts in a series, highlighting the current one.",
		fields: "title, items[] { label, url }",
		needsPlugin: false,
	},
	{
		type: "widget_latest_posts",
		name: "Latest posts",
		description: "Live list of the newest entries in a collection, resolved by the plugin at render time.",
		fields: "heading, collection, limit, exclude current",
		needsPlugin: true,
	},
	{
		type: "widget_divider",
		name: "Divider",
		description: "A section break inside the article — a line, dots, or whitespace.",
		fields: "style",
		needsPlugin: false,
	},
];

async function viewCatalog(ctx: PluginContext): Promise<BlockResponse> {
	const settings = await readSettings(ctx);
	const contentRead = !!ctx.content;
	const schemaRead = !!ctx.schema;
	const granted = contentRead && schemaRead;
	const catalog = WIDGETS.map((widget) =>
		blocks.accordion({
			label: `${widget.name} — ${widget.type}`,
			blocks: [
				blocks.section(widget.description),
				blocks.fields([
					{ label: "Fields", value: widget.fields },
					{
						label: "Plugin routes",
						value: widget.needsPlugin ? "Uses widget settings/routes" : "Self-contained",
					},
				]),
			],
		}),
	);
	return {
		blocks: [
			blocks.header("Widget catalog"),
			blocks.section(
				`${WIDGETS.length} block types ship in the package's site/ directory. Copy them into your site's seed and component map as described in the setup guide.`,
			),
			blocks.banner({
				variant: granted ? "default" : "alert",
				title: granted ? "All capabilities granted" : "Optional capabilities not granted",
				description: granted
					? "content:read and schema:read are active — the Latest posts widget and the posts route work."
					: "content:read and schema:read are not granted. Static widgets still render; the Latest posts widget and posts route return empty results.",
			}),
			blocks.fields([
				{ label: "Posts collection", value: settings.postsCollection },
				{ label: "YouTube no-cookie", value: settings.youtubeNoCookie ? "On" : "Off" },
				{
					label: "Affiliate disclosure",
					value: settings.affiliateDisclosure ? "Set" : "Hidden",
				},
			]),
			blocks.divider(),
			...catalog,
		],
	};
}

const SETUP_STEPS = `1. Copy site/block-types/*.json into your seed file's blockTypes.
2. Add the block slugs to the blocks field's allowedTypes
   (e.g. the pages.content field or a posts.body field).
3. Copy site/components/*.astro and site/WidgetBlocks.astro
   into your project and register them with defineBlockComponents().
4. Re-apply the seed (emdash seed on a fresh database, or the
   schema API on a live site) so the block types exist in the CMS.`;

const POSTS_ROUTE_SNIPPET = `const res = await Astro.locals.emdash.handlePublicPluginApiRoute(
	"emdashhq-widgets", "GET", "posts",
	new Request(\`\${Astro.url.origin}/_emdash/api/plugins/emdashhq-widgets/posts?limit=5\`),
);
const { items } = res.success ? res.data : { items: [] };`;

async function viewSetup(ctx: PluginContext): Promise<BlockResponse> {
	const settings = await readSettings(ctx);
	const page: Block[] = [
		blocks.header("Setup guide"),
		blocks.section(
			"Sandboxed plugins cannot ship Astro render components, so the widgets are distributed as block-type JSON plus ready-made Astro components inside this package's site/ directory.",
		),
		blocks.header("Install the blocks"),
		blocks.code({ code: SETUP_STEPS, language: "bash" }),
		blocks.header("Plugin routes"),
		blocks.section(
			"Two public routes back the dynamic widgets. Widget components call them in-process — no HTTP roundtrip.",
		),
		blocks.fields([
			{
				label: "GET config",
				value: "Public widget settings: YouTube no-cookie mode, affiliate disclosure, posts collection.",
			},
			{
				label: "GET posts",
				value: "?collection=&limit=&exclude= — newest published entries with resolved public URLs. Needs content:read + schema:read.",
			},
		]),
		blocks.code({ code: POSTS_ROUTE_SNIPPET, language: "ts" }),
		blocks.header("Current settings"),
		blocks.fields([
			{ label: "Posts collection", value: settings.postsCollection },
			{ label: "YouTube no-cookie", value: settings.youtubeNoCookie ? "On" : "Off" },
			{ label: "Affiliate disclosure", value: settings.affiliateDisclosure || "(hidden)" },
			{ label: "Posts route", value: ctx.content ? "Active" : "Inactive — grant content:read" },
		]),
	];
	return { blocks: page };
}

export async function handleAdminInteraction(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<BlockResponse> {
	const input = routeCtx.input as PageLoad;
	try {
		if (input.type === "page_load") {
			if (input.page === "/setup") return viewSetup(ctx);
			return viewCatalog(ctx);
		}
		return { blocks: [blocks.banner({ variant: "error", title: "Unknown interaction" })] };
	} catch (error) {
		ctx.log.error("Admin interaction failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			blocks: [
				blocks.banner({
					variant: "error",
					title: "Something went wrong",
					description: error instanceof Error ? error.message : String(error),
				}),
			],
		};
	}
}
