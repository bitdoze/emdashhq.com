/**
 * icons.ts — small inline SVG set shared by the widget components.
 * Stroke icons on a 24x24 grid, currentColor, dependency-free so the
 * components stay portable to any EmDash site.
 */

export const WIDGET_ICON_NAMES = [
	"arrow-right",
	"arrow-up-right",
	"download",
	"play",
	"check",
	"x",
	"star",
	"info",
	"rocket",
	"book",
	"github",
	"mail",
	"terminal",
] as const;

export type WidgetIconName = (typeof WIDGET_ICON_NAMES)[number];

const PATHS: Record<WidgetIconName, string> = {
	"arrow-right": '<path d="M4 12h16m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
	"arrow-up-right": '<path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
	download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
	play: '<path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" stroke="none"/>',
	check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
	x: '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
	star: '<path d="m12 4 2.4 5 5.3.7-3.9 3.7 1 5.3-4.8-2.6-4.8 2.6 1-5.3-3.9-3.7 5.3-.7L12 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
	info: '<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
	rocket: '<path d="M12 15.5c-1.5.5-3 .5-4.5-.5-.5-1.5-.5-3-.5-4.5 1-4 4-7 9-7.5-.5 5-2 9-4 10l-1.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="13.5" cy="9.5" r="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 14.5c-1.5 1-2 3.5-2 5 1.5 0 4-.5 5-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
	book: '<path d="M12 6.5C10.5 5 8 4.5 5 4.5v13c3 0 5.5.5 7 2 1.5-1.5 4-2 7-2v-13c-3 0-5.5.5-7 2zM12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
	github: '<path d="M12 3.5a8.5 8.5 0 0 0-2.7 16.6c.4.1.6-.2.6-.4v-1.4c-2.4.5-2.9-1.2-2.9-1.2-.4-1-.9-1.2-.9-1.2-.8-.5.1-.5.1-.5.9.1 1.3.9 1.3.9.8 1.3 2 .9 2.5.7.1-.6.3-1 .6-1.2-1.9-.2-3.9-1-3.9-4.2 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.3.9a8 8 0 0 1 4.2 0c1.6-1.1 2.3-.9 2.3-.9.5 1.2.2 2.1.1 2.3.6.6.9 1.4.9 2.3 0 3.2-2 4-3.9 4.2.3.3.6.8.6 1.7v2.4c0 .3.2.5.6.4A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" stroke="none"/>',
	mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
	terminal: '<rect x="3" y="4.5" width="18" height="15" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m7 9 3 3-3 3m5.5 0H17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** Inline SVG for a named icon, or null when unset/unknown. */
export function widgetIcon(name: string | null | undefined): string | null {
	if (!name || !(name in PATHS)) return null;
	return `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">${PATHS[name as WidgetIconName]}</svg>`;
}
