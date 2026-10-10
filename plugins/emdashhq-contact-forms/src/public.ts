import { pluginResponse } from "emdash/plugin";
import type { PluginContext, PluginFormData, SandboxedRouteContext } from "emdash/plugin";

import { readSettings } from "./types";
import { csvCell, ulid } from "./util";
import {
	firstEmailValue,
	isFieldType,
	renderTemplate,
	type EmailLogRecord,
	type EmailLogStatus,
	type EmailStatus,
	type FormFieldDef,
	type FormRecord,
	type PluginSettings,
	type PublicForm,
	type RecoveryRecord,
	IDEM_PREFIX,
	RATE_PREFIX,
	RECOVERY_PREFIX,
	type RouteRequestMeta,
	type SubmissionRecord,
} from "./types";

type WhereArgs = NonNullable<Parameters<PluginContext["storage"]["forms"]["query"]>[0]>["where"];

function requestMeta(routeCtx: SandboxedRouteContext): RouteRequestMeta {
	return (routeCtx.requestMeta ?? { ip: null, userAgent: null, referer: null, geo: null }) as RouteRequestMeta;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_SINGLE_LINE = 500;
const MAX_LONG_TEXT = 5000;
const MAX_FIELDS = 50;
// Humans need a moment to read a form; instant posts are bots.
const MIN_FILL_MS = 1500;

function publicForm(form: FormRecord): PublicForm {
	return {
		slug: form.slug,
		name: form.name,
		description: form.description,
		submitLabel: form.submitLabel,
		successMessage: form.successMessage,
		fields: form.fields,
	};
}

async function findFormBySlug(
	ctx: PluginContext,
	slug: string,
): Promise<{ id: string; data: FormRecord } | null> {
	const { items } = await ctx.storage.forms.query({ where: { slug }, limit: 1 });
	return items[0] ? { id: items[0].id, data: items[0].data as FormRecord } : null;
}

export async function handleFormRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<{ form: PublicForm | null }> {
	const input = (routeCtx.input ?? {}) as Record<string, string | string[]>;
	const slugParam = input.slug ?? input.form ?? "";
	const slug = (Array.isArray(slugParam) ? slugParam[0] : slugParam).trim();
	if (!slug) return { form: null };
	const found = await findFormBySlug(ctx, slug);
	if (!found || !found.data.enabled) return { form: null };
	const form = publicForm(found.data);
	const settings = await readSettings(ctx);
	if (settings.turnstileSiteKey && settings.turnstileSecretKey) {
		form.turnstileSiteKey = settings.turnstileSiteKey;
	}
	return { form };
}

/**
 * Submit inputs whose name starts with cf_ or cf- carry routing and anti-spam
 * data (cf_slug, cf_page, cf_ts, cf_hp, cf-turnstile-response). Field keys may
 * not use the prefix — the admin rejects it — but a legacy or hand-rolled
 * definition could still ship one, so the split stays defensive here.
 */
const PROTOCOL_INPUT = /^cf[-_]/;

const CHECKBOX_CHECKED = new Set(["on", "true", "yes", "1"]);
const CHECKBOX_UNCHECKED = new Set(["off", "false", "no", "0", ""]);

/** Checked state for a checkbox submission, or null for an unexpected value. */
function checkboxState(raw: string): "on" | "off" | null {
	const v = raw.trim().toLowerCase();
	if (CHECKBOX_CHECKED.has(v)) return "on";
	if (CHECKBOX_UNCHECKED.has(v)) return "off";
	return null;
}

function formValues(input: PluginFormData): {
	protocol: Record<string, string>;
	fields: Record<string, string>;
} {
	const protocol: Record<string, string> = {};
	const fields: Record<string, string> = {};
	// A JSON-encoded post instead of form-data arrives without entries.
	for (const entry of input.entries ?? []) {
		if (entry.kind !== "text") continue;
		if (PROTOCOL_INPUT.test(entry.name)) {
			// The renderer writes its hidden inputs first; an injected duplicate
			// must not override the site's own routing/anti-spam values.
			protocol[entry.name] ??= entry.value;
		} else {
			fields[entry.name] = entry.value;
		}
	}
	return { protocol, fields };
}

function validateField(field: FormFieldDef, raw: string): string | null {
	if (field.type === "checkbox") {
		// A browser always posts "on" or omits the input; the renderer submits
		// "off" explicitly so required checkboxes can be checked server-side.
		const state = checkboxState(raw);
		if (state === null) return `${field.key} has an unexpected value`;
		return field.required && state === "off" ? `${field.key} is required` : null;
	}
	const value = raw.trim();
	if (!value) return field.required ? `${field.key} is required` : null;
	switch (field.type) {
		case "email":
			if (!EMAIL_RE.test(value) || value.length > 254) return `${field.key} is not a valid email`;
			break;
		case "url":
			try {
				const url = new URL(value);
				if (url.protocol !== "http:" && url.protocol !== "https:") return `${field.key} must be an http(s) URL`;
			} catch {
				return `${field.key} is not a valid URL`;
			}
			break;
		case "number":
			if (!Number.isFinite(Number(value))) return `${field.key} must be a number`;
			break;
		case "tel":
			if (!/^[+()\-.\s\d]{5,25}$/.test(value)) return `${field.key} is not a valid phone number`;
			break;
		case "select":
			if (field.options?.length && !field.options.includes(value)) return `${field.key} is not a listed option`;
			break;
		default:
			break;
	}
	const max = field.type === "textarea" ? MAX_LONG_TEXT : MAX_SINGLE_LINE;
	if (value.length > max) return `${field.key} is too long`;
	return null;
}

/** Redirect target: the referer page, kept on this site's origin; "/" otherwise. */
function redirectTarget(routeCtx: SandboxedRouteContext, fallback?: string): URL {
	const origin = new URL(routeCtx.request.url).origin;
	const candidates = [requestMeta(routeCtx).referer, fallback];
	for (const candidate of candidates) {
		if (!candidate) continue;
		try {
			const url = new URL(candidate, origin);
			if (url.origin === origin) return url;
		} catch {
			// try the next candidate
		}
	}
	return new URL("/", origin);
}

function redirect303(
	routeCtx: SandboxedRouteContext,
	status: string,
	formSlug: string,
	fields?: string[],
	recoveryId?: string,
) {
	const url = redirectTarget(routeCtx);
	url.searchParams.set("cf", formSlug);
	url.searchParams.set("cf_status", status);
	if (fields?.length) url.searchParams.set("cf_fields", fields.join(","));
	if (recoveryId) url.searchParams.set("cf_rid", recoveryId);
	return pluginResponse({
		status: 303,
		headers: [["location", url.pathname + url.search + url.hash]],
	});
}

/** cf_page and the referer are visitor-controlled; keep only same-origin URLs. */
function safePageUrl(raw: string | undefined, referer: string | null, origin: string): string | undefined {
	for (const candidate of [raw, referer]) {
		if (!candidate) continue;
		try {
			const url = new URL(candidate, origin);
			if (url.origin === origin) return url.pathname + url.search;
		} catch {
			// try the next candidate
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Transient KV state: recovery records, rate-limit buckets, idempotency claims
// (prefixes and lifetimes live in types.ts; the hourly prune cron uses them).

/**
 * Keep the visitor's draft server-side so a rejection never erases a message.
 * The renderer fetches the record through the public `recovery` route, which
 * deletes it on read.
 */
async function storeRecovery(
	ctx: PluginContext,
	formSlug: string,
	values: Record<string, string>,
	errors: Record<string, string>,
): Promise<string | undefined> {
	try {
		const id = ulid();
		await ctx.kv.set(RECOVERY_PREFIX + id, {
			formSlug,
			values,
			errors,
			createdAt: new Date().toISOString(),
		} satisfies RecoveryRecord);
		return id;
	} catch (error) {
		ctx.log.warn(`Could not store a form recovery record: ${error instanceof Error ? error.message : error}`);
		return undefined;
	}
}

/**
 * Atomic per-IP attempt budget, consumed before verification work so failed
 * attempts count too. KV compare-and-set makes the increment atomic across
 * Worker instances; persistent contention fails closed (a limiter rejecting
 * under contention is the safe direction). KV failures are logged and
 * tolerated so the form stays available when storage hiccups.
 */
async function consumeAttemptBudget(ctx: PluginContext, ip: string, limit: number): Promise<boolean> {
	const bucket = Math.floor(Date.now() / 3600e3);
	const key = `${RATE_PREFIX}${ip}:${bucket}`;
	for (let i = 0; i < 6; i++) {
		const current = await ctx.kv.getVersioned<{ count: number }>(key);
		const count = current?.value?.count ?? 0;
		if (count >= limit) return false;
		const result = await ctx.kv.compareAndSet(key, current?.revision ?? null, { count: count + 1 });
		if (result.applied) return true;
	}
	return false;
}

/**
 * Content-addressed idempotency claim: the same visitor re-posting identical
 * data (retry after an ambiguous response) must not duplicate the stored
 * submission or re-send the notification. `compareAndSet` with a null
 * expected revision creates only when absent.
 */
async function claimIdempotency(
	ctx: PluginContext,
	slug: string,
	ip: string | null,
	userAgent: string | null,
	data: Record<string, string>,
): Promise<"claimed" | "duplicate" | "unavailable"> {
	try {
		const canon = Object.keys(data)
			.sort()
			.map((k) => `${k}=${data[k]}`)
			.join("&");
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(`${slug}\n${ip ?? ""}\n${userAgent ?? ""}\n${canon}`),
		);
		const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
		const claim = await ctx.kv.compareAndSet(IDEM_PREFIX + hex, null, {
			createdAt: new Date().toISOString(),
		});
		return claim.applied ? "claimed" : "duplicate";
	} catch (error) {
		ctx.log.warn(`Idempotency check failed; storing without it: ${error instanceof Error ? error.message : error}`);
		return "unavailable";
	}
}

/**
 * One-time read of a recovery record; the site's Contact form block calls
 * this in-process to refill fields after a rejected submit. The record is
 * deleted on read so drafts cannot be replayed or enumerated.
 */
export async function handleRecoveryRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<{ recovery: RecoveryRecord | null }> {
	const input = (routeCtx.input ?? {}) as Record<string, string | string[]>;
	const raw = input.id ?? "";
	const id = (Array.isArray(raw) ? raw[0] : raw).trim();
	if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) return { recovery: null };
	const key = RECOVERY_PREFIX + id;
	const record = (await ctx.kv.get<RecoveryRecord>(key)) ?? null;
	if (record) await ctx.kv.delete(key).catch(() => {});
	return { recovery: record };
}

function notificationBodies(
	form: FormRecord,
	data: Record<string, string>,
	sub: SubmissionRecord,
): { text: string; html: string } {
	const esc = (s: string) =>
		s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	const lines: string[] = [];
	const rows: string[] = [];
	for (const field of form.fields) {
		const value = data[field.key];
		if (value === undefined) continue;
		const shown = field.type === "checkbox" ? (value === "on" || value === "true" ? "Yes" : "No") : value;
		lines.push(`${field.label}: ${shown}`);
		rows.push(
			`<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;font-weight:600">${esc(field.label)}</th><td style="padding:6px 0">${esc(shown).replace(/\n/g, "<br>")}</td></tr>`,
		);
	}
	lines.push("", `Form: ${form.name} (${form.slug})`, `Page: ${sub.pageUrl || "unknown"}`, `When: ${sub.createdAt}`);
	if (sub.ip) lines.push(`IP: ${sub.ip}${sub.country ? ` (${sub.country})` : ""}`);
	const metaRows =
		`<tr><td colspan="2" style="padding:12px 0 0;color:#888;font-size:12px">` +
		`Form ${esc(form.slug)} · ${esc(sub.pageUrl || "unknown page")} · ${esc(sub.createdAt)}` +
		`</td></tr>`;
	return {
		text: lines.join("\n"),
		html:
			`<table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;color:#222">${rows.join("")}${metaRows}</table>`,
	};
}

export async function sendSubmissionEmail(
	ctx: PluginContext,
	form: FormRecord,
	submissionId: string,
	sub: SubmissionRecord,
	settings: PluginSettings,
	kind: "notification" | "resend" = "notification",
): Promise<{ status: EmailStatus; error?: string }> {
	const to = (form.notifyEmail || settings.defaultNotifyEmail).trim();
	const subject = renderTemplate(
		form.subjectTemplate?.trim() || settings.defaultSubject || "New {form} submission",
		form,
		sub.data,
		settings.notifyName || ctx.site.name,
	);
	const attempt = async (status: EmailLogStatus, error?: string, durationMs = 0) => {
		const logEntry: EmailLogRecord = {
			submissionId,
			formId: sub.formId,
			formSlug: form.slug,
			kind,
			to: to || "(none configured)",
			subject,
			status,
			error,
			durationMs,
			createdAt: new Date().toISOString(),
		};
		await ctx.storage.email_log.put(ulid(), logEntry);
		return { status, error };
	};

	if (!to) return attempt("skipped", "No notification email configured on the form or in plugin settings");
	if (!ctx.email) return attempt("unconfigured", "No email provider is active (Settings > Email)");

	const bodies = notificationBodies(form, sub.data, sub);
	const replyTo = firstEmailValue(form, sub.data);
	const started = Date.now();
	try {
		await ctx.email.send({ to, subject, text: bodies.text, html: bodies.html, replyTo });
		return attempt("sent", undefined, Date.now() - started);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.log.error(`Contact form email failed: ${message}`, { submissionId, to });
		return attempt("failed", message, Date.now() - started);
	}
}

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 10_000;

/**
 * A completed check decides the outcome; anything that prevents the check
 * from completing (missing http access, timeout, transport or HTTP error) is
 * "unavailable", and the configured outage policy decides accept vs reject.
 * Timeouts make the unavailability observable instead of hanging the POST.
 */
type TurnstileOutcome = "verified" | "rejected" | "unavailable";

async function verifyTurnstile(
	ctx: PluginContext,
	secret: string,
	token: string,
	ip: string | null,
): Promise<TurnstileOutcome> {
	if (!ctx.http) {
		ctx.log.warn("Turnstile is configured but the plugin has no HTTP access");
		return "unavailable";
	}
	try {
		const res = await Promise.race([
			ctx.http.fetch(TURNSTILE_VERIFY_URL, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					secret,
					response: token,
					...(ip ? { remoteip: ip } : {}),
				}).toString(),
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("siteverify timed out")), TURNSTILE_TIMEOUT_MS),
			),
		]);
		if (!res.ok) {
			ctx.log.warn(`Turnstile siteverify answered HTTP ${res.status}`);
			return "unavailable";
		}
		const result = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
		if (result.success !== true) {
			ctx.log.info("Turnstile verification rejected a submission", { codes: result["error-codes"] });
			return "rejected";
		}
		return "verified";
	} catch (error) {
		ctx.log.warn(`Turnstile siteverify failed: ${error instanceof Error ? error.message : String(error)}`);
		return "unavailable";
	}
}

export async function handleSubmitRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<unknown> {
	const input = routeCtx.input as PluginFormData;
	const meta = requestMeta(routeCtx);
	const origin = new URL(routeCtx.request.url).origin;
	const { protocol, fields: fieldValues } = formValues(input);
	const slug = (protocol.cf_slug ?? "").trim();
	const settings = await readSettings(ctx);
	const debug = (msg: string, data?: unknown) => {
		if (settings.extraDebug) ctx.log.debug(msg, data);
	};

	// Honeypot: invisible to humans, bots fill it. Pretend success.
	if ((protocol.cf_hp ?? "").trim()) {
		debug("honeypot tripped", { slug, ip: meta.ip });
		return redirect303(routeCtx, "sent", slug || "form");
	}

	const found = slug ? await findFormBySlug(ctx, slug) : null;
	if (!found || !found.data.enabled) {
		debug("form not found or disabled", { slug });
		return redirect303(routeCtx, "error", slug || "form");
	}
	const form = found.data;

	// Time trap: posts faster than MIN_FILL_MS are bots. Pretend success.
	const postedAt = Number(protocol.cf_ts ?? 0);
	if (postedAt > 0 && Date.now() - postedAt < MIN_FILL_MS) {
		debug("submitted too fast", { slug, ip: meta.ip });
		return redirect303(routeCtx, "sent", slug);
	}

	// A field key on the cf_ protocol namespace can collide with the hidden
	// routing inputs — a stored definition that old (or written by hand) gets
	// an explicit error instead of silently corrupting submissions.
	if (form.fields.some((f) => PROTOCOL_INPUT.test(f.key))) {
		ctx.log.error(`Form "${slug}" uses reserved cf_* field keys; refusing submissions`, { slug });
		return redirect303(routeCtx, "error", slug);
	}

	// Draft of the declared fields as submitted — the recovery record keeps it
	// across the redirect so a rejection never erases what the visitor typed.
	const draft: Record<string, string> = {};
	for (const field of form.fields) {
		if (!field.key || !isFieldType(field.type)) continue;
		const raw = fieldValues[field.key] ?? (field.type === "checkbox" ? "off" : "");
		draft[field.key] = field.type === "checkbox" ? (checkboxState(raw) ?? "off") : raw.trim();
	}
	const rejectRecoverable = async (
		status: string,
		errors?: Record<string, string>,
		fields?: string[],
	) => {
		const rid = await storeRecovery(ctx, slug, draft, errors ?? {});
		return redirect303(routeCtx, status, slug, fields, rid);
	};

	// Attempt budget: a bounded per-IP hourly count consumed before the
	// expensive verification path, so failed attempts cost budget too.
	const ip = meta.ip;
	const limit = settings.rateLimitPerHour;
	if (ip && limit > 0) {
		try {
			const allowed = await consumeAttemptBudget(ctx, ip, limit);
			if (!allowed) {
				ctx.log.warn(`Contact form attempt budget exhausted: ${ip} (${limit}/h)`, { slug });
				return rejectRecoverable("rate_limited");
			}
		} catch (error) {
			ctx.log.warn(
				`Rate-limit check failed; allowing the attempt: ${error instanceof Error ? error.message : error}`,
				{ slug },
			);
		}
	}

	// Turnstile: when both keys are configured the widget's token must verify.
	// The outage policy only governs unavailable verifiers; a completed check
	// that returns failure always rejects.
	if (settings.turnstileSiteKey && settings.turnstileSecretKey) {
		const token = (protocol["cf-turnstile-response"] ?? "").trim();
		const outcome = token
			? await verifyTurnstile(ctx, settings.turnstileSecretKey, token, ip)
			: "rejected";
		if (outcome === "rejected") {
			debug("turnstile verification failed", { slug, ip: meta.ip });
			return rejectRecoverable("challenge");
		}
		if (outcome === "unavailable") {
			if (settings.turnstileOutagePolicy === "reject") {
				ctx.log.warn("Turnstile unavailable; rejecting per outage policy", { slug });
				return rejectRecoverable("unavailable");
			}
			ctx.log.warn("Turnstile unavailable; accepting per outage policy", { slug });
		}
	}

	// Validate against the form's field definitions.
	const data: Record<string, string> = {};
	const errors: Record<string, string> = {};
	const fieldKeys = new Set(form.fields.map((f) => f.key));
	const extraKeys = Object.keys(fieldValues).filter((k) => !fieldKeys.has(k));
	if (form.fields.length === 0 || extraKeys.length + form.fields.length > MAX_FIELDS) {
		return redirect303(routeCtx, "error", slug);
	}
	for (const field of form.fields) {
		if (!field.key || !isFieldType(field.type)) continue;
		const raw = fieldValues[field.key] ?? (field.type === "checkbox" ? "off" : "");
		const error = validateField(field, raw);
		if (error) {
			errors[field.key] = error;
			continue;
		}
		data[field.key] = field.type === "checkbox" ? (checkboxState(raw) ?? "off") : raw.trim();
	}
	if (Object.keys(errors).length) {
		debug("validation failed", { slug, errors: Object.keys(errors) });
		return rejectRecoverable("invalid", errors, Object.keys(errors));
	}

	// Idempotency: a retried post of identical content stores and emails once.
	const claim = await claimIdempotency(ctx, slug, ip, meta.userAgent, data);
	if (claim === "duplicate") {
		ctx.log.info("Duplicate submission suppressed", { slug });
		return redirect303(routeCtx, "saved", slug);
	}

	// Durable storage is the acceptance boundary: once the row is written the
	// submission is safe, and every failure past this point degrades to
	// bookkeeping — the visitor still gets "saved".
	const submissionId = ulid();
	const submission: SubmissionRecord = {
		formId: found.id,
		formSlug: form.slug,
		formName: form.name,
		data,
		fieldLabels: Object.fromEntries(form.fields.map((f) => [f.key, f.label])),
		pageUrl: safePageUrl(protocol.cf_page, meta.referer, origin),
		ip,
		userAgent: meta.userAgent,
		country: meta.geo?.country ?? null,
		status: "new",
		emailStatus: "pending",
		emailAttempts: 0,
		createdAt: new Date().toISOString(),
	};
	await ctx.storage.submissions.put(submissionId, submission);
	debug("submission stored", { submissionId, slug });

	try {
		const sent = await sendSubmissionEmail(ctx, form, submissionId, submission, settings);
		submission.emailStatus = sent.status;
		submission.emailAttempts = 1;
		submission.emailError = sent.error;

		// Optional auto-reply to the visitor's email field.
		if (form.sendConfirmation && ctx.email) {
			const visitorEmail = firstEmailValue(form, submission.data);
			if (visitorEmail) {
				const message =
					form.confirmationMessage?.trim() ||
					`Thanks for reaching out to ${ctx.site.name}. We received your message and will reply soon.`;
				const started = Date.now();
				let status: EmailLogRecord["status"] = "sent";
				let error: string | undefined;
				try {
					await ctx.email.send({
						to: visitorEmail,
						subject: `${form.name} — message received`,
						text: message,
					});
				} catch (err) {
					status = "failed";
					error = err instanceof Error ? err.message : String(err);
				}
				await ctx.storage.email_log.put(ulid(), {
					submissionId,
					formId: submission.formId,
					formSlug: form.slug,
					kind: "confirmation",
					to: visitorEmail,
					subject: `${form.name} — message received`,
					status,
					error,
					durationMs: Date.now() - started,
					createdAt: new Date().toISOString(),
				} satisfies EmailLogRecord);
			}
		}

		await ctx.storage.submissions.put(submissionId, submission);
		return redirect303(routeCtx, sent.status === "sent" ? "sent" : "saved", slug);
	} catch (error) {
		// The row is already durable — bookkeeping or delivery failures never
		// become visitor-facing errors, and the idempotency claim suppresses
		// the duplicate a retry would otherwise create.
		ctx.log.error(
			`Contact form post-storage work failed for ${submissionId}: ${error instanceof Error ? error.message : String(error)}`,
			{ slug },
		);
		try {
			if (submission.emailStatus === "pending") {
				submission.emailStatus = "failed";
				submission.emailError = "post-store processing failed";
			}
			await ctx.storage.submissions.put(submissionId, submission);
		} catch {
			// Nothing else to persist; the submission itself is already safe.
		}
		return redirect303(routeCtx, "saved", slug);
	}
}

export async function handleExportRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<unknown> {
	const input = (routeCtx.input ?? {}) as Record<string, string | string[]>;
	const formParam = input.form;
	const formFilter = (Array.isArray(formParam) ? formParam[0] : formParam) || "";
	const statusParam = input.status;
	const statusFilter = (Array.isArray(statusParam) ? statusParam[0] : statusParam) || "";

	const where: WhereArgs = {};
	if (statusFilter && ["new", "read", "archived"].includes(statusFilter)) where.status = statusFilter;
	if (formFilter) {
		const { items } = await ctx.storage.forms.query({ where: { slug: formFilter }, limit: 1 });
		where.formId = items[0]?.id ?? "__none__";
	}

	const encoder = new TextEncoder();
	const lines: string[] = ["id,created_at,form,status,email_status,email_attempts,page,ip,country,data"];
	let cursor: string | undefined;
	let exported = 0;
	const MAX_ROWS = 5000;
	do {
		const page = await ctx.storage.submissions.query({
			where,
			orderBy: { createdAt: "desc" },
			limit: 100,
			cursor,
		});
		for (const item of page.items) {
			const sub = item.data as SubmissionRecord;
			lines.push(
				[
					csvCell(item.id),
					csvCell(sub.createdAt),
					csvCell(sub.formSlug),
					csvCell(sub.status),
					csvCell(sub.emailStatus),
					csvCell(sub.emailAttempts),
					csvCell(sub.pageUrl),
					csvCell(sub.ip),
					csvCell(sub.country),
					csvCell(JSON.stringify(sub.data)),
				].join(","),
			);
			exported++;
			if (exported >= MAX_ROWS) break;
		}
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && exported < MAX_ROWS);

	const stamp = new Date().toISOString().slice(0, 10);
	return pluginResponse({
		status: 200,
		headers: [
			["content-type", "text/csv; charset=utf-8"],
			["content-disposition", `attachment; filename="submissions-${stamp}.csv"`],
		],
		body: { kind: "bytes", value: encoder.encode(lines.join("\n")) },
	});
}
