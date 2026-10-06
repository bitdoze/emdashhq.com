import { afterEach, describe, expect, it } from "vitest";

import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

const page = (path: string) => ({ page: { path } });

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
});
