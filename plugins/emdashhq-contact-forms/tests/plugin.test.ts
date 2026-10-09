import { afterEach, describe, expect, it } from "vitest";
import { capacitySettingsSchema } from "../src/capacity";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginRuntimeTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

const FORM = {
	slug: "contact",
	name: "Contact",
	description: "",
	submitLabel: "Send message",
	successMessage: "Thanks — we will reply shortly.",
	enabled: true,
	notifyEmail: "",
	subjectTemplate: "New {form} submission",
	sendConfirmation: false,
	fields: [
		{ key: "name", type: "text", label: "Name", required: true, placeholder: "", options: [], width: "half" },
		{ key: "email", type: "email", label: "Email", required: true, placeholder: "", options: [], width: "half" },
		{ key: "message", type: "textarea", label: "Message", required: true, placeholder: "", options: [], width: "full" },
	],
	createdAt: "2025-01-01T00:00:00.000Z",
};

const REQUEST = {
	url: "https://example.com/_emdash/api/plugins/emdashhq-contact-forms/submit",
	meta: { ip: "203.0.113.10", userAgent: "vitest", referer: "https://example.com/contact", geo: { country: "US", region: null, city: null } },
};

let host: PluginTestHost | undefined;
let runtimeHost: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
	await runtimeHost?.dispose();
	runtimeHost = undefined;
});

async function seedForm(): Promise<PluginTestHost> {
	const h = await createPluginTestHost();
	await h.storage("forms").list();
	await h.invokeHook("plugin:activate", {});
	// Seed via storage API on the host side is for CMS collections; plugin storage
	// rows are written through routes, so create the form via the admin handler.
	const res = await h.invokeRoute("admin", {
		type: "form_submit",
		action_id: "form_create",
		page: "/forms",
		values: {
			name: FORM.name,
			slug: FORM.slug,
			description: "",
			submitLabel: FORM.submitLabel,
			successMessage: FORM.successMessage,
			notifyEmail: "",
			subjectTemplate: FORM.subjectTemplate,
			enabled: true,
			sendConfirmation: false,
		},
	});
	const forms = await h.storage("forms").list();
	if (forms.length !== 1) throw new Error(`form_create failed: ${JSON.stringify(res).slice(0, 400)}`);
	const formId = forms[0].id;
	for (const field of FORM.fields) {
		await h.invokeRoute("admin", {
			type: "form_submit",
			action_id: `field_save:${formId}`,
			page: `/forms/${formId}`,
			values: {
				key: field.key,
				type: field.type,
				label: field.label,
				required: field.required,
				placeholder: field.placeholder,
				width: field.width,
			},
		});
	}
	return h;
}

describe("form route", () => {
	it("returns null for an unknown slug", async () => {
		host = await createPluginTestHost();
		expect(await host.invokeRoute("form", { slug: "nope" })).toEqual({ form: null });
	});

	it("returns the public form definition and strips notifyEmail", async () => {
		host = await seedForm();
		const result = (await host.invokeRoute("form", { slug: "contact" })) as {
			form: { slug: string; fields: unknown[]; notifyEmail?: string };
		};
		expect(result.form.slug).toBe("contact");
		expect(result.form.fields).toHaveLength(3);
		expect(result.form.notifyEmail).toBeUndefined();
	});
});

describe("submit route", () => {
	it("stores the submission, writes an email log, and 303-redirects", async () => {
		host = await seedForm();
		const entries = [
			{ kind: "text", name: "cf_slug", value: "contact" },
			{ kind: "text", name: "name", value: "Ada" },
			{ kind: "text", name: "email", value: "ada@example.com" },
			{ kind: "text", name: "message", value: "Hello there" },
			{ kind: "text", name: "_cf_page", value: "https://example.com/contact" },
			{ kind: "text", name: "cf_ts", value: String(Date.now() - 10_000) },
		];
		const res = (await host.invokeRoute("submit", { entries }, REQUEST)) as {
			__emdashPluginResponse: true;
			status: number;
			headers: [string, string][];
		};
		expect(res.__emdashPluginResponse).toBe(true);
		expect(res.status).toBe(303);
		const location = new Map(res.headers).get("location") ?? "";
		expect(location).toContain("cf_status=saved"); // stored, no email provider in tests

		const submissions = await host.storage("submissions").list();
		expect(submissions).toHaveLength(1);
		expect((submissions[0].data as { emailStatus: string }).emailStatus).toBe("skipped");

		const log = await host.storage("email_log").list();
		expect(log).toHaveLength(1);
	});

	it("silently accepts honeypot posts without storing", async () => {
		host = await seedForm();
		const entries = [
			{ kind: "text", name: "cf_slug", value: "contact" },
			{ kind: "text", name: "name", value: "Bot" },
			{ kind: "text", name: "cf_hp", value: "spammy" },
		];
		const res = (await host.invokeRoute("submit", { entries }, REQUEST)) as {
			status: number;
		};
		expect(res.status).toBe(303);
		expect(await host.storage("submissions").list()).toHaveLength(0);
	});
});

describe("turnstile", () => {
	const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

	function validEntries(token?: string) {
		const entries = [
			{ kind: "text", name: "cf_slug", value: "contact" },
			{ kind: "text", name: "name", value: "Ada" },
			{ kind: "text", name: "email", value: "ada@example.com" },
			{ kind: "text", name: "message", value: "Hello there" },
			{ kind: "text", name: "cf_ts", value: String(Date.now() - 10_000) },
		];
		if (token) entries.push({ kind: "text", name: "cf-turnstile-response", value: token });
		return entries;
	}

	async function seedRuntimeForm(withKeys = true): Promise<PluginRuntimeTestHost> {
		const h = await createPluginRuntimeTestHost();
		await h.actions.plugin.activate();
		await h.fixtures.plugin.storage("forms", "form_1", FORM);
		if (withKeys) {
			await h.fixtures.plugin.setting("turnstileSiteKey", "1x_sitekey");
			await h.fixtures.plugin.setting("turnstileSecretKey", "1x_secret");
		}
		return h;
	}

	function locationOf(res: unknown): string {
		const { headers } = res as { headers: [string, string][] };
		return new Map(headers).get("location") ?? "";
	}

	it("exposes the site key on the form route only when configured", async () => {
		runtimeHost = await seedRuntimeForm(true);
		const withKeys = (await runtimeHost.transport.invokeRoute("form", { slug: "contact" })) as {
			form: { turnstileSiteKey?: string };
		};
		expect(withKeys.form.turnstileSiteKey).toBe("1x_sitekey");

		await runtimeHost.dispose();
		runtimeHost = await seedRuntimeForm(false);
		const withoutKeys = (await runtimeHost.transport.invokeRoute("form", { slug: "contact" })) as {
			form: { turnstileSiteKey?: string };
		};
		expect(withoutKeys.form.turnstileSiteKey).toBeUndefined();
	});

	it("rejects submissions without a token and never calls siteverify", async () => {
		runtimeHost = await seedRuntimeForm();
		const res = await runtimeHost.transport.invokeRoute("submit", { entries: validEntries() }, REQUEST);
		expect(locationOf(res)).toContain("cf_status=challenge");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(0);
		expect(runtimeHost.http.requests()).toHaveLength(0);
	});

	it("rejects submissions when siteverify answers success: false", async () => {
		runtimeHost = await seedRuntimeForm();
		await runtimeHost.http.respond(
			SITEVERIFY,
			new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
				headers: { "content-type": "application/json" },
			}),
		);
		const res = await runtimeHost.transport.invokeRoute(
			"submit",
			{ entries: validEntries("bad-token") },
			REQUEST,
		);
		expect(locationOf(res)).toContain("cf_status=challenge");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(0);
		const requests = runtimeHost.http.requests();
		expect(requests).toHaveLength(1);
		expect(requests[0].url).toBe(SITEVERIFY);
	});

	it("accepts and stores submissions when siteverify answers success: true", async () => {
		runtimeHost = await seedRuntimeForm();
		await runtimeHost.http.respond(
			SITEVERIFY,
			new Response(JSON.stringify({ success: true }), {
				headers: { "content-type": "application/json" },
			}),
		);
		const res = await runtimeHost.transport.invokeRoute(
			"submit",
			{ entries: validEntries("good-token") },
			REQUEST,
		);
		expect(locationOf(res)).toContain("cf_status=saved");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(1);
	});
});

describe("admin route", () => {
	it("renders the forms page blocks", async () => {
		host = await createPluginTestHost();
		const result = (await host.invokeRoute("admin", { type: "page_load", page: "/forms" })) as {
			blocks: unknown[];
		};
		expect(Array.isArray(result.blocks)).toBe(true);
		expect(result.blocks.length).toBeGreaterThan(0);
	});

	it("creates a form through form_submit", async () => {
		host = await seedForm();
		const forms = await host.storage("forms").list();
		expect(forms).toHaveLength(1);
		expect((forms[0].data as { slug: string }).slug).toBe("contact");
	});
});

describe("export route", () => {
	it("returns a CSV response", async () => {
		host = await seedForm();
		const res = (await host.invokeRoute("export", {})) as {
			status: number;
			headers: [string, string][];
			body: { kind: string; value: number[] | Uint8Array };
		};
		expect(res.status).toBe(200);
		expect(new Map(res.headers).get("content-type")).toContain("text/csv");
		const csv = new TextDecoder().decode(Uint8Array.from(res.body.value));
		expect(csv).toContain("email_status");
	});
});

describe("capacity", () => {
	async function setup(maxSubmissions: number | null = 2) {
		runtimeHost = await createPluginRuntimeTestHost();
		await runtimeHost.actions.plugin.activate();
		await runtimeHost.fixtures.plugin.storage("forms", "form_1", {
			...FORM, maxSubmissions, spotsRemainingLabel: "Only {remaining} left", showSpotsRemaining: true,
			closedMessage: "Camp is full. Join us next year!",
		});
		return runtimeHost;
	}
	function entries() {
		return Object.entries({ cf_slug: "contact", name: "Ada", email: "ada@example.com", message: "Signup", cf_ts: String(Date.now() - 10000) })
			.map(([name, value]) => ({ kind: "text", name, value }));
	}
	function json(res: unknown) {
		return JSON.parse((res as { body: { value: string } }).body.value);
	}
	async function status() {
		const res = await runtimeHost!.transport.invokeRoute("capacity", { slug: "contact" });
		expect(new Map((res as { headers: [string, string][] }).headers).get("cache-control")).toBe("no-store");
		return json(res);
	}
	async function submit() {
		return runtimeHost!.transport.invokeRoute("submit", { entries: entries() }, { ...REQUEST, headers: { accept: "application/json" } });
	}

	it("accepts under capacity and increases the confirmed count", async () => {
		await setup();
		expect(await status()).toMatchObject({ remaining: 2, isClosed: false, totalAllowed: 2 });
		expect(json(await submit())).toMatchObject({ success: true, capacity: { remaining: 1 } });
		expect(await runtimeHost!.inspect.storage.list("submissions")).toHaveLength(1);
		expect(await status()).toMatchObject({ remaining: 1, isClosed: false });
	});
	it("accepts the last spot and closes at the exact limit", async () => {
		await setup(1);
		expect(json(await submit())).toMatchObject({ success: true, capacity: { remaining: 0, isClosed: true } });
		expect(await status()).toMatchObject({ remaining: 0, isClosed: true });
	});
	it("rejects over capacity with HTTP 409 and the custom message, without writes or email", async () => {
		await setup(1);
		await submit();
		const before = await runtimeHost!.inspect.storage.list("email_log");
		const res = await submit();
		expect(res).toMatchObject({ status: 409 });
		expect(json(res)).toEqual({ error: "capacity_reached", message: "Camp is full. Join us next year!" });
		expect(await runtimeHost!.inspect.storage.list("submissions")).toHaveLength(1);
		expect(await runtimeHost!.inspect.storage.list("email_log")).toHaveLength(before.length);
	});
	it("also returns 409 for a native browser post", async () => {
		await setup(0);
		const res = await runtimeHost!.transport.invokeRoute("submit", { entries: entries() }, REQUEST);
		expect(res).toMatchObject({ status: 409 });
		expect(await runtimeHost!.inspect.storage.list("submissions")).toHaveLength(0);
	});
	it("tracks unlimited submissions with nullable metadata", async () => {
		await setup(null);
		for (let i = 0; i < 3; i++) expect(json(await submit()).success).toBe(true);
		expect(await status()).toMatchObject({ remaining: null, totalAllowed: null, isClosed: false });
		expect(await runtimeHost!.inspect.storage.list("submissions")).toHaveLength(3);
		expect((await runtimeHost!.inspect.storage.list("capacity"))[0].data).toEqual({ count: 3 });
	});
	it("does not oversubscribe when concurrent requests compete for the last spot", async () => {
		await setup(1);
		const results = await Promise.all(Array.from({ length: 12 }, submit));
		expect(results.filter(result => json(result).success)).toHaveLength(1);
		expect(results.filter(result => (result as { status: number }).status === 409)).toHaveLength(11);
		expect(await runtimeHost!.inspect.storage.list("submissions")).toHaveLength(1);
		expect(await status()).toMatchObject({ remaining: 0, isClosed: true });
	});
	it("counts legacy entries and keeps capacity consumed after inbox deletion", async () => {
		await setup(2);
		await runtimeHost!.fixtures.plugin.storage("submissions", "old", { formId: "form_1", createdAt: "2025-01-01T00:00:00.000Z" });
		expect(await status()).toMatchObject({ remaining: 1 });
		await runtimeHost!.transport.invokeRoute("admin", { type: "block_action", action_id: "del_sub", value: "old" });
		expect(await status()).toMatchObject({ remaining: 1 });
		await submit();
		expect(await status()).toMatchObject({ remaining: 0 });
	});
	it("does not consume capacity for invalid or honeypot submissions", async () => {
		await setup(1);
		await runtimeHost!.transport.invokeRoute("submit", { entries: entries().filter(e => e.name !== "email") }, REQUEST);
		await runtimeHost!.transport.invokeRoute("submit", { entries: [...entries(), { kind: "text", name: "cf_hp", value: "spam" }] }, REQUEST);
		expect(await status()).toMatchObject({ remaining: 1 });
	});
	it("returns only capacity metadata and rejects unknown forms", async () => {
		await setup();
		expect(Object.keys(await status()).sort()).toEqual(["closedMessage", "isClosed", "remaining", "totalAllowed"]);
		expect(await runtimeHost!.transport.invokeRoute("capacity", { slug: "unknown" })).toMatchObject({ status: 404 });
	});
	it("recovers a durably accepted entry on cron without freeing its spot", async () => {
		await setup(1);
		const submission = { formId: "form_1", data: { email: "private@example.com" }, createdAt: "2025-01-01T00:00:00.000Z" };
		await runtimeHost!.fixtures.plugin.storage("capacity", "form_1", { count: 1, pending: { id: "interrupted", submission } });
		await runtimeHost!.transport.invokeHook("cron", { name: "prune" });
		expect((await runtimeHost!.inspect.storage.list("submissions"))[0].data).toEqual(submission);
		expect((await runtimeHost!.inspect.storage.list("capacity"))[0].data).toEqual({ count: 1 });
		expect(await status()).toMatchObject({ remaining: 0, isClosed: true });
	});
	it("validates capacity settings and preserves them through ordinary form saves", async () => {
		host = await seedForm();
		const [{ id }] = await host.storage("forms").list();
		const save = (maxSubmissions: unknown) => host!.invokeRoute("admin", { type: "form_submit", action_id: `capacity_save:${id}`, values: { maxSubmissions, showSpotsRemaining: true, closedMessage: "Full" } });
		await save("3");
		await host.invokeRoute("admin", { type: "form_submit", action_id: `form_save:${id}`, values: { name: FORM.name, slug: FORM.slug } });
		expect((await host.storage("forms").list())[0].data).toMatchObject({ maxSubmissions: 3, showSpotsRemaining: true, closedMessage: "Full" });
		const invalid = await save(1.5) as { toast: { type: string } };
		expect(invalid.toast.type).toBe("error");
		expect((await host.storage("forms").list())[0].data).toMatchObject({ maxSubmissions: 3 });
		await save("");
		expect((await host.storage("forms").list())[0].data).toMatchObject({ maxSubmissions: null });
	});
	it.each([-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "4"])("rejects invalid stored capacity %s", value => {
		expect(capacitySettingsSchema.safeParse({ maxSubmissions: value }).success).toBe(false);
	});
});
