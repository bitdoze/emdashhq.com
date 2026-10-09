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

async function uploadMedia(path, filename, alt) {
	const buf = await readFile(new URL(`../${path}`, import.meta.url));
	const form = new FormData();
	form.set("file", new File([buf], filename, { type: "image/jpeg" }));
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
let keyN = 0;
const key = () => `u${String(keyN++).padStart(4, "0")}`;
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
				p("The contact form here started collecting junk submissions. The built-in filters (honeypot field, minimum fill time, a per-IP hourly limit) stopped some of it, but enough got through to make the inbox annoying."),
				p("So the Contact Forms plugin got Cloudflare Turnstile. It runs a quiet browser check, hands the form a token, and the worker verifies that token before anything is stored or emailed. Most visitors never see a puzzle. Managed mode only escalates the suspicious ones."),
			),
			h2("What you need"),
			checklist(null, [
				"A Cloudflare account (the free plan covers Turnstile)",
				"Contact Forms plugin 1.1.0 or newer",
				"Two keys: the site key and the secret key",
				"About fifteen minutes",
			]),
			h2("Set it up"),
			steps("Five steps", [
				["Create a Turnstile site", "In the Cloudflare dashboard, open Turnstile and choose Add site. Enter your real hostname and keep the Managed widget mode. Cloudflare shows the site key and secret key once; copy both."],
				["Open the plugin settings", "Admin → Plugins → Contact forms → Settings. The two Turnstile fields only exist on 1.1.0 and newer."],
				["Paste both keys and save", "The site key renders the widget; the secret key verifies tokens. Set only one and the plugin stays off; a half-configured pair is treated as unconfigured."],
				["Redeploy the site", "If your pages are cached, the cached HTML has no widget on it. Redeploy or purge the cache, otherwise visitors submit with no token and get bounced."],
				["Test it", "Load the form page and look for the widget, then submit once yourself to confirm the happy path still works."],
			]),
			h2("Verify it from the outside"),
			prose(p("A POST with no token should never reach the inbox. From a terminal:")),
			code(
				"bash",
				`curl -i -X POST https://your-site.com/_emdash/api/plugins/emdashhq-contact-forms/submit \\
  -F "slug=contact" -F "name=Bot" -F "email=bot@example.com" -F "message=hi"`,
			),
			prose(p("You want a 303 redirect to ?cf_status=challenge. The submission is not stored and no email goes out. A real browser submit carries the cf-turnstile-response token and lands in the inbox instead.")),
			notice("warning", "The cache trap we actually hit", "Keys were saved, but the page showed no widget. The deploy had warmed a widget-less copy of the contact page into the Workers cache and kept serving it. A redeploy fixed it. If the widget does not appear after saving, suspect the cache before the keys."),
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
				["Where do real submissions go?", "Same places as before: the admin inbox under Plugins → Contact forms, and an email through the site's configured provider."],
			]),
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
				p("Articles on this site needed more than paragraphs. Callouts for warnings, numbered steps for walkthroughs, code blocks for commands. The Content Widgets plugin adds nineteen block types to the EmDash editor, and they work in post bodies and on regular pages."),
				p("Everything renders on the server. There is no client-side bundle to load, and every widget picks up the site's own type scale and colors through CSS variables, so it looks like part of the theme rather than a bolt-on."),
			),
			h2("Install it"),
			tabs([
				["From the registry", "Admin → Plugins → Browse → find Content Widgets → Install. The package is @bitdoze.com/emdashhq-widgets on plugins.emdashcms.com."],
				["From source", "Clone the plugin into your site's plugins/ directory, register it under sandboxed: in astro.config.mjs, and add it to package.json as a file: dependency. The repo has the full layout."],
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
			notice("info", "About the site/ folder", "Sandboxed plugins cannot register Astro components into a site's render pipeline, so the package ships its renderers in site/. Copy site/components into your project and map them in your blocks component; the README walks through it in four steps."),
			h2("What is inside"),
			checklist("Nineteen blocks", [
				"Prose: Portable Text between the widgets",
				"Notice: info, success, warning and danger callouts",
				"Accordion and tabs: collapsed and tabbed sections",
				"Checklist and steps: task lists and numbered walkthroughs",
				"Button: links with twelve built-in icons",
				"YouTube: click-to-load facade, privacy-enhanced host",
				"Embed: iframe sandbox for anything else",
				"Image: figure with caption through the media pipeline",
				"Code: syntax-highlighted with filename and language",
				"Product: review box with rating, pros and cons",
				"Cards: small link grids with icons",
				"Quote: pull quotes with attribution",
				"Facts: a label/value fact sheet",
				"Table of contents: built from the post's headings",
				"Series: previous/next navigation for multi-part posts",
				"Latest posts: a recent-articles list that skips the current post",
				"Divider: a horizontal rule, styled",
			]),
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
			),
			facts(null, [
				["Collection", "posts: title, excerpt, cover, body blocks"],
				["Route", "src/pages/blog/[slug].astro"],
				["Rendering", "Server-rendered on every request"],
				["Extras", "Drafts, revisions, per-post SEO, sitemap"],
			]),
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
			h2("The route"),
			prose(p("One file renders every post. It looks the entry up by slug, rewrites to /404 when it is missing, and hands the body blocks to the widget renderer:")),
			code(
				"typescript",
				`const { entry: post, error, cacheHint } =
  await getEmDashEntry("posts", Astro.params.slug);
if (!post) return Astro.rewrite("/404");

const seo = getSeoMeta(post, {
  siteUrl: Astro.url.origin,
  path: \`/blog/\${post.id}/\`,
});
// <WidgetBlocks value={post.data.body} />`,
				"src/pages/blog/[slug].astro",
			),
			prose(p("getSeoMeta resolves the SEO tab on each post (meta title, description, og image) and falls back to the title and excerpt when the fields are empty. Canonical and robots come along for free.")),
			h2("The hub page"),
			prose(p("/blog itself is an ordinary page with a site_posts block on it. The block queries the posts collection, orders by published date, and renders the card list. The page is content, not code: editors can move it, rename it and add blocks around it without touching the repo.")),
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
		...(includeBody ? { body: post.body } : {}),
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
