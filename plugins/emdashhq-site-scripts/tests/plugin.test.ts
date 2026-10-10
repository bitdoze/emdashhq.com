import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginRuntimeTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;
let runtimeHost: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
	await runtimeHost?.dispose();
	runtimeHost = undefined;
});

const page = (path: string) => ({ page: { path } });

type Fragment = {
	kind: string;
	placement: string;
	src?: string;
	code?: string;
	html?: string;
	async?: boolean;
	defer?: boolean;
	attributes?: Record<string, string>;
};

async function seedRuntimeHost(settings: Record<string, unknown>): Promise<PluginRuntimeTestHost> {
	const h = await createPluginRuntimeTestHost();
	await h.actions.plugin.activate();
	for (const [key, value] of Object.entries(settings)) {
		await h.fixtures.plugin.setting(key, value);
	}
	return h;
}

const fragmentsFor = (path = "/") =>
	runtimeHost?.transport.invokeHook("page:fragments", page(path)) as Promise<Fragment[] | null>;

describe("page:fragments hook", () => {
	it("returns null on admin pages regardless of settings", async () => {
		host = await createPluginTestHost();
		expect(await host.invokeHook("page:fragments", page("/_emdash/admin"))).toBeNull();
		expect(await host.invokeHook("page:fragments", page("/_emdash/api/x"))).toBeNull();
	});

	it("returns null on public pages when no providers are configured", async () => {
		host = await createPluginTestHost();
		expect(await host.invokeHook("page:fragments", page("/"))).toBeNull();
		expect(await host.invokeHook("page:fragments", page("/contact"))).toBeNull();
	});

	it("returns null on admin pages even when providers are configured", async () => {
		runtimeHost = await seedRuntimeHost({ headHtml: "<meta name='x' content='y'>" });
		expect(await fragmentsFor("/_emdash/admin")).toBeNull();
		expect(await fragmentsFor("/_emdash/api/plugins/x")).toBeNull();
	});

	it("returns null when the plugin is disabled", async () => {
		runtimeHost = await seedRuntimeHost({
			enabled: false,
			headHtml: "<meta name='x' content='y'>",
		});
		expect(await fragmentsFor("/")).toBeNull();
	});
});

describe("plausible", () => {
	it("emits an async loader plus init call for a per-site pa-* script", async () => {
		runtimeHost = await seedRuntimeHost({
			plausibleSrc: "https://plausible.io/js/pa-abc123.js",
		});
		const fragments = await fragmentsFor();
		expect(fragments).toHaveLength(2);
		const [loader, init] = fragments!;
		expect(loader).toMatchObject({
			kind: "external-script",
			placement: "head",
			src: "https://plausible.io/js/pa-abc123.js",
			async: true,
		});
		expect(init).toMatchObject({ kind: "inline-script", placement: "head" });
		expect(init.code).toContain("plausible.init");
	});

	it("emits the default deferred script with data-domain for domain-only config", async () => {
		runtimeHost = await seedRuntimeHost({ plausibleDomain: "example.com" });
		const fragments = await fragmentsFor();
		expect(fragments).toHaveLength(1);
		expect(fragments![0]).toMatchObject({
			kind: "external-script",
			placement: "head",
			src: "https://plausible.io/js/script.js",
			defer: true,
			attributes: { "data-domain": "example.com" },
		});
	});

	it("drops a data-domain with unsafe characters but keeps the script", async () => {
		runtimeHost = await seedRuntimeHost({ plausibleDomain: `"><script>bad()` });
		const fragments = await fragmentsFor();
		expect(fragments).toHaveLength(1);
		expect(fragments![0].attributes ?? {}).not.toHaveProperty("data-domain");
	});
});

describe("cloudflare web analytics", () => {
	it("emits the beacon with a JSON token attribute for a valid token", async () => {
		runtimeHost = await seedRuntimeHost({
			cloudflareBeaconToken: "0123456789abcdef0123456789abcdef",
		});
		const fragments = await fragmentsFor();
		expect(fragments).toHaveLength(1);
		const beacon = fragments![0];
		expect(beacon.src).toBe("https://static.cloudflareinsights.com/beacon.min.js");
		expect(beacon.defer).toBe(true);
		expect(JSON.parse(beacon.attributes?.["data-cf-beacon"] ?? "{}")).toEqual({
			token: "0123456789abcdef0123456789abcdef",
		});
	});

	it("ignores a token with unexpected characters", async () => {
		runtimeHost = await seedRuntimeHost({
			cloudflareBeaconToken: `"><script>alert(1)</script>`,
		});
		expect(await fragmentsFor()).toBeNull();
	});
});

describe("google analytics", () => {
	it("emits the gtag loader and inline config for a valid id", async () => {
		runtimeHost = await seedRuntimeHost({ gaMeasurementId: "G-ABC123DEF4" });
		const fragments = await fragmentsFor();
		expect(fragments).toHaveLength(2);
		const [loader, config] = fragments!;
		expect(loader.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4");
		expect(loader.async).toBe(true);
		expect(config.kind).toBe("inline-script");
		expect(config.code).toContain('gtag("config","G-ABC123DEF4")');
	});

	it("ignores a malformed measurement id", async () => {
		runtimeHost = await seedRuntimeHost({ gaMeasurementId: "G-BAD ID" });
		expect(await fragmentsFor()).toBeNull();
	});
});

describe("custom html areas", () => {
	it("emits html fragments in their declared placements", async () => {
		runtimeHost = await seedRuntimeHost({
			headHtml: "<meta name='head' content='1'>",
			bodyStartHtml: "<div id='start'></div>",
			bodyEndHtml: "<div id='end'></div>",
		});
		const fragments = await fragmentsFor();
		expect(fragments).toEqual([
			{ kind: "html", placement: "head", html: "<meta name='head' content='1'>", key: "site-scripts:headHtml" },
			{ kind: "html", placement: "body:start", html: "<div id='start'></div>", key: "site-scripts:bodyStartHtml" },
			{ kind: "html", placement: "body:end", html: "<div id='end'></div>", key: "site-scripts:bodyEndHtml" },
		]);
	});
});
