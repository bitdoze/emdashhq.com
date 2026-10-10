#!/usr/bin/env node
/*
 * Publishes the "Migrate from WordPress to EmDash CMS" post: uploads the
 * generated cover, creates or updates the posts entry, sets SEO, publishes.
 * Idempotent and safe to re-run against local dev and prod.
 *
 * Local:  node scripts/publish-wp-migration-post.mjs --local
 * Prod:   node scripts/publish-wp-migration-post.mjs --url https://emdashhq.com --token <token>
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
const toc = (title) => ({ _type: "widget_toc", _version: 1, _key: key(), title });
let figN = 0;
const fig = (name, caption, wide = true) => ({
	_type: "widget_image",
	_version: 1,
	_key: `fig${RUN}${figN++}`,
	_img: name,
	caption,
	wide,
});
const SLUG = "wordpress-to-emdash-migration";

const POST = {
	slug: SLUG,
	title: "Migrate from WordPress to EmDash CMS: a practical guide",
	excerpt:
		"The WordPress to EmDash route that actually works: what maps where, the steps from export to DNS cutover, which plugins replace what, where AI earns its keep, and when staying put is the right answer.",
	topic: "migration",
	featured: false,
	cover: {
		file: "uploads/covers/wp-migration-cover.png",
		alt: "A vintage printing press feeding pages through cardboard moving boxes into a clean modern letterpress",
	},
	seo: {
		title: "Migrate from WordPress to EmDash CMS",
		description:
			"A practical WordPress to EmDash CMS migration: the content map, the steps from export to DNS cutover, plugin replacements, where AI helps, and honest limits.",
	},
	body: [
		prose(
			p("WordPress earned its install base, and I ran it for years without complaint. What wore me down was the maintenance surface: plugin updates every week, PHP version bumps breaking something at the worst time, and a hosting bill for a site that mostly served static articles with a contact form. I moved my own site off WordPress once already. This guide is the route I would take doing it again, this time landing on EmDash, the CMS this site runs on."),
			p("The short version: EmDash is an Astro-based CMS where one deployment gives you the site, a real admin at /_emdash/admin, a REST API, passkey sign-in and a media library. It runs on Cloudflare Workers with D1 and R2, or on a plain VPS with Node and SQLite. The migration itself is a mapping exercise - decide what your content becomes, rebuild the theme once, script the bulk of the content over, then cut DNS. The honest caveat is that EmDash is young and WordPress is not going anywhere, so the first step is deciding whether to move at all."),
		),
		toc("On this page"),
		h2("Decide before you pack"),
		prose(
			p("EmDash is a good home for the sites WordPress is worst at running: blogs, documentation, marketing pages, content hubs. If your WordPress install is basically posts, pages, a menu and a contact form, you are the target audience. The editor is real - collections, a block editor, drafts, revisions, scheduled publishing - not a static site generator wearing a CMS hat."),
			pLink(
				"If you are still weighing the platform choice, the ",
				"https://www.bitdoze.com/emdash-cms-review/",
				"EmDash review on bitdoze.com",
				" covers six months of running it in production, including who it is not for.",
			),
		),
		notice(
			"warning",
			"Where WordPress still wins",
			"If the site depends on WooCommerce, a membership or LMS plugin, paid forums, or a page builder the editors love, stay on WordPress. Rebuilding those is a project, not a migration. The same goes for teams where nobody wants to touch an Astro component - EmDash themes are code in a repository, not a theme directory you click-install.",
		),
		h2("The concept map"),
		prose(
			p("Most of the migration fear comes from vocabulary, not difficulty. Nearly everything in a WordPress site has a direct counterpart in EmDash - it just lives somewhere more explicit:"),
		),
		facts("WordPress to EmDash", [
			["Posts and pages", "Collections and entries. One collection per content type, with your own fields"],
			["Custom post types and ACF", "Typed collection fields in seed/seed.json - string, rich text, image, repeater, blocks"],
			["Theme (PHP templates)", "Astro layouts and components plus CSS design tokens. Real code, no template hierarchy guessing"],
			["Widgets and shortcodes", "Block types in a blocks field. Editors drop them into content, components render them"],
			["Contact Form 7 / WPForms", "The Contact Forms plugin: forms, inbox, email log, honeypot and Turnstile built in"],
			["Yoast or Rank Math", "A built-in SEO tab on every entry: title, description, canonical, robots, og image"],
			["Media library", "EmDash media library backed by R2 (Workers) or the filesystem (Node)"],
			["Users and roles", "CMS users with passkey sign-in and role-based permissions"],
			["Menus", "Named menus edited in the admin, rendered by the layout"],
			["RSS feed", "A route file like this site's rss.xml.ts, serving real XML"],
		]),
		h2("The migration, step by step"),
		steps("Nine steps, in order", [
			[
				"Audit the WordPress site",
				"List every plugin you actually use, every custom post type, every shortcode in real content, and every redirect you already maintain. Then export everything from Tools, Export in wp-admin and keep the old site running - the XML references images that still need to download. The audit list, not the XML, decides the shape of the new site.",
			],
			[
				"Stand up an EmDash site locally",
				"Run npm create emdash@latest and pick the template closest to your target - it ships the schema, routes and sample content you will edit rather than build from zero. No Cloudflare account needed for local work; the Node option runs on SQLite. The EmDash CMS tutorial on bitdoze.com walks the whole first-run path step by step.",
			],
			[
				"Model the content",
				"Turn your WordPress post types into collections in seed/seed.json. A post type with five ACF fields becomes a collection with five typed fields. Resist recreating every field - migration is the one time you get to delete the ones nobody fills in. Check the validation and block types while you are here; that is where allowed widget types get wired.",
			],
			[
				"Rebuild the theme once",
				"Port the look to Astro layouts, components and CSS tokens. This is the only step that is real work instead of plumbing, and you only pay it once - after this, the theme is a normal frontend codebase. The custom theme guide documents the exact file layout on this site, including doing the grunt work with AI agents.",
			],
			[
				"Move the content",
				"Small sites: paste it in through the admin and accept the two evenings it takes. Larger sites: script it. Parse the WordPress XML, map each item to a collection entry, upload images to the media library through the REST API, and write entries through the same content API the admin uses. Draft first, publish in one batch at the end.",
			],
			[
				"Replace the plugins you actually use",
				"Work down the audit list. Most WordPress plugin categories collapse into three EmDash answers: a block type, a built-in feature, or a plugin from the registry. The two plugins below cover the most common gap - contact forms and rich article blocks. Delete everything on the audit list that exists because a plugin needed another plugin.",
			],
			[
				"Pick the host",
				"Cloudflare Workers is the fast path: D1 and R2 are created at deploy, the free plan works if you skip sandboxed registry plugins, and the paid plan is $5 a month when you want them. A cheap VPS with Docker is the boring-reliable alternative, with Node standalone and SQLite. Both are documented in the tutorials linked below.",
			],
			[
				"Map redirects and cut DNS",
				"Export the old URL list (a crawler or the XML gives you most of it), write one 301 for each moved slug - WordPress /2024/05/my-post/ to EmDash /blog/my-post/ - and verify a sample by hand. Then point DNS at the new host and keep the old WordPress server running for two weeks. It costs almost nothing idle and covers the stragglers.",
			],
			[
				"Verify the boring way",
				"Submit the contact form yourself, click five old URLs, check the sitemap and RSS, then watch Search Console and analytics for a fortnight. Migration bugs do not announce themselves; they show up as a quiet 404 on a post that used to rank.",
			],
		]),
		h2("The plugin question, answered"),
		prose(
			p("The two gaps people hit first leaving WordPress are forms and rich article blocks. Both are covered by free plugins I maintain - they run on this site, so what you see in the demos is what ships.",
		)),
		h3("Contact forms without Contact Form 7"),
		prose(
			pRich([
				"The ",
				["https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-contact-forms", "Contact Forms plugin"],
				" builds forms in the admin with real fields, stores every submission in an inbox with an email log, sends mail through whichever provider the site already uses, and carries honeypot, fill-time and per-IP rate limiting plus optional Cloudflare Turnstile.",
			]),
			pRich([
				"The ",
				["https://emdashhq.com/contact/", "live form on this site"],
				" is the working demo, and the ",
				["https://emdashhq.com/blog/contact-form-spam-turnstile/", "Turnstile write-up"],
				" shows the full anti-spam pipeline with curl tests you can repeat. It replaced a Contact Form 7 install and a separate anti-spam plugin in one move.",
			]),
		),
		h3("Article blocks without page builders or shortcodes"),
		prose(
			pRich([
				"The ",
				["https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-widgets", "Content Widgets plugin"],
				" adds nineteen block types to the editor - notices, accordions, tabs, numbered steps, code blocks, product boxes, quotes, a table of contents, cards and more - all server-rendered with no client JavaScript unless the widget needs it.",
			]),
			pRich([
				"Every block is live on the ",
				["https://emdashhq.com/blog/widget-gallery/", "widget gallery demo"],
				", and the ",
				["https://emdashhq.com/blog/emdash-widgets-plugin/", "install walkthrough"],
				" covers registry install and wiring the renderers. This is what replaced the shortcode soup my old articles carried.",
			]),
		),
		notice(
			"info",
			"One hosting wrinkle for plugins",
			"Registry plugins run sandboxed, and the sandbox needs the Workers Paid plan ($5/month) on Cloudflare. On a VPS they run on the free path, and these packages can also be installed from source and run in-process with no sandbox at all. It is the one line item worth deciding before you install anything.",
		),
		fig("plugins-page", "The plugins catalog on this site links each registry listing - the two free plugins cover the gaps most WordPress leavers hit first."),
		h2("Where AI actually saves time"),
		prose(
			p("This is the part every migration post oversells, so the honest version first: AI will not do the migration for you. What it does well is the tedious mechanical middle that used to take days."),
			pLink(
				"When I moved my own site off WordPress I used Codex CLI exactly this way - batch image conversion, frontmatter fixes, reference rewrites - and that ",
				"https://www.bitdoze.com/wordpress-to-astro-migration/",
				"WordPress to Astro migration write-up",
				" documents what held up and what needed babysitting.",
			),
		),
		checklist("Worth automating", [
			"WordPress HTML and shortcode cleanup: feed the agent a parser, then have it convert post HTML into clean blocks or Portable Text - verify a random sample by eye",
			"Block components and seed schema: give an agent your old templates and it drafts the collection fields and renderers; the custom-theme tutorial did this end to end",
			"Redirect maps: generate the old-slug to new-slug table from the XML, then review every row before it ships",
			"Meta titles and descriptions: draft them per post from the content, edit the important pages by hand",
		]),
		checklist("Not worth automating", [
			"Body copy rewrites: it will quietly change your voice and occasionally your facts",
			"Redirect maps unreviewed: a hallucinated 301 leaks ranking to the wrong page or to nothing",
			"Content model design: that is a decision, not a task - you have to live with it",
			"Anything involving your analytics history or SEO priorities: it does not know which posts pay the bills",
		]),
		h2("Pre-launch checklist"),
		checklist("Before you cut DNS", [
			"Every old URL either resolves or 301s somewhere sensible",
			"The contact form stores a real submission and the email lands",
			"SEO title and description filled on the pages that get search traffic",
			"Sitemap and RSS reachable at their new URLs",
			"Analytics firing - Plausible via the Site Scripts settings on EmDash, or self-hosted Plausible on your VPS",
			"A real 404 page, not a blank error",
			"Old WordPress server still running, billing untouched",
		]),
		fig("live-contact-form", "The boring verification, made visible: the live form on this site. If a submission stores and the email lands, the plumbing works - this is the last thing to test before DNS."),
		h2("Links for the road"),
		cards("Tutorials referenced in this guide", [
			{ icon: "rocket", title: "Deploy EmDash on Cloudflare Workers", url: "https://www.bitdoze.com/deploy-emdash-cloudflare-workers/", description: "Workers, D1, R2 and the free tier, step by step" },
			{ icon: "book", title: "EmDash CMS tutorial", url: "https://www.bitdoze.com/emdash-cms-tutorial/", description: "Build your first EmDash site from npm create to running admin" },
			{ icon: "terminal", title: "WordPress to Astro migration", url: "https://www.bitdoze.com/wordpress-to-astro-migration/", description: "The export, conversion and Codex CLI automation I used on my own move" },
			{ icon: "rocket", title: "Coolify on a VPS", url: "https://www.bitdoze.com/coolify-install-heroku-alternative/", description: "Self-host EmDash behind a self-hosted PaaS with free SSL" },
			{ icon: "book", title: "Self-hosted Plausible", url: "https://www.bitdoze.com/install-plausible-analytics/", description: "Analytics on your own VPS via Coolify" },
			{ icon: "star", title: "Build a custom EmDash theme", url: "https://www.bitdoze.com/emdash-custom-theme/", description: "Tokens, blocks and seed schema on a real site" },
		]),
		prose(
			p("A small site - a few dozen posts, a theme, one form - is a weekend once you have done the mapping. A five-hundred-post archive with three custom post types is a real project, but it is a finite one: the list above is all of it. WordPress will still be there if it ever wins again. The difference is you stop paying a weekly plugin tax for a site that was mostly pages all along."),
		),
		button("Deploy EmDash on Cloudflare Workers", "https://www.bitdoze.com/deploy-emdash-cloudflare-workers/", "rocket", "solid", { new_tab: true }),
		button("See the Content Widgets demo", "https://emdashhq.com/blog/widget-gallery/", "star", "outline"),
	],
};

// ------------------------------------------------- inline article images ---
const INLINE = {
	"plugins-page": { file: "uploads/article-images/plugins-page.png", alt: "The plugins catalog page on emdashhq.com listing the registry entries" },
	"live-contact-form": { file: "uploads/article-images/live-contact-form.png", alt: "The live contact form on emdashhq.com including the Turnstile widget" },
};

// ------------------------------------------------------------------ apply ---
console.log(`Publishing ${SLUG} on ${BASE}`);

console.log("1. media");
const cover = await uploadMedia(POST.cover.file, `${SLUG}.png`, POST.cover.alt);
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

console.log("2. post");
const data = {
	title: POST.title,
	excerpt: POST.excerpt,
	topic: POST.topic,
	featured: POST.featured,
	...(cover ? { cover: { id: cover.id, alt: POST.cover.alt } } : {}),
	body: resolveBody(POST.body),
};
const seo = { ...POST.seo, ...(cover ? { image: cover.storageKey } : {}) };

const found = await api("GET", `/content/posts/${encodeURIComponent(SLUG)}`);
const existing = found.json?.data?.item ?? found.json?.item;
let itemId = existing?.id;

if (ok(found) && itemId) {
	const r = await api("PUT", `/content/posts/${itemId}`, { data, seo });
	console.log(`  posts/${SLUG}: update ${r.status} ${ok(r) ? "ok" : fail(r)}`);
	if (!ok(r)) process.exit(1);
} else {
	const r = await api("POST", `/content/posts`, { data, seo, slug: SLUG });
	const created = r.json?.data?.item ?? r.json?.item;
	if (ok(r) && created?.id) {
		itemId = created.id;
		console.log(`  posts/${SLUG}: created ${itemId}`);
	} else {
		console.log(`  posts/${SLUG}: create ${r.status} ${fail(r)}`);
		process.exit(1);
	}
}

const pub = await api("POST", `/content/posts/${itemId}/publish`, {});
console.log(`  publish: ${pub.status} ${pub.status === 200 || pub.status === 409 ? "ok" : fail(pub)}`);

console.log("Done.");
