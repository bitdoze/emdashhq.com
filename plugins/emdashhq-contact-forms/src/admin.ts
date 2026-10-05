import { blocks, elements } from "@emdash-cms/blocks/server";
import type {
	Block,
	BlockAction,
	BlockResponse,
	FormField,
	FormSubmit,
	PageLoad,
	TableColumn,
} from "@emdash-cms/blocks/server";
import type { PluginContext, SandboxedRouteContext } from "emdash/plugin";

import { sendSubmissionEmail } from "./public";
import { readSettings } from "./types";
import { slugify, ulid } from "./util";
import {
	FIELD_TYPES,
	isFieldType,
	type EmailLogRecord,
	type FormFieldDef,
	type FormRecord,
	type SubmissionRecord,
} from "./types";

type WhereArgs = NonNullable<Parameters<PluginContext["storage"]["forms"]["query"]>[0]>["where"];

const SUBMISSIONS_PAGE_SIZE = 15;
const LOG_PAGE_SIZE = 15;
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const SUBMISSION_STATUSES = ["new", "read", "archived"] as const;
const FILTER_KEY = "state:ui";

interface UiState {
	submissionFilter: { formId?: string; status?: string; emailStatus?: string };
	logFilter: { status?: string };
}

async function uiState(ctx: PluginContext): Promise<UiState> {
	return (
		(await ctx.kv.get<UiState>(FILTER_KEY)) ?? { submissionFilter: {}, logFilter: {} }
	);
}

type Toast = NonNullable<BlockResponse["toast"]>;
const ok = (message: string): Toast => ({ message, type: "success" });
const fail = (message: string): Toast => ({ message, type: "error" });

function str(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/** Per-row action menu for tables — the `element` column format. */
function rowMenu(actionId: string, items: Array<{ label: string; value: string }>) {
	return { type: "menu", action_id: actionId, label: "…", items, style: "secondary" } as const;
}

function providerBanner(ctx: PluginContext): Block[] {
	if (ctx.email) return [];
	return [
		blocks.banner({
			variant: "alert",
			title: "No email provider is active",
			description:
				"Submissions are still stored, but notification emails cannot be sent until one is enabled in Settings > Email.",
		}),
	];
}

// ---------------------------------------------------------------------------
// /forms

async function viewForms(ctx: PluginContext, toast?: Toast): Promise<BlockResponse> {
	const [{ items: forms }, totalSubs, newSubs, failedWeek] = await Promise.all([
		ctx.storage.forms.query({ orderBy: { createdAt: "desc" }, limit: 100 }),
		ctx.storage.submissions.count(),
		ctx.storage.submissions.count({ status: "new" }),
		ctx.storage.email_log.count({
			status: "failed",
			createdAt: { gte: new Date(Date.now() - 7 * 864e5).toISOString() },
		}),
	]);

	const out: Block[] = [
		...providerBanner(ctx),
		blocks.header("Forms"),
		blocks.context(
			"Build a form here, then drop a Contact form block into any page and enter the form's slug. Submissions are stored on this site and emailed through the active email provider.",
		),
		blocks.stats([
			{ label: "Forms", value: forms.length },
			{ label: "Enabled", value: forms.filter((f) => (f.data as FormRecord).enabled).length },
			{ label: "Submissions", value: totalSubs },
			{ label: "Unread", value: newSubs },
			{
				label: "Failed emails (7d)",
				value: failedWeek,
				trend: failedWeek > 0 ? "down" : "neutral",
			},
		]),
		blocks.actions([
			elements.button("new_form", "New form", { style: "primary" }),
			elements.button("help", "Setup guide"),
			elements.link("Plugin settings", { kind: "plugin-settings" }, { appearance: "secondary" }),
		]),
	];

	if (forms.length === 0) {
		out.push(
			blocks.empty({
				title: "No forms yet",
				description:
					"Create your first form, then reference its slug in a Contact form block on a page.",
			}),
		);
		return { blocks: out, toast };
	}

	const subCounts = new Map<string, number>();
	await Promise.all(
		forms.map(async (row) => {
			subCounts.set(row.id, await ctx.storage.submissions.count({ formId: row.id }));
		}),
	);

	out.push(
		blocks.table({
			pageActionId: "forms_page",
			columns: [
				{ key: "name", label: "Name" },
				{ key: "slug", label: "Slug", format: "code" },
				{ key: "fields", label: "Fields", format: "number" },
				{ key: "notify", label: "Notify" },
				{ key: "enabled", label: "Status", format: "badge" },
				{ key: "subs", label: "Submissions", format: "number" },
				{ key: "row", label: "", format: "element" },
			],
			rows: forms.map((row) => {
				const form = row.data as FormRecord;
				return {
					name: form.name,
					slug: form.slug,
					fields: form.fields.length,
					notify: form.notifyEmail || "(default)",
					enabled: form.enabled ? "enabled" : "disabled",
					subs: subCounts.get(row.id) ?? 0,
					row: rowMenu("form_menu", [
						{ label: "Edit", value: `edit:${row.id}` },
						{ label: form.enabled ? "Disable" : "Enable", value: `toggle:${row.id}` },
						{ label: "View submissions", value: `subs:${row.id}` },
					]),
				};
			}),
		}),
	);
	return { blocks: out, toast };
}

// ---------------------------------------------------------------------------
// Form create / edit

function formMetaFields(form?: FormRecord): FormField[] {
	return [
		elements.textInput("name", "Form name", {
			placeholder: "Contact",
			initialValue: form?.name,
		}),
		elements.textInput("slug", "Slug", {
			placeholder: "contact",
			initialValue: form?.slug,
		}),
		elements.textInput("description", "Description (shown above the form)", {
			multiline: true,
			initialValue: form?.description,
		}),
		elements.textInput("notifyEmail", "Notification recipient", {
			placeholder: "Empty = plugin default recipient",
			initialValue: form?.notifyEmail,
		}),
		elements.textInput("subjectTemplate", "Email subject", {
			placeholder: "New {form} submission — supports {form}, {site}, {field_key}",
			initialValue: form?.subjectTemplate,
		}),
		elements.textInput("submitLabel", "Submit button label", {
			placeholder: "Send",
			initialValue: form?.submitLabel,
		}),
		elements.textInput("successMessage", "Success message shown to visitors", {
			placeholder: "Thanks, we will get back to you soon.",
			initialValue: form?.successMessage,
		}),
		elements.toggle("sendConfirmation", "Send the visitor a confirmation email", {
			initialValue: form?.sendConfirmation ?? false,
		}),
		{
			...elements.textInput("confirmationMessage", "Confirmation email body", {
				multiline: true,
				placeholder: "Empty = a short default confirmation",
				initialValue: form?.confirmationMessage,
			}),
			condition: { field: "sendConfirmation", eq: true },
		},
		elements.toggle("enabled", "Accepting submissions", {
			initialValue: form?.enabled ?? true,
		}),
	];
}

function readMetaValues(values: Record<string, unknown>, existing?: FormRecord): FormRecord {
	const now = new Date().toISOString();
	const name = str(values.name);
	return {
		name,
		slug: str(values.slug) || slugify(name),
		description: str(values.description) || undefined,
		enabled: values.enabled !== false,
		fields: existing?.fields ?? [],
		notifyEmail: str(values.notifyEmail) || undefined,
		subjectTemplate: str(values.subjectTemplate) || undefined,
		submitLabel: str(values.submitLabel) || undefined,
		successMessage: str(values.successMessage) || undefined,
		sendConfirmation: values.sendConfirmation === true,
		confirmationMessage: str(values.confirmationMessage) || undefined,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};
}

function viewFormNew(toast?: Toast): BlockResponse {
	return {
		blocks: [
			blocks.header("New form"),
			blocks.context(
				"Name the form and choose where its submissions are emailed. You add fields on the next step.",
			),
			blocks.form({
				fields: formMetaFields(),
				submit: { label: "Create form", actionId: "form_create" },
			}),
			blocks.actions([elements.button("back_forms", "Back to forms")]),
		],
		toast,
	};
}

async function viewFormEdit(
	ctx: PluginContext,
	formId: string,
	toast?: Toast,
): Promise<BlockResponse> {
	const form = await ctx.storage.forms.get(formId) as FormRecord | null;
	if (!form) return viewForms(ctx, fail("Form not found"));

	const out: Block[] = [
		blocks.header(`Edit: ${form.name}`),
		blocks.context(
			`Embed it in a page with a Contact form block, slug "${form.slug}".` +
				(form.enabled ? "" : " This form is disabled — the block renders a closed notice."),
		),
		...providerBanner(ctx),
		blocks.form({
			fields: formMetaFields(form),
			submit: { label: "Save settings", actionId: `form_save:${formId}` },
		}),
		blocks.divider(),
		blocks.section("Fields", {
			accessory: elements.button("add_field", "Add field", {
				style: "primary",
				value: formId,
			}),
		}),
	];

	if (form.fields.length === 0) {
		out.push(
			blocks.empty({
				title: "No fields yet",
				description: "Add the fields visitors fill in — name, email, message, and so on.",
				size: "sm",
			}),
		);
	} else {
		out.push(
			blocks.table({
				pageActionId: "fields_page",
				columns: [
					{ key: "label", label: "Label" },
					{ key: "key", label: "Key", format: "code" },
					{ key: "type", label: "Type", format: "badge" },
					{ key: "required", label: "Required", format: "badge" },
					{ key: "row", label: "", format: "element" },
				],
				rows: form.fields.map((field, i) => ({
					label: field.label,
					key: field.key,
					type: field.type,
					required: field.required ? "yes" : "",
					row: rowMenu(`field_menu:${formId}`, [
						{ label: "Edit", value: `edit:${i}` },
						{ label: "Move up", value: `up:${i}` },
						{ label: "Move down", value: `down:${i}` },
						{ label: "Delete", value: `del:${i}` },
					]),
				})),
			}),
		);
	}

	out.push(
		blocks.actions([
			elements.link("Back to forms", { kind: "plugin-page", path: "/forms" }),
			elements.button("delete_form", "Delete form", {
				style: "danger",
				value: formId,
				confirm: {
					title: "Delete this form?",
					text: `Deletes "${form.name}", its fields and all ${form.fields.length ? "stored submissions" : "submissions"}. Email log entries are kept.`,
					confirm: "Delete form",
					deny: "Cancel",
				},
			}),
		]),
	);
	return { blocks: out, toast };
}

async function viewFieldEdit(
	ctx: PluginContext,
	formId: string,
	index: number | null,
	toast?: Toast,
): Promise<BlockResponse> {
	const form = await ctx.storage.forms.get(formId) as FormRecord | null;
	if (!form) return viewForms(ctx, fail("Form not found"));
	const existing = index !== null ? form.fields[index] : undefined;
	if (index !== null && !existing) return viewFormEdit(ctx, formId, fail("Field not found"));

	return {
		blocks: [
			blocks.header(index === null ? `New field — ${form.name}` : `Edit field — ${form.name}`),
			blocks.form({
				fields: [
					elements.textInput("label", "Label", {
						placeholder: "Your email",
						initialValue: existing?.label,
					}),
					elements.textInput("key", "Field key", {
						placeholder: "email",
						initialValue: existing?.key,
					}),
					elements.select(
						"type",
						"Type",
						FIELD_TYPES.map((t) => ({ label: t, value: t })),
						{ initialValue: existing?.type ?? "text" },
					),
					elements.toggle("required", "Required", { initialValue: existing?.required ?? false }),
					elements.textInput("placeholder", "Placeholder", { initialValue: existing?.placeholder }),
					{
						...elements.textInput("options", "Options (one per line, select fields only)", {
							multiline: true,
							initialValue: existing?.options?.join("\n"),
						}),
						condition: { field: "type", eq: "select" },
					},
					elements.textInput("help", "Help text under the field", {
						initialValue: existing?.help,
					}),
				],
				submit: {
					label: index === null ? "Add field" : "Save field",
					actionId: index === null ? `field_save:${formId}` : `field_save:${formId}:${index}`,
				},
			}),
			blocks.actions([
				elements.button(`back_edit:${formId}`, `Back to ${form.name}`),
			]),
		],
		toast,
	};
}

// ---------------------------------------------------------------------------
// /submissions

async function viewSubmissions(
	ctx: PluginContext,
	opts: { cursor?: string; toast?: Toast } = {},
): Promise<BlockResponse> {
	const state = await uiState(ctx);
	const filter = state.submissionFilter;
	const where: WhereArgs = {};
	if (filter.formId) where.formId = filter.formId;
	if (filter.status && (SUBMISSION_STATUSES as readonly string[]).includes(filter.status))
		where.status = filter.status;
	if (filter.emailStatus) where.emailStatus = filter.emailStatus;

	const [{ items: formRows }, counts] = await Promise.all([
		ctx.storage.forms.query({ limit: 100 }),
		Promise.all([
			ctx.storage.submissions.count({ status: "new" }),
			ctx.storage.submissions.count(),
			ctx.storage.submissions.count({ emailStatus: "failed" }),
		]),
	]);
	const page = await ctx.storage.submissions.query({
		where,
		orderBy: { createdAt: "desc" },
		limit: SUBMISSIONS_PAGE_SIZE,
		cursor: opts.cursor,
	});

	const formOptions = [
		{ label: "All forms", value: "" },
		...formRows.map((r) => ({ label: (r.data as FormRecord).name, value: r.id })),
	];
	const summary = (sub: SubmissionRecord): string => {
		const firstText = Object.values(sub.data).find((v) => v && v.length < 80);
		const emailField = Object.entries(sub.data).find(([, v]) => v.includes("@"));
		return [firstText, emailField?.[1]].filter(Boolean).slice(0, 2).join(" · ") || "(empty)";
	};

	const out: Block[] = [
		...providerBanner(ctx),
		blocks.header("Submissions"),
		blocks.stats([
			{ label: "Unread", value: counts[0] },
			{ label: "Total stored", value: counts[1] },
			{
				label: "Email failures",
				value: counts[2],
				trend: counts[2] > 0 ? "down" : "neutral",
			},
		]),
		blocks.form({
			fields: [
				elements.select("formId", "Form", formOptions, { initialValue: filter.formId ?? "" }),
				elements.select(
					"status",
					"Status",
					[
						{ label: "Any status", value: "" },
						{ label: "Unread", value: "new" },
						{ label: "Read", value: "read" },
						{ label: "Archived", value: "archived" },
					],
					{ initialValue: filter.status ?? "" },
				),
				elements.select(
					"emailStatus",
					"Email",
					[
						{ label: "Any", value: "" },
						{ label: "Sent", value: "sent" },
						{ label: "Failed", value: "failed" },
						{ label: "Skipped / unconfigured", value: "skipped" },
					],
					{ initialValue: filter.emailStatus ?? "" },
				),
			],
			submit: { label: "Filter", actionId: "subs_filter" },
		}),
	];

	if (page.items.length === 0 && !opts.cursor) {
		out.push(
			blocks.empty({
				title: "No submissions",
				description: filter.formId || filter.status || filter.emailStatus
					? "Nothing matches the current filter."
					: "Submissions appear here as soon as a visitor posts a form.",
			}),
		);
	} else {
		const columns: TableColumn[] = [
			{ key: "when", label: "When", format: "relative_time", sortable: true },
			{ key: "form", label: "Form" },
			{ key: "from", label: "From" },
			{ key: "status", label: "Status", format: "badge" },
			{ key: "email", label: "Email", format: "badge" },
			{ key: "row", label: "", format: "element" },
		];
		out.push(
			blocks.table({
				pageActionId: "subs_page",
				columns,
				nextCursor: page.hasMore ? page.cursor : undefined,
				rows: page.items.map((item) => {
					const sub = item.data as SubmissionRecord;
					return {
						when: sub.createdAt,
						form: sub.formName || sub.formSlug,
						from: summary(sub),
						status: sub.status,
						email: sub.emailStatus,
						row: rowMenu("sub_menu", [
							{ label: "View", value: `view:${item.id}` },
							{ label: sub.status === "read" ? "Mark unread" : "Mark read", value: `mark:${item.id}` },
							{ label: sub.status === "archived" ? "Unarchive" : "Archive", value: `archive:${item.id}` },
							{ label: "Resend email", value: `resend:${item.id}` },
						]),
					};
				}),
			}),
		);
	}
	out.push(
		blocks.actions([
			elements.button("csv_view", "Copy as CSV", {
				value: JSON.stringify({ formId: filter.formId, status: filter.status }),
			}),
		]),
	);
	return { blocks: out, toast: opts.toast };
}

async function viewSubmission(
	ctx: PluginContext,
	id: string,
	toast?: Toast,
): Promise<BlockResponse> {
	const raw = await ctx.storage.submissions.get(id) as SubmissionRecord | null;
	if (!raw) return viewSubmissions(ctx, { toast: fail("Submission not found") });
	const sub = raw;
	if (sub.status === "new") {
		sub.status = "read";
		await ctx.storage.submissions.put(id, sub);
	}
	const { items: attempts } = await ctx.storage.email_log.query({
		where: { submissionId: id },
		orderBy: { createdAt: "desc" },
		limit: 20,
	});

	const dataFields = Object.entries(sub.data).map(([key, value]) => ({
		label: sub.fieldLabels[key] ?? key,
		value: value === "on" ? "Yes" : value === "off" ? "No" : value || "(empty)",
	}));

	const out: Block[] = [
		blocks.header(`Submission — ${sub.formName || sub.formSlug}`),
		blocks.fields([
			{ label: "Received", value: new Date(sub.createdAt).toLocaleString("en-GB") },
			{ label: "Page", value: sub.pageUrl || "unknown" },
			{ label: "IP", value: sub.ip ? `${sub.ip}${sub.country ? ` (${sub.country})` : ""}` : "unknown" },
			{ label: "Email", value: sub.emailStatus + (sub.emailError ? ` — ${sub.emailError}` : "") },
		]),
		blocks.section("Message"),
		blocks.fields(dataFields),
	];
	if (attempts.length) {
		out.push(
			blocks.section("Email attempts"),
			blocks.table({
				pageActionId: "attempts_page",
				columns: [
					{ key: "when", label: "When", format: "relative_time" },
					{ key: "kind", label: "Kind", format: "badge" },
					{ key: "to", label: "To" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "ms", label: "ms", format: "number" },
					{ key: "error", label: "Error" },
				],
				rows: attempts.map((a) => {
					const log = a.data as EmailLogRecord;
					return {
						when: log.createdAt,
						kind: log.kind,
						to: log.to,
						status: log.status,
						ms: log.durationMs,
						error: log.error ?? "",
					};
				}),
			}),
		);
	}
	out.push(
		blocks.actions([
			elements.link("Back to submissions", { kind: "plugin-page", path: "/submissions" }),
			elements.button("resend_sub", "Resend email", { value: id, style: "primary" }),
			elements.button(
				"mark_sub",
				sub.status === "read" ? "Mark unread" : "Mark read",
				{ value: `${id}:${sub.status === "read" ? "new" : "read"}` },
			),
			elements.button("archive_sub", sub.status === "archived" ? "Unarchive" : "Archive", {
				value: `${id}:${sub.status === "archived" ? "read" : "archived"}`,
			}),
			elements.button("del_sub", "Delete", {
				style: "danger",
				value: id,
				confirm: {
					title: "Delete submission?",
					text: "The stored entry is removed. Email log entries are kept.",
					confirm: "Delete",
					deny: "Cancel",
				},
			}),
		]),
	);
	return { blocks: out, toast };
}

// ---------------------------------------------------------------------------
// /log

async function viewLog(
	ctx: PluginContext,
	opts: { cursor?: string; toast?: Toast } = {},
): Promise<BlockResponse> {
	const state = await uiState(ctx);
	const statusFilter = state.logFilter.status;
	const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
	const [sent7d, failed7d, skippedTotal] = await Promise.all([
		ctx.storage.email_log.count({ status: "sent", createdAt: { gte: weekAgo } }),
		ctx.storage.email_log.count({ status: "failed", createdAt: { gte: weekAgo } }),
		ctx.storage.email_log.count({ status: "skipped" }),
	]);
	const where: WhereArgs = statusFilter ? { status: statusFilter } : {};
	const page = await ctx.storage.email_log.query({
		where,
		orderBy: { createdAt: "desc" },
		limit: LOG_PAGE_SIZE,
		cursor: opts.cursor,
	});

	const out: Block[] = [
		...providerBanner(ctx),
		blocks.header("Email log"),
		blocks.context(
			"Every delivery attempt — notifications, visitor confirmations and manual resends — is recorded here with its result and error message.",
		),
		blocks.stats([
			{ label: "Sent (7d)", value: sent7d },
			{ label: "Failed (7d)", value: failed7d, trend: failed7d > 0 ? "down" : "up" },
			{ label: "Skipped (no recipient)", value: skippedTotal },
		]),
		blocks.form({
			fields: [
				elements.select(
					"status",
					"Status",
					[
						{ label: "All", value: "" },
						{ label: "Sent", value: "sent" },
						{ label: "Failed", value: "failed" },
						{ label: "Skipped", value: "skipped" },
						{ label: "No provider", value: "unconfigured" },
					],
					{ initialValue: statusFilter ?? "" },
				),
			],
			submit: { label: "Filter", actionId: "log_filter" },
		}),
	];

	if (page.items.length === 0 && !opts.cursor) {
		out.push(
			blocks.empty({
				title: "No email attempts yet",
				description: "Attempts are logged when a visitor submits a form or you resend a submission.",
			}),
		);
	} else {
		out.push(
			blocks.table({
				pageActionId: "log_page",
				columns: [
					{ key: "when", label: "When", format: "relative_time", sortable: true },
					{ key: "form", label: "Form" },
					{ key: "kind", label: "Kind", format: "badge" },
					{ key: "to", label: "To" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "ms", label: "ms", format: "number" },
					{ key: "error", label: "Error" },
					{ key: "row", label: "", format: "element" },
				],
				nextCursor: page.hasMore ? page.cursor : undefined,
				rows: page.items.map((item) => {
					const log = item.data as EmailLogRecord;
					return {
						when: log.createdAt,
						form: log.formSlug ?? "",
						kind: log.kind,
						to: log.to,
						status: log.status,
						ms: log.durationMs,
						error: log.error ?? "",
						row: log.submissionId
							? rowMenu("log_menu", [{ label: "View submission", value: log.submissionId }])
							: "",
					};
				}),
			}),
		);
	}
	out.push(
		blocks.actions([
			elements.button("clear_log", "Clear log", {
				style: "danger",
				confirm: {
					title: "Clear the email log?",
					text: "Deletes every recorded attempt. Submissions are kept.",
					confirm: "Clear",
					deny: "Cancel",
				},
			}),
		]),
	);
	return { blocks: out, toast: opts.toast };
}

// ---------------------------------------------------------------------------
// CSV view + widget + help

async function viewCsv(ctx: PluginContext, opts: { formId?: string; status?: string }): Promise<BlockResponse> {
	const where: WhereArgs = {};
	if (opts.formId) where.formId = opts.formId;
	if (opts.status && (SUBMISSION_STATUSES as readonly string[]).includes(opts.status))
		where.status = opts.status;
	const esc = (v: unknown) => {
		const s = v == null ? "" : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines = ["id,created_at,form,status,email_status,page,data"];
	let cursor: string | undefined;
	let rows = 0;
	do {
		const page = await ctx.storage.submissions.query({
			where,
			orderBy: { createdAt: "desc" },
			limit: 100,
			cursor,
		});
		for (const item of page.items) {
			const s = item.data as SubmissionRecord;
			lines.push(
				[item.id, s.createdAt, s.formSlug, s.status, s.emailStatus, s.pageUrl ?? "", JSON.stringify(s.data)]
					.map(esc)
					.join(","),
			);
			if (++rows >= 500) break;
		}
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && rows < 500);

	return {
		blocks: [
			blocks.header("Submissions as CSV"),
			blocks.context(`First ${rows} rows matching the current filter. Copy the block below.`),
			{ type: "code", code: lines.join("\n"), language: "ts" },
			blocks.actions([
				elements.link("Back to submissions", { kind: "plugin-page", path: "/submissions" }),
			]),
		],
	};
}

async function viewWidget(ctx: PluginContext): Promise<BlockResponse> {
	const [newCount, failed7d, recent, forms] = await Promise.all([
		ctx.storage.submissions.count({ status: "new" }),
		ctx.storage.email_log.count({
			status: "failed",
			createdAt: { gte: new Date(Date.now() - 7 * 864e5).toISOString() },
		}),
		ctx.storage.submissions.query({ orderBy: { createdAt: "desc" }, limit: 5 }),
		ctx.storage.forms.count({ enabled: true }),
	]);
	const out: Block[] = [
		...providerBanner(ctx),
		blocks.stats([
			{ label: "Unread submissions", value: newCount },
			{ label: "Active forms", value: forms },
			{ label: "Failed emails (7d)", value: failed7d, trend: failed7d > 0 ? "down" : "up" },
		]),
	];
	if (recent.items.length) {
		out.push(
			blocks.table({
				pageActionId: "widget_page",
				columns: [
					{ key: "when", label: "When", format: "relative_time" },
					{ key: "form", label: "Form" },
					{ key: "email", label: "Email", format: "badge" },
				],
				rows: recent.items.map((item) => {
					const s = item.data as SubmissionRecord;
					return { when: s.createdAt, form: s.formName || s.formSlug, email: s.emailStatus };
				}),
			}),
		);
	} else {
		out.push(
			blocks.empty({
				title: "No submissions yet",
				description: "Embed a Contact form block on a page to start collecting entries.",
				size: "sm",
			}),
		);
	}
	out.push(
		blocks.actions([
			elements.link("Open submissions", { kind: "plugin-page", path: "/submissions" }),
			elements.link("Forms", { kind: "plugin-page", path: "/forms" }),
		]),
	);
	return { blocks: out };
}

function viewHelp(): BlockResponse {
	const step = (n: string, t: string) =>
		blocks.context(`${n}. ${t}`);
	return {
		blocks: [
			blocks.header("Setup guide"),
			blocks.section("How it works"),
			blocks.context(
				"Each form is stored on this site. When a visitor submits, the entry is saved under Submissions and a notification email is sent through whichever email provider is active — Cloudflare Email Sending or an SMTP provider via emdash-smtp. The plugin works with both; it never talks to the provider directly.",
			),
			step("1", "Set a default recipient in Plugins > Contact forms > Settings so forms can notify you without a per-form address."),
			step("2", "Create a form here and add its fields. The slug is what connects a page block to this form."),
			step("3", "In the page editor, add a Contact form block and type the slug into its Form field."),
			step("4", "Activate an email provider in Settings > Email and send a test email. Without one, submissions are stored but not emailed."),
			blocks.section("Anti-spam"),
			blocks.context(
				"Every rendered form carries a hidden honeypot field and a timestamp trap; both pretend success to bots. A per-IP hourly limit (Settings) caps floods.",
			),
			blocks.actions([elements.link("Back to forms", { kind: "plugin-page", path: "/forms" })]),
		],
	};
}

// ---------------------------------------------------------------------------
// Dispatch

async function saveUiState(ctx: PluginContext, state: UiState) {
	await ctx.kv.set(FILTER_KEY, state);
}

async function handleBlockAction(ctx: PluginContext, input: BlockAction): Promise<BlockResponse> {
	const [actionId, ...rest] = input.action_id.split(":");
	const arg = rest.join(":");
	const value = typeof input.value === "string" ? input.value : undefined;

	switch (actionId) {
		case "new_form":
			return viewFormNew();
		case "help":
			return viewHelp();
		case "back_forms":
			return viewForms(ctx);
		case "back_edit":
			return viewFormEdit(ctx, arg);
		case "add_field":
			return viewFieldEdit(ctx, String(input.value ?? ""), null);
		case "delete_form": {
			const id = String(input.value ?? "");
			const form = await ctx.storage.forms.get(id) as FormRecord | null;
			if (!form) return viewForms(ctx, fail("Form not found"));
			// Cascade submissions; keep emailLog for the audit trail.
			for (;;) {
				const page = await ctx.storage.submissions.query({ where: { formId: id }, limit: 100 });
				if (page.items.length === 0) break;
				await ctx.storage.submissions.deleteMany(page.items.map((i) => i.id));
			}
			await ctx.storage.forms.delete(id);
			return viewForms(ctx, ok(`Deleted form "${form.name}"`));
		}
		case "form_menu": {
			const [cmd, id] = (value ?? "").split(":");
			const form = await ctx.storage.forms.get(id) as FormRecord | null;
			if (!form) return viewForms(ctx, fail("Form not found"));
			if (cmd === "edit") return viewFormEdit(ctx, id);
			if (cmd === "toggle") {
				form.enabled = !form.enabled;
				form.updatedAt = new Date().toISOString();
				await ctx.storage.forms.put(id, form);
				return viewForms(ctx, ok(`${form.name} ${form.enabled ? "enabled" : "disabled"}`));
			}
			if (cmd === "subs") {
				const state = await uiState(ctx);
				state.submissionFilter = { formId: id };
				await saveUiState(ctx, state);
				return viewSubmissions(ctx);
			}
			return viewForms(ctx);
		}
		case "field_menu": {
			const formId = arg;
			const [cmd, idxRaw] = (value ?? "").split(":");
			const index = Number(idxRaw);
			const form = await ctx.storage.forms.get(formId) as FormRecord | null;
			if (!form) return viewForms(ctx, fail("Form not found"));
			if (!Number.isInteger(index) || !form.fields[index])
				return viewFormEdit(ctx, formId, fail("Field not found"));
			if (cmd === "edit") return viewFieldEdit(ctx, formId, index);
			if (cmd === "del") {
				const [removed] = form.fields.splice(index, 1);
				form.updatedAt = new Date().toISOString();
				await ctx.storage.forms.put(formId, form);
				return viewFormEdit(ctx, formId, ok(`Deleted field "${removed.label}"`));
			}
			if (cmd === "up" || cmd === "down") {
				const swap = cmd === "up" ? index - 1 : index + 1;
				if (swap < 0 || swap >= form.fields.length)
					return viewFormEdit(ctx, formId);
				[form.fields[index], form.fields[swap]] = [form.fields[swap], form.fields[index]];
				form.updatedAt = new Date().toISOString();
				await ctx.storage.forms.put(formId, form);
				return viewFormEdit(ctx, formId);
			}
			return viewFormEdit(ctx, formId);
		}
		case "sub_menu": {
			const [cmd, id] = (value ?? "").split(":");
			if (cmd === "view") return viewSubmission(ctx, id);
			const sub = await ctx.storage.submissions.get(id) as SubmissionRecord | null;
			if (!sub) return viewSubmissions(ctx, { toast: fail("Submission not found") });
			if (cmd === "mark") {
				sub.status = sub.status === "read" ? "new" : "read";
				await ctx.storage.submissions.put(id, sub);
				return viewSubmissions(ctx, { toast: ok(`Marked ${sub.status}`) });
			}
			if (cmd === "archive") {
				sub.status = sub.status === "archived" ? "read" : "archived";
				await ctx.storage.submissions.put(id, sub);
				return viewSubmissions(ctx, { toast: ok(`Marked ${sub.status}`) });
			}
			if (cmd === "resend") return resend(ctx, id, /* returnToList */ true);
			return viewSubmissions(ctx);
		}
		case "mark_sub":
		case "archive_sub": {
			const [id, next] = (value ?? "").split(":");
			const sub = await ctx.storage.submissions.get(id) as SubmissionRecord | null;
			if (!sub) return viewSubmissions(ctx, { toast: fail("Submission not found") });
			sub.status = (SUBMISSION_STATUSES as readonly string[]).includes(next)
				? (next as SubmissionRecord["status"])
				: "read";
			await ctx.storage.submissions.put(id, sub);
			return viewSubmission(ctx, id, ok(`Marked ${sub.status}`));
		}
		case "resend_sub":
			return resend(ctx, String(input.value ?? ""), false);
		case "del_sub": {
			const id = String(input.value ?? "");
			await ctx.storage.submissions.delete(id);
			return viewSubmissions(ctx, { toast: ok("Submission deleted") });
		}
		case "subs_page": {
			const cursor =
				typeof input.value === "object" && input.value !== null
					? (input.value as { cursor?: string }).cursor
					: undefined;
			return viewSubmissions(ctx, { cursor });
		}
		case "log_page": {
			const cursor =
				typeof input.value === "object" && input.value !== null
					? (input.value as { cursor?: string }).cursor
					: undefined;
			return viewLog(ctx, { cursor });
		}
		case "log_menu":
			return value ? viewSubmission(ctx, value) : viewLog(ctx);
		case "csv_view": {
			let opts: { formId?: string; status?: string } = {};
			try {
				opts = JSON.parse(String(input.value ?? "{}"));
			} catch {
				// ignore malformed value
			}
			return viewCsv(ctx, opts);
		}
		case "clear_log": {
			for (;;) {
				const page = await ctx.storage.email_log.query({ limit: 100 });
				if (page.items.length === 0) break;
				await ctx.storage.email_log.deleteMany(page.items.map((i) => i.id));
			}
			return viewLog(ctx, { toast: ok("Email log cleared") });
		}
		case "widget_page":
			return viewWidget(ctx);
		default:
			return viewForms(ctx, fail(`Unknown action "${input.action_id}"`));
	}
}

async function resend(ctx: PluginContext, id: string, returnToList: boolean): Promise<BlockResponse> {
	const sub = await ctx.storage.submissions.get(id) as SubmissionRecord | null;
	if (!sub) return viewSubmissions(ctx, { toast: fail("Submission not found") });
	const form = await ctx.storage.forms.get(sub.formId) as FormRecord | null;
	if (!form) return viewSubmission(ctx, id, fail("The form this submission belongs to was deleted"));
	const settings = await readSettings(ctx);
	const result = await sendSubmissionEmail(ctx, form, id, sub, settings, "resend");
	sub.emailStatus = result.status;
	sub.emailAttempts += 1;
	sub.emailError = result.error;
	await ctx.storage.submissions.put(id, sub);
	const toast =
		result.status === "sent"
			? ok("Email re-sent")
			: fail(`Resend failed: ${result.error ?? result.status}`);
	return returnToList ? viewSubmissions(ctx, { toast }) : viewSubmission(ctx, id, toast);
}

async function handleFormSubmit(ctx: PluginContext, input: FormSubmit): Promise<BlockResponse> {
	const [actionId, ...rest] = input.action_id.split(":");
	const arg = rest.join(":");
	const values = input.values ?? {};

	switch (actionId) {
		case "form_create": {
			const form = readMetaValues(values);
			if (!form.name) return viewFormNew(fail("Name is required"));
			const dupe = await ctx.storage.forms.count({ slug: form.slug });
			if (dupe > 0) return viewFormNew(fail(`Slug "${form.slug}" is already in use`));
			const id = ulid();
			await ctx.storage.forms.put(id, form);
			return viewFormEdit(ctx, id, ok(`Form "${form.name}" created — now add its fields`));
		}
		case "form_save": {
			const existing = await ctx.storage.forms.get(arg) as FormRecord | null;
			if (!existing) return viewForms(ctx, fail("Form not found"));
			const next = readMetaValues(values, existing);
			if (!next.name) return viewFormEdit(ctx, arg, fail("Name is required"));
			if (next.slug !== existing.slug) {
				const dupe = await ctx.storage.forms.count({ slug: next.slug });
				if (dupe > 0) return viewFormEdit(ctx, arg, fail(`Slug "${next.slug}" is already in use`));
				ctx.log.warn(`Form slug changed ${existing.slug} -> ${next.slug}; update page blocks`, { formId: arg });
			}
			await ctx.storage.forms.put(arg, next);
			return viewFormEdit(ctx, arg, ok("Form saved"));
		}
		case "field_save": {
			const [formId, idxRaw] = arg.split(":");
			const index = idxRaw === undefined || idxRaw === "" ? null : Number(idxRaw);
			const form = await ctx.storage.forms.get(formId) as FormRecord | null;
			if (!form) return viewForms(ctx, fail("Form not found"));
			if (index !== null && (!Number.isInteger(index) || index < 0 || index >= form.fields.length))
				return viewFormEdit(ctx, formId, fail("Field not found"));
			const field = readFieldValues(values);
			const err = validateFieldInput(field, form, index);
			if (err) return viewFieldEdit(ctx, formId, index, fail(err));
			if (index === null) form.fields.push(field);
			else form.fields[index] = field;
			form.updatedAt = new Date().toISOString();
			await ctx.storage.forms.put(formId, form);
			return viewFormEdit(ctx, formId, ok(index === null ? `Added field "${field.label}"` : "Field saved"));
		}
		case "subs_filter": {
			const state = await uiState(ctx);
			state.submissionFilter = {
				formId: str(values.formId) || undefined,
				status: str(values.status) || undefined,
				emailStatus: str(values.emailStatus) || undefined,
			};
			await saveUiState(ctx, state);
			return viewSubmissions(ctx);
		}
		case "log_filter": {
			const state = await uiState(ctx);
			state.logFilter = { status: str(values.status) || undefined };
			await saveUiState(ctx, state);
			return viewLog(ctx);
		}
		default:
			return viewForms(ctx, fail(`Unknown form action "${input.action_id}"`));
	}
}

function readFieldValues(values: Record<string, unknown>): FormFieldDef {
	const options = str(values.options)
		.split("\n")
		.map((o) => o.trim())
		.filter(Boolean);
	return {
		label: str(values.label),
		key: str(values.key),
		type: isFieldType(str(values.type)) ? str(values.type) as FormFieldDef["type"] : "text",
		required: values.required === true,
		placeholder: str(values.placeholder) || undefined,
		options: options.length ? options : undefined,
		help: str(values.help) || undefined,
	};
}

function validateFieldInput(
	field: FormFieldDef,
	form: FormRecord,
	editingIndex: number | null,
): string | null {
	if (!field.label) return "Label is required";
	if (!KEY_PATTERN.test(field.key))
		return "Key must start with a letter and use only lowercase letters, numbers and underscores";
	if (field.type === "select" && !field.options?.length)
		return "Select fields need at least one option";
	const clash = form.fields.findIndex(
		(f, i) => f.key === field.key && i !== editingIndex,
	);
	if (clash !== -1) return `Key "${field.key}" is already used by another field`;
	return null;
}

export async function handleAdminInteraction(
	routeCtx: SandboxedRouteContext,
	ctx: PluginContext,
): Promise<BlockResponse> {
	const input = routeCtx.input as PageLoad | BlockAction | FormSubmit;
	try {
		if (input.type === "page_load") {
			const page = input.page;
			if (page === "widget:contact-forms" || page.startsWith("widget:")) return viewWidget(ctx);
			if (page === "/submissions") return viewSubmissions(ctx);
			if (page === "/log") return viewLog(ctx);
			return viewForms(ctx);
		}
		if (input.type === "block_action") return handleBlockAction(ctx, input);
		if (input.type === "form_submit") return handleFormSubmit(ctx, input);
		return { blocks: [blocks.banner({ variant: "error", title: "Unknown interaction" })] };
	} catch (error) {
		ctx.log.error("Admin interaction failed", {
			type: input.type,
			action: "action_id" in input ? input.action_id : undefined,
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			blocks: [
				blocks.banner({
					variant: "error",
					title: "Something went wrong",
					description: error instanceof Error ? error.message : String(error),
				}),
			],
		};
	}
}
