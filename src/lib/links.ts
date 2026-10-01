import { sanitizeHref } from "emdash";

export interface LinkAttrs {
	href: string;
	target?: "_blank";
	rel?: string;
}

/** Sanitizes an editor-supplied URL and opens absolute web links in a new tab. */
export function linkAttrs(raw: string | undefined | null): LinkAttrs {
	const href = sanitizeHref(raw);
	if (/^https?:\/\//i.test(href)) {
		return { href, target: "_blank", rel: "noopener noreferrer" };
	}
	return { href };
}

/** Returns a link only when both the label and the URL are filled in. */
export function optionalLink(
	label: string | undefined | null,
	url: string | undefined | null,
): (LinkAttrs & { label: string }) | undefined {
	if (!label || !url) return undefined;
	return { label, ...linkAttrs(url) };
}

/** Compare canonical paths, including absolute links to this same origin. */
export function isCurrentPath(raw: string, current: URL): boolean {
	const safe = sanitizeHref(raw);
	if (!safe || safe.startsWith("#")) return false;
	if (!URL.canParse(safe, current)) return false;
	const link = new URL(safe, current);
	if (link.origin !== current.origin) return false;
	const path = link.pathname.replace(/\/+$/, "") || "/";
	const here = current.pathname.replace(/\/+$/, "") || "/";
	return here === path || (path !== "/" && here.startsWith(`${path}/`));
}
