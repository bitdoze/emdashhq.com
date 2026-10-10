// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { enhanceCapacityForm } from "../site/capacity-client";

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); document.body.innerHTML = ""; });

const capacity = (remaining: number | null, isClosed = remaining === 0) => ({ remaining, isClosed, totalAllowed: remaining === null ? null : 2, closedMessage: "Workshop full" });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 20)); };

function mount(show = true) {
	document.body.innerHTML = `<form action="https://example.com/submit" data-capacity-url="https://example.com/capacity" data-remaining="2" data-show-spots="${show}" data-spots-label="Only {remaining} left" data-closed-message="Workshop full" data-success-message="Signed up">
	<input name="cf_ts" type="hidden"><p class="cf-capacity"></p><p class="cf-capacity-closed" hidden></p><p class="cf-feedback" hidden></p>
	<fieldset class="cf-fields"><input name="name" value="Ada"></fieldset><button type="submit" class="cf-submit">Register</button></form>`;
	const form = document.querySelector("form")!;
	cleanup = enhanceCapacityForm(form);
	return form;
}

describe("capacity frontend", () => {
	it("renders the label and closes when polling finds the last spot taken", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(response(capacity(2))).mockResolvedValue(response(capacity(0)));
		vi.stubGlobal("fetch", fetch);
		const form = mount();
		await settle();
		expect(form.querySelector(".cf-capacity")!.textContent).toBe("Only 2 left");
		window.dispatchEvent(new Event("focus"));
		await settle();
		expect(form.querySelector("fieldset")!.disabled).toBe(true);
		expect((form.querySelector(".cf-submit") as HTMLElement).hidden).toBe(true);
		expect(form.querySelector(".cf-capacity-closed")!.textContent).toBe("Workshop full");
	});
	it("hides the counter when configured off", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(capacity(2))));
		const form = mount(false);
		await settle();
		expect((form.querySelector(".cf-capacity") as HTMLElement).hidden).toBe(true);
	});
	it("updates after success and prevents duplicate submission", async () => {
		let submitted = false;
		const fetch = vi.fn().mockImplementation((_url, init) => Promise.resolve(response(init?.method === "POST"
			? (submitted = true, { success: true, message: "Signed up", capacity: capacity(1) }) : capacity(submitted ? 1 : 2))));
		vi.stubGlobal("fetch", fetch);
		const form = mount();
		await settle();
		form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
		form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
		await settle();
		expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
		expect(form.querySelector(".cf-feedback")!.textContent).toBe("Signed up");
		expect(form.querySelector(".cf-capacity")!.textContent).toBe("Only 1 left");
		expect(form.querySelector("fieldset")!.disabled).toBe(true);
	});
	it("locks immediately on a server capacity conflict", async () => {
		vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => Promise.resolve(response(init?.method === "POST"
			? { error: "capacity_reached", message: "Camp full" } : capacity(0), init?.method === "POST" ? 409 : 200))));
		const form = mount();
		// Submit before the initial poll resolves to model a competing visitor.
		form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
		await settle();
		expect(form.querySelector("fieldset")!.disabled).toBe(true);
		expect((form.querySelector(".cf-submit") as HTMLElement).hidden).toBe(true);
		expect(form.querySelector(".cf-feedback")!.textContent).toBe("Camp full");
		expect(form.querySelector(".cf-feedback")!.getAttribute("role")).toBe("alert");
	});
	it("preserves answers and permits correction after validation errors", async () => {
		vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) => Promise.resolve(response(init?.method === "POST"
			? { success: false, message: "Check name", fields: ["name"] } : capacity(2), init?.method === "POST" ? 422 : 200))));
		const form = mount();
		form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
		await settle();
		expect((form.elements.namedItem("name") as HTMLInputElement).value).toBe("Ada");
		expect((form.elements.namedItem("name") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
		expect(form.querySelector("fieldset")!.disabled).toBe(false);
		expect((form.querySelector(".cf-submit") as HTMLButtonElement).disabled).toBe(false);
	});
	it("ignores a stale capacity poll that completes after submission starts", async () => {
		let resolvePoll: (value: Response) => void = () => {};
		const fetch = vi.fn().mockImplementation((_url, init) => init?.method === "POST"
			? Promise.resolve(response({ success: true, capacity: capacity(0) }))
			: new Promise<Response>(resolve => { resolvePoll = resolve; }));
		vi.stubGlobal("fetch", fetch);
		const form = mount();
		form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
		await settle();
		resolvePoll(response(capacity(2)));
		await settle();
		expect(form.querySelector(".cf-capacity")!.textContent).toBe("Only 0 left");
		expect((form.querySelector(".cf-submit") as HTMLElement).hidden).toBe(true);
	});
});
