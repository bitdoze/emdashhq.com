#!/usr/bin/env node
/*
 * Builds the "start here" section on the home page, right after the hero:
 * numbered steps, a copy-paste quickstart, the deploy video, a guide card
 * for every step, a cost note, and CTAs into both plugins and the catalog.
 * GET-modify-PUT; replaces the section in place when it already exists
 * (anchored by the steps title, consuming the contiguous widget_* run).
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
const REG_CF = "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-contact-forms";
const REG_WGT = "https://plugins.emdashcms.com/plugins/@bitdoze.com/emdashhq-widgets";
const UTM = "?utm_source=emdashhq&utm_medium=start_section&utm_campaign=getting-started";

const ptBlock = (text, style = "normal") => ({
	_type: "block",
	_key: uid(),
	style,
	markDefs: [],
	children: [{ _type: "span", _key: uid(), text, marks: [] }],
});

const SECTION = [
	{
		_type: "widget_steps",
		_version: 1,
		_key: uid(),
		title: TITLE,
		items: [
			{
				title: "Scaffold the site",
				body: "Run npm create emdash@latest, pick the template closest to your target, then npm run dev. You get a working CMS on SQLite and the admin at /_emdash/admin - no accounts, no cloud signup, ten minutes.",
			},
			{
				title: "Make it yours",
				body: "Edit the collections in seed.json and the theme tokens, then write your first entry in the admin. The content model and the look are files you own, not settings in a database.",
			},
			{
				title: "Pick the host",
				body: "Cloudflare Workers is the managed route: free tier, then $5 a month once you want sandboxed registry plugins. Docker on a cheap VPS is the boring-reliable alternative, Coolify if you want a panel.",
			},
			{
				title: "Deploy",
				body: "npm run deploy builds the site, checks production migrations, uploads the Worker and warms the page cache. First run takes about as long as making coffee.",
			},
			{
				title: "Extend when ready",
				body: "Admin, Plugins, Registry - search, install, approve. Contact Forms and Content Widgets, both free and both running on this site, are the two most sites install first.",
			},
		],
	},
	{
		_type: "widget_prose",
		_version: 1,
		_key: uid(),
		body: [ptBlock("The copy-paste version", "h3")],
	},
	{
		_type: "widget_code",
		_version: 1,
		_key: uid(),
		language: "bash",
		filename: "quickstart.sh",
		code: "npm create emdash@latest my-site\ncd my-site\nnpm run dev      # admin at http://localhost:4321/_emdash/admin\nnpm run deploy   # build -> migrate check -> upload -> cache warm",
	},
	{
		_type: "widget_youtube",
		_version: 1,
		_key: uid(),
		url: "https://www.youtube.com/watch?v=EbVsG5feCH8",
		title: "Deploy EmDash on Cloudflare Workers for FREE (Step-by-Step)",
		caption: "Prefer to watch? The free-tier deploy, filmed start to finish.",
	},
	{
		_type: "widget_cards",
		_version: 1,
		_key: uid(),
		title: CARDS_TITLE,
		items: [
			{ icon: "book", title: "Your first EmDash site", url: `https://www.bitdoze.com/emdash-cms-tutorial/${UTM}`, description: "Steps 1 and 2: scaffold, the admin, and the files you will actually edit" },
			{ icon: "star", title: "Build a custom theme", url: `https://www.bitdoze.com/emdash-custom-theme/${UTM}`, description: "Step 2 deeper: tokens, blocks and seed schema on a real site" },
			{ icon: "rocket", title: "Deploy on Cloudflare Workers", url: `https://www.bitdoze.com/deploy-emdash-cloudflare-workers/${UTM}`, description: "Step 3's managed path: D1, R2 and the free tier, end to end" },
			{ icon: "rocket", title: "Self-host with Docker", url: `https://www.bitdoze.com/deploy-emdash-docker/${UTM}`, description: "Step 3's other path: a compose stack on a VPS, with sizing benchmarks" },
			{ icon: "play", title: "Watch the deploy on YouTube", url: "https://www.youtube.com/watch?v=EbVsG5feCH8", description: "The free-tier Cloudflare deploy, filmed start to finish" },
			{ icon: "arrow-right", title: "Migrate from WordPress", url: "/blog/wordpress-to-emdash-migration/", description: "Already on WP? The route from export to DNS, plugin by plugin" },
			{ icon: "mail", title: "Contact forms end to end", url: "/blog/emdash-contact-forms/", description: "Step 5's first plugin: forms, inbox, email, anti-spam" },
			{ icon: "star", title: "Writing with Content Widgets", url: "/blog/writing-with-emdash-widgets/", description: "Step 5's second plugin: the blocks this section is built from" },
		],
	},
	{
		_type: "widget_notice",
		_version: 1,
		_key: uid(),
		kind: "info",
		title: "What it costs",
		body: [ptBlock("Everything here is free except one line item: Cloudflare's Workers Paid plan at $5 a month, and you need it only for sandboxed registry plugins. The CMS, the deploys and both plugins cost nothing.")],
	},
	{
		_type: "widget_button",
		_version: 1,
		_key: uid(),
		label: "Start the tutorial",
		url: `https://www.bitdoze.com/emdash-cms-tutorial/${UTM}`,
		icon: "rocket",
		variant: "solid",
		new_tab: true,
	},
	{
		_type: "widget_button",
		_version: 1,
		_key: uid(),
		label: "Contact Forms plugin",
		url: REG_CF,
		icon: "mail",
		variant: "outline",
		new_tab: true,
	},
	{
		_type: "widget_button",
		_version: 1,
		_key: uid(),
		label: "Content Widgets plugin",
		url: REG_WGT,
		icon: "star",
		variant: "outline",
		new_tab: true,
	},
	{
		_type: "widget_button",
		_version: 1,
		_key: uid(),
		label: "Browse all plugins",
		url: "/plugins/",
		icon: "arrow-right",
		variant: "outline",
	},
];

// Block types this script owns - used to find the section's extent.
const OUR_TYPES = new Set([
	"widget_steps",
	"widget_prose",
	"widget_code",
	"widget_youtube",
	"widget_cards",
	"widget_notice",
	"widget_button",
]);

const found = await api("GET", `/content/pages/home`);
const item = found.json?.data?.item ?? found.json?.item;
if (!ok(found) || !item?.id) {
	console.error(`home: fetch failed ${found.status}`);
	process.exit(1);
}
const data = { ...(item.data ?? {}) };
const content = [...(data.content ?? [])];

const stepsAt = content.findIndex((b) => b._type === "widget_steps" && b.title === TITLE);
let replaced = 0;
if (stepsAt === -1) {
	// Fresh install of the whole section, right after the hero (index 1).
	content.splice(1, 0, ...SECTION);
} else {
	// Replace the contiguous widget run that starts at the steps block.
	let end = stepsAt;
	while (end < content.length && OUR_TYPES.has(content[end]._type)) end++;
	replaced = end - stepsAt;
	content.splice(stepsAt, replaced, ...SECTION);
}

data.content = content;

const r = await api("PUT", `/content/pages/${item.id}`, { data });
if (!ok(r)) {
	console.log(`home: update ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
	process.exit(1);
}
const pub = await api("POST", `/content/pages/${item.id}/publish`, {});
console.log(`home: ${stepsAt === -1 ? "installed" : `replaced ${replaced} blocks`}, publish ${pub.status}`);
