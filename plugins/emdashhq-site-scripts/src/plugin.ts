import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

const DEFAULT_PLAUSIBLE_SRC = "https://plausible.io/js/script.js";
// Plausible's newer per-site scripts (pa-XXXX.js) only track after this call.
const PLAUSIBLE_INIT_CODE =
	"window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()";
const PLAUSIBLE_DOMAIN_PATTERN = /^[a-z0-9.-]+(,[a-z0-9.-]+)*$/i;
const GA_ID_PATTERN = /^(?:G|GT|AW)-[A-Z0-9]{4,20}$/i;
const CF_TOKEN_PATTERN = /^[a-z0-9]{16,64}$/i;
const ADMIN_PATH_PREFIX = "/_emdash/";

type PagePlacement = "head" | "body:start" | "body:end";
type Contribution =
	| {
			kind: "external-script";
			placement: PagePlacement;
			src: string;
			async?: boolean;
			defer?: boolean;
			attributes?: Record<string, string>;
			key?: string;
	  }
	| {
			kind: "inline-script";
			placement: PagePlacement;
			code: string;
			attributes?: Record<string, string>;
			key?: string;
	  }
	| {
			kind: "html";
			placement: PagePlacement;
			html: string;
			key?: string;
	  };

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isPerSitePlausibleScript(src: string): boolean {
	try {
		const url = new URL(src);
		return url.protocol === "https:" && /\/pa-[\w-]+\.js$/.test(url.pathname);
	} catch {
		return false;
	}
}

async function buildFragments(ctx: PluginContext): Promise<Contribution[]> {
	const stored = new Map<string, unknown>();
	for (const { key, value } of await ctx.settings.list()) stored.set(key, value);

	if (stored.get("enabled") === false) return [];

	const fragments: Contribution[] = [];

	const plausibleDomain = text(stored.get("plausibleDomain"));
	const plausibleSrc = text(stored.get("plausibleSrc"));
	if (plausibleSrc && isPerSitePlausibleScript(plausibleSrc)) {
		fragments.push(
			{
				kind: "external-script",
				placement: "head",
				src: plausibleSrc,
				async: true,
				key: "site-scripts:plausible",
			},
			{
				kind: "inline-script",
				placement: "head",
				code: PLAUSIBLE_INIT_CODE,
				key: "site-scripts:plausible-init",
			},
		);
	} else if (plausibleDomain || plausibleSrc) {
		const attributes: Record<string, string> = {};
		if (plausibleDomain) {
			if (PLAUSIBLE_DOMAIN_PATTERN.test(plausibleDomain)) {
				attributes["data-domain"] = plausibleDomain;
			} else {
				ctx.log.warn("Ignoring Plausible domain with unexpected characters");
			}
		}
		fragments.push({
			kind: "external-script",
			placement: "head",
			src: plausibleSrc || DEFAULT_PLAUSIBLE_SRC,
			defer: true,
			attributes,
			key: "site-scripts:plausible",
		});
	}

	const cfToken = text(stored.get("cloudflareBeaconToken"));
	if (cfToken) {
		if (CF_TOKEN_PATTERN.test(cfToken)) {
			fragments.push({
				kind: "external-script",
				placement: "head",
				src: "https://static.cloudflareinsights.com/beacon.min.js",
				defer: true,
				attributes: { "data-cf-beacon": JSON.stringify({ token: cfToken }) },
				key: "site-scripts:cloudflare-beacon",
			});
		} else {
			ctx.log.warn("Ignoring Cloudflare Web Analytics token with unexpected characters");
		}
	}

	const gaId = text(stored.get("gaMeasurementId"));
	if (gaId) {
		if (GA_ID_PATTERN.test(gaId)) {
			fragments.push(
				{
					kind: "external-script",
					placement: "head",
					src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`,
					async: true,
					key: "site-scripts:ga-loader",
				},
				{
					kind: "inline-script",
					placement: "head",
					code: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config",${JSON.stringify(gaId)});`,
					key: "site-scripts:ga-config",
				},
			);
		} else {
			ctx.log.warn("Ignoring Google Analytics measurement ID with unexpected format");
		}
	}

	const custom = [
		{ setting: "headHtml", placement: "head" },
		{ setting: "bodyStartHtml", placement: "body:start" },
		{ setting: "bodyEndHtml", placement: "body:end" },
	] as const;
	for (const { setting, placement } of custom) {
		const html = text(stored.get(setting));
		if (html) fragments.push({ kind: "html", placement, html, key: `site-scripts:${setting}` });
	}

	return fragments;
}

const plugin: SandboxedPlugin = {
	hooks: {
		"page:fragments": async (event, ctx) => {
			if (event.page.path.startsWith(ADMIN_PATH_PREFIX)) return null;
			const fragments = await buildFragments(ctx);
			return fragments.length > 0 ? fragments : null;
		},
	},
};

export default plugin;
