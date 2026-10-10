#!/usr/bin/env node
/*
 * Publishes the "EmDash vs WordPress" comparison post: uploads the generated
 * cover, creates or updates the posts entry, sets SEO, publishes.
 * Idempotent and safe to re-run against local dev and prod.
 *
 * Local:  node scripts/publish-vs-wordpress-post.mjs --local
 * Prod:   node scripts/publish-vs-wordpress-post.mjs --url https://emdashhq.com --token <token>
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
const quote = (text, attribution, role) => ({
	_type: "widget_quote",
	_version: 1,
	_key: key(),
	quote: text,
	attribution,
	role,
});
const toc = (title) => ({ _type: "widget_toc", _version: 1, _key: key(), title });

const SLUG = "emdash-vs-wordpress";

const POST = {
	slug: SLUG,
	title: "EmDash vs WordPress: where it wins and where it doesn't",
	excerpt:
		"An honest EmDash vs WordPress comparison from someone running both: where EmDash genuinely wins, the drawbacks that don't get talked about, the real adoption numbers, and who should stay put.",
	topic: "review",
	featured: false,
	cover: {
		file: "uploads/covers/cover-vs-wordpress.png",
		alt: "A large ornate vintage printing press tangled in cables beside a small clean modern press printing a neat stack of pages",
	},
	seo: {
		title: "EmDash vs WordPress: honest comparison",
		description:
			"EmDash vs WordPress compared honestly: where EmDash wins on speed, cost and maintenance, its real drawbacks, current adoption numbers, and who should stay on WordPress.",
	},
	body: [
		prose(
			p("I ran WordPress for years and I still think it earned its 40-something percent of the web. I also run this site on EmDash, a CMS that is six months old. So this is not a fanboy listicle - it is the comparison I wish someone had written before I moved: where EmDash genuinely beats WordPress, the drawbacks that get glossed over, and the adoption numbers as they actually stand."),
			p("One disclosure up front: I build plugins for EmDash, so I am not neutral. That is exactly why the drawbacks section below is longer than the wins section."),
		),
		toc("On this page"),
		facts("The shape of the fight", [
			["WordPress", "Powers roughly 43% of the web, 20+ years of ecosystem, around 60,000 free plugins"],
			["EmDash", "Public since April 2026; 184,179 npm downloads in the last 30 days"],
			["EmDash registry", "65 plugins - three orders of magnitude smaller, no pretending otherwise"],
			["Sites on EmDash", "628 and counting, by the project's own tracker"],
			["Stack", "WordPress: PHP plus MySQL on a host you babysit. EmDash: Astro on Cloudflare Workers or a Node VPS"],
			["The admin", "Both are real CMSs - collections, block editor, drafts, revisions. EmDash is not a static generator in a costume"],
		]),
		fig("wgt-editor", "The admin editors actually use: picking a block in the post editor on this site. No page builder, no markup mode required."),
		h2("Where EmDash genuinely wins"),
		h3("Speed you do not have to buy plugins for"),
		prose(
			p("Every page on this site is server-rendered HTML behind the Cloudflare edge cache. Warm responses come back in about 20 to 35 milliseconds, and there is no PHP worker assembling the page per request. On WordPress the equivalent took a caching plugin, a CDN, object-cache config and usually a performance plugin fighting the page builder for last place."),
		),
		h3("A smaller attack surface"),
		prose(
			p("There is no wp-login.php to brute-force - sign-in is passkeys with a magic-link fallback. Sandboxed plugins run in a separate isolate with declared capabilities, not PHP executing inside your request on every page load. The admin sits under /_emdash/ and the public site does not ship it. WordPress security is a discipline; here most of it is the architecture."),
		),
		h3("Maintenance that stops being a chore"),
		prose(
			pRich([
				"Deploy is one command - it builds, checks production migrations, uploads the Worker and warms the cache, as documented in the ",
				["https://www.bitdoze.com/deploy-emdash-cloudflare-workers/", "Cloudflare Workers deploy tutorial"],
				". There is no weekly round of plugin updates hoping none of them conflicts, and no PHP version bump breaking the site on a Friday. The content model lives in seed.json and migrations in the repo, so what is in production is what is in git.",
			]),
		),
		h3("Cost"),
		prose(
			p("A WordPress site worth visiting costs real hosting money - ten to thirty a month for anything managed. This site runs on the Workers Paid plan at five dollars a month, and the free tier works if you skip sandboxed registry plugins. The Docker path on a cheap VPS lands in the same range."),
		),
		quote(
			"WordPress asks you to keep a machine patched forever. EmDash asks you to write a theme once and deploy with a command. Which chore you prefer is the real question.",
			"The honest summary",
		),
		h2("The drawbacks, honestly"),
		prose(
			p("This is the section most comparison posts skip, and the reason the article is worth reading. These are real and current, not hypothetical:"),
		),
		checklist("What WordPress still does better", [
			"The plugin gap: 65 registry plugins versus ~60,000. If your site runs on a niche WordPress plugin, its EmDash counterpart probably does not exist yet",
			"Themes are code, not click-install: an EmDash theme is Astro components and CSS tokens in a repository. There is no theme directory where a non-developer clicks Activate",
			"No commerce, membership or LMS story: WooCommerce, LearnDash and MemberPress have no counterparts. If money changes hands on your site, WordPress wins today",
			"The sandbox costs money on Cloudflare: registry plugins need Workers Paid at $5 a month. Free-tier Workers sites can still run plugins in-process from source, but that is a code workflow",
			"Migration is manual: there is no importer. Content moves by scripting the REST API, which is a project, not a click",
			"The community is small: when you hit an odd bug the answer might be reading the source rather than a forum thread with a green checkmark",
			"It is a 1.0.x project: solid enough for this site, but the APIs are six months old and the long tail of edge cases is still being found",
		]),
		notice(
			"warning",
			"Who should stay on WordPress",
			"If the site depends on WooCommerce, memberships, an LMS, or a page builder your editors love, stay. If nobody on the team wants to touch an Astro component, stay. A painful but working WordPress site beats a clean rebuild nobody can operate.",
		),
		h2("Adoption: where it actually stands"),
		prose(
			p("The numbers worth quoting, all current: 184,179 npm downloads in the last 30 days, 65 plugins in the registry, 628-plus sites tracked by the project, and a GitHub repo past 13,500 stars that was created in April 2026."),
			p("Honest caveats on those numbers: npm downloads count CI runs and bots too, so the sites counter is the better signal - and 628 sites against WordPress's hundreds of millions is a rounding error. The trajectory is real; the scale is not there yet. Six months ago this project did not exist, so what you are measuring is slope, not mass."),
		),
		fig("stats-strip", "The same numbers as this site's home page renders them live - the counter refreshes daily, so the article and the page stay in sync."),
		prose(
			pLink(
				"If you want the longer production story rather than numbers, the ",
				"https://www.bitdoze.com/emdash-cms-review/",
				"six-month EmDash review on bitdoze.com",
				" covers who it is and is not for after running it daily.",
			),
		),
		h2("Who should switch"),
		checklist("EmDash is a good home if", [
			"The site is content - a blog, docs, a marketing site, a content hub - and WordPress feels like overkill",
			"You or your team are comfortable in a code editor; themes and schema are files you own",
			"You want edge-speed pages without a caching plugin stack",
			"A fixed $5-a-month hosting bill beats a variable managed-hosting one",
			"Plugin security alerts in your inbox every week finally wore you down",
		]),
		checklist("Stay on WordPress if", [
			"Commerce, memberships or courses are core to the site",
			"Editors build pages visually and nobody wants to own Astro code",
			"You need a niche plugin that has no EmDash equivalent - check the registry first",
			"The site works, is maintained, and the migration budget does not exist",
		]),
		h2("Try it this weekend"),
		steps("A low-risk test drive", [
			[
				"Scaffold locally",
				"npm create emdash@latest gives you a working CMS on SQLite - no Cloudflare account needed. Poke the admin, create a collection, write a post. This is the fifteen-minute version of the decision.",
			],
			[
				"Pick a hosting path",
				"Cloudflare Workers for the managed route, Docker on a VPS for the boring-reliable one, or Coolify if you want a self-hosted PaaS. All three are documented in the tutorials below.",
			],
			[
				"Move one real page",
				"Port your about page or one post, theme and all. That exercise tells you more than any comparison article - including this one.",
			],
		]),
		fig("blog-index", "What a finished EmDash site looks like: this blog index is plain server-rendered HTML - the page you are reading runs the same stack."),
		cards("The tutorials to start with", [
			{ icon: "rocket", title: "Deploy EmDash on Cloudflare Workers", url: "https://www.bitdoze.com/deploy-emdash-cloudflare-workers/", description: "Workers, D1, R2 and the free tier, step by step" },
			{ icon: "rocket", title: "Deploy EmDash with Docker", url: "https://www.bitdoze.com/deploy-emdash-docker/", description: "Self-host on a VPS with benchmarks to size it" },
			{ icon: "terminal", title: "Coolify on a VPS", url: "https://www.bitdoze.com/coolify-install-heroku-alternative/", description: "A self-hosted PaaS for the Docker route, with free SSL" },
			{ icon: "star", title: "Build a custom EmDash theme", url: "https://www.bitdoze.com/emdash-custom-theme/", description: "Tokens, blocks and seed schema on a real site" },
			{ icon: "book", title: "EmDash CMS tutorial", url: "https://www.bitdoze.com/emdash-cms-tutorial/", description: "From npm create to a running admin" },
			{ icon: "book", title: "Migrate from WordPress", url: "https://emdashhq.com/blog/wordpress-to-emdash-migration/", description: "The full move, step by step, if you decide to go" },
		]),
		h2("Common questions"),
		accordion("FAQ", [
			["Is EmDash just Astro with extra steps?", "Astro is the rendering layer - the same reason sites built on it are fast. On top sits the real CMS: collections, the block editor, users and roles, media, revisions, a REST API and a plugin system. You would not call WordPress just PHP."],
			["Can a non-developer run an EmDash site?", "Once it is set up, yes - the admin is a normal CMS admin and editors never see code. The setup and the theme are the developer-shaped part, and those are one-time jobs."],
			["What does it cost compared to WordPress?", "This site: $5 a month on Workers Paid, and free-tier works without registry plugins. A comparable cared-for WordPress install on managed hosting is typically $10 to $30 a month before the plugin licenses."],
			["Will my WordPress content import?", "Not by clicking a button. Content moves through the REST API - paste by hand for small sites, script it for archives. The migration guide covers the route that works."],
			["Is it too young to trust?", "For a commerce site or a client's livelihood, maybe. For a content site you control, the risk profile is reasonable: the data sits in D1 or SQLite you can dump, and the theme is your code either way."],
		]),
		prose(
			p("The fair summary: WordPress is the safer default and EmDash is the better tool for the job it aims at. If your site is content and you can own an Astro codebase, the six-month-old contender already beats the incumbent on speed, cost and the week you get back every month. If your site sells things or your editors build pages visually, the incumbent still earns its install base."),
		),
		button("Deploy EmDash on Cloudflare Workers", "https://www.bitdoze.com/deploy-emdash-cloudflare-workers/", "rocket", "solid", { new_tab: true }),
		button("Read the six-month review", "https://www.bitdoze.com/emdash-cms-review/", "book", "outline", { new_tab: true }),
	],
};

// ------------------------------------------------- inline article images ---
const INLINE = {
	"stats-strip": { file: "uploads/article-images/site-stats-strip.png", alt: "The site stats strip showing 184,179 npm downloads, 65 registry plugins and 628 sites" },
	"wgt-editor": { file: "plugins/emdashhq-widgets/images/screenshot-editor.png", alt: "Picking a widget block in the EmDash post editor" },
	"blog-index": { file: "uploads/article-images/blog-index.png", alt: "The EmDash HQ blog index rendered on the live site" },
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
