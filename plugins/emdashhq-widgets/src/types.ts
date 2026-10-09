import type { PluginContext } from "emdash/plugin";

export interface PluginSettings {
	youtubeNoCookie: boolean;
	affiliateDisclosure: string;
	postsCollection: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	youtubeNoCookie: true,
	affiliateDisclosure:
		"This post contains affiliate links. If you buy through them, the site may earn a commission at no extra cost to you.",
	postsCollection: "posts",
};

/** Public subset of the settings, returned by the `config` route. */
export interface PublicWidgetConfig {
	youtubeNoCookie: boolean;
	affiliateDisclosure: string;
	postsCollection: string;
}

/** One entry returned by the `posts` route. */
export interface PublicPostItem {
	title: string;
	url: string;
	excerpt?: string;
	publishedAt?: string;
	collection: string;
}

const SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function readSettingsValue(entries: { key: string; value: unknown }[]): PluginSettings {
	const raw = new Map(entries.map(({ key, value }) => [key, value]));
	return {
		youtubeNoCookie: raw.get("youtubeNoCookie") !== false,
		affiliateDisclosure:
			typeof raw.get("affiliateDisclosure") === "string"
				? (raw.get("affiliateDisclosure") as string)
				: DEFAULT_SETTINGS.affiliateDisclosure,
		postsCollection:
			typeof raw.get("postsCollection") === "string" &&
			SLUG_PATTERN.test(raw.get("postsCollection") as string)
				? (raw.get("postsCollection") as string)
				: DEFAULT_SETTINGS.postsCollection,
	};
}

export async function readSettings(ctx: PluginContext): Promise<PluginSettings> {
	return readSettingsValue(await ctx.settings.list());
}

export function toPublicConfig(settings: PluginSettings): PublicWidgetConfig {
	return {
		youtubeNoCookie: settings.youtubeNoCookie,
		affiliateDisclosure: settings.affiliateDisclosure,
		postsCollection: settings.postsCollection,
	};
}
