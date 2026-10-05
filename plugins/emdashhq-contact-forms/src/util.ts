const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number, len: number): string {
	let str = "";
	for (let i = len; i > 0; i--) {
		const mod = now % 32;
		str = ENCODING[mod] + str;
		now = (now - mod) / 32;
	}
	return str;
}

function encodeRandom(len: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(len));
	let str = "";
	for (let i = 0; i < len; i++) str += ENCODING[bytes[i] % 32];
	return str;
}

/**
 * ULID: 48-bit time + 80-bit random, Crockford base32.
 * Vendored because sandboxed plugins cannot import `emdash`.
 */
export function ulid(): string {
	return encodeTime(Date.now(), 10) + encodeRandom(16);
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
