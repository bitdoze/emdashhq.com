/** Turns a select value such as "getting-started" into "Getting started". */
export function labelize(value: string | undefined | null): string {
	if (!value) return "";
	const text = value.replace(/[-_]+/g, " ").trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Splits a multiline text value into trimmed, non-empty lines. */
export function lines(value: string | undefined | null): string[] {
	return (value ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

/** Shows the host of a URL without "www.", or an empty string if it cannot be parsed. */
export function hostOf(url: string | undefined | null): string {
	if (!url) return "";
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
