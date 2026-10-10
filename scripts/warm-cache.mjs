// Requests every sitemap page so the deployed version's Workers Cache is full
// before visitors arrive. The cache key includes the Worker version, so each
// deploy starts empty and the first visit to a page pays a cold render.
//
// The script fails (exit 1) when a sitemap cannot be read, a page never turns
// a cached status after every pass, a page answers an uncacheable status
// (BYPASS/DYNAMIC), or a page does not return 2xx — a partial warm is not a
// warm cache.
//
// Usage: node scripts/warm-cache.mjs [origin] [--settle=ms]
// Without an origin, the custom domain comes from the built Wrangler config.
// `--selftest` runs the warm logic against a local fixture server.

import { readFile } from "node:fs/promises";

const CACHED = new Set(["HIT", "UPDATING", "STALE", "REVALIDATED"]);
const UNCACHEABLE = new Set(["BYPASS", "DYNAMIC"]);
const MAX_PASSES = 3;
// Lets a just-uploaded version finish rolling out before the first pass.
const SETTLE_MS = 5000;
const PASS_GAP_MS = 2000;
const REQUEST_TIMEOUT_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function siteOrigin(arg) {
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
	const failures = [];
	const queue = [`${origin}/sitemap.xml`];
	const seen = new Set();
	while (queue.length > 0) {
		const sitemap = queue.shift();
		if (seen.has(sitemap)) continue;
		seen.add(sitemap);
		const response = await fetch(sitemap, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
			(error) => ({ ok: false, status: error.message }),
		);
		if (!response.ok) {
			failures.push(`${sitemap} (${response.status})`);
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
	return { paths: [...paths], failures };
}

async function warm(url) {
	const started = performance.now();
	try {
		// Follow redirects so canonical targets (e.g. trailing-slash blog URLs
		// the sitemap emits slashless) get warmed too.
		const response = await fetch(url, {
			headers: { Accept: "text/html" },
			redirect: "follow",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
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

async function run(origin, { settle = SETTLE_MS } = {}) {
	await sleep(settle);
	const { paths, failures } = await sitemapPaths(origin);
	for (const failure of failures) console.error(`Sitemap unavailable: ${failure}`);
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
	let code = 0;
	if (failures.length > 0) {
		console.error(`Could not read ${failures.length} sitemap(s); the warm may be incomplete.`);
		code = 1;
	}
	if (uncacheable.size > 0) {
		console.error(`Unexpected uncacheable pages (BYPASS/DYNAMIC): ${[...uncacheable].join(", ")}`);
		code = 1;
	}
	if (cold.length > 0) {
		console.error(`Still cold after ${MAX_PASSES} passes: ${cold.join(", ")}`);
		code = 1;
	}
	if (failed.size > 0) {
		const list = [...failed].map(([path, status]) => `${path} (${status})`).join(", ");
		console.error(`The Worker is deployed, but these pages did not return 2xx: ${list}`);
		code = 1;
	}
	if (code === 0) console.log("Cache warm.");
	return code;
}

// Exercises run() against a local fixture — no deploy needed to check the
// failure modes.
async function selftest() {
	const { createServer } = await import("node:http");
	const { once } = await import("node:events");

	const serve = async (handler) => {
		const server = createServer(handler);
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		return { server, origin: `http://127.0.0.1:${server.address().port}` };
	};

	const withSitemap = (paths, pageHandler) => (req, res) => {
		if (req.url === "/sitemap.xml") {
			const locs = paths.map((p) => `<url><loc>http://x${p}</loc></url>`).join("");
			res.setHeader("content-type", "application/xml");
			res.end(`<?xml version="1.0"?><urlset>${locs}</urlset>`);
			return;
		}
		pageHandler(req, res);
	};

	let failures = 0;
	const check = async (name, expected, handler) => {
		const { server, origin } = await serve(handler);
		const code = await run(origin, { settle: 0 });
		const okResult = code === expected;
		if (!okResult) failures++;
		console.log(`${okResult ? "PASS" : "FAIL"} selftest:${name} (exit ${code}, expected ${expected})`);
		server.close();
	};

	// Healthy: a MISS that warms to HIT on the second pass.
	const healthy = (() => {
		let missHits = 0;
		return withSitemap(["/", "/about"], (req, res) => {
			res.setHeader("content-type", "text/html");
			if (req.url === "/") res.setHeader("cf-cache-status", missHits++ === 0 ? "MISS" : "HIT");
			else res.setHeader("cf-cache-status", "HIT");
			res.end("ok");
		});
	})();
	await check("healthy", 0, healthy);

	// Broken: one page never caches and one answers BYPASS.
	await check(
		"cold-and-bypass",
		1,
		withSitemap(["/", "/always-miss", "/bypassed"], (req, res) => {
			res.setHeader("content-type", "text/html");
			if (req.url === "/always-miss") res.setHeader("cf-cache-status", "MISS");
			else if (req.url === "/bypassed") res.setHeader("cf-cache-status", "BYPASS");
			else res.setHeader("cf-cache-status", "HIT");
			res.end("ok");
		}),
	);

	// No sitemap at all.
	await check("missing-sitemap", 1, (req, res) => {
		if (req.url === "/sitemap.xml") {
			res.statusCode = 404;
			res.end("not found");
			return;
		}
		res.setHeader("content-type", "text/html");
		res.setHeader("cf-cache-status", "HIT");
		res.end("ok");
	});

	return failures;
}

async function main() {
	const args = process.argv.slice(2);
	if (args.includes("--selftest")) return await selftest();
	const settleArg = args.find((a) => a.startsWith("--settle="));
	const settle = settleArg ? Number(settleArg.split("=")[1]) : SETTLE_MS;
	const { origin, error } = await siteOrigin(args.find((a) => !a.startsWith("--")));
	if (error) {
		console.error(error);
		return 1;
	}
	return await run(origin, { settle });
}

process.exitCode = await main();
