import { z } from "zod";
import type { PluginContext } from "emdash/plugin";
import type { FormRecord, SubmissionRecord } from "./types";

export const capacitySettingsSchema = z.object({
	maxSubmissions: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null),
	spotsRemainingLabel: z.string().trim().max(500).nullable().default(null),
	closedMessage: z.string().trim().max(2000).nullable().default(null),
	showSpotsRemaining: z.boolean().default(false),
});
export type CapacitySettings = z.infer<typeof capacitySettingsSchema>;
export interface CapacityStatus {
	remaining: number | null;
	isClosed: boolean;
	totalAllowed: number | null;
	closedMessage: string;
}

interface CapacityLedger {
	count: number;
	// Atomic acceptance includes the entry, not just a reservation. An interrupted
	// inbox write can therefore be recovered without losing data or freeing a spot.
	pending?: { id: string; submission: SubmissionRecord };
}
const MAX_ATTEMPTS = 32;
export const DEFAULT_CLOSED_MESSAGE = "This form has reached capacity and is no longer accepting submissions.";

export function capacityStatus(form: FormRecord, count: number): CapacityStatus {
	const settings = capacitySettingsSchema.parse(form);
	const remaining = settings.maxSubmissions === null ? null : Math.max(0, settings.maxSubmissions - count);
	return {
		remaining,
		isClosed: !form.enabled || remaining === 0,
		totalAllowed: settings.maxSubmissions,
		closedMessage: settings.closedMessage || DEFAULT_CLOSED_MESSAGE,
	};
}

async function ledger(ctx: PluginContext, formId: string) {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const current = await ctx.storage.capacity.getVersioned(formId);
		if (current) return { value: current.value as CapacityLedger, revision: current.revision };
		// Existing forms start from retained submissions. Historical deleted entries
		// cannot be reconstructed; once initialized, this lifetime count never shrinks.
		const count = await ctx.storage.submissions.count({ formId });
		await ctx.storage.capacity.compareAndSet(formId, null, { count });
	}
	throw new Error("Capacity changed repeatedly; try again later");
}

export async function readCapacity(ctx: PluginContext, formId: string, form: FormRecord): Promise<CapacityStatus> {
	return capacityStatus(form, (await ledger(ctx, formId)).value.count);
}

/** Idempotent projection: never overwrite an inbox record edited by an admin. */
export async function recoverCapacity(ctx: PluginContext, formId: string): Promise<boolean> {
	const current = await ctx.storage.capacity.getVersioned(formId);
	const value = current?.value as CapacityLedger | undefined;
	if (!current || !value?.pending) return true;
	await ctx.storage.submissions.compareAndSet(value.pending.id, null, value.pending.submission);
	const cleared = await ctx.storage.capacity.compareAndSet(formId, current.revision, { count: value.count });
	return cleared.applied;
}

export async function acceptSubmission(
	ctx: PluginContext,
	formId: string,
	form: FormRecord,
	id: string,
	submission: SubmissionRecord,
): Promise<{ accepted: boolean; capacity: CapacityStatus; projected: boolean }> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const current = await ledger(ctx, formId);
		if (current.value.pending) {
			await recoverCapacity(ctx, formId);
			continue;
		}
		const capacity = capacityStatus(form, current.value.count);
		if (capacity.isClosed) return { accepted: false, capacity, projected: false };
		if (current.value.count >= Number.MAX_SAFE_INTEGER) throw new Error("Submission counter is exhausted");
		const count = current.value.count + 1;
		const committed = await ctx.storage.capacity.compareAndSet(formId, current.revision, {
			count,
			pending: { id, submission },
		} satisfies CapacityLedger);
		if (!committed.applied) continue;
		let projected = false;
		try {
			await recoverCapacity(ctx, formId);
			projected = await ctx.storage.submissions.exists(id);
		} catch (error) {
			// Acceptance is already durable. Report success, keep the outbox for the
			// next request/cron, and let the admin resend any undelivered notification.
			ctx.log.error("Accepted submission awaiting inbox recovery", { formId, submissionId: id, error: String(error) });
		}
		return { accepted: true, capacity: capacityStatus(form, count), projected };
	}
	throw new Error("Capacity changed repeatedly; try again later");
}
