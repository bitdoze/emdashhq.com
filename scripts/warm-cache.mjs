// Requests every sitemap page so the deployed version's Workers Cache is full
// before visitors arrive. The cache key includes the Worker version, so each
// deploy starts empty and the first visit to a page pays a cold render.
//
// Usage: node scripts/warm-cache.mjs [origin]
// Without an origin, the custom domain comes from the built Wrangler config.

import { readFile } from "node:fs/promises";

const CACHED = new Set(["HIT", "UPDATING", "STALE", "REVALIDATED"]);
const UNCACHEABLE = new Set(["BYPASS", "DYNAMIC"]);
const MAX_PASSES = 3;
// Lets a just-uploaded version finish rolling out before the first pass.
const SETTLE_MS = 5000;
const PASS_GAP_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function siteOrigin() {
	const arg = process.argv[2];
	if (arg) return { origin: new URL(arg).origin };
	try {
		const config = JSON.parse(
			await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
		);
		const routes = Array.isArray(config.routes) ? config.routes : [];
		const route = routes.find((r) => r?.custom_domain) ?? routes[0];
		const pattern = typeof route === "string" ? route : route?.pattern;
		if (!pattern) return { error: "No route in dist/server/wrangler.json. Pass the site origin." };
		return { origin: new URL(`https://${pattern.replace(/\/\*?$/, "")}`).origin };
	} catch (error) {
		return { error: `Cannot read dist/server/wrangler.json (${error.message}). Build first or pass the site origin.` };
	}
}

async function sitemapPaths(origin) {
	const paths = new Set(["/"]);
	const queue = [`${origin}/sitemap.xml`];
	const seen = new Set();
	while (queue.length > 0) {
		const sitemap = queue.shift();
		if (seen.has(sitemap)) continue;
		seen.add(sitemap);
		const response = await fetch(sitemap).catch((error) => ({ ok: false, status: error.message }));
		if (!response.ok) {
			console.warn(`Skipping ${sitemap}: ${response.status}`);
			continue;
		}
		const xml = await response.text();
		const isIndex = xml.includes("<sitemapindex");
		for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
			// The cache key ignores the host, so warm each path on the target origin.
			const url = new URL(match[1].replaceAll("&amp;", "&"), origin);
			if (isIndex) queue.push(`${origin}${url.pathname}${url.search}`);
			else paths.add(`${url.pathname}${url.search}`);
		}
	}
	return [...paths];
}

async function warm(url) {
	const started = performance.now();
	try {
		const response = await fetch(url, { headers: { Accept: "text/html" }, redirect: "manual" });
		await response.arrayBuffer();
		return {
			status: response.status,
			cache: response.headers.get("cf-cache-status") ?? "NONE",
			ms: performance.now() - started,
		};
	} catch (error) {
		return { status: 0, cache: "ERROR", ms: performance.now() - started, error: error.message };
	}
}

async function main() {
	const { origin, error } = await siteOrigin();
	if (error) {
		console.error(error);
		return 1;
	}

	await sleep(SETTLE_MS);
	const paths = await sitemapPaths(origin);
	console.log(`Warming ${paths.length} pages on ${origin}`);

	const failed = new Map();
	const uncacheable = new Set();
	let pending = paths;
	for (let pass = 1; pass <= MAX_PASSES && pending.length > 0; pass++) {
		if (pass > 1) await sleep(PASS_GAP_MS);
		console.log(`Pass ${pass}`);
		const next = [];
		for (const path of pending) {
			const result = await warm(`${origin}${path}`);
			const detail = result.error ? `  ${result.error}` : "";
			console.log(
				`  ${result.cache.padEnd(9)} ${String(result.status).padEnd(4)} ${result.ms.toFixed(0).padStart(5)} ms  ${path}${detail}`,
			);
			if (result.status < 200 || result.status >= 300) {
				failed.set(path, result.status);
				next.push(path);
			} else if (UNCACHEABLE.has(result.cache)) {
				failed.delete(path);
				uncacheable.add(path);
			} else {
				failed.delete(path);
				if (!CACHED.has(result.cache)) next.push(path);
			}
		}
		pending = next;
	}

	const cold = pending.filter((path) => !failed.has(path));
	if (uncacheable.size > 0) console.warn(`Not cacheable: ${[...uncacheable].join(", ")}`);
	if (cold.length > 0) console.warn(`Not cached yet after ${MAX_PASSES} passes: ${cold.join(", ")}`);
	if (failed.size > 0) {
		const list = [...failed].map(([path, status]) => `${path} (${status})`).join(", ");
		console.error(`The Worker is deployed, but these pages did not return 2xx: ${list}`);
		return 1;
	}
	console.log("Cache warm.");
	return 0;
}

process.exitCode = await main();
