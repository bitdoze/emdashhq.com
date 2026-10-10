#!/usr/bin/env node
/*
 * Publishes the two plugin guide posts - the Contact Forms walkthrough and the
 * Content Widgets field guide: uploads covers + inline screenshots, creates or
 * updates each posts entry, sets SEO, publishes. Idempotent; safe to re-run.
 *
 * Local:  node scripts/publish-plugin-guides.mjs --local
 * Prod:   node scripts/publish-plugin-guides.mjs --url https://emdashhq.com --token <token>
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
let keyN = 0;
const RUN = Math.random().toString(36).slice(2, 8);
const key = () => `${RUN}${String(keyN++).padStart(4, "0")}`;
const span = (text, marks = []) => ({ _type: "span", _key: key(), text, marks });
const ptBlock = (children, style = "normal", markDefs = []) => ({
	_type: "block",
	_key: key(),
	style,
	markDefs,
	children,
});
const p = (text) => ptBlock([span(text)]);
const pLink = (before, href, label, after) => {
	const mk = key();
	return ptBlock(
		[span(before), span(label, [mk]), span(after)],
		"normal",
		[{ _type: "link", _key: mk, href }],
	);
};
// Segments are plain strings or [href, label] links.
const pRich = (segments) => {
	const children = [];
	const markDefs = [];
	for (const seg of segments) {
		if (typeof seg === "string") {
			children.push(span(seg));
		} else {
			const mk = key();
			children.push(span(seg[1], [mk]));
			markDefs.push({ _type: "link", _key: mk, href: seg[0] });
		}
	}
	return ptBlock(children, "normal", markDefs);
};
const prose = (...blocks) => ({ _type: "widget_prose", _version: 1, _key: key(), body: blocks });
const h2 = (text) => ({ _type: "widget_prose", _version: 1, _key: key(), body: [ptBlock([span(text)], "h2")] });
const h3 = (text) => ({ _type: "widget_prose", _version: 1, _key: key(), body: [ptBlock([span(text)], "h3")] });
let figN = 0;
const fig = (name, caption, wide = true) => ({
	_type: "widget_image",
	_version: 1,
	_key: `fig${RUN}${figN++}`,
	_img: name,
	caption,
	wide,
});
const notice = (kind, title, text) => ({
	_type: "widget_notice",
	_version: 1,
	_key: key(),
	kind,
	title,
	body: [p(text)],
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
const accordion = (heading, items) => ({
	_type: "widget_accordion",
	_version: 1,
	_key: key(),
	heading,
	items: items.map(([t, b]) => ({ title: t, body: b })),
});
const tabs = (items) => ({
	_type: "widget_tabs",
	_version: 1,
	_key: key(),
	items: items.map(([label, body]) => ({ label, body })),
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
const youtube = (url, title, caption) => ({
	_type: "widget_youtube",
	_version: 1,
	_key: key(),
	url,
	title,
	caption,
});
const code = (filename, language, source) => ({
	_type: "widget_code",
	_version: 1,
	_key: key(),
	filename,
	language,
	code: source,
});
const quote = (text, attribution, role) => ({
	_type: "widget_quote",
	_version: 1,
	_key: key(),
	quote: text,
	attribution,
	role,
});
const series = (title, items) => ({
	_type: "widget_series",
	_version: 1,
	_key: key(),
	title,
	items: items.map(([label, url]) => ({ label, url })),
});
const product = (fields) => ({ _type: "widget_product", _version: 1, _key: key(), ...fields });
const toc = (title) => ({ _type: "widget_toc", _version: 1, _key: key(), title });
const latestPosts = (heading, limit) => ({
	_type: "widget_latest_posts",
	_version: 1,
	_key: key(),
	heading,
	limit,
	exclude_current: true,
});

const REG_CF = "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-contact-forms";
const REG_WGT = "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-widgets";

const POSTS = [
	{
		slug: "emdash-contact-forms",
		title: "Contact forms in EmDash: build, email and spam-proof",
		excerpt:
			"The Contact Forms plugin end to end on a live site: install, fields, the page block, the inbox and email log, delivery through the site's own provider, passive anti-spam, and where AI earns its keep.",
		topic: "plugins",
		featured: false,
		cover: {
			file: "uploads/covers/cover-contact-forms.png",
			alt: "A vintage brass mailbox feeding a letter past a rubber stamp marked DELIVERED onto a conveyor of envelopes",
		},
		seo: {
			title: "Contact forms in EmDash: build, email, spam-proof",
			description:
				"Set up contact forms in EmDash: install, fields, the page block, submissions inbox, email delivery through the site's provider, and anti-spam that needs no CAPTCHA.",
		},
		body: [
			prose(
				p("Every site I have ever run eventually needed a contact form, and on WordPress it was always the same three-plugin stack: the form plugin, the SMTP plugin to make its mail actually arrive, and a captcha plugin to keep the bots out. On EmDash it is one plugin. It stores every message on the site, sends mail through whatever provider the site already uses, and the anti-spam is passive until you decide you want more."),
				p("This site runs it at /contact/ - what you see there is what ships. This is the full path: install, the first form, where the messages land, how email works, the spam traps, and the spots where an AI assistant genuinely saves time."),
			),
			toc("On this page"),
			facts("What's in the box", [
				["Form builder", "An admin page under Plugins, Contact forms: fields, ordering, per-form settings"],
				["Public submit route", "A same-origin form POST that answers with a 303 redirect - no fetch, no JavaScript needed"],
				["Submissions inbox", "Every stored entry with read state, resend and CSV export"],
				["Email log", "Each delivery attempt with recipient, timing, status and the error when one fails"],
				["Delivery", "ctx.email.send() - the site's own provider, not a new account to set up"],
				["Anti-spam", "Honeypot, minimum fill time and a per-IP hourly limit, with optional Turnstile"],
			]),
			h2("Install and turn it on"),
			steps("Three steps to a working form", [
				[
					"Install the plugin",
					"Admin, Plugins, Registry - search for Contact Forms and install. On a code-managed site, add the package and register it under sandboxed: instead. Either way it runs inside the plugin sandbox, walled off from your content and settings.",
				],
				[
					"Approve what it asks for",
					"The manifest requests email:send and, only if you switch on Turnstile, network access to Cloudflare's siteverify endpoint. That is the whole list. Read it before approving - it is short on purpose.",
				],
				[
					"Set the defaults",
					"Under Plugin settings, enter the fallback notification address and, if you want it, the Turnstile keys. Individual forms can override the notify address; the defaults only catch the forms that do not bother.",
				],
			]),
			notice(
				"warning",
				"One hosting wrinkle",
				"Sandboxed plugins need the Workers Paid plan on Cloudflare, about $5 a month. On a VPS the same plugin runs fine on the free path, and installing the package from source lets it run in-process with no sandbox at all.",
			),
			fig("cf-forms", "The Forms page the plugin adds to the admin: stats up top, one row per form, the setup guide one click away."),
			h2("Build the first form"),
			steps("From empty page to working form", [
				[
					"New form",
					"Name it and pick a slug - the slug is how the page block finds the form, so keep it short: contact, support, press.",
				],
				[
					"Add the fields",
					"Eight types: text, email, textarea, select, checkbox, radio, number and hidden. Each gets a label, a key, an optional placeholder and a required flag. Drag to reorder; a required checkbox demands a real tick, not a guess at a default.",
				],
				[
					"Per-form settings",
					"Notification email, subject line and the success message visitors see after posting. The subject accepts field values, so 'New enquiry from {name}' works.",
				],
				[
					"Save and look at it",
					"The public form endpoint renders exactly what visitors will get - the same markup the demo on this site serves.",
				],
			]),
			h2("Put it on a page"),
			prose(
				pRich([
					"On this site a Contact form block takes the slug and renders the whole thing server-side - the markup is in the HTML before CSS or JS loads, and it still works as a plain form post with JavaScript off. Other themes get the same result from the generic component that ships in the package's ",
					["https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-contact-forms", "site/ directory"],
					", ready to copy in.",
				]),
			),
			h2("Where the messages land"),
			prose(
				p("A submission that passes the traps is written to storage first and emailed second. That order matters: if the mail provider is down or misconfigured, the message still sits in your admin inbox instead of dying inside a timeout. Failed sends are marked on the row so you can spot and resend them."),
			),
			fig("cf-log", "The email log records every attempt - notifications, visitor confirmations and manual resends - with the delivery time in milliseconds and the error when one fails."),
			fig("cf-widget", "The dashboard widget is the morning check: unread count, recent entries, one click into the inbox."),
			h2("Email, the part that usually breaks"),
			prose(
				p("The plugin never speaks SMTP itself. It calls the site's email hook, so the provider is whatever you already configured: Cloudflare Email Sending through a Worker binding, or a hosted provider through the emdash-smtp plugin. The full setup for both paths is in this video from my EmDash course:"),
			),
			youtube(
				"https://www.youtube.com/watch?v=HDhAKThf-1M",
				"How to Send Emails in EmDash CMS (Cloudflare & Free SMTP Guide)",
				"The companion video: the send_email binding on Workers, and the SMTP route for everything else.",
			),
			prose(
				pRich([
					"The written version lives at ",
					["https://www.bitdoze.com/emdash-send-email/", "Send Email from an EmDash Site"],
					". One detail worth knowing: every submission carries an emailStatus - sent, failed or skipped - and skipped is what you get until a provider exists. The inbox fills either way, so a missing provider costs you notifications, not messages.",
				]),
			),
			h2("Anti-spam without the checkbox farm"),
			prose(
				p("Three passive traps run before anything else: a honeypot field humans never see, a minimum fill-time check that catches instant bot posts, and a per-IP hourly limit. A bot that trips one gets a fake success back and nothing is stored, so it never learns to retry differently. If the volume still climbs, optional Cloudflare Turnstile adds a managed check that stays invisible for most visitors."),
				pLink(
					"The ",
					"https://emdashhq.com/blog/contact-form-spam-turnstile/",
					"Turnstile write-up",
					" walks the full pipeline with curl tests you can repeat against your own form.",
				),
			),
			h2("Where AI actually helps"),
			checklist("Worth automating", [
				"Field sets: describe the form - booking enquiry, bug report, press contact - and let it draft the fields, types and validation, then trim to what you need",
				"Email copy: notification subjects and the confirmation auto-reply are easy first drafts for a model",
				"Spam tuning: paste a batch of blocked submissions and ask what pattern belongs in the honeypot or the rate window",
				"Migrating old forms: it reads a Contact Form 7 or WPForms export and proposes the matching field list",
			]),
			checklist("Do not automate", [
				"Recipient addresses: a hallucinated inbox means messages land somewhere nobody reads",
				"Auto-reply tone, unreviewed: that is your site's voice writing to strangers",
				"Privacy wording: the line about what you do with submissions has to be true, not plausible-sounding",
			]),
			h2("Common questions"),
			accordion("FAQ", [
				["Does it work with no email provider configured?", "Yes. Submissions store normally and each row is marked emailStatus skipped. Add a provider later and nothing is lost - the inbox was filling the whole time."],
				["How many forms can one site have?", "As many as you need. Each carries its own slug, fields, notify address and success message; the page block picks one by slug."],
				["Can visitors attach files?", "Not in this version. The honest reason: attachments mean file scanning and storage decisions that deserve a deliberate design, not a bolt-on."],
				["Is Turnstile required?", "No. The passive traps alone stop the bulk of junk on my sites. Turnstile is there for when they stop being enough."],
				["What does a rejected visitor see?", "Their values come back with the failing fields marked. The draft is held once in KV and deleted when read, so a rejection never loses the message they typed."],
			]),
			h2("Keep going"),
			cards("The links from this guide", [
				{ icon: "star", title: "Contact Forms on the registry", url: REG_CF, description: "Install, changelog and the full field reference" },
				{ icon: "mail", title: "The live demo", url: "https://emdashhq.com/contact/", description: "The working form on this site - send me a message" },
				{ icon: "play", title: "Email sending in EmDash", url: "https://www.bitdoze.com/emdash-send-email/", description: "Cloudflare Email Sending and the SMTP plugin, written up" },
				{ icon: "book", title: "The Turnstile deep dive", url: "https://emdashhq.com/blog/contact-form-spam-turnstile/", description: "The anti-spam pipeline with tests you can run" },
				{ icon: "rocket", title: "Migrate from WordPress", url: "https://emdashhq.com/blog/wordpress-to-emdash-migration/", description: "If the contact form is part of a bigger move" },
			]),
			button("Install Contact Forms", REG_CF, "rocket", "solid", { new_tab: true }),
			button("Try the live form", "https://emdashhq.com/contact/", "mail", "outline"),
		],
	},
	{
		slug: "writing-with-emdash-widgets",
		title: "Writing with Content Widgets: the blocks I actually use",
		excerpt:
			"A field guide to the nineteen blocks the Content Widgets plugin adds: which ones earn a place in a real article, when steps beat tabs, what the product box is honest about, and how AI drafts a widget-heavy post.",
		topic: "plugins",
		featured: false,
		cover: {
			file: "uploads/covers/cover-widgets-guide.png",
			alt: "Letterpress type blocks in a grid, each stamped with a widget symbol, one being placed by hand",
		},
		seo: {
			title: "Writing with EmDash Content Widgets: a field guide",
			description:
				"A field guide to EmDash Content Widgets: the blocks that earn a place in real articles, when steps beat tabs, and how AI drafts a widget-heavy post.",
		},
		body: [
			prose(
				p("Articles are more than paragraphs. Tutorials need steps and warnings, reviews need spec tables and pros/cons, and every long post needs signposts. On WordPress that meant shortcodes or a page builder. On EmDash it is nineteen block types from the Content Widgets plugin - and this article is built from them, so every example below is running code, not a mockup."),
				pRich([
					"The ",
					["https://emdashhq.com/blog/emdash-widgets-plugin/", "install walkthrough"],
					" already covers getting the plugin onto a site. This is the other half: which blocks I reach for, when one beats another, and where an AI assistant helps draft widget-heavy posts without flattening them into plain text.",
				]),
			),
			toc("On this page"),
			checklist("The five I reach for first", [
				"Notice - the colored callout carrying every warning and tip in this article; four kinds, a sentence or two of body",
				"Steps - the numbered procedure; anything with an order gets this instead of a bulleted list",
				"Code - filename, language tag, server-rendered so there is no flash of unstyled text",
				"Cards - related-reading grids with icons; how most posts on this site end",
				"Facts - the spec table: label/value pairs for versions, plans, requirements",
			]),
			h2("Structure and signposts"),
			prose(
				p("Long posts need scaffolding before decoration. Prose blocks carry the paragraphs and headings, the table of contents above built itself from them, and the series block chains related posts so a reader can walk the set in order. The divider is the quiet one: a line, dots or space, no other fields."),
			),
			series("The EmDash plugin guides", [
				["Install and architecture", "https://emdashhq.com/blog/emdash-widgets-plugin/"],
				["Every block in one post", "https://emdashhq.com/blog/widget-gallery/"],
				["Contact forms end to end", "https://emdashhq.com/blog/emdash-contact-forms/"],
				["Anti-spam and Turnstile", "https://emdashhq.com/blog/contact-form-spam-turnstile/"],
				["WordPress to EmDash", "https://emdashhq.com/blog/wordpress-to-emdash-migration/"],
			]),
			h2("Teaching blocks"),
			prose(
				p("Steps, checklist, accordion and tabs overlap on paper but not in use. Steps when order matters, checklist for unordered must-dos, accordion for questions the reader may skip, and tabs when one slot has to hold alternatives - like the two install paths below."),
			),
			tabs([
				["Registry install", "Admin, Plugins, Registry - search for Content Widgets, install, approve. The registry path keeps the plugin sandboxed and updates arrive through the same UI."],
				["From source", "Clone the repo and add it as a file dependency, registered under sandboxed: or in-process. Pick this when you want to read or patch the code - it is the same package either way."],
			]),
			prose(
				p("That was a real widget_tabs block: one slot, two alternatives, arrow-key navigation when JavaScript is on, anchored sections when it is not. The accordion works the same way for content a reader might skip - see the FAQ at the bottom."),
			),
			h2("Callouts and proof"),
			prose(
				p("Two blocks carry persuasion. The notice is the callout, and the quote block is for reader-voice lines that would look silly as a paragraph:"),
			),
			quote("Notices for warnings, quotes for voices. Keep the two separate and the article stays honest.", "House rule", "EmDash HQ style guide"),
			notice(
				"info",
				"The notice, noticing itself",
				"This is a widget_notice with kind info. Warning and danger get their own colors; keep the body to a sentence or two so it stays a callout, not a chapter.",
			),
			facts("Anatomy of a block", [
				["This table", "A widget_facts block: title plus a label/value repeater"],
				["Rendered", "Server-side, straight into the HTML"],
				["Client JavaScript", "None for this one"],
				["Editor shape", "Fields in a block form, not markup you type"],
			]),
			fig("wgt-gallery", "The widget gallery post is the kitchen-sink demo - all nineteen blocks in order, which is how most people meet them."),
			h2("Media and embeds"),
			prose(
				p("Images carry a caption and a wide flag - the screenshots in this post are widget_image blocks. The YouTube block is a facade: a thumbnail and a link until the visitor chooses to play, with a site setting that swaps the iframe to youtube-nocookie.com. Code blocks take a filename and a language:"),
			),
			code(
				"astro.config.mjs",
				"typescript",
				`plugins: [\n\tcloudflareEmail({ from: { email: "dragos@emdashhq.com", name: "EmDash HQ" } }),\n\tsiteScriptsPlugin,\n],\nsandboxed: [contactFormsPlugin, widgetsPlugin],\nsandboxRunner: sandbox(),`,
			),
			prose(
				p("The embed block covers the rest - a URL, a title and an aspect ratio for anything that needs a plain iframe."),
			),
			h2("The money blocks, honestly"),
			prose(
				p("Cards and buttons are the traffic directors - most posts here end in a cards grid. The product box is the one block that can look like an ad, so the plugin puts an affiliate disclosure field in its settings and prints it small inside the box. This is a real product box reviewing the thing it runs on:"),
			),
			product({
				name: "Cloudflare Workers Paid",
				rating: 4,
				description:
					"The $5-a-month tier this site runs on. You need it for sandboxed registry plugins like the one this post is about - the honest price of the sandbox.",
				pros: [{ text: "Sandboxed plugins actually run" }, { text: "D1 and R2 included for a site this size" }, { text: "Still cheaper than my old shared hosting" }],
				cons: [{ text: "Not free like the Workers tier was" }, { text: "The sandbox ties you to Workers" }],
				price: "$5/month",
				url: "https://www.bitdoze.com/deploy-emdash-cloudflare-workers/",
				cta_label: "The full cost breakdown",
			}),
			fig("wgt-widgets", "In the editor these are just entries in the block picker - previews come from the same catalog the plugin's admin page shows."),
			fig("wgt-settings", "Three settings for the whole plugin: the YouTube nocookie toggle, the affiliate disclosure line, and which collection latest posts reads."),
			h2("Where AI actually helps"),
			checklist("Worth automating", [
				"Outline to blocks: paste a markdown outline and let it draft the widget body - steps for procedures, facts for specs, accordion for the FAQ",
				"Shortcode cleanup: it converts WordPress shortcode soup into the matching widget blocks faster than any find-and-replace",
				"FAQ drafting: feed it a doc or a comment thread and keep the five questions that keep recurring",
				"Alt text and captions: first drafts for every figure, then fix the three that matter by hand",
			]),
			checklist("Do not automate", [
				"Ratings and pros/cons: that is your judgment - a plausible four stars you did not earn is just a nicer lie",
				"Links: it invents plausible URLs, and every href it writes gets clicked by a human. That human is you, first",
				"The prose: let it place blocks, not write paragraphs - the voice flattens within two sections",
			]),
			latestPosts("Fresh off the blog", 3),
			h2("Common questions"),
			accordion("FAQ", [
				["Do the blocks work on pages, not just posts?", "Yes - widget types can be allowed in any blocks field. This site's pages take them; what gets allowed is a schema decision, not a plugin limitation."],
				["How heavy is the output?", "Server-rendered and small. The only client JavaScript covers tabs, the accordion toggle and the YouTube facade - everything else is plain HTML and CSS."],
				["Can I restyle them?", "They take the site's design tokens and ship their own scoped styles. The components live in the package's site/ directory, so copying and editing them is the supported path."],
				["What happens if I uninstall the plugin?", "The block data stays in your content; the renderers stop. Types are declared per collection, so you can also remove a single widget from the picker without touching the rest."],
			]),
			h2("Keep going"),
			cards("The links from this guide", [
				{ icon: "star", title: "Content Widgets on the registry", url: REG_WGT, description: "Install, changelog and the block list" },
				{ icon: "play", title: "The live gallery", url: "https://emdashhq.com/blog/widget-gallery/", description: "All nineteen blocks on one page" },
				{ icon: "book", title: "The install walkthrough", url: "https://emdashhq.com/blog/emdash-widgets-plugin/", description: "Registry install and wiring the renderers" },
				{ icon: "rocket", title: "Build a custom EmDash theme", url: "https://www.bitdoze.com/emdash-custom-theme/", description: "Where the design tokens these blocks inherit come from" },
			]),
			button("See the live gallery", "https://emdashhq.com/blog/widget-gallery/", "star", "outline"),
			button("Install Content Widgets", REG_WGT, "rocket", "solid", { new_tab: true }),
		],
	},
];

// ------------------------------------------------- inline article images ---
const INLINE = {
	"cf-forms": { file: "plugins/emdashhq-contact-forms/images/screenshot-forms.png", alt: "The Forms admin page listing forms with their slugs, fields and submission counts" },
	"cf-log": { file: "plugins/emdashhq-contact-forms/images/screenshot-log.png", alt: "The email log showing a sent notification with delivery time and status" },
	"cf-widget": { file: "plugins/emdashhq-contact-forms/images/screenshot-widget.png", alt: "The contact forms dashboard widget with unread count and recent submissions" },
	"wgt-gallery": { file: "plugins/emdashhq-widgets/images/screenshot-gallery.jpg", alt: "The widget gallery post on the live site showing the article header" },
	"wgt-widgets": { file: "plugins/emdashhq-widgets/images/screenshot-widgets.jpg", alt: "The Content Widgets block picker in the EmDash post editor" },
	"wgt-settings": { file: "plugins/emdashhq-widgets/images/screenshot-settings.png", alt: "The Content Widgets settings page: YouTube nocookie, affiliate disclosure and posts collection" },
};

// ------------------------------------------------------------------ apply ---
console.log(`Publishing ${POSTS.length} plugin guides on ${BASE}`);

console.log("1. media");
for (const post of POSTS) {
	post._cover = await uploadMedia(post.cover.file, `${post.slug}.${post.cover.file.split(".").pop()}`, post.cover.alt);
}
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

console.log("2. posts");
for (const post of POSTS) {
	const data = {
		title: post.title,
		excerpt: post.excerpt,
		topic: post.topic,
		featured: post.featured,
		...(post._cover ? { cover: { id: post._cover.id, alt: post.cover.alt } } : {}),
		body: resolveBody(post.body),
	};
	const seo = { ...post.seo, ...(post._cover ? { image: post._cover.storageKey } : {}) };

	const found = await api("GET", `/content/posts/${encodeURIComponent(post.slug)}`);
	const existing = found.json?.data?.item ?? found.json?.item;
	let itemId = existing?.id;

	if (ok(found) && itemId) {
		const r = await api("PUT", `/content/posts/${itemId}`, { data, seo });
		console.log(`  posts/${post.slug}: update ${r.status} ${ok(r) ? "ok" : fail(r)}`);
		if (!ok(r)) process.exit(1);
	} else {
		const r = await api("POST", `/content/posts`, { data, seo, slug: post.slug });
		const created = r.json?.data?.item ?? r.json?.item;
		if (ok(r) && created?.id) {
			itemId = created.id;
			console.log(`  posts/${post.slug}: created ${itemId}`);
		} else {
			console.log(`  posts/${post.slug}: create ${r.status} ${fail(r)}`);
			process.exit(1);
		}
	}

	const pub = await api("POST", `/content/posts/${itemId}/publish`, {});
	console.log(`  publish: ${pub.status} ${pub.status === 200 || pub.status === 409 ? "ok" : fail(pub)}`);
}

console.log("Done.");
