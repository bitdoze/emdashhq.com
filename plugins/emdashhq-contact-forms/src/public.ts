import { pluginResponse } from "emdash/plugin";
import type { PluginContext, PluginFormData, SandboxedRouteContext } from "emdash/plugin";

import { readSettings } from "./types";
import { ulid } from "./util";
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
	return { form: publicForm(found.data) };
}

function formValues(input: PluginFormData): Record<string, string> {
	const values: Record<string, string> = {};
	for (const entry of input.entries) {
		if (entry.kind !== "text") continue;
		values[entry.name] = entry.value;
	}
	return values;
}

function validateField(field: FormFieldDef, raw: string): string | null {
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
		case "checkbox":
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

function redirect303(routeCtx: SandboxedRouteContext, status: string, formSlug: string, fields?: string[]) {
	const url = redirectTarget(routeCtx);
	url.searchParams.set("cf", formSlug);
	url.searchParams.set("cf_status", status);
	if (fields?.length) url.searchParams.set("cf_fields", fields.join(","));
	return pluginResponse({
		status: 303,
		headers: [["location", url.pathname + url.search + url.hash]],
	});
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

export async function handleSubmitRoute(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<unknown> {
	const input = routeCtx.input as PluginFormData;
	const meta = requestMeta(routeCtx);
	const values = formValues(input);
	const slug = (values.cf_slug ?? "").trim();
	const settings = await readSettings(ctx);
	const debug = (msg: string, data?: unknown) => {
		if (settings.extraDebug) ctx.log.debug(msg, data);
	};

	// Honeypot: invisible to humans, bots fill it. Pretend success.
	if ((values.cf_hp ?? "").trim()) {
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
	const postedAt = Number(values.cf_ts ?? 0);
	if (postedAt > 0 && Date.now() - postedAt < MIN_FILL_MS) {
		debug("submitted too fast", { slug, ip: meta.ip });
		return redirect303(routeCtx, "sent", slug);
	}

	// Rate limit: bounded count of recent submissions from this IP.
	const ip = meta.ip;
	const limit = settings.rateLimitPerHour;
	if (ip && limit > 0) {
		const cutoff = new Date(Date.now() - 3600e3).toISOString();
		const recent = await ctx.storage.submissions.count({ ip, createdAt: { gte: cutoff } });
		if (recent >= limit) {
			ctx.log.warn(`Contact form rate limit hit: ${ip} (${recent}/${limit}/h)`, { slug });
			return redirect303(routeCtx, "rate_limited", slug);
		}
	}

	// Validate against the form's field definitions.
	const data: Record<string, string> = {};
	const errors: string[] = [];
	const fieldKeys = new Set(form.fields.map((f) => f.key));
	const extraKeys = Object.keys(values).filter(
		(k) => !k.startsWith("cf_") && !fieldKeys.has(k),
	);
	if (form.fields.length === 0 || extraKeys.length + form.fields.length > MAX_FIELDS) {
		return redirect303(routeCtx, "error", slug);
	}
	for (const field of form.fields) {
		if (!field.key || !isFieldType(field.type)) continue;
		const raw = values[field.key] ?? (field.type === "checkbox" ? "off" : "");
		const error = validateField(field, raw);
		if (error) {
			errors.push(field.key);
			continue;
		}
		data[field.key] = field.type === "checkbox" ? (raw === "on" || raw === "true" ? "on" : "off") : raw.trim();
	}
	if (errors.length) {
		debug("validation failed", { slug, errors });
		return redirect303(routeCtx, "invalid", slug, errors);
	}

	// Store first — the submission is never lost even if the email fails.
	const submissionId = ulid();
	const submission: SubmissionRecord = {
		formId: found.id,
		formSlug: form.slug,
		formName: form.name,
		data,
		fieldLabels: Object.fromEntries(form.fields.map((f) => [f.key, f.label])),
		pageUrl: values.cf_page || meta.referer || undefined,
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
}

function csvCell(value: unknown): string {
	const s = value == null ? "" : String(value);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
