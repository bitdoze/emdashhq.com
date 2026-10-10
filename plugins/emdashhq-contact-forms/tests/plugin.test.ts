import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginRuntimeTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

import { csvCell } from "../src/util";

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

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function validEntries(token?: string, slug = "contact") {
	const entries = [
		{ kind: "text", name: "cf_slug", value: slug },
		{ kind: "text", name: "name", value: "Ada" },
		{ kind: "text", name: "email", value: "ada@example.com" },
		{ kind: "text", name: "message", value: "Hello there" },
		{ kind: "text", name: "cf_ts", value: String(Date.now() - 10_000) },
	];
	if (token) entries.push({ kind: "text", name: "cf-turnstile-response", value: token });
	return entries;
}

function locationOf(res: unknown): string {
	const { headers } = res as { headers: [string, string][] };
	return new Map(headers).get("location") ?? "";
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

	it("accepts by default when siteverify is unreachable", async () => {
		runtimeHost = await seedRuntimeForm();
		await runtimeHost.http.respond(SITEVERIFY, new Response("upstream error", { status: 502 }));
		const res = await runtimeHost.transport.invokeRoute(
			"submit",
			{ entries: validEntries("good-token") },
			REQUEST,
		);
		expect(locationOf(res)).toContain("cf_status=saved");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(1);
	});

	it("rejects with a retryable error when the outage policy is reject", async () => {
		runtimeHost = await seedRuntimeForm();
		await runtimeHost.fixtures.plugin.setting("turnstileOutagePolicy", "reject");
		await runtimeHost.http.respond(SITEVERIFY, new Response("upstream error", { status: 502 }));
		const res = await runtimeHost.transport.invokeRoute(
			"submit",
			{ entries: validEntries("good-token") },
			REQUEST,
		);
		const location = locationOf(res);
		expect(location).toContain("cf_status=unavailable");
		expect(location).toContain("cf_rid=");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(0);
	});
});

describe("attempt budget", () => {
	it("is consumed by failed attempts before Turnstile is called", async () => {
		runtimeHost = await seedRuntimeForm();
		await runtimeHost.fixtures.plugin.setting("rateLimitPerHour", 2);
		// Two token-less attempts get challenged; both consume the budget.
		await runtimeHost.transport.invokeRoute("submit", { entries: validEntries() }, REQUEST);
		await runtimeHost.transport.invokeRoute("submit", { entries: validEntries() }, REQUEST);
		// The third is rate-limited before siteverify is ever called.
		const res = await runtimeHost.transport.invokeRoute(
			"submit",
			{ entries: validEntries("good-token") },
			REQUEST,
		);
		expect(locationOf(res)).toContain("cf_status=rate_limited");
		expect(runtimeHost.http.requests()).toHaveLength(0);
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(0);
	});
});

describe("idempotency", () => {
	it("stores a retried post of identical content once", async () => {
		runtimeHost = await seedRuntimeForm(false);
		const entries = validEntries();
		await runtimeHost.transport.invokeRoute("submit", { entries }, REQUEST);
		const res = await runtimeHost.transport.invokeRoute("submit", { entries }, REQUEST);
		expect(locationOf(res)).toContain("cf_status=saved");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(1);
	});
});

describe("checkbox fields", () => {
	async function seedCheckboxForm(required: boolean): Promise<PluginTestHost> {
		const h = await createPluginTestHost();
		await h.invokeHook("plugin:activate", {});
		await h.invokeRoute("admin", {
			type: "form_submit",
			action_id: "form_create",
			page: "/forms",
			values: { name: "Opt-in", slug: "optin", enabled: true },
		});
		const forms = await h.storage("forms").list();
		const formId = forms[0].id;
		await h.invokeRoute("admin", {
			type: "form_submit",
			action_id: `field_save:${formId}`,
			page: `/forms/${formId}`,
			values: { key: "consent", type: "checkbox", label: "I agree", required, options: "", placeholder: "" },
		});
		return h;
	}

	const post = (h: PluginTestHost, consent?: string) =>
		h.invokeRoute(
			"submit",
			{
				entries: [
					{ kind: "text", name: "cf_slug", value: "optin" },
					{ kind: "text", name: "cf_ts", value: String(Date.now() - 10_000) },
					...(consent === undefined ? [] : [{ kind: "text", name: "consent", value: consent }]),
				],
			},
			REQUEST,
		);

	it("rejects an omitted required checkbox", async () => {
		host = await seedCheckboxForm(true);
		const location = locationOf(await post(host));
		expect(location).toContain("cf_status=invalid");
		expect(location).toContain("cf_fields=consent");
		expect(await host.storage("submissions").list()).toHaveLength(0);
	});

	it("rejects 'off' and unexpected values on a required checkbox", async () => {
		host = await seedCheckboxForm(true);
		expect(locationOf(await post(host, "off"))).toContain("cf_status=invalid");
		expect(locationOf(await post(host, "banana"))).toContain("cf_status=invalid");
		expect(await host.storage("submissions").list()).toHaveLength(0);
	});

	it("accepts 'on' and stores it", async () => {
		host = await seedCheckboxForm(true);
		expect(locationOf(await post(host, "on"))).toContain("cf_status=saved");
		const subs = await host.storage("submissions").list();
		expect((subs[0].data as { data: { consent: string } }).data.consent).toBe("on");
	});

	it("defaults an omitted optional checkbox to off", async () => {
		host = await seedCheckboxForm(false);
		expect(locationOf(await post(host))).toContain("cf_status=saved");
		const subs = await host.storage("submissions").list();
		expect((subs[0].data as { data: { consent: string } }).data.consent).toBe("off");
	});
});

describe("submission recovery", () => {
	it("returns a rejected draft once, then clears it", async () => {
		host = await seedForm();
		const res = await host.invokeRoute(
			"submit",
			{
				entries: [
					{ kind: "text", name: "cf_slug", value: "contact" },
					{ kind: "text", name: "name", value: "Ada" },
					{ kind: "text", name: "email", value: "not-an-email" },
					{ kind: "text", name: "message", value: "Draft body" },
					{ kind: "text", name: "cf_ts", value: String(Date.now() - 10_000) },
				],
			},
			REQUEST,
		);
		const location = locationOf(res);
		expect(location).toContain("cf_status=invalid");
		expect(location).toContain("cf_fields=email");
		const rid = new URL(`https://example.com${location}`).searchParams.get("cf_rid");
		expect(rid).toBeTruthy();

		const first = (await host.invokeRoute("recovery", { id: rid })) as {
			recovery: {
				formSlug: string;
				values: Record<string, string>;
				errors: Record<string, string>;
			} | null;
		};
		expect(first.recovery?.formSlug).toBe("contact");
		expect(first.recovery?.values.name).toBe("Ada");
		expect(first.recovery?.values.message).toBe("Draft body");
		expect(first.recovery?.errors.email).toContain("valid email");

		const second = (await host.invokeRoute("recovery", { id: rid })) as { recovery: unknown };
		expect(second.recovery).toBeNull();
	});

	it("returns null for malformed or unknown ids", async () => {
		host = await seedForm();
		expect(await host.invokeRoute("recovery", { id: "not-a-ulid" })).toEqual({ recovery: null });
		expect(await host.invokeRoute("recovery", { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).toEqual({
			recovery: null,
		});
	});
});

describe("reserved cf_ field keys", () => {
	it("admin rejects a cf_-prefixed field key", async () => {
		host = await seedForm();
		const formId = (await host.storage("forms").list())[0].id;
		const res = (await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: `field_save:${formId}`,
			page: `/forms/${formId}`,
			values: { key: "cf_hp", type: "text", label: "Trap", required: false },
		})) as { toast?: { type: string } };
		expect(res.toast?.type).toBe("error");
		const form = (await host.storage("forms").list())[0].data as { fields: unknown[] };
		expect(form.fields).toHaveLength(3);
	});

	it("submit refuses a stored form whose fields collide with cf_", async () => {
		runtimeHost = await createPluginRuntimeTestHost();
		await runtimeHost.actions.plugin.activate();
		await runtimeHost.fixtures.plugin.storage("forms", "form_bad", {
			...FORM,
			fields: [...FORM.fields, { key: "cf_hp", type: "text", label: "Trap" }],
		});
		const res = await runtimeHost.transport.invokeRoute(
			"submit",
			{ entries: validEntries() },
			REQUEST,
		);
		expect(locationOf(res)).toContain("cf_status=error");
		expect(await runtimeHost.inspect.storage.list("submissions")).toHaveLength(0);
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

	it("neutralizes spreadsheet formulas in attacker-controlled cells", async () => {
		host = await seedForm();
		const hostile = {
			...REQUEST,
			meta: { ...REQUEST.meta, ip: "=cmd|' /C calc'!A0" },
		};
		await host.invokeRoute(
			"submit",
			{
				entries: [
					{ kind: "text", name: "cf_slug", value: "contact" },
					{ kind: "text", name: "name", value: "Ada" },
					{ kind: "text", name: "email", value: "ada@example.com" },
					{ kind: "text", name: "message", value: "Hi" },
					{ kind: "text", name: "cf_ts", value: String(Date.now() - 10_000) },
				],
			},
			hostile,
		);
		const res = (await host.invokeRoute("export", {})) as {
			status: number;
			body: { value: number[] | Uint8Array };
		};
		const csv = new TextDecoder().decode(Uint8Array.from(res.body.value));
		expect(csv).toContain("'=cmd");
		expect(csv).not.toMatch(/(^|[,\n])=cmd/m);
	});
});

describe("csvCell", () => {
	it("prefixes formula-leading cells with an apostrophe", () => {
		expect(csvCell("=1+1")).toBe("'=1+1");
		expect(csvCell("  +SUM(A1:A2)")).toBe("'  +SUM(A1:A2)");
		expect(csvCell("-3")).toBe("'-3");
		expect(csvCell("@IMPORT")).toBe("'@IMPORT");
	});

	it("leaves ordinary values untouched", () => {
		expect(csvCell("Ada")).toBe("Ada");
		expect(csvCell("")).toBe("");
		expect(csvCell(null)).toBe("");
		expect(csvCell(0)).toBe("0");
	});

	it("quotes commas, quotes and newlines after neutralizing", () => {
		expect(csvCell('="x",2')).toBe(`"'=""x"",2"`);
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
	});
});
