#!/usr/bin/env node
/*
 * Rewrites the four blog posts as tutorials (new bodies, excerpts, covers,
 * SEO fields) and creates the "Content Widgets" entry in the resources
 * collection. Idempotent and safe to re-run against local dev and prod.
 *
 * Local:  node scripts/update-blog-content.mjs --local
 * Prod:   node scripts/update-blog-content.mjs --url https://emdashhq.com --token <token>
 */

import { readFile } from "node:fs/promises";

const args = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const [k, v] = a.replace(/^--/, "").split("=");
		return [k, v ?? true];
	}),
);

const IS_LOCAL = !!args.local;
const BASE = (args.url ?? "http://localhost:4321").replace(/\/$/, "");
const TOKEN = args.token;
let SESSION = args.session;

if (!IS_LOCAL && !TOKEN) {
	console.error("Prod needs --token (admin API token)");
	process.exit(1);
}

// Local dev: mint a bypass session so the REST API accepts us.
if (IS_LOCAL && !SESSION) {
	const res = await fetch(`${BASE}/_emdash/api/setup/dev-bypass`, { redirect: "manual" });
	SESSION = (res.headers.get("set-cookie") ?? "").match(/astro-session=[^;]+/)?.[0];
	if (!SESSION) {
		console.error("No dev-bypass session. Is the dev server running with setup incomplete?");
		process.exit(1);
	}
}

async function api(method, path, body) {
	const res = await fetch(`${BASE}/_emdash/api${path}`, {
		method,
		headers: {
			"X-EmDash-Request": "1",
			...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
			...(SESSION ? { Cookie: SESSION } : {}),
			...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
		},
		body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
		redirect: "manual",
	});
	let json = null;
	try {
		json = await res.json();
	} catch {}
	return { status: res.status, json };
}

const ok = (r) => r.status >= 200 && r.status < 300;
const fail = (r) => JSON.stringify(r.json).slice(0, 300);

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function uploadMedia(path, filename, alt) {
	const buf = await readFile(new URL(`../${path}`, import.meta.url));
	const form = new FormData();
	const type = MIME[filename.split(".").pop().toLowerCase()] ?? "application/octet-stream";
	form.set("file", new File([buf], filename, { type }));
	form.set("alt", alt);
	form.set("deduplicate", "true");
	const r = await api("POST", "/media", form);
	const item = r.json?.data?.item ?? r.json?.item;
	if (!ok(r) || !item?.id) {
		console.log(`  media ${filename}: ${r.status} ${fail(r)}`);
		return null;
	}
	console.log(`  media ${filename} -> ${item.id} (${item.storageKey})`);
	return item;
}

// ---------------------------------------------------------------- content ---
// Fresh key prefix per rewrite so regenerated bodies never collide with stored
// blocks (the API rejects a _key whose _type changed between revisions).
let keyN = 0;
const key = () => `w${String(keyN++).padStart(4, "0")}`;
const span = (text, marks = []) => ({ _type: "span", _key: key(), text, marks });
const ptBlock = (children, style = "normal", markDefs = []) => ({
	_type: "block",
	_key: key(),
	style,
	markDefs,
	children,
});
const p = (text) => ptBlock([span(text)]);
// Headings are Portable Text too — wrap them in a widget_prose so body only
// ever contains widget_* blocks.
// Inline figures carry a _img placeholder resolved to an uploaded media id in
// the apply step, so bodies stay declarative across local/prod runs.
let figN = 0;
const fig = (name, caption, wide = true) => ({ _type: "widget_image", _version: 1, _key: `fig${String(figN++).padStart(3, "0")}`, _img: name, caption, wide });
const h2 = (text) => ({ _type: "widget_prose", _version: 1, _key: key(), body: [ptBlock([span(text)], "h2")] });
const h3 = (text) => ({ _type: "widget_prose", _version: 1, _key: key(), body: [ptBlock([span(text)], "h3")] });
const pLink = (before, href, label, after) => {
	const mk = key();
	return ptBlock(
		[span(before), span(label, [mk]), span(after)],
		"normal",
		[{ _type: "link", _key: mk, href }],
	);
};
const prose = (...blocks) => ({ _type: "widget_prose", _version: 1, _key: key(), body: blocks });
const pt = (...texts) => texts.map((t) => p(t));
const notice = (kind, title, text) => ({
	_type: "widget_notice",
	_version: 1,
	_key: key(),
	kind,
	title,
	body: pt(text),
});
const steps = (title, items) => ({
	_type: "widget_steps",
	_version: 1,
	_key: key(),
	title,
	items: items.map(([t, b]) => ({ title: t, body: b })),
});
const checklist = (title, texts) => ({
	_type: "widget_checklist",
	_version: 1,
	_key: key(),
	title,
	items: texts.map((text) => ({ text })),
});
const code = (language, codeText, filename) => ({
	_type: "widget_code",
	_version: 1,
	_key: key(),
	language,
	...(filename ? { filename } : {}),
	code: codeText,
});
const button = (label, url, icon, variant = "solid", extra = {}) => ({
	_type: "widget_button",
	_version: 1,
	_key: key(),
	label,
	url,
	icon,
	variant,
	...extra,
});
const facts = (title, items) => ({
	_type: "widget_facts",
	_version: 1,
	_key: key(),
	title,
	items: items.map(([label, value]) => ({ label, value })),
});
const cards = (title, items) => ({
	_type: "widget_cards",
	_version: 1,
	_key: key(),
	title,
	items,
});
const tabs = (items) => ({
	_type: "widget_tabs",
	_version: 1,
	_key: key(),
	items: items.map(([label, body]) => ({ label, body })),
});
const accordion = (heading, items) => ({
	_type: "widget_accordion",
	_version: 1,
	_key: key(),
	heading,
	items: items.map(([title, body]) => ({ title, body })),
});
const divider = (style = "line") => ({ _type: "widget_divider", _version: 1, _key: key(), style });
const quote = (text, attribution, role) => ({
	_type: "widget_quote",
	_version: 1,
	_key: key(),
	quote: text,
	attribution,
	...(role ? { role } : {}),
});

// ------------------------------------------------------------- the posts ----
const POSTS = {
	"contact-form-spam-turnstile": {
		title: "Stop contact form spam with Cloudflare Turnstile",
		excerpt:
			"The contact form on this site was feeding the inbox junk. Turnstile took it to zero: here is the fifteen-minute setup, the page-cache trap we hit, and how to test it.",
		cover: { file: "uploads/covers/cover-turnstile.jpg", alt: "A paper mailbox behind a small turnstile gate, letters held at the checkpoint" },
		seo: {
			title: "Stop contact form spam with Cloudflare Turnstile",
			description:
				"Set up Cloudflare Turnstile on the EmDash Contact Forms plugin: get the keys, enable the widget, dodge the page-cache trap, and verify bot posts get challenged.",
		},
		body: [
			prose(
				p("The contact form here started collecting junk submissions. The built-in filters (a honeypot field, a minimum fill time, a per-IP hourly limit) stopped some of it, but enough got through to make the inbox annoying."),
				p("So the Contact Forms plugin got Cloudflare Turnstile. It runs a quiet browser check, hands the form a token, and the worker verifies that token before anything is stored or emailed. Most visitors never see a puzzle; the Managed mode here only escalates the submissions Cloudflare already suspects."),
			),
			fig("turnstile-flow", "The submit pipeline: the honeypot, fill-time check and hourly limit run first, Turnstile verifies the token at the door, and only then does anything reach the inbox."),
			h2("What you need"),
			checklist(null, [
				"A Cloudflare account (the free plan covers Turnstile)",
				"Contact Forms plugin 1.1.0 or newer",
				"Two keys from the dashboard: the site key and the secret key",
				"About fifteen minutes",
			]),
			h2("How a submission is judged"),
			prose(
				p("Every POST to the submit route passes five gates, in this order. Knowing the order explains most confusing behavior later:"),
			),
			steps("Five gates", [
				["Honeypot", "An invisible field that humans never fill. Bots that fill it get a fake success page and nothing is stored. They cannot tell they lost."],
				["Minimum fill time", "A submit faster than 1.5 seconds is a bot. Same trick: it gets a fake success, so scrapers never learn which gate caught them."],
				["Turnstile verify", "The widget's token goes to Cloudflare siteverify together with the visitor IP. A failed check returns cf_status=challenge."],
				["Rate limit", "A per-IP hourly cap, 20 submissions by default. Tripping it returns cf_status=rate_limited."],
				["Field validation", "Required fields, types and lengths are checked against the form definition. Only then is the row stored and the email sent."],
			]),
			notice("info", "It fails open on purpose", "If Cloudflare siteverify is unreachable or the plugin has no HTTP access, the submission is accepted rather than rejected. A Turnstile outage never takes the form down; the tradeoff is that a broken verifier quietly disables the spam check, so a sudden spam spike usually means the keys stopped working."),
			h2("Set it up"),
			steps("Five steps", [
				["Create a Turnstile site", "In the Cloudflare dashboard, open Turnstile and choose Add site. Enter your real hostname and keep the Managed widget mode. Cloudflare shows the site key and secret key once; copy both."],
				["Open the plugin settings", "Admin → Plugins → Contact forms → Settings. The two Turnstile fields only exist on 1.1.0 and newer."],
				["Paste both keys and save", "The site key renders the widget; the secret key verifies tokens. Set only one and the plugin stays off; a half-configured pair is treated as unconfigured."],
				["Redeploy the site", "If your pages are cached, the cached HTML has no widget on it. Redeploy or purge the cache, otherwise visitors submit with no token and get bounced."],
				["Test it", "Load the form page and look for the widget, then submit once yourself to confirm the happy path still works."],
			]),
			fig("cf-settings", "The plugin settings screen: the Turnstile site key and secret key sit next to the built-in rate limit."),
			h2("Verify it from the outside"),
			prose(p("A POST with no token should never reach the inbox. From a terminal:")),
			code(
				"bash",
				`curl -i -X POST https://your-site.com/_emdash/api/plugins/emdashhq-contact-forms/submit \\
  -F "slug=contact" -F "name=Bot" -F "email=bot@example.com" -F "message=hi"`,
			),
			prose(p("You want a 303 redirect to ?cf_status=challenge. The submission is not stored and no email goes out. A real browser submit carries the cf-turnstile-response token and lands in the inbox instead.")),
			h2("What the status codes mean"),
			facts(null, [
				["sent", "Stored and emailed (or a fake success fed to the honeypot and time traps)"],
				["saved", "Stored, but the notification email failed; check the email log"],
				["challenge", "Turnstile token missing or rejected; nothing was stored"],
				["rate_limited", "The hourly per-IP cap tripped"],
				["invalid", "Fields failed validation; the bad fields echo back in cf_fields"],
				["error", "Form slug not found or the form is disabled"],
			]),
			fig("cf-subs", "Submissions that pass land in the inbox with an email status for each one. Blocked posts never get a row."),
			notice("warning", "The cache trap we actually hit", "Keys were saved, but the page showed no widget. The deploy had warmed a widget-less copy of the contact page into the Workers cache and kept serving it. A redeploy fixed it. If the widget does not appear after saving, suspect the cache before the keys."),
			h2("Tuning it afterwards"),
			checklist("Worth adjusting", [
				"Rate limit per IP per hour: 20 by default, accepts 1 to 1000",
				"Keep submissions for (days): 0 keeps everything forever",
				"Confirmation email: each form can auto-reply to the visitor's email field",
				"Extra debug: plugin settings has a switch that turns on verbose submit logs",
				"Submissions export to CSV from the admin inbox when you need them out",
			]),
			h2("Worth knowing"),
			facts(null, [
				["Price", "Free with any Cloudflare account"],
				["User friction", "Usually invisible; Managed mode only challenges suspects"],
				["Privacy", "No tracking cookies, no puzzle farm"],
				["Mode used here", "Managed"],
			]),
			accordion("Common questions", [
				["Does it stop all spam?", "It stops automated posts and most scripted junk. A determined human can still pass a challenge. If flagged submissions keep slipping through, the plugin can quarantine them: stored as spam, never emailed."],
				["Does it work without JavaScript?", "No. The widget needs JavaScript in the browser. That is the point: bots posting the raw endpoint get challenged regardless."],
				["What if Cloudflare is down?", "Verification fails open: submissions are accepted so the form never goes offline with them. Watch for a spam spike as the telltale."],
				["Where do real submissions go?", "Same places as before: the admin inbox under Plugins → Contact forms, and an email through the site's configured provider."],
			]),
			fig("cf-form", "The live form on this site: in managed mode the widget renders nothing until Cloudflare decides a visitor needs a challenge."),
			button("Turnstile documentation", "https://developers.cloudflare.com/turnstile/", "arrow-up-right", "outline", { new_tab: true }),
			checklist("Done means", [
				"The widget renders on the form page",
				"A tokenless POST gets cf_status=challenge",
				"A real submit is stored and emailed",
				"A quiet inbox for a week",
			]),
		],
	},

	"emdash-widgets-plugin": {
		title: "Nineteen content widgets for EmDash posts and pages",
		excerpt:
			"Callouts, numbered steps, tabs, code blocks, video facades and more for the block editor. What ships in the plugin, how to install it, and where to see it working.",
		cover: { file: "uploads/covers/cover-widgets.jpg", alt: "A grid of small paper widget cards, accordion folds, checklists, buttons, laid out like letterpress blocks" },
		seo: {
			title: "Nineteen content widgets for EmDash",
			description:
				"Install the Content Widgets plugin for EmDash and get callouts, steps, tabs, code blocks and fifteen more block types in the editor. Includes a live demo post.",
		},
		body: [
			prose(
				p("Articles on this site needed more than paragraphs. Callouts for warnings, numbered steps for walkthroughs, code blocks for commands. The stock block editor ships a lean set on purpose, so I built the Content Widgets plugin: nineteen block types for the EmDash editor, usable in post bodies and on regular pages."),
				p("Everything renders on the server. There is no client-side bundle to load, and every widget picks up the site's type scale and colors through CSS variables, so the blocks look like part of the theme rather than a bolt-on."),
			),
			fig("widgets-catalog", "The catalog page the plugin adds under Plugins → Content Widgets: every block with a preview, a one-line description and its type name."),
			h2("Install it"),
			tabs([
				["From the registry", "Admin → Plugins → Browse → find Content Widgets → Install. The package is @bitdoze.com/emdashhq-widgets on plugins.emdashcms.com. This is the path for most sites: the registry handles versions and updates."],
				["From source", "Clone the plugin into your site's plugins/ directory, register it under sandboxed: in astro.config.mjs, and add it to package.json as a file: dependency. Take this path when you want to edit the widgets themselves."],
			]),
			h2("Allow the block types"),
			prose(p("New block types do not appear in the editor until a blocks field allows them. Open the collection, edit the blocks field, and tick the widget types under allowed types. In a seed file it looks like this:")),
			code(
				"json",
				`{
  "slug": "body",
  "type": "blocks",
  "validation": {
    "allowedTypes": ["widget_prose", "widget_notice", "widget_steps", "widget_code"]
  }
}`,
			),
			notice("info", "About the site/ folder", "Sandboxed plugins cannot register Astro components into a site's render pipeline, so the package ships its renderers in site/. Copy site/components into your project and map them with defineBlockComponents(); the README walks through it in four steps."),
			prose(
				p("Two ways to render them. Spread the shipped component map into your existing block renderer, or drop the standalone WidgetBlocks component on a widget-only field like a post body:"),
			),
			code(
				"typescript",
				`import { widgetComponents } from "./widgets/widget-components";
import WidgetBlocks from "./widgets/WidgetBlocks.astro";

// path 1: merge into the page's block map
const blockComponents = defineBlockComponents({
  ...widgetComponents,
});

// path 2: a widget-only field, like a post body
<WidgetBlocks value={post.data.body} />`,
				"any Astro page",
			),
			fig("widgets-editor", "Once the types are allowed, they show up in the block picker alongside the regular blocks."),
			h2("What each group is for"),
			prose(p("Nineteen blocks is a lot of names. Grouped by job:")),
			checklist("Writing and structure", [
				"Prose: Portable Text paragraphs between the widgets",
				"Notice: info, success, warning and danger callouts for gotchas",
				"Checklist and steps: task lists and numbered walkthroughs",
				"Accordion and tabs: collapsed sections and side-by-side variants",
				"Divider: a styled rule between sections",
			]),
			checklist("Media and embeds", [
				"Image: figure with caption, served through the media pipeline",
				"Code: syntax highlighting with filename and language label",
				"YouTube: a click-to-load facade, privacy-enhanced host",
				"Embed: a sandboxed iframe for anything else",
			]),
			checklist("Reference and calls to action", [
				"Button: links with twelve built-in icons",
				"Cards: small link grids for related reading",
				"Quote: pull quotes with attribution",
				"Facts: a label/value fact sheet for specs and pricing",
				"Product: a review box with rating and pros/cons",
				"Table of contents: built from the post's own headings",
				"Series: previous/next navigation for multi-part posts",
				"Latest posts: a recent-articles list that skips the current post",
			]),
			h2("Pages get them too"),
			prose(p("Nothing here is post-specific. The contact page's form block and this site's marketing pages use the same mechanism: any blocks field on any collection can allow the widget types, and the same WidgetBlocks component renders them. Write the field once, use the widgets everywhere.")),
			h2("See it working"),
			prose(p("Every block on the list is rendering in the demo post linked below, the same one you can open in this site's editor to inspect how it was put together.")),
			cards(null, [
				{ icon: "rocket", title: "Live demo post", url: "/blog/widget-gallery/", description: "All nineteen blocks in one article." },
				{ icon: "download", title: "Registry listing", url: "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-widgets", description: "Install button, changelog and screenshots." },
				{ icon: "github", title: "Source", url: "https://github.com/bitdoze/emdashhq.com", description: "The plugin lives in this site's repo." },
			]),
			button("Open the widget gallery", "/blog/widget-gallery/", "book"),
			facts(null, [
				["Version", "1.0.2"],
				["License", "MIT"],
				["Blocks", "19"],
				["Price", "Free"],
			]),
		],
	},

	"emdash-blog-section": {
		title: "How the blog on this site works",
		excerpt:
			"A posts collection, one Astro route and a hub block. The whole thing took an afternoon, including one redirect bug worth a warning.",
		cover: { file: "uploads/covers/cover-blog.jpg", alt: "A vintage printing press feeding out a magazine page, a stack of paper beside it" },
		seo: {
			title: "How the blog on this site works",
			description:
				"The anatomy of a blog built on EmDash: a posts collection, a dynamic Astro route, a hub block and a sitemap, plus the trailing-slash trap we stepped in.",
		},
		body: [
			prose(
				p("This site has a blog now. Not a separate app: a posts collection, one Astro route, and a block that lists articles on the /blog page. Here is the anatomy of it, so you can build the same thing, or take it apart to see how EmDash pieces fit together."),
				p("It took an afternoon. Most of that went into deciding what a post is; the code is the easy part once the schema is honest."),
			),
			facts(null, [
				["Collection", "posts: title, excerpt, cover, body blocks"],
				["Route", "src/pages/blog/[slug].astro"],
				["Hub page", "/blog, a page with a site_posts block"],
				["Rendering", "Server-rendered on every request"],
				["Extras", "Drafts, revisions, per-post SEO, sitemap, RSS"],
			]),
			fig("blog-pipeline", "The whole blog in three pieces: the posts collection holds the data, one route renders every slug, and the body blocks become the article."),
			h2("The collection"),
			prose(p("The posts collection is regular EmDash schema. The interesting bits are the urlPattern, which makes entries routable and lands them in the sitemap, and the body field, a blocks field where all the widgets live.")),
			code(
				"json",
				`{
  "slug": "posts",
  "urlPattern": "/blog/{slug}",
  "supports": ["drafts", "revisions", "seo", "search"],
  "fields": [
    { "slug": "title", "type": "string", "required": true },
    { "slug": "excerpt", "type": "text" },
    { "slug": "cover", "type": "image" },
    { "slug": "body", "type": "blocks" },
    { "slug": "featured", "type": "boolean" }
  ]
}`,
				"seed.json",
			),
			prose(
				p("Two fields carry the listing pages: excerpt is the card text and meta description fallback, cover is the card image and og:image. Skip them and every surface downstream looks unfinished."),
			),
			h2("The route"),
			prose(p("One file renders every post. It looks the entry up by slug, rewrites to /404 when it is missing, and hands the body blocks to the widget renderer:")),
			code(
				"typescript",
				`const { entry: post, error, cacheHint } =
  await getEmDashEntry("posts", Astro.params.slug);
if (!post) return Astro.rewrite("/404");
if (Astro.cache.enabled) Astro.cache.set(cacheHint);

const seo = getSeoMeta(post, {
  siteUrl: Astro.url.origin,
  path: \`/blog/\${post.id}/\`,
});
// <WidgetBlocks value={post.data.body} />`,
				"src/pages/blog/[slug].astro",
			),
			prose(p("getSeoMeta resolves the SEO tab on each post (meta title, description, og image) and falls back to the title and excerpt when the fields are empty. Canonical and robots come along for free.")),
			prose(p("The cacheHint line matters more than it looks. Passing it to Astro.cache tags the response, so publishing a post invalidates exactly the cached pages that show it: the article itself, /blog, and the homepage section. Skip it and edits take a cache lifetime to appear.")),
			h2("The hub page"),
			prose(p("/blog itself is an ordinary page with a site_posts block on it. The block queries the posts collection, orders by published date, and renders the newest article as a lead card with the rest in a grid. The page is content, not code: editors can move it, rename it and add blocks around it without touching the repo.")),
			prose(p("The same block with a limit of three is the \"Latest from the blog\" section on the homepage. One component, two placements, no duplicated markup.")),
			h2("The feed"),
			prose(p("rss.xml.ts joins the posts collection with tutorials, videos and resources into one feed, newest first. Posts link to their /blog/ URLs; the hub collections link out to their real destinations (bitdoze.com, YouTube, npm). One line of plumbing: each collection passes a linkField, and posts get the special case of an internal path.")),
			h2("Drafts and publishing"),
			prose(p("Saving a post writes a draft revision; the live page only changes when you hit publish. That is why a saved-but-unpublished edit can look lost on the site while being perfectly visible in the admin. The SEO tab sits on the same editor screen, so meta title and description are part of the publish checklist rather than an afterthought.")),
			divider("line"),
			h2("One trap worth knowing"),
			notice("warning", "Leave trailingSlash alone", "Setting Astro's trailingSlash to \"always\" 404s every /_emdash/api/ route without a trailing slash; it briefly broke the contact form on this site. The sitemap emits slashless post URLs that 301 to the canonical form. That redirect is expected and harmless: do not try to fix it with trailingSlash."),
			h2("Ship list"),
			checklist("If you are building your own", [
				"A posts collection with the fields above",
				"urlPattern set to /blog/{slug}",
				"A route that renders entry body blocks",
				"A hub page with a site_posts block",
				"A Blog link in the primary menu",
				"Posts folded into your RSS source list",
				"One real published post, the rest follows",
				"Excerpt, cover and SEO fields filled per post",
			]),
			h2("Read next"),
			cards(null, [
				{ icon: "book", title: "The widgets plugin", url: "/blog/emdash-widgets-plugin/", description: "Nineteen block types for post bodies." },
				{ icon: "check", title: "Kill the form spam", url: "/blog/contact-form-spam-turnstile/", description: "Cloudflare Turnstile on contact forms." },
				{ icon: "rocket", title: "The demo post", url: "/blog/widget-gallery/", description: "Every widget in one article." },
			]),
			button("Browse the blog", "/blog/", "arrow-right"),
		],
	},
};

// For the gallery post we keep the body as-is; update cover/excerpt/seo only.
const GALLERY = {
	slug: "widget-gallery",
	title: "The widget gallery, every block in one post",
	excerpt:
		"All nineteen Content Widgets blocks in a single article, what each one looks like and when to reach for it.",
	cover: { file: "uploads/covers/cover-gallery.jpg", alt: "A printer's specimen sheet with a grid of type blocks, quote marks, stars and frames" },
	seo: {
		title: "The widget gallery, all nineteen blocks, live",
		description:
			"A live demo of every Content Widgets block for EmDash, notices, steps, tabs, code, video, cards, a table of contents and more.",
	},
};

// -------------------------------------------------------------- resource ----
const RESOURCE = {
	slug: "emdash-content-widgets",
	data: {
		title: "Content Widgets",
		kind: "plugin",
		price_type: "free",
		summary:
			"Nineteen server-rendered block types for posts and pages: callouts, steps, tabs, code, video, cards and more. Built for the block editor.",
		url: "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-widgets",
		demo_url: "https://emdashhq.com/blog/widget-gallery/",
		cta_label: "Install",
		latest_version: "1.0.2",
		license: "MIT",
		package: "@bitdoze.com/emdashhq-widgets",
		publisher: "@bitdoze.com",
		featured: true,
		changelog: "1.0.2: docs link the live demo. 1.0.1: listing assets. 1.0.0: first release.",
	},
	imageFile: { file: "plugins/emdashhq-widgets/images/screenshot-widgets.jpg", alt: "The Content Widgets block picker in the EmDash editor" },
};

// ------------------------------------------------- inline article images ---
const INLINE = {
	"turnstile-flow": { file: "uploads/article-images/turnstile-flow.jpg", alt: "The submission pipeline: envelope, honey pot, clock and turnstile gate guarding the inbox" },
	"widgets-catalog": { file: "plugins/emdashhq-widgets/images/screenshot-catalog.png", alt: "The Content Widgets catalog in the EmDash admin" },
	"widgets-editor": { file: "plugins/emdashhq-widgets/images/screenshot-editor.png", alt: "A widget block picked from the EmDash post editor" },
	"blog-pipeline": { file: "uploads/article-images/blog-pipeline.jpg", alt: "The blog pipeline: posts collection, one route, the rendered article" },
	"cf-settings": { file: "plugins/emdashhq-contact-forms/images/screenshot-settings.png", alt: "The contact forms plugin settings page showing the Turnstile key fields" },
	"cf-subs": { file: "plugins/emdashhq-contact-forms/images/screenshot-submissions.png", alt: "The submissions inbox listing stored form entries with status and email columns" },
	"cf-form": { file: "plugins/emdashhq-contact-forms/images/screenshot-public-form.png", alt: "The public contact form rendered on the site" },
};

// ------------------------------------------------------------------ apply ---
console.log(`Updating blog content on ${BASE}`);

// 1. upload covers
console.log("1. media");
const covers = {};
for (const [slug, post] of Object.entries(POSTS)) {
	covers[slug] = await uploadMedia(post.cover.file, `${slug}.jpg`, post.cover.alt);
}
covers[GALLERY.slug] = await uploadMedia(GALLERY.cover.file, `${GALLERY.slug}.jpg`, GALLERY.cover.alt);
const resImage = await uploadMedia(RESOURCE.imageFile.file, "content-widgets-screenshot.jpg", RESOURCE.imageFile.alt);
const inline = {};
for (const [name, spec] of Object.entries(INLINE)) {
	const ext = spec.file.split(".").pop();
	inline[name] = await uploadMedia(spec.file, `inline-${name}.${ext}`, spec.alt);
}
const resolveBody = (body) =>
	body?.flatMap((b) => {
		if (!b._img) return [b];
		const media = inline[b._img];
		if (!media?.id) return [];
		const { _img, ...rest } = b;
		return [{ ...rest, image: { id: media.id, alt: INLINE[b._img].alt } }];
	});

// 2. posts
console.log("2. posts");
async function applyPost(slug, post, includeBody) {
	const found = await api("GET", `/content/posts/${encodeURIComponent(slug)}`);
	const item = found.json?.data?.item ?? found.json?.item;
	if (!ok(found) || !item?.id) {
		console.log(`  posts/${slug}: not found (${found.status}) ${fail(found)}`);
		return;
	}
	const media = covers[slug];
	const data = {
		title: post.title,
		excerpt: post.excerpt,
		...(media ? { cover: { id: media.id, alt: post.cover.alt } } : {}),
		...(includeBody ? { body: resolveBody(post.body) } : {}),
	};
	const seo = { ...post.seo, ...(media ? { image: media.storageKey } : {}) };
	const r = await api("PUT", `/content/posts/${item.id}`, { data, seo });
	console.log(`  posts/${slug}: ${r.status} ${ok(r) ? "updated" : fail(r)}`);
	if (!ok(r)) return;
	// ensure live revision is published
	const pub = await api("POST", `/content/posts/${item.id}/publish`, {});
	if (pub.status !== 200 && pub.status !== 409) {
		console.log(`    publish: ${pub.status} ${fail(pub)}`);
	}
}
for (const [slug, post] of Object.entries(POSTS)) await applyPost(slug, post, true);
await applyPost(GALLERY.slug, GALLERY, false);

// 3. resource entry for the plugins page
console.log("3. resource");
{
	const found = await api("GET", `/content/resources/${encodeURIComponent(RESOURCE.slug)}`);
	const item = found.json?.data?.item ?? found.json?.item;
	const data = {
		...RESOURCE.data,
		...(resImage ? { image: { id: resImage.id, alt: RESOURCE.imageFile.alt } } : {}),
	};
	if (ok(found) && item?.id) {
		const r = await api("PUT", `/content/resources/${item.id}`, { data });
		const pub = await api("POST", `/content/resources/${item.id}/publish`, {});
		console.log(`  resources/${RESOURCE.slug}: update ${r.status}, publish ${pub.status}`);
	} else {
		const r = await api("POST", `/content/resources`, { data, slug: RESOURCE.slug });
		const created = r.json?.data?.item ?? r.json?.item;
		if (ok(r) && created?.id) {
			const pub = await api("POST", `/content/resources/${created.id}/publish`, {});
			console.log(`  resources/${RESOURCE.slug}: created, publish ${pub.status}`);
		} else {
			console.log(`  resources/${RESOURCE.slug}: ${r.status} ${fail(r)}`);
		}
	}
}

console.log("Done.");
