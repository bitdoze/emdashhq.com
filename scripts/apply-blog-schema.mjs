#!/usr/bin/env node
/**
 * apply-blog-schema.mjs — pushes the seed's widget block types, the posts
 * collection (fields included), the pages.content allowedTypes update, the
 * seeded blog page + posts, the cover media and the Blog menu items to a
 * running EmDash site via the admin REST API.
 *
 * Seed files only apply at bootstrap — this is the live-schema path for an
 * already-running site.
 *
 * Usage:
 *   node scripts/apply-blog-schema.mjs --url https://emdashhq.com --token <api-token>
 *
 * The token needs schema:manage, content:write, media:upload and menu write
 * access (an admin-level API token covers all of them).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [k, ...rest] = arg.replace(/^--/, "").split("=");
		return [k, rest.join("=")];
	}),
);
const BASE = (args.url ?? process.env.EMDASH_URL ?? "http://localhost:4321").replace(/\/+$/, "");
const TOKEN = args.token ?? process.env.EMDASH_TOKEN;
if (!TOKEN) {
	console.error("Missing --token (admin API token)");
	process.exit(1);
}
const WIDGETS_ONLY = args["widgets-only"] === "true";

const api = async (method, path, body, extra = {}) => {
	const res = await fetch(`${BASE}/_emdash/api${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
			...extra.headers,
		},
		body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text.slice(0, 400) };
	}
	return { status: res.status, json };
};

const ok = (r) => r.status >= 200 && r.status < 300 && r.json?.success !== false;
const items = (r) => r.json?.data?.items ?? r.json?.items ?? [];
const fail = (r) => JSON.stringify(r.json).slice(0, 260);

// ---------------------------------------------------------------- seed data
const seed = JSON.parse(readFileSync(new URL("../seed/seed.json", import.meta.url), "utf8"));
const btDir = new URL("../plugins/emdashhq-widgets/site/block-types/", import.meta.url).pathname;
const widgetBlockTypes = readdirSync(btDir)
	.filter((f) => f.endsWith(".json"))
	.map((f) => JSON.parse(readFileSync(join(btDir, f), "utf8")));

const sitePosts = seed.blockTypes.find((b) => b.slug === "site_posts");
const allBlockTypes = [...widgetBlockTypes, sitePosts];
const postsCollection = seed.collections.find((c) => c.slug === "posts");
const widgetSlugs = allBlockTypes.map((b) => b.slug);

const flattenFields = (bt) =>
	(bt.versions.find((v) => v.version === bt.currentVersion)?.fields ?? bt.versions.at(-1)?.fields ?? []).map(
		sanitizeBlockField,
	);

// The REST schema for block-type fields is strict — strip seed-only keys
// (description etc.) down to what the API accepts.
const BLOCK_FIELD_KEYS = ["slug", "label", "type", "required", "defaultValue"];
const BLOCK_VALIDATION_KEYS = [
	"min",
	"max",
	"minLength",
	"maxLength",
	"pattern",
	"options",
	"subFields",
	"minItems",
	"maxItems",
	"allowedMimeTypes",
];
const SUBFIELD_KEYS = ["slug", "type", "label", "required", "options"];
const pick = (obj, keys) =>
	Object.fromEntries(Object.entries(obj ?? {}).filter(([k, v]) => keys.includes(k) && v !== undefined));
function sanitizeBlockField(field) {
	const out = pick(field, BLOCK_FIELD_KEYS);
	if (field.validation) {
		const v = pick(field.validation, BLOCK_VALIDATION_KEYS);
		if (Array.isArray(v.subFields)) v.subFields = v.subFields.map((sf) => pick(sf, SUBFIELD_KEYS));
		if (Object.keys(v).length) out.validation = v;
	}
	return out;
}

// 1. Block types ------------------------------------------------------------
async function applyBlockTypes() {
	const existing = new Set(items(await api("GET", "/schema/block-types")).map((b) => b.slug));
	for (const bt of allBlockTypes) {
		if (existing.has(bt.slug)) {
			console.log(`  block-type ${bt.slug}: exists, skipping`);
			continue;
		}
		const r = await api("POST", "/schema/block-types", {
			slug: bt.slug,
			label: bt.label,
			description: bt.description,
			icon: bt.icon,
			category: bt.category,
			fields: flattenFields(bt),
		});
		console.log(`  block-type ${bt.slug}: ${r.status} ${ok(r) ? "created" : fail(r)}`);
	}
}

// 2. posts collection + fields ----------------------------------------------
async function applyPostsCollection() {
	const cols = items(await api("GET", "/schema/collections"));
	if (cols.some((c) => c.slug === "posts")) {
		console.log("  collection posts: exists, skipping");
	} else {
		const r = await api("POST", "/schema/collections", {
			slug: postsCollection.slug,
			label: postsCollection.label,
			labelSingular: postsCollection.labelSingular,
			description: postsCollection.description,
			icon: postsCollection.icon,
			admin: postsCollection.admin,
			supports: postsCollection.supports,
			urlPattern: postsCollection.urlPattern,
			routable: postsCollection.routable ?? true,
			hasSeo: postsCollection.supports?.includes("seo") ?? true,
			sortOrder: postsCollection.sortOrder,
			group: postsCollection.group,
		});
		console.log(`  collection posts: ${r.status} ${ok(r) ? "created" : fail(r)}`);
		if (!ok(r)) return;
	}
	const detail = await api("GET", "/schema/collections/posts?includeFields=true");
	const existingFields = new Set((detail.json?.data?.item?.fields ?? detail.json?.item?.fields ?? detail.json?.data?.fields ?? []).map((f) => f.slug));
	for (const field of postsCollection.fields) {
		if (existingFields.has(field.slug)) {
			console.log(`    field posts.${field.slug}: exists, skipping`);
			continue;
		}
		const r = await api("POST", "/schema/collections/posts/fields", {
			slug: field.slug,
			label: field.label,
			type: field.type,
			required: field.required ?? false,
			defaultValue: field.defaultValue,
			validation: field.validation ?? null,
			widget: field.widget,
			options: field.options,
			searchable: field.searchable,
			indexed: field.indexed,
		});
		console.log(`    field posts.${field.slug}: ${r.status} ${ok(r) ? "created" : fail(r)}`);
	}
}

// 3. pages.content allowedTypes ---------------------------------------------
async function applyPagesAllowedTypes() {
	const detail = await api("GET", "/schema/collections/pages?includeFields=true");
	const fields = detail.json?.data?.item?.fields ?? detail.json?.item?.fields ?? detail.json?.data?.fields ?? [];
	const content = fields.find((f) => f.slug === "content");
	if (!content) {
		console.log("  pages.content: not found, skipping");
		return;
	}
	const allowed = new Set(content.validation?.allowedTypes ?? []);
	const missing = widgetSlugs.filter((s) => !allowed.has(s));
	if (missing.length === 0) {
		console.log("  pages.content: all widget types already allowed");
		return;
	}
	const r = await api("PUT", "/schema/collections/pages/fields/content", {
		validation: { ...(content.validation ?? {}), allowedTypes: [...allowed, ...missing] },
	});
	console.log(`  pages.content allowedTypes +${missing.length}: ${r.status} ${ok(r) ? "updated" : fail(r)}`);
}

// 4. media ------------------------------------------------------------------
async function ensureCoverMedia() {
	const img = await fetch(`${BASE}/og-default.png`);
	if (!img.ok) {
		console.log(`  media: could not fetch ${BASE}/og-default.png (${img.status}) — posts go without covers`);
		return null;
	}
	const buf = new Uint8Array(await img.arrayBuffer());
	const form = new FormData();
	form.set("file", new File([buf], "og-default.png", { type: "image/png" }));
	form.set("alt", "The EmDash cover card");
	form.set("deduplicate", "true");
	const r = await api("POST", "/media", form);
	const item = r.json?.data?.item ?? r.json?.item;
	if (!ok(r) || !item?.id) {
		console.log(`  media upload: ${r.status} ${fail(r)}`);
		return null;
	}
	console.log(`  media: og-default.png -> ${item.id}`);
	return item;
}

// 5. content ----------------------------------------------------------------
function replaceMediaRefs(value, mediaId) {
	if (Array.isArray(value)) return value.map((v) => replaceMediaRefs(v, mediaId));
	if (value && typeof value === "object") {
		if ("$media" in value) return mediaId ? { id: mediaId, alt: value.$media.alt ?? "" } : undefined;
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceMediaRefs(v, mediaId)]));
	}
	return value;
}

async function applyContent(collection, entry, mediaId, publishedAt) {
	const found = await api("GET", `/content/${collection}/${encodeURIComponent(entry.slug)}`);
	if (found.status === 200) {
		console.log(`  ${collection}/${entry.slug}: exists, skipping`);
		return;
	}
	const data = replaceMediaRefs(entry.data, mediaId);
	const body = { data, slug: entry.slug };
	if (publishedAt) body.publishedAt = publishedAt;
	const r = await api("POST", `/content/${collection}`, body);
	const item = r.json?.data?.item ?? r.json?.data;
	if (!ok(r) || !item?.id) {
		console.log(`  ${collection}/${entry.slug}: ${r.status} ${fail(r)}`);
		return;
	}
	const pub = await api("POST", `/content/${collection}/${item.id}/publish`, {});
	console.log(`  ${collection}/${entry.slug}: created ${r.status}, publish ${pub.status} ${ok(pub) ? "ok" : fail(pub)}`);
}

// 6. menus ------------------------------------------------------------------
async function applyMenus() {
	for (const menuName of ["primary", "footer_learn"]) {
		const detail = await api("GET", `/menus/${menuName}`);
		const menu = detail.json?.data ?? detail.json;
		const existing = (menu?.items ?? []).find(
			(i) => i.label === "Blog" || i.customUrl === "/blog/" || i.url === "/blog/",
		);
		if (existing) {
			console.log(`  menu ${menuName}: Blog item exists, skipping`);
			continue;
		}
		const r = await api("POST", `/menus/${menuName}/items`, {
			type: "custom",
			label: "Blog",
			customUrl: "/blog/",
			sortOrder: 2,
		});
		console.log(`  menu ${menuName}: Blog item ${r.status} ${ok(r) ? "created" : fail(r)}`);
	}
}

// ------------------------------------------------------------------- run ---
console.log(`Applying blog schema to ${BASE}`);
console.log("1. block types");
await applyBlockTypes();
if (!WIDGETS_ONLY) {
	console.log("2. posts collection");
	await applyPostsCollection();
	console.log("3. pages.content allowedTypes");
	await applyPagesAllowedTypes();
	console.log("4. media");
	const media = await ensureCoverMedia();
	console.log("5. content");
	for (const entry of (seed.content?.pages ?? []).filter((e) => e.slug === "blog")) {
		await applyContent("pages", entry, media?.id);
	}
	const dates = {
		"contact-form-spam-turnstile": "2026-10-06T10:00:00Z",
		"emdash-widgets-plugin": "2026-10-07T10:00:00Z",
		"emdash-blog-section": "2026-10-08T10:00:00Z",
		"widget-gallery": "2026-10-09T10:00:00Z",
	};
	for (const entry of seed.content?.posts ?? []) {
		await applyContent("posts", entry, media?.id, dates[entry.slug]);
	}
	console.log("6. menus");
	await applyMenus();
}
console.log("Done.");
