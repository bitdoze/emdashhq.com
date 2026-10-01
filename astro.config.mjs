import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, kvCache, r2 } from "@emdash-cms/cloudflare";
import icon from "astro-iconset";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { siteScriptsPlugin } from "@emdashhq/plugin-site-scripts";

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
		"/": { maxAge: 3600, swr: 86400 },
		"/_emdash/api/media/[...path]": { maxAge: 86400, swr: 604800 },
		"/_emdash/[...path]": { maxAge: 0 },
		"/[...slug]": { maxAge: 3600, swr: 86400 },
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
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			objectCache: kvCache({ binding: "CACHE" }),
			toolbar: "client",
			plugins: [siteScriptsPlugin()],
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
			name: "IBM Plex Mono",
			cssVariable: "--font-mono",
			weights: [400, 500, 600],
			fallbacks: ["ui-monospace", "monospace"],
		},
	],
	devToolbar: { enabled: false },
});
