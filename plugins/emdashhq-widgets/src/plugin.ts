import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdminInteraction } from "./admin";
import { handleConfigRoute, handlePostsRoute } from "./public";

const plugin: SandboxedPlugin = {
	routes: {
		// Public: the site's widget components read shared settings from here.
		config: {
			public: true,
			request: { body: "none" },
			cacheControl: "public, max-age=60, stale-while-revalidate=300",
			handler: handleConfigRoute,
		},
		// Public: latest published entries for the Latest posts widget.
		posts: {
			public: true,
			request: { body: "none" },
			cacheControl: "public, max-age=60, stale-while-revalidate=300",
			handler: handlePostsRoute,
		},
		// Private: Block Kit admin pages (widget catalog, setup guide).
		admin: {
			handler: handleAdminInteraction,
		},
	},
};

export default plugin;
