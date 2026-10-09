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

describe("config route", () => {
	it("returns the public defaults", async () => {
		host = await createPluginTestHost();
		const result = (await host.invokeRoute("config", {})) as {
			config: {
				youtubeNoCookie: boolean;
				affiliateDisclosure: string;
				postsCollection: string;
			};
		};
		expect(result.config.youtubeNoCookie).toBe(true);
		expect(result.config.postsCollection).toBe("posts");
		expect(result.config.affiliateDisclosure).toContain("affiliate");
	});

	it("reflects saved settings", async () => {
		runtimeHost = await createPluginRuntimeTestHost();
		await runtimeHost.actions.plugin.activate();
		await runtimeHost.fixtures.plugin.setting("youtubeNoCookie", false);
		await runtimeHost.fixtures.plugin.setting("postsCollection", "articles");
		const result = (await runtimeHost.transport.invokeRoute("config", {})) as {
			config: { youtubeNoCookie: boolean; postsCollection: string };
		};
		expect(result.config.youtubeNoCookie).toBe(false);
		expect(result.config.postsCollection).toBe("articles");
	});
});

async function seedPosts(withDraft = true): Promise<PluginRuntimeTestHost> {
	const h = await createPluginRuntimeTestHost();
	await h.actions.plugin.activate();
	await h.fixtures.collection({
		slug: "posts",
		label: "Posts",
		urlPattern: "/blog/{slug}",
		routable: true,
		fields: [
			{ slug: "title", label: "Title", type: "string", required: true },
			{ slug: "excerpt", label: "Excerpt", type: "text" },
		],
	});
	await h.fixtures.content("posts", {
		slug: "newer-post",
		status: "published",
		publishedAt: "2026-03-01T10:00:00.000Z",
		data: { title: "Newer post", excerpt: "Latest article" },
	});
	await h.fixtures.content("posts", {
		slug: "older-post",
		status: "published",
		publishedAt: "2026-01-15T10:00:00.000Z",
		data: { title: "Older post", excerpt: "First article" },
	});
	if (withDraft) {
		await h.fixtures.content("posts", {
			slug: "draft-post",
			status: "draft",
			data: { title: "Draft post" },
		});
	}
	return h;
}

describe("posts route", () => {
	it("returns published entries newest first with resolved URLs", async () => {
		runtimeHost = await seedPosts();
		const result = (await runtimeHost.transport.invokeRoute("posts", {})) as {
			items: { title: string; url: string; excerpt?: string }[];
		};
		expect(result.items.map((item) => item.title)).toEqual(["Newer post", "Older post"]);
		expect(result.items[0].url).toContain("newer-post");
		expect(result.items[0].excerpt).toBe("Latest article");
	});

	it("skips drafts and honours limit", async () => {
		runtimeHost = await seedPosts();
		const result = (await runtimeHost.transport.invokeRoute("posts", { limit: "1" })) as {
			items: { title: string }[];
		};
		expect(result.items).toHaveLength(1);
		expect(result.items[0].title).toBe("Newer post");
	});

	it("excludes the current slug while keeping the list full", async () => {
		runtimeHost = await seedPosts();
		const result = (await runtimeHost.transport.invokeRoute("posts", {
			limit: "1",
			exclude: "newer-post",
		})) as { items: { title: string }[] };
		expect(result.items).toHaveLength(1);
		expect(result.items[0].title).toBe("Older post");
	});

	it("answers an empty list for an unknown or invalid collection", async () => {
		runtimeHost = await seedPosts();
		const unknown = (await runtimeHost.transport.invokeRoute("posts", {
			collection: "nope",
		})) as { items: unknown[] };
		expect(unknown.items).toEqual([]);
		const invalid = (await runtimeHost.transport.invokeRoute("posts", {
			collection: "Bad Slug!",
		})) as { items: unknown[] };
		expect(invalid.items).toEqual([]);
	});
});

describe("admin route", () => {
	it("renders the widget catalog", async () => {
		host = await createPluginTestHost();
		const result = (await host.invokeRoute("admin", {
			type: "page_load",
			page: "/widgets",
		})) as { blocks: unknown[] };
		expect(result.blocks.length).toBeGreaterThan(5);
	});

	it("renders the setup guide", async () => {
		host = await createPluginTestHost();
		const result = (await host.invokeRoute("admin", {
			type: "page_load",
			page: "/setup",
		})) as { blocks: { type: string }[] };
		expect(result.blocks.some((block) => block.type === "code")).toBe(true);
	});
});
