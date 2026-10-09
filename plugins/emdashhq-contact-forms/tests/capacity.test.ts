import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "emdash/plugin";
import { acceptSubmission, recoverCapacity } from "../src/capacity";
import type { FormRecord, SubmissionRecord } from "../src/types";

// Fault injection around the atomic commit. Concurrency itself is also covered
// against the production storage bridge in plugin.test.ts.
function context() {
	let value: unknown = null;
	let revision = 0;
	const inbox = new Map<string, unknown>();
	const capacity = {
		getVersioned: vi.fn(async () => value === null ? null : { value, revision: String(revision) }),
		compareAndSet: vi.fn(async (_id: string, expected: string | null, next: unknown) => {
			if (expected !== (value === null ? null : String(revision))) return { applied: false };
			value = next;
			return { applied: true, revision: String(++revision) };
		}),
	};
	const submissions = {
		count: vi.fn(async () => 0),
		exists: vi.fn(async (id: string) => inbox.has(id)),
		compareAndSet: vi.fn(async (id: string, _expected: null, next: unknown) => {
			if (inbox.has(id)) return { applied: false };
			inbox.set(id, next);
			return { applied: true, revision: "inbox" };
		}),
	};
	const ctx = { storage: { capacity, submissions }, log: { error: vi.fn() } } as unknown as PluginContext;
	return { ctx, capacity, submissions, inbox, value: () => value };
}
const form: FormRecord = {
	name: "Signup", slug: "signup", enabled: true, fields: [],
	maxSubmissions: 1, spotsRemainingLabel: null, closedMessage: null, showSpotsRemaining: false,
	createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const submission: SubmissionRecord = {
	formId: "form_1", formSlug: "signup", formName: "Signup", data: { name: "Ada" },
	fieldLabels: { name: "Name" }, status: "new", emailStatus: "pending", emailAttempts: 0,
	createdAt: "2026-01-01T00:00:00.000Z",
};

describe("atomic capacity failures", () => {
	it("does not consume a spot if acceptance fails before the commit", async () => {
		const h = context();
		h.capacity.compareAndSet.mockRejectedValueOnce(new Error("Database unavailable"));
		await expect(acceptSubmission(h.ctx, "form_1", form, "entry_1", submission)).rejects.toThrow("Database unavailable");
		expect(h.value()).toBeNull();
		expect(h.inbox.size).toBe(0);
	});
	it("keeps count and full entry durably together when the inbox write fails", async () => {
		const h = context();
		h.submissions.compareAndSet.mockRejectedValueOnce(new Error("Interrupted inbox write"));
		expect(await acceptSubmission(h.ctx, "form_1", form, "entry_1", submission)).toMatchObject({ accepted: true, projected: false });
		expect(h.value()).toEqual({ count: 1, pending: { id: "entry_1", submission } });
		expect(h.inbox.size).toBe(0);
		await recoverCapacity(h.ctx, "form_1");
		expect(h.inbox.get("entry_1")).toBe(submission);
		expect(h.value()).toEqual({ count: 1 });
		expect(await acceptSubmission(h.ctx, "form_1", form, "entry_2", submission)).toMatchObject({ accepted: false });
	});
	it("does not overwrite an existing inbox entry during recovery", async () => {
		const h = context();
		h.submissions.compareAndSet.mockRejectedValueOnce(new Error("Interrupted"));
		await acceptSubmission(h.ctx, "form_1", form, "entry_1", submission);
		const edited = { ...submission, status: "read" };
		h.inbox.set("entry_1", edited);
		await recoverCapacity(h.ctx, "form_1");
		expect(h.inbox.get("entry_1")).toBe(edited);
		expect(h.value()).toEqual({ count: 1 });
	});
});
