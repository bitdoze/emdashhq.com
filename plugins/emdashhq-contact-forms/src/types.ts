import type { PluginContext } from "emdash/plugin";

/** Normalized request metadata sent to sandboxed routes (declared `unknown` upstream). */
export interface RouteRequestMeta {
	ip: string | null;
	userAgent: string | null;
	referer: string | null;
	geo: { country: string | null; region: string | null; city: string | null } | null;
}

export const FIELD_TYPES = ["text", "email", "tel", "url", "number", "textarea", "select", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormFieldDef {
	key: string;
	label: string;
	type: FieldType;
	required?: boolean;
	placeholder?: string;
	/** Select options, one choice per entry. */
	options?: string[];
	help?: string;
}

export interface FormRecord {
	name: string;
	slug: string;
	description?: string;
	enabled: boolean;
	fields: FormFieldDef[];
	/** Recipient for notification mail. Falls back to the plugin setting. */
	notifyEmail?: string;
	/** Supports {form}, {site} and any submitted {field_key} placeholder. */
	subjectTemplate?: string;
	submitLabel?: string;
	successMessage?: string;
	sendConfirmation?: boolean;
	confirmationMessage?: string;
	createdAt: string;
	updatedAt: string;
}

export type SubmissionStatus = "new" | "read" | "archived";
export type EmailStatus = "pending" | "sent" | "failed" | "skipped" | "unconfigured";

export interface SubmissionRecord {
	formId: string;
	formSlug: string;
	formName: string;
	/** Submitted values keyed by field key. */
	data: Record<string, string>;
	/** Field labels at submit time, so old submissions still render after a form edit. */
	fieldLabels: Record<string, string>;
	pageUrl?: string;
	ip?: string | null;
	userAgent?: string | null;
	country?: string | null;
	status: SubmissionStatus;
	emailStatus: EmailStatus;
	emailError?: string;
	emailAttempts: number;
	createdAt: string;
}

export type EmailLogKind = "notification" | "confirmation" | "resend";
export type EmailLogStatus = "sent" | "failed" | "skipped" | "unconfigured";

export interface EmailLogRecord {
	submissionId?: string;
	formId?: string;
	formSlug?: string;
	kind: EmailLogKind;
	to: string;
	subject: string;
	status: EmailLogStatus;
	error?: string;
	durationMs: number;
	createdAt: string;
}

/** Public shape returned by the `form` route. Recipient addresses stay server-side. */
export interface PublicForm {
	slug: string;
	name: string;
	description?: string;
	submitLabel?: string;
	successMessage?: string;
	fields: FormFieldDef[];
	/** Present when Turnstile is fully configured; renderers show the widget. */
	turnstileSiteKey?: string;
}

export interface PluginSettings {
	defaultNotifyEmail: string;
	defaultSubject: string;
	notifyName: string;
	rateLimitPerHour: number;
	turnstileSiteKey: string;
	turnstileSecretKey: string;
	retentionDays: number;
	extraDebug: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	defaultNotifyEmail: "",
	defaultSubject: "New {form} submission",
	notifyName: "",
	rateLimitPerHour: 20,
	turnstileSiteKey: "",
	turnstileSecretKey: "",
	retentionDays: 0,
	extraDebug: false,
};

export function isFieldType(value: string): value is FieldType {
	return (FIELD_TYPES as readonly string[]).includes(value);
}

/** {form}, {site} and {field_key} placeholders in subject templates. */
export function renderTemplate(
	template: string,
	form: FormRecord,
	data: Record<string, string>,
	siteName: string,
): string {
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
		if (key === "form") return form.name;
		if (key === "site") return siteName;
		return data[key] ?? match;
	});
}

export function firstEmailValue(form: FormRecord, data: Record<string, string>): string | undefined {
	for (const field of form.fields) {
		if (field.type !== "email") continue;
		const value = data[field.key]?.trim();
		if (value) return value;
	}
	return undefined;
}

export async function readSettings(ctx: PluginContext): Promise<PluginSettings> {
	const entries = await ctx.settings.list();
	const raw = new Map(entries.map(({ key, value }) => [key, value]));
	return {
		defaultNotifyEmail: typeof raw.get("defaultNotifyEmail") === "string" ? (raw.get("defaultNotifyEmail") as string) : "",
		defaultSubject:
			typeof raw.get("defaultSubject") === "string" && (raw.get("defaultSubject") as string).trim()
				? (raw.get("defaultSubject") as string)
				: DEFAULT_SETTINGS.defaultSubject,
		notifyName: typeof raw.get("notifyName") === "string" ? (raw.get("notifyName") as string) : "",
		rateLimitPerHour:
			typeof raw.get("rateLimitPerHour") === "number" && raw.get("rateLimitPerHour") !== null
				? Math.max(1, Math.min(1000, raw.get("rateLimitPerHour") as number))
				: DEFAULT_SETTINGS.rateLimitPerHour,
		turnstileSiteKey:
			typeof raw.get("turnstileSiteKey") === "string" ? (raw.get("turnstileSiteKey") as string).trim() : "",
		turnstileSecretKey:
			typeof raw.get("turnstileSecretKey") === "string" ? (raw.get("turnstileSecretKey") as string).trim() : "",
		retentionDays:
			typeof raw.get("retentionDays") === "number" && raw.get("retentionDays") !== null
				? Math.max(0, Math.min(3650, raw.get("retentionDays") as number))
				: DEFAULT_SETTINGS.retentionDays,
		extraDebug: raw.get("extraDebug") === true,
	};
}
