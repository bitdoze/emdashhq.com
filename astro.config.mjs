import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, kvCache, r2, sandbox } from "@emdash-cms/cloudflare";
import { cloudflareEmail } from "@emdash-cms/cloudflare/plugins";
import icon from "astro-iconset";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import contactFormsPlugin from "emdashhq-contact-forms";
import siteScriptsPlugin from "emdashhq-site-scripts";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	prefetch: {
		prefetchAll: true,
		defaultStrategy: "hover",
	},
	cache: {
		provider: cacheCloudflare(),
	},
	routeRules: {
		// Publishing purges pages by tag, so a long stale window only lets a page
		// idle for days answer from cache while it refreshes, not a cold render.
		"/": { maxAge: 3600, swr: 604800 },
		"/_emdash/api/media/[...path]": { maxAge: 86400, swr: 604800 },
		"/_emdash/[...path]": { maxAge: 0 },
		"/[...slug]": { maxAge: 3600, swr: 604800 },
	},
	build: {
		inlineStylesheets: "auto",
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	vite: {
		build: {
			// Keep light-dark() native in the shipped CSS. Below this line
			// LightningCSS transpiles it into a [data-mode] variable fallback
			// that ignores the theme toggle and pins :root to light.
			cssTarget: ["chrome123", "edge123", "safari18", "firefox136", "opera109"],
		},
		ssr: {
			optimizeDeps: {
				// Pre-bundle so it isn't discovered mid-render, which would trigger
				// a Vite dep re-optimization and break in-flight worker imports
				// under the Cloudflare dev runner (workerd).
				include: ["astro-iconset/components"],
			},
		},
	},
	integrations: [
		react(),
		icon({
			// Only ship the Phosphor icons actually referenced in templates,
			// not the full @iconify-json/ph set (which adds megabytes to the
			// deployed worker bundle).
			include: {
				ph: [
					"arrow-right",
					"book-open-text",
					"check",
					"chart-bar",
					"check-circle",
					"clock",
					"cloud",
					"code",
					"database",
					"envelope",
					"gift",
					"github-logo",
					"globe",
					"heart",
					"lifebuoy",
					"lightning",
					"list",
					"lock",
					"palette",
					"play",
					"plug",
					"rocket-launch",
					"shield-check",
					"sparkle",
					"star",
					"swap",
					"users-three",
					"video",
					"wrench",
					"x",
					"x-logo",
					"youtube-logo",
				],
			},
		}),
		emdash({
			// Collapse concurrent page/chrome reads into per-request D1 batches.
			// Sessions preserve query ordering and authenticated bookmarks.
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			// npm run deploy verifies the build's migration manifest before upload.
			// Production skips migration/setup probes; local dev stays automatic.
			migrations: { runtime: "manual", dev: "auto" },
			storage: r2({ binding: "MEDIA" }),
			objectCache: kvCache({ binding: "CACHE" }),
			toolbar: "client",
			plugins: [
				// Sends magic links, invites, and recovery mail through the
				// send_email binding in wrangler.jsonc. Any address on
				// emdashhq.com works once the domain is onboarded for Email
				// Sending.
				cloudflareEmail({
					from: { email: "dragos@emdashhq.com", name: "EmDash HQ" },
				}),
				// page:fragments is trusted-only: sandboxed plugins never get
				// the hook, so this runs in-process like any native plugin.
				siteScriptsPlugin,
			],
			// Sandboxed plugins run in a Worker Loader isolate (the same
			// format the plugin registry distributes). Contact-forms mail
			// goes through ctx.email.
			sandboxed: [contactFormsPlugin],
			sandboxRunner: sandbox(),
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Archivo",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700, 800],
			fallbacks: ["system-ui", "sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "Playfair Display",
			cssVariable: "--font-display",
			weights: [500, 700, 800, 900],
			styles: ["normal", "italic"],
			fallbacks: ["Georgia", "serif"],
		},
		{
			provider: fontProviders.google(),
			name: "IBM Plex Mono",
			cssVariable: "--font-mono",
			weights: [400, 500, 600],
			fallbacks: ["ui-monospace", "monospace"],
		},
	],
	devToolbar: { enabled: false },
});
