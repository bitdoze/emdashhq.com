/**
 * Maps the icon names offered in the seed's select fields to Phosphor icons.
 * Every icon used here must also be listed in the `include` option of
 * `astro-iconset` in astro.config.mjs, or it will not ship in the bundle.
 */
export const ICON_MAP: Record<string, string> = {
	zap: "ph:lightning",
	shield: "ph:shield-check",
	users: "ph:users-three",
	chart: "ph:chart-bar",
	code: "ph:code",
	database: "ph:database",
	globe: "ph:globe",
	heart: "ph:heart",
	star: "ph:star",
	check: "ph:check-circle",
	lock: "ph:lock",
	clock: "ph:clock",
	cloud: "ph:cloud",
	rocket: "ph:rocket-launch",
	palette: "ph:palette",
	plug: "ph:plug",
	swap: "ph:swap",
	lifebuoy: "ph:lifebuoy",
	wrench: "ph:wrench",
	book: "ph:book-open-text",
	video: "ph:video",
	gift: "ph:gift",
	mail: "ph:envelope",
	youtube: "ph:youtube-logo",
	github: "ph:github-logo",
	x: "ph:x-logo",
};

export const FALLBACK_ICON = "ph:sparkle";

export function iconFor(name: string | undefined): string {
	return (name && ICON_MAP[name]) || FALLBACK_ICON;
}
