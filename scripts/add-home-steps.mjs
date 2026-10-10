#!/usr/bin/env node
/*
 * Builds the "start here" roadmap on the home page, right after the
 * hero: five numbered steps, one line each, nothing else. The deeper
 * guides already live in the tutorials/plugins sections below.
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

const SECTION = [
	{
		_type: "widget_steps",
		_version: 1,
		_key: uid(),
		title: TITLE,
		items: [
			{
				title: "Scaffold the site",
				body: "npm create emdash@latest, then npm run dev. Admin at /_emdash/admin, no accounts needed.",
			},
			{
				title: "Make it yours",
				body: "Edit seed.json and the theme tokens, write your first entry.",
			},
			{
				title: "Pick the host",
				body: "Cloudflare Workers free tier, or Docker on any VPS.",
			},
			{
				title: "Deploy",
				body: "npm run deploy - build, migration check, upload, cache warm in one command.",
			},
			{
				title: "Extend when ready",
				body: "Admin, Plugins, Registry. Contact Forms and Content Widgets are free and a good first install.",
			},
		],
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
