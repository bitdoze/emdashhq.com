# Installation

## 1. Install the plugin

Install `@bitdoze.com/emdashhq-widgets` from the EmDash plugin registry, or link it as a file dependency and register it under `sandboxed:` in `astro.config.mjs`:

```ts
import widgetsPlugin from "emdashhq-widgets";

emdash({
	// ...
	sandboxed: [widgetsPlugin],
	sandboxRunner: sandbox(), // @emdash-cms/cloudflare
});
```

The plugin asks for `content:read` and `schema:read` — approve them so the Latest posts widget and the posts route work. Static widgets render without them.

## 2. Add the block types to your schema

Copy `site/block-types/*.json` into your seed file's `blockTypes` array (or POST each file's contents to `/_emdash/api/schema/block-types` on a live site), then list the types in the `allowedTypes` of whichever `blocks` fields should accept them — for example `pages.content` or `posts.body`.

## 3. Register the renderers

Copy `site/components/*.astro`, `site/components/config.ts`, `site/components/icons.ts`, `site/widget-components.ts` and `site/WidgetBlocks.astro` into your project, then either render `WidgetBlocks` for a widget-only field:

```astro
<WidgetBlocks value={post.data.body} />
```

or spread `widgetComponents` into your existing map:

```ts
const blockComponents = defineBlockComponents<PageContentBlock>({
	marketing_hero: Hero,
	// ...
	...widgetComponents,
});
```

## 4. Configure

Settings live under **Plugins → Content Widgets → Settings**:

- **Privacy-enhanced YouTube embeds** — serves players from `youtube-nocookie.com` (default on).
- **Affiliate disclosure** — small-print line inside Product box widgets; empty hides it.
- **Posts collection** — default collection for the Latest posts widget and `posts` route.
