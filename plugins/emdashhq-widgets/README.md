# Content Widgets for EmDash

Article widgets — notices, accordions, tabs, checklists, product boxes, embeds, quotes, tables of contents and more — as `blocks`-field block types for [EmDash](https://emdashcms.com) sites. Modeled on the widget set used by [bitdoze.com](https://bitdoze.com) tutorials.

## Widgets

| Block type | What it renders |
| --- | --- |
| `widget_prose` | Rich text section (Portable Text) |
| `widget_notice` | Info / success / warning / danger callout |
| `widget_accordion` | Collapsible sections (native `<details>`, no JS needed) |
| `widget_tabs` | Tabbed panels with arrow-key navigation |
| `widget_checklist` | Checkmarked list |
| `widget_steps` | Numbered how-to steps with a connected rail |
| `widget_button` | CTA link (icon, solid/outline, aligned, new-tab aware) |
| `widget_youtube` | Click-to-play facade; optional `youtube-nocookie.com` embeds |
| `widget_embed` | Generic iframe embed (16:9, 4:3, 1:1, 9:16) |
| `widget_image` | Figure with caption, optional wide breakout |
| `widget_code` | Code block: language label, filename, copy button |
| `widget_product` | Review/affiliate card: rating, pros/cons, price, CTA, disclosure |
| `widget_cards` | Grid of linked cards with optional icons |
| `widget_quote` | Pull quote with attribution |
| `widget_facts` | Key/value spec table |
| `widget_toc` | Auto-built table of contents from article headings |
| `widget_series` | Ordered multi-part post navigation |
| `widget_latest_posts` | Live latest-posts list via the plugin's `posts` route |
| `widget_divider` | Section break (line, dots or space) |

Buttons and link cards accept an icon from a small built-in set (arrow, download, play, check, star, info, rocket, book, GitHub, mail, terminal) — rendered as inline SVG, no icon library required.

## Install

1. Install `@bitdoze.com/emdashhq-widgets` from the EmDash registry (or link it locally and register it under `sandboxed:` in `astro.config.mjs`).
2. Copy `site/block-types/*.json` into your seed's `blockTypes`, or POST each to `/_emdash/api/schema/block-types` on a live site. Allow the types on your `blocks` fields' `allowedTypes`.
3. Copy `site/components/` + `site/widget-components.ts` into your project and spread `widgetComponents` into your `defineBlockComponents()` map — or render `<WidgetBlocks value={...}>` for a widget-only field.

See **Plugins → Content Widgets → Setup guide** in the admin for the same steps with the live capability status.

## Plugin routes

- `GET /_emdash/api/plugins/emdashhq-widgets/config` — public widget settings (`youtubeNoCookie`, `affiliateDisclosure`, `postsCollection`). Cached 60s.
- `GET /_emdash/api/plugins/emdashhq-widgets/posts?collection=&limit=&exclude=` — newest published entries with resolved public URLs. Requires the `content:read` + `schema:read` capabilities; `limit` clamps to 20, `exclude` skips a slug/id (the widget passes the current post's slug).

Components call these in-process via `Astro.locals.emdash.handlePublicPluginApiRoute`, so there is no HTTP roundtrip at render time.

## Settings

- **Privacy-enhanced YouTube embeds** — on by default; the player iframe comes from `youtube-nocookie.com`.
- **Affiliate disclosure** — shown in Product box widgets; empty hides it.
- **Posts collection** — default `posts`; the Latest posts block can override it per placement.

## Styling

Components are intentionally neutral: `wgt-*` classes read common design tokens (`--color-brand`, `--color-brand-strong`, `--color-surface`, `--color-border`, `--color-muted`, `--color-accent`, `--color-success`, `--color-warning`, `--color-danger`, `--radius*`, `--spacing*`, `--font-*`) with safe fallbacks, so they inherit your theme without fighting it.

## Development

```bash
npm install
npm run test        # manifest validation + vitest (plugin test host)
npm run typecheck
npm run build       # dist/index.mjs + dist/plugin.mjs + manifest.json
npm run bundle      # registry tarball
npm run publish
```

MIT — Bitdoze
