#!/usr/bin/env node
/*
 * Inserts the "start here" steps section on the home page: a widget_steps
 * block right after the hero plus two CTA buttons. GET-modify-PUT; skips if
 * the section is already present (matched by the steps title).
 *
 * Prod: node scripts/add-home-steps.mjs --url https://emdashhq.com --token <token>
 */

const args = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const [k, v] = a.replace(/^--/, "").split("=");
		return [k, v ?? true];
	}),
);
const BASE = (args.url ?? "http://localhost:4321").replace(/\/$/, "");
const TOKEN = args.token;
if (!TOKEN) {
	console.error("Needs --token (admin API token)");
	process.exit(1);
}

async function api(method, path, body) {
	const res = await fetch(`${BASE}/_emdash/api${path}`, {
		method,
		headers: {
			"X-EmDash-Request": "1",
			Authorization: `Bearer ${TOKEN}`,
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: "manual",
	});
	let json = null;
	try {
		json = await res.json();
	} catch {}
	return { status: res.status, json };
}

const ok = (r) => r.status >= 200 && r.status < 300;
const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const TITLE = "New to EmDash? Zero to deployed in an afternoon";
const CARDS_TITLE = "A guide for every step";

const STEPS = {
	_type: "widget_steps",
	_version: 1,
	_key: uid(),
	title: TITLE,
	items: [
			{
				title: "Scaffold the site",
				body: "Run npm create emdash@latest and pick the template closest to your target. You get a working CMS on SQLite and the admin at /_emdash/admin - no accounts, no cloud setup.",
			},
			{
				title: "Make it yours",
				body: "Edit the collections in seed.json and the theme tokens, then write your first entry in the admin. The content model and the look are files you own, not settings in a database.",
			},
			{
				title: "Pick the host",
				body: "Cloudflare Workers for the managed route - free tier, or $5 a month when you want sandboxed registry plugins. A cheap VPS with Docker is the boring-reliable alternative.",
			},
			{
				title: "Deploy",
				body: "npm run deploy builds the site, checks production migrations, uploads the Worker and warms the page cache. The first deploy takes about as long as making coffee.",
			},
			{
				title: "Extend when ready",
				body: "The registry's plugins cover the usual gaps. Contact Forms and Content Widgets - both free, both running on this site - are the two most sites install first.",
			},
		],
};

const CARDS = {
	_type: "widget_cards",
	_version: 1,
	_key: uid(),
	title: CARDS_TITLE,
	items: [
		{ icon: "book", title: "Your first EmDash site", url: "https://www.bitdoze.com/emdash-cms-tutorial/", description: "Steps 1 and 2: npm create, the admin, and the pieces you will actually edit" },
		{ icon: "star", title: "Build a custom theme", url: "https://www.bitdoze.com/emdash-custom-theme/", description: "Step 2 deeper: tokens, blocks and seed schema on a real site" },
		{ icon: "rocket", title: "Deploy with Docker", url: "https://www.bitdoze.com/deploy-emdash-docker/", description: "Step 3's other path: self-host on a VPS, with benchmarks to size it" },
		{ icon: "book", title: "Migrate from WordPress", url: "/blog/wordpress-to-emdash-migration/", description: "If you are moving an existing site: the full route from export to DNS" },
		{ icon: "mail", title: "Contact forms end to end", url: "/blog/emdash-contact-forms/", description: "Step 5's first plugin: forms, inbox, email and anti-spam" },
		{ icon: "play", title: "Writing with Content Widgets", url: "/blog/writing-with-emdash-widgets/", description: "Step 5's second plugin: the article blocks this section is built from" },
	],
};

const BUTTONS = [
	{
		_type: "widget_button",
		_version: 1,
		_key: uid(),
		label: "Read the deploy tutorial",
		url: "https://www.bitdoze.com/deploy-emdash-cloudflare-workers/",
		icon: "rocket",
		variant: "solid",
		new_tab: true,
	},
	{
		_type: "widget_button",
		_version: 1,
		_key: uid(),
		label: "Browse the plugins",
		url: "/plugins/",
		icon: "star",
		variant: "outline",
	},
];

const found = await api("GET", `/content/pages/home`);
const item = found.json?.data?.item ?? found.json?.item;
if (!ok(found) || !item?.id) {
	console.error(`home: fetch failed ${found.status}`);
	process.exit(1);
}
const data = { ...(item.data ?? {}) };
const content = [...(data.content ?? [])];

const hasSteps = content.some((b) => b._type === "widget_steps" && b.title === TITLE);
const hasCards = content.some((b) => b._type === "widget_cards" && b.title === CARDS_TITLE);

if (!hasSteps) {
	// Fresh install of the whole section, right after the hero (index 1).
	content.splice(1, 0, STEPS, CARDS, ...BUTTONS);
} else if (!hasCards) {
	// Section exists without the guide cards: insert before our CTAs.
	const ctaAt = content.findIndex(
		(b, i) => b._type === "widget_button" && i > content.findIndex((s) => s._type === "widget_steps" && s.title === TITLE),
	);
	content.splice(ctaAt >= 0 ? ctaAt : 2, 0, CARDS);
} else {
	console.log("home: steps section already complete, skipping");
	process.exit(0);
}

data.content = content;

const r = await api("PUT", `/content/pages/${item.id}`, { data });
if (!ok(r)) {
	console.log(`home: update ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
	process.exit(1);
}
const pub = await api("POST", `/content/pages/${item.id}/publish`, {});
console.log(`home: updated, publish ${pub.status}`);
