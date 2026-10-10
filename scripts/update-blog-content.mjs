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
const key = () => `x${String(keyN++).padStart(4, "0")}`;
const span = (text, marks = []) => ({ _type: "span", _key: key(), text, marks });
const ptBlock = (children, style = "normal", markDefs = []) => ({
	_type: "block",
	_key: key(),
	style,
	markDefs,
	children,
});
const p = (text) => ptBlock([span(text)]);
// Headings are Portable Text too - wrap them in a widget_prose so body only
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
			"The contact form on this site was feeding the inbox junk. Turnstile took it to zero: the real pipeline, the exact fields a bot must fake, verified curl tests, and the cache trap we hit.",
		cover: { file: "uploads/covers/cover-turnstile.jpg", alt: "A paper mailbox behind a small turnstile gate, letters held at the checkpoint" },
		seo: {
			title: "Stop contact form spam with Cloudflare Turnstile",
			description:
				"Set up Cloudflare Turnstile on the EmDash Contact Forms plugin: the real eight-gate pipeline, the cf_status decoder, verified curl tests, and the page-cache trap.",
		},
		body: [
			prose(
				p("The contact form on this site runs exactly the setup below. Before Turnstile it was collecting scripted submissions - the built-in filters caught some, but enough got through to make the inbox a chore. After adding it, junk posts stopped creating rows entirely: what lands in the inbox now is real people and nothing else."),
				p("The short version: the Contact Forms plugin renders a Cloudflare Turnstile widget on the form, the browser hands back a token, and the submit route verifies that token with Cloudflare before it stores anything or sends mail. A POST without a valid token gets a 303 redirect to cf_status=challenge - no database row, no email. Everything below is the real pipeline from the plugin source, plus tests I ran against the live form."),
			),
			fig("turnstile-flow", "The submit pipeline: the honeypot and fill-time traps run first and lie to the bot, Turnstile verifies the token at the door, and only then does anything reach the inbox."),
			h2("What you need"),
			checklist(null, [
				"A Cloudflare account (the free plan covers Turnstile)",
				"Contact Forms plugin 1.1.0 or newer",
				"Two keys from the dashboard: the site key and the secret key",
				"About fifteen minutes",
			]),
			h2("How a submission is judged"),
			prose(
				p("Every POST to the submit route passes these gates, in this order. The order matters: a request can only fail one gate, and which one tells you what the sender was."),
			),
			steps("The gates, in order", [
				["Honeypot", "The cf_hp field is invisible to humans and bots fill it. Tripping it returns a fake cf_status=sent and stores nothing - the bot thinks it won."],
				["Form lookup", "cf_slug must match an enabled form. No match means cf_status=error before anything else is checked."],
				["Minimum fill time", "The hidden cf_ts field carries the page-load timestamp. A submit under 1.5 seconds old is a bot and gets another fake sent."],
				["Turnstile verify", "When both keys are set, cf-turnstile-response goes to Cloudflare siteverify with the secret key and the visitor IP. Missing or rejected token: cf_status=challenge."],
				["Rate limit", "Counts stored submissions from the same IP in the last hour against the configured cap, 20 by default. Over it: cf_status=rate_limited."],
				["Field validation", "Each field is checked against the form definition. Failures return cf_status=invalid with the bad keys echoed in cf_fields."],
				["Store", "The row is written first - before email - so a mail outage never loses a message. That is why a broken mail config shows status saved, not sent."],
				["Email", "The notification goes through the site's configured provider, and the row records the attempt. If the form has send confirmation on, the visitor gets an auto-reply too."],
			]),
			notice("info", "Two gates lie on purpose", "The honeypot and fill-time traps return a success-shaped redirect instead of an error. A scraper watching responses cannot tell which gate caught it, so it never learns what to fix. You can watch this happen yourself in the curl tests below."),
			h2("The two contracts"),
			prose(
				p("Everything the route needs is in the posted form data. These are the real field names - the prefix matters, and getting it wrong is the first trap:"),
			),
			facts("Posted fields", [
				["cf_slug", "The form slug to submit to. Plain \"slug\" is ignored and returns error"],
				["cf_hp", "Honeypot. Must be empty; the input is hidden and never filled by humans"],
				["cf_ts", "Page-load timestamp in ms; posts younger than 1.5 s are bots"],
				["cf-turnstile-response", "The token Cloudflare's widget writes into the form"],
				["cf_page", "Optional URL the submit came from, stored on the row"],
				["your fields", "Whatever the form defines - name, email, subject, message here"],
			]),
			prose(
				p("The answer is never JSON. The route 303-redirects back to the referring page with cf_status in the query string, so a plain HTML form with no JavaScript still completes the loop - the browser just lands on a page that can read the status."),
			),
			h2("Set it up"),
			steps("Five steps", [
				["Create a Turnstile site", "In the Cloudflare dashboard, open Turnstile and choose Add site. Enter your real hostname and keep the Managed widget mode. Cloudflare shows the site key and secret key once; copy both."],
				["Open the plugin settings", "Admin → Plugins → Contact forms → Settings. The two Turnstile fields only exist on 1.1.0 and newer."],
				["Paste both keys and save", "The site key renders the widget; the secret key verifies tokens. Set only one and the gate stays off: a half-configured pair is treated as unconfigured, not half-on."],
				["Redeploy or purge the cache", "If pages are cached, the cached HTML has no widget on it. Cached pages keep collecting challenge failures until the cache refreshes."],
				["Test it", "Load the form page, confirm the widget, submit once yourself for the happy path, then run the curl below for the bot path."],
			]),
			fig("cf-settings", "The plugin settings screen: the Turnstile site key and secret key sit next to the built-in rate limit."),
			h2("Test it from the outside"),
			prose(
				p("These are real responses from this site's live endpoint, not a mock. A tokenless POST must be challenged:"),
			),
			code(
				"bash",
				`curl -i -X POST https://emdashhq.com/_emdash/api/plugins/emdashhq-contact-forms/submit \\
  -F "cf_slug=contact" -F "name=Bot" -F "email=bot@example.com" \\
  -F "subject=test" -F "message=hi"`,
			),
			code(
				"plaintext",
				`HTTP/2 303
location: /?cf=contact&cf_status=challenge`,
				"what came back",
			),
			prose(
				p("No row is written, no mail goes out. Now the trap I fell into writing this: my first test posted slug=contact instead of cf_slug=contact and got cf_status=error - the route read an empty slug and reported the form missing, which is honest but misleading when you typo the field name. If you see error instead of challenge, check the field names before the keys."),
			),
			code(
				"bash",
				`curl -si -X POST https://emdashhq.com/_emdash/api/plugins/emdashhq-contact-forms/submit \\
  -F "cf_slug=contact" -F "name=Bot" -F "email=bot@example.com" \\
  -F "subject=test" -F "message=hi" -F "cf_hp=spammy"`,
			),
			code(
				"plaintext",
				`HTTP/2 303
location: /?cf=contact&cf_status=sent`,
				"honeypot filled - fake success",
			),
			prose(
				p("That sent is a lie in the good direction: the response says success, the database got nothing. The submissions inbox on this site held eight rows when I checked - all real, every one with an email status recorded."),
			),
			h2("What the status codes mean"),
			facts(null, [
				["sent", "Stored and emailed - or a fake success fed to the honeypot and time traps"],
				["saved", "Stored, but the notification email failed; the row keeps the error"],
				["challenge", "Turnstile token missing or rejected; nothing was stored"],
				["rate_limited", "The hourly per-IP cap tripped"],
				["invalid", "Fields failed validation; the bad keys echo back in cf_fields"],
				["error", "Form slug unknown or disabled - or too many posted fields"],
			]),
			fig("cf-subs", "Submissions that pass land in the inbox with an email status for each one. Blocked posts never get a row."),
			h2("What a stored row contains"),
			prose(
				p("Each passing submission records more than the answers - enough to debug delivery problems later without a second system:"),
			),
			checklist(null, [
				"The answers plus the field labels at submit time",
				"IP, user agent and country (from the edge request)",
				"The page URL the submit came from",
				"emailStatus and emailAttempts, so a provider outage is visible, not silent",
				"A new / read / flagged state you can triage in the inbox",
			]),
			h2("The fail-open trade-off, honestly"),
			prose(
				p("When Turnstile is configured but siteverify cannot be reached, the plugin accepts the submission. The reasoning: a Cloudflare outage should never take your contact form down with it. The cost: a silently broken verifier quietly turns the spam check off - you find out via a spam spike, not an error. If junk suddenly reappears, suspect the keys before the bots got smarter."),
			),
			notice("warning", "The cache trap we actually hit", "Keys were saved, but the page showed no widget. The deploy had warmed a widget-less copy of the contact page into the Workers cache and kept serving it. A redeploy fixed it. If the widget does not appear after saving, suspect the cache before the keys."),
			h2("Tuning it afterwards"),
			checklist("Worth adjusting", [
				"Rate limit per IP per hour: 20 by default, accepts 1 to 1000; the count is over stored rows, so challenged posts do not eat the budget",
				"Keep submissions for (days): 0 keeps everything forever",
				"Confirmation email: each form can auto-reply to the visitor's email field - the contact form here has it on",
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
				["Does it stop all spam?", "It stops automated posts and most scripted junk. A determined human can still pass a challenge. Flagged submissions can be quarantined in the inbox: stored as spam, never emailed."],
				["Does it work without JavaScript?", "The widget needs JavaScript in the browser. That is the point: bots posting the raw endpoint get challenged regardless."],
				["What if Cloudflare is down?", "Verification fails open: submissions are accepted so the form never goes offline with them. Watch for a spam spike as the telltale."],
				["Where do real submissions go?", "The admin inbox under Plugins → Contact forms, plus an email through the site's configured provider."],
			]),
			fig("cf-form", "The live form on this site: in managed mode the widget renders nothing until Cloudflare decides a visitor needs a challenge."),
			button("Turnstile documentation", "https://developers.cloudflare.com/turnstile/", "arrow-up-right", "outline", { new_tab: true }),
			checklist("Done means", [
				"The widget renders on the form page",
				"A tokenless POST gets cf_status=challenge",
				"A filled honeypot gets a fake sent and stores nothing",
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
				p("Articles on this site needed more than paragraphs. Callouts for warnings, numbered steps for walkthroughs, code blocks for commands, a table of contents on long posts. The stock block editor ships a lean set on purpose, so I built the Content Widgets plugin: nineteen block types for the EmDash editor, usable in post bodies and on regular pages."),
				p("The short version: install @bitdoze.com/emdashhq-widgets from the registry, allow the widget types on your blocks field, copy the renderers from the package's site/ folder into your project, and the editor's slash menu grows nineteen new entries. Everything renders on the server, picks up the site's type scale and colors through CSS variables, and ships no client-side bundle."),
			),
			fig("widgets-catalog", "The catalog page the plugin adds under Plugins → Content Widgets: every block with a preview, a one-line description and its type name."),
			h2("What actually ships"),
			prose(p("Nineteen blocks is a lot of names. Grouped by the job they do:")),
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
				"Product: a review box with rating, pros/cons and an affiliate disclosure line",
				"Table of contents: built from the post's own headings",
				"Series: previous/next navigation for multi-part posts",
				"Latest posts: a recent-articles list that skips the current post",
			]),
			h2("What the editor actually stores"),
			prose(
				p("This is a real notice block lifted from the demo post's stored body - the whole record, nothing trimmed:"),
			),
			code(
				"json",
				`{
  "_type": "widget_notice",
  "_version": 1,
  "_key": "meywrdak",
  "kind": "info",
  "title": "Info notice",
  "body": [
    {
      "_type": "block",
      "style": "normal",
      "children": [
        { "_type": "span", "text": "A neutral note...", "marks": [] }
      ]
    }
  ]
}`,
				"a stored widget block",
			),
			prose(
				p("Three details matter. The _type is the contract between editor and renderer; _version versions the shape so a plugin update can migrate old blocks; and _key is immutable - the API rejects an update that reuses a key with a different type, which is worth knowing the first time you rewrite a body through the REST API. Rich text fields like body carry real Portable Text, so spans, marks and links survive intact."),
			),
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
			h2("Wire the renderers"),
			notice("info", "Why a site/ folder exists", "Sandboxed plugins run in a Worker isolate and cannot register Astro components into a site's render pipeline. So the package ships its renderers as plain Astro files in site/ - you copy them into your project and they become your components, free of the sandbox. It is the distribution format, not a workaround."),
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
			h2("Anatomy of one widget"),
			prose(
				p("Every renderer is the same small shape - props carry the stored block value, markup is plain HTML, and styling reads theme tokens instead of hardcoding colors. Skinned down to its skeleton, a widget looks like this:"),
			),
			code(
				"html",
				`---
const { value } = Astro.props;
---

<aside class={\`wgt-notice wgt-notice-\${value.kind}\`}>
  {value.title && <p class="wgt-notice-title">{value.title}</p>}
  <PortableText value={value.body} />
</aside>

<style>
  .wgt-notice {
    border-left: 3px solid var(--color-brand);
    background: var(--color-surface);
    padding: var(--spacing-md);
  }
</style>`,
				"site/components/WidgetNotice.astro, simplified",
			),
			prose(
				p("The wgt- class prefix keeps widget CSS from colliding with the theme, and var() tokens mean the same file renders correctly in a cream-paper theme or an ink-dark one. Copy a component, change the fields, and you have a custom widget that stores Portable Text like the built-ins."),
			),
			h2("Pages get them too"),
			prose(p("Nothing here is post-specific. The contact page's form block and this site's marketing pages use the same mechanism: any blocks field on any collection can allow the widget types, and the same WidgetBlocks component renders them. Write the field once, use the widgets everywhere.")),
			h2("See it working"),
			prose(p("Every block on the list is rendering in the demo post linked below, the same one you can open in this site's editor to inspect how it was put together - including the affiliate product card, which got a layout fix and an affiliate-card restyle in 1.0.3.")),
			cards(null, [
				{ icon: "rocket", title: "Live demo post", url: "/blog/widget-gallery/", description: "All nineteen blocks in one article." },
				{ icon: "download", title: "Registry listing", url: "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-widgets", description: "Install button, changelog and screenshots." },
				{ icon: "github", title: "Source", url: "https://github.com/bitdoze/emdashhq.com", description: "The plugin lives in this site's repo." },
			]),
			button("Open the widget gallery", "/blog/widget-gallery/", "book"),
			facts(null, [
				["Version", "1.0.3"],
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
				p("This site has a blog now. Not a separate app: a posts collection, one Astro route, and a block that lists articles on the /blog page. Here is the anatomy of it - real code, not pseudocode - so you can build the same thing, or take it apart to see how EmDash pieces fit together."),
				p("The short version: entries in a posts collection become routable via a urlPattern, one dynamic route renders each slug, a hub block lists them on a page, and cache tags make publish invalidate exactly the pages that show the post. Everything below is the actual implementation on this site."),
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
			h2("The route, annotated"),
			prose(p("One file renders every post. This is its real core - the redirects, the lookup, the cache tag, and the SEO resolution:")),
			code(
				"typescript",
				`const slug = Astro.params.slug;
if (!slug) return Astro.redirect(\`/blog/\${Astro.url.search}\`, 301);
// canonical form is slash-terminated; anything else 301s there
if (!Astro.url.pathname.endsWith("/"))
  return Astro.redirect(\`\${Astro.url.pathname}/\${Astro.url.search}\`, 301);

const [result] = await Promise.all([
  getEmDashEntry("posts", slug), getSiteChrome(Astro),
]);
if (result.error) { Astro.cache.set(false); return unavailableResponse(); }
const post = result.entry;
if (Astro.cache.enabled) Astro.cache.set(result.cacheHint);
if (!post) return Astro.rewrite("/404");`,
				"src/pages/blog/[slug].astro",
			),
			prose(
				p("Four things worth stealing. The early 301s normalize the URL before any data work happens. The entry read runs in parallel with the site chrome read - one round trip, not two. A failed query sets no cache and returns a deliberately uncached 503 rather than a poisoned 500. And a missing post rewrites to the 404 page instead of rendering an empty shell."),
			),
			prose(
				p("The reading time on the post header is also computed, not stored: the route filters body blocks down to widget_prose, runs extractPlainText over their Portable Text, and divides the word count by 200. Every article's minutes stay honest automatically."),
			),
			h2("What the head gets"),
			prose(p("getSeoMeta resolves the SEO tab on each post - meta title, description, og image - and falls back to the title and excerpt when the fields are empty. Canonical and robots come along for free, and the cover doubles as og:image. Fill the SEO tab once and every surface agrees.")),
			h2("Why cacheHint matters"),
			prose(
				p("Passing the query's cacheHint to Astro.cache tags the response with the entries it read. Publishing a post then invalidates exactly the cached pages that show it: the article, /blog, and the homepage section. Skip the tag and edits wait out the cache lifetime. The same trick runs site-wide - the middleware tags public pages with site-scripts so changing analytics settings busts every page at once."),
			),
			h2("The hub page"),
			prose(p("/blog itself is an ordinary page with a site_posts block on it. The block queries the posts collection, orders by published date, and renders the newest article as a lead card with the rest in a grid. The page is content, not code: editors can move it, rename it and add blocks around it without touching the repo.")),
			prose(p("The same block with a limit of three is the \"Latest from the blog\" section on the homepage. One component, two placements, no duplicated markup.")),
			h2("The feed, annotated"),
			prose(p("rss.xml.ts builds one feed out of four collections. The whole trick is a small table - each collection declares which field holds its outbound link:")),
			code(
				"typescript",
				`const collections = [
  { slug: "posts",     linkField: "",            tag: "Post" },
  { slug: "tutorials", linkField: "url",         tag: "Tutorial" },
  { slug: "videos",    linkField: "youtube_url", tag: "Video" },
  { slug: "resources", linkField: "url",         tag: "Resource" },
];
// posts are own content: link = \`/blog/\${entry.id}/\`
// hub entries: link = sanitizeHref(data[linkField])`,
				"src/pages/rss.xml.ts",
			),
			prose(p("Tutorials link out to bitdoze.com, videos to YouTube, resources to npm or the registry - and posts get the internal /blog/ path as the special case. Each collection read also passes its own cacheHint, so publishing anything refreshes the feed too.")),
			h2("Drafts and publishing"),
			prose(p("Saving a post writes a draft revision; the live page only changes when you hit publish. That is why a saved-but-unpublished edit can look lost on the site while being perfectly visible in the admin - and why the REST API answers a PUT with a new revision id rather than a changed page. The SEO tab sits on the same editor screen, so meta title and description are part of the publish checklist rather than an afterthought.")),
			divider("line"),
			h2("Two traps worth knowing"),
			notice("warning", "Leave trailingSlash alone", "Setting Astro's trailingSlash to \"always\" 404s every /_emdash/api/ route without a trailing slash; it briefly broke the contact form on this site. The sitemap emits slashless post URLs that 301 to the canonical form. That redirect is expected and harmless: do not try to fix it with trailingSlash."),
			notice("info", "Block keys are immutable", "Rewriting a post body through the API fails if a reused _key changes _type between revisions. Fresh keys per rewrite - the content update script rotates a key prefix for exactly this reason."),
			h2("Ship list"),
			checklist("If you are building your own", [
				"A posts collection with the fields above",
				"urlPattern set to /blog/{slug}",
				"A route that redirects non-canonical URLs, then renders body blocks",
				"cacheHint passed to Astro.cache so publish busts the right pages",
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
