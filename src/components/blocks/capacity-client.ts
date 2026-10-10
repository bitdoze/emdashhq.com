interface CapacityStatus {
	remaining: number | null;
	isClosed: boolean;
	totalAllowed: number | null;
	closedMessage: string;
}

/** Progressive enhancement. The submit route remains authoritative without JS. */
export function enhanceCapacityForm(form: HTMLFormElement): () => void {
	const fields = form.querySelector<HTMLFieldSetElement>(".cf-fields")!;
	const submit = form.querySelector<HTMLButtonElement>(".cf-submit")!;
	const badge = form.querySelector<HTMLElement>(".cf-capacity")!;
	const closedNote = form.querySelector<HTMLElement>(".cf-capacity-closed")!;
	const feedback = form.querySelector<HTMLElement>(".cf-feedback")!;
	const timestamp = form.querySelector<HTMLInputElement>('[name="cf_ts"]');
	if (timestamp) timestamp.value = String(Date.now());
	let remaining = form.dataset.remaining === "" ? null : Number(form.dataset.remaining);
	let closed = fields.disabled;
	let busy = false;
	let completed = false;
	let disposed = false;
	let generation = 0;
	let polling = false;
	const lifetime = new AbortController();
	const label = form.dataset.spotsLabel || "{remaining} spots remaining";
	const showBadge = form.dataset.showSpots === "true";

	function render(status: CapacityStatus) {
		const focusWasInFields = fields.contains(document.activeElement);
		remaining = status.remaining;
		closed = status.isClosed || remaining === 0;
		badge.hidden = !showBadge || remaining === null;
		badge.textContent = remaining === null ? "" : label.replaceAll("{remaining}", String(remaining));
		fields.disabled = closed || completed;
		const challenge = form.querySelector<HTMLElement>(".cf-turnstile");
		if (challenge) challenge.hidden = closed || completed;
		submit.hidden = closed || completed;
		submit.disabled = busy || closed || completed;
		closedNote.hidden = !closed;
		closedNote.textContent = status.closedMessage;
		if (closed && focusWasInFields) { closedNote.tabIndex = -1; closedNote.focus(); }
	}

	function message(text: string, error = false) {
		feedback.textContent = text;
		feedback.hidden = false;
		feedback.classList.toggle("cf-err", error);
		feedback.setAttribute("role", error ? "alert" : "status");
		feedback.focus();
	}

	async function poll() {
		if (disposed || polling || busy || document.hidden || !form.isConnected) return;
		const version = generation;
		polling = true;
		try {
			const response = await fetch(form.dataset.capacityUrl!, {
				cache: "no-store", signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]),
			});
			if (disposed || version !== generation) return;
			if (response.status === 404) {
				render({ remaining, totalAllowed: null, isClosed: true, closedMessage: "This form is not available right now." });
				return;
			}
			if (!response.ok) return;
			const status = await response.json() as CapacityStatus;
			if (!disposed && version === generation) render(status);
		} catch {
			// Keep the last known capacity on transient errors. A post always checks
			// the authoritative count; never auto-retry a submission.
		} finally { polling = false; }
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || closed || completed || !form.reportValidity()) return;
		const body = new FormData(form);
		busy = true;
		generation++;
		submit.disabled = true;
		form.setAttribute("aria-busy", "true");
		try {
			const response = await fetch(form.action, {
				method: "POST", body, headers: { accept: "application/json" },
				signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(30000)]),
			});
			const result = await response.json() as {
				success?: boolean; status?: string; error?: string; message?: string;
				fields?: string[]; capacity?: CapacityStatus;
			};
			if (disposed) return;
			if (result.error === "capacity_reached") {
				const text = result.message || form.dataset.closedMessage!;
				render({ remaining: 0, isClosed: true, totalAllowed: null, closedMessage: text });
				message(text, true);
			} else if (response.ok && result.success) {
				completed = true;
				// Update immediately, then reconcile with the server's confirmed count.
				if (result.capacity) {
					if (remaining !== null) remaining = Math.max(0, remaining - 1);
					render({ ...result.capacity, remaining: remaining ?? result.capacity.remaining });
					render(result.capacity);
				} else {
					fields.disabled = true;
					submit.hidden = true;
				}
				message(result.message || form.dataset.successMessage!);
			} else {
				message(result.message || "Your submission could not be confirmed. Please check with the organizer before trying again.", true);
				for (const input of form.querySelectorAll<HTMLElement>(".cf-fields input, .cf-fields textarea, .cf-fields select")) {
					const invalid = result.fields?.includes(input.getAttribute("name") || "") ?? false;
					input.setAttribute("aria-invalid", String(invalid));
					input.closest(".cf-field")?.classList.toggle("cf-field-bad", invalid);
				}
			}
		} catch {
			if (!disposed) message("Your submission could not be confirmed. Please check with the organizer before trying again.", true);
		} finally {
			busy = false;
			submit.disabled = closed || completed;
			form.removeAttribute("aria-busy");
			void poll();
		}
	}

	form.addEventListener("submit", onSubmit);
	document.addEventListener("visibilitychange", poll);
	window.addEventListener("focus", poll);
	const interval = window.setInterval(poll, 15000);
	void poll();
	return () => {
		disposed = true;
		lifetime.abort();
		window.clearInterval(interval);
		form.removeEventListener("submit", onSubmit);
		document.removeEventListener("visibilitychange", poll);
		window.removeEventListener("focus", poll);
	};
}

export function initializeCapacityForms() {
	const cleanups = Array.from(document.querySelectorAll<HTMLFormElement>("form[data-capacity-url]"), enhanceCapacityForm);
	return () => cleanups.forEach(cleanup => cleanup());
}
