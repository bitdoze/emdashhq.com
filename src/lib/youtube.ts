const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the video ID from a watch, youtu.be, embed or shorts URL. */
export function parseYouTubeId(input: string | undefined | null): string | null {
	if (!input) return null;
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}
	const host = url.hostname.replace(/^www\./, "");
	let id: string | null = null;
	if (host === "youtu.be") {
		id = url.pathname.slice(1).split("/")[0] ?? null;
	} else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
		id = url.searchParams.get("v");
		if (!id) {
			const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
			id = match?.[1] ?? null;
		}
	}
	return id && VIDEO_ID.test(id) ? id : null;
}

export function youTubeThumbnail(id: string): string {
	return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
