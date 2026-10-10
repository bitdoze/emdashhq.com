#!/usr/bin/env node
/*
 * Backfills navigation blocks on the older plugin posts: a widget_toc after
 * the intro and a widget_series "More in this series" before the closing
 * cards/buttons. GET-modify-PUT so existing bodies are preserved; skips any
 * post that already has the block. Idempotent.
 *
 * Prod: node scripts/add-series-block.mjs --url https://emdashhq.com --token <token>
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

const SLUGS = ["contact-form-spam-turnstile", "emdash-widgets-plugin", "widget-gallery"];

const SERIES = [
	["Migrate from WordPress", "https://emdashhq.com/blog/wordpress-to-emdash-migration/"],
	["EmDash vs WordPress", "https://emdashhq.com/blog/emdash-vs-wordpress/"],
	["Contact forms end to end", "https://emdashhq.com/blog/emdash-contact-forms/"],
	["Anti-spam and Turnstile", "https://emdashhq.com/blog/contact-form-spam-turnstile/"],
	["Install and architecture", "https://emdashhq.com/blog/emdash-widgets-plugin/"],
	["Writing with Content Widgets", "https://emdashhq.com/blog/writing-with-emdash-widgets/"],
	["Every block in one post", "https://emdashhq.com/blog/widget-gallery/"],
];

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

const tocBlock = () => ({ _type: "widget_toc", _version: 1, _key: uid(), title: "On this page" });
const seriesBlock = () => ({
	_type: "widget_series",
	_version: 1,
	_key: uid(),
	title: "More in this series",
	items: SERIES.map(([label, url]) => ({ label, url })),
});

for (const slug of SLUGS) {
	const found = await api("GET", `/content/posts/${encodeURIComponent(slug)}`);
	const item = found.json?.data?.item ?? found.json?.item;
	if (!ok(found) || !item?.id) {
		console.log(`${slug}: fetch failed ${found.status}`);
		continue;
	}
	const data = { ...(item.data ?? {}) };
	const body = [...(data.body ?? [])];
	const types = body.map((b) => b._type);
	const hasToc = types.includes("widget_toc");
	const hasSeries = types.includes("widget_series");
	if (hasToc && hasSeries) {
		console.log(`${slug}: already has toc + series, skipping`);
		continue;
	}
	if (!hasToc) {
		// After the opening block (intro prose).
		body.splice(1, 0, tocBlock());
	}
	if (!hasSeries) {
		// Before the closing cards grid; else before trailing buttons; else append.
		const cardsAt = body.findLastIndex((b) => b._type === "widget_cards");
		const buttonsAt = body.findLastIndex((b) => b._type === "widget_button");
		const insertAt = cardsAt >= 0 ? cardsAt : buttonsAt >= 0 ? buttonsAt : body.length;
		body.splice(insertAt, 0, seriesBlock());
	}
	data.body = body;
	const r = await api("PUT", `/content/posts/${item.id}`, { data });
	if (!ok(r)) {
		console.log(`${slug}: update ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
		continue;
	}
	const pub = await api("POST", `/content/posts/${item.id}/publish`, {});
	console.log(`${slug}: updated, publish ${pub.status}`);
}
console.log("Done.");
