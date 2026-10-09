This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
npm run dev              # Start the Astro dev server
npx emdash types      # Regenerate TypeScript types from a running site
npm run deploy           # Build, verify production core migrations, deploy, warm the page cache
npm run cache:warm       # Request every sitemap page until it is a cache hit
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, and storage                    |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro` | Base layout with EmDash wiring (menus, search, page contributions)                 |
| `src/pages/`             | Astro pages -- all server-rendered                                                 |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Production core migrations are deployment-managed (`migrations.runtime: "manual"`, dev `"auto"`). Use `npm run deploy`: its migration check must pass before uploading the Worker. See README for pending-migration handling.
- Workers Cache is keyed by Worker version, so each deploy empties the page cache and the first visit to each page is a cold render (1-3 s). `npm run deploy` ends with `npm run cache:warm` (`scripts/warm-cache.mjs`), which fills the cache from the sitemap. Keep that step; do not enable `cross_version_cache`, because cached HTML from an older version can reference hashed `/_astro/` files the new version no longer serves.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- When Astro's cache is enabled, pass content-query hints to `Astro.cache.set(cacheHint)`. Use the `WithCacheHint` variants for site settings, menus, taxonomies, and widget areas rendered by cached routes.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## This Template

The site for emdashhq.com: a hub for EmDash CMS. It links to tutorials on bitdoze.com, shows YouTube videos, lists free and paid themes and plugins, and sells EmDash services. It started from the EmDash marketing template and keeps its block editor.

Voice: plain and specific. No hype, no invented testimonials, no em dashes. Seeded tutorials and the video are real (bitdoze.com and its YouTube channel). Service copy is placeholder until the owner confirms it; the contact email is `dragos@emdashhq.com`.

## Pages

One route, `src/pages/[...slug].astro`, renders every entry in the `pages` collection. The slug is the URL, `home` is `/`, and `/home` redirects to `/`. A missing slug rewrites to `404.astro`. New pages need no code. `src/pages/rss.xml.ts` serves an RSS 2.0 feed of published tutorials, videos and resources (items link to their real destinations); it is advertised via `<link rel="alternate">` in the head.

Seeded pages: `home`, `tutorials`, `videos`, `blog`, `themes`, `plugins`, `services`, `contact`. Seeded posts: `contact-form-spam-turnstile`, `emdash-widgets-plugin`, `emdash-blog-section`, `widget-gallery` (a kitchen-sink demo exercising every widget).

## Site stats strip

`src/components/blocks/SiteStats.astro` renders the "By the numbers" ledger on the home page (after the content blocks). Counters live in a `site_stats` D1 table (`key`, `label`, `value`, `suffix`, `source`, `updated_at`) managed by `src/lib/site-stats.ts`: the table self-creates and seeds on first read, `npm_downloads` refreshes from the npm downloads API and `plugins`/`themes` recount `ec_resources` at most once every 24 h — via `refreshSiteStats` in the worker `scheduled` handler (`src/worker.ts`, hourly cron) or lazily on a stale page read. Bindings come from `cloudflare:workers` (`env.DB`); `Astro.locals.runtime` does not exist in Astro 6 — `waitUntil` is `Astro.locals.cfContext`. The `sites` row is manual: update it with `npx wrangler d1 execute emdashhq --remote --command "UPDATE site_stats SET value=<n>, updated_at=datetime('now') WHERE key='sites'"`.

## Schema

- `pages`: `title`, `content` (a `blocks` field).
- `posts`: `title`, `excerpt`, `cover` (image), `body` (a `blocks` field allowing all `widget_*` types), `featured`. Routed by `src/pages/blog/[slug].astro` under `/blog/<slug>/`; the `blog` page itself uses the `site_posts` block to list published posts.
- Content hub collections (grouped in the admin): `tutorials`, `videos`, `resources` (themes and plugins), `services`. Each has a `featured` boolean. Blocks use `src/lib/hub-content.ts` for CMS filters, ordering, cache hints, and cursor traversal. The page preloads these reads before streaming so query errors return a noncached 503.
- No taxonomies.
- Menus: `primary` (header links), `header_cta` (only the first item is used, as the header button — currently an external link to docs.emdashcms.com), `footer_learn`, `footer_resources`, `footer_company`. Footer column headings are the menu labels.
- Site settings: `title`, `tagline`, `logo`, `social` (YouTube, GitHub, X). Social links render in the footer.

## Blocks

Twelve page block types, mapped to `src/components/blocks/*.astro` in `src/components/MarketingBlocks.astro` with `defineBlockComponents()`. Post bodies use the `widget_*` blocks via `src/components/blocks/widgets/WidgetBlocks.astro`; `widget_*` types are also allowed in `pages.content`.

| Block | Purpose |
| --- | --- |
|`marketing_hero`|Headline, optional eyebrow (renders as the title-block SET token), two CTAs, image, and an optional `specs` repeater (icon select + label) for the architecture-highlights strip under the CTAs. With no image it shows the system-diagram panel; centered heroes get a compact diagram strip.|
| `marketing_features`, `marketing_faq`, `marketing_pricing`, `marketing_testimonials` | Kept from the template. Testimonials and pricing are not seeded. |
| `site_tutorials` | Cards from `tutorials`. Options: limit (0 = all), featured only, topic filter, section link. |
| `site_videos` | Cards from `videos` with a click-to-load YouTube player (`VideoFacade.astro`). Optional large first video. |
| `site_resources` | Cards from `resources`. Options: kind (all, theme, plugin), price (all, free, paid), free/paid filter. |
| `site_services` | Cards from `services`, sorted by `sort_order`. |
| `site_cta` | Banner with one or two buttons, `gradient` or `plain`. |
| `site_contact` | Contact method cards (email, YouTube, GitHub) in the shared `.card-grid` with `.hub-card`. |
| `site_posts` | Published `posts` (newest first) as a lead card plus cover-card grid, on `/blog/` and the home page. |

The 19 `widget_*` block types (prose, notice, accordion, tabs, checklist, steps, button, youtube, embed, image, code, product, cards, quote, facts, toc, series, latest_posts, divider) come from the Widgets plugin below.

Constraints worth remembering:

- Every stored block has immutable `_type`, `_version`, and `_key` values. Components receive the generated value as `value`; do not treat blocks as Portable Text nodes.
- Block fields cannot contain nested object groups, and repeaters cannot contain nested repeaters.
- Render every stored URL through `sanitizeHref()`. `src/lib/links.ts` wraps it (`linkAttrs`, `optionalLink`) and opens absolute web links in a new tab.
- Image fields are objects. Render them with `<Image>` from `emdash/ui`.
- Icon names in select fields map to Phosphor icons in `src/lib/icons.ts`. Add a new icon in three places: the seed's select options, `ICON_MAP`, and the `astro-iconset` `include` list in `astro.config.mjs`.
- `.card-grid`, `.hub-card`, `.badge` and the filter chips are shared classes in `src/styles/theme.css` and `FilterBar.astro`. Reuse them.
- Everything in a section starts at the container's left edge: `.section-header` (use `SectionHeader.astro`), `.card-grid` (a short last row stays left), lists, `.section-link` and `.empty-note`. Do not add `margin: auto` or `text-align: center` to a section child. Only a hero with `centered` set is centered.
- A row or card that contains a stretched `.card-link::after` must be `position: relative`, or the overlay covers the page above it.
- External links (`target="_blank"`) get a visible `↗` marker via a rule in `theme.css` and a screen-reader `(opens in a new tab)` via `src/components/NewTab.astro` — add `<NewTab />` inside any new `_blank` anchor. Stretched `.card-link`s, `.video-facade`s, `.contact-card`s and `aria-label`ed icon links are excluded from the marker rule because they carry their own affordances.
- Block and collection fields are defined in `seed/seed.json`. After changing them, start the dev server so it rewrites `emdash-env.d.ts`.
- Do not set Astro `trailingSlash: "always"`: it makes every `/_emdash/api/` route without a trailing slash 404, which breaks public plugin endpoints (e.g. the contact-form `submit` POST). Slashless content URLs get a 301 to the canonical `/…/` form anyway — `interpolateUrlPattern` strips pattern slashes, so a `/blog/{slug}/` pattern does nothing; canonical URLs come from the redirect.

## Plugin: Site Scripts

`plugins/emdashhq-site-scripts` is a standard-format plugin (`emdash-plugin.jsonc` + `src/plugin.ts`), registered in `astro.config.mjs` under `plugins:` and linked as a file dependency in `package.json`. It must run in-process: `page:fragments` is never invoked for sandboxed plugins, so it cannot be distributed through the EmDash plugin registry — npm is the distribution path. Its `page:fragments` hook injects analytics (Plausible as a `pa-XXXX.js` script plus its init call, or the older `script.js` plus a domain; Cloudflare Web Analytics; Google Analytics 4) and three free-form HTML areas (head, body start, body end) on public pages, never under `/_emdash/`. Settings are edited at Plugins, Site Scripts, Settings in the admin. The HTML areas are raw, so they are trusted administrator input.

## Plugin: Contact Forms

`plugins/emdashhq-contact-forms` (package `emdashhq-contact-forms`, plugin id `emdashhq-contact-forms`) is a standard-format sandboxed plugin published to the EmDash registry as `@bitdoze.com/emdashhq-contact-forms` -- keep it free of site-specific references. Registered under `sandboxed:` in `astro.config.mjs` with `sandboxRunner: sandbox()`. It provides form CRUD, a submissions inbox, and an email log under Plugins, Contact forms (Block Kit pages via the private `admin` route; no React), plus a dashboard widget. Storage lives in `_plugin_storage` (`forms`, `submissions`, `email_log` collections). Public routes: `GET .../form?slug=` (public form definition, strips recipient) and `POST .../submit` (form-data, answers a same-origin 303 with `cf`/`cf_status`/`cf_fields`). Email goes through `ctx.email.send()`, so it uses the site's active provider; no provider means submissions still store with `emailStatus: "skipped"`. `orderBy` fields must be declared in the collection's `indexes` or the query throws. Anti-spam: `cf_hp` honeypot, `cf_ts` minimum-fill-time, per-IP hourly limit. The `contact_form` seed block type renders through `src/components/blocks/ContactForm.astro`, which resolves the form in-process via `Astro.locals.emdash.handlePublicPluginApiRoute` -- no HTTP fetch. A generic copy of that component plus the block-type JSON ship in the package's `site/` dir for other sites; see the plugin README.

## Plugin: Widgets

`plugins/emdashhq-widgets` (published as `@bitdoze.com/emdashhq-widgets`) is a sandboxed plugin that distributes 19 `widget_*` article block types plus the Astro components that render them. Sandboxed plugins can't ship renderers into the site runtime, so the package's `site/` dir is the copy source: `site/block-types/*.json` are the single source of truth for the seed block defs, `site/components/*.astro` + `icons.ts` + `widget-components.ts` are mirrored into `src/components/blocks/widgets/`, and `WidgetBlocks.astro` maps `_type` to component. When editing a widget, patch the copy under `plugins/emdashhq-widgets/site/` first, then `cp` it into `src/components/blocks/widgets/` (and sync the block JSON into `seed/seed.json`). Public routes: `.../config` (plugin settings: YouTube nocookie toggle, affiliate disclosure, posts collection) and `.../posts` (latest published entries for `widget_latest_posts`); the site resolves both in-process via `Astro.locals.emdash.handlePublicPluginApiRoute` through `components/blocks/widgets/config.ts` (WeakMap-cached per request). Admin gets a Block Kit catalog + setup page under Plugins. `astro check` must stay clean — generated optional fields are `T | null`, so widget props need `| null`. Repeater sub-fields only support scalar/select/image types (no `portableText`); accordion/tab bodies use `text` split on blank lines.

Schema changes (block types, the `posts` collection, `pages.content`/`posts.body` allowedTypes, seed content, menus) reach a running site via `node scripts/apply-blog-schema.mjs --url=<site> --token=<api-token>` — the seed file itself only applies at bootstrap. On this repo it was applied to prod with a temporary `admin`-scoped `ec_pat_` token inserted into `_emdash_api_tokens` via `wrangler d1 execute --remote` and revoked after. Token row format: `token_hash = base64url(sha256(raw))` and `scopes` is a JSON array (`'["admin"]'`) — a bare `'admin'` string crashes `resolveApiToken`'s `JSON.parse` and surfaces as a baffling 301/500 on authed API routes instead of 401.

`node scripts/update-blog-content.mjs --url=<site> [--token=...]` rewrites the four tutorial posts (widget-rich bodies, covers, SEO), uploads the images in `uploads/covers/` and `uploads/article-images/` (plus plugin screenshots) through the admin media API, publishes each entry, and upserts the `resources/emdash-content-widgets` listing. Inline figures are `widget_image` blocks carrying a `_img` placeholder resolved to a fresh media id per environment. `PUT /_emdash/api/content/{col}/{slug}` accepts `seo` as a top-level sibling of `data` (`{title, description, image, canonicalPath, robots}`; `image` is a media storage key). `resources` entries drive `/plugins/` cards: `kind: plugin`, `url` = registry page, `demo_url` = live demo, `image` = screenshot, `latest_version`, `changelog`. Regenerate covers with the kie-ai skill if `uploads/article-images/` is missing files.

## Visual character

The Print Edition: every page is a magazine cover about one working CMS, in the style of the Bitdoze tutorial covers. Cream stock with faint fiber texture and indigo serif display type in light mode; the ink plate (deep navy ground, cream ink, same rose marker) in dark mode. Playfair Display for headlines (`--font-heading` maps to `--font-display`), Archivo for body, IBM Plex Mono for eyebrows, metadata, pills and buttons. Paper cards rest on the desk with soft indigo-tinted shadows and lift a few pixels on hover. The rose accent is a marker: it appears as the `.hl` highlighter swash on the hero's key phrase, section-header marks, small annotations and the footer's top edge — never as a large fill. Featured surfaces (video spotlight, highlighted pricing tier, dark CTAs, footer) use `--color-plate`, an always-dark panel with cream ink.

## Customisation

Design tokens live in `src/styles/tokens.css` with their default values. To restyle the site, override tokens in `src/styles/theme.css` -- declarations there are unlayered, so they always beat the `@layer base` defaults. Don't edit `tokens.css` or `Base.astro` for visual changes.

Colours are defined with `light-dark(<light>, <dark>)`, so each token carries both modes. Overriding with a plain colour changes light and dark at once; use `light-dark()` in the override to keep them distinct. There is no separate dark palette to maintain.

Webfonts are configured in `astro.config.mjs` under `fonts:`. Archivo is bound to `--font-body`, Playfair Display to `--font-display` (headings follow via `--font-heading: var(--font-display)` in theme.css); IBM Plex Mono is bound to `--font-mono` for annotations, metadata and buttons. If you swap a face, keep the mono/annotation voice separate from the text voice.

CSS variables worth knowing (see `tokens.css` for the full list, `theme.css` for the overrides):

- `--color-brand`, `--color-brand-strong`, `--color-brand-soft`, `--color-on-brand`, `--color-brand-ring` (indigo ink)
- `--color-accent`, `--color-accent-soft` (dusty rose marker), `--color-highlight` (the `.hl` swash), `--color-warm` (amber detail)
- `--color-control`, `--color-control-hover`, `--color-on-control` (filled buttons; indigo on paper in light, paper on plate in dark)
- `--color-plate`, `--color-plate-ink`, `--color-plate-muted`, `--color-plate-border` (the always-dark featured panel)
- `--gradient-brand`, `--gradient-brand-strong`, `--gradient-brand-soft`, `--gradient-headline` (resolve to solid fields in this theme)
- `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-border`
- `--color-success`, `--color-warning`, `--color-danger`
- `--font-body`, `--font-display`, `--font-heading`, `--font-mono` (from the font pipeline), `--font-weight-heading` (700), `--font-weight-display` (800)
- `--font-size-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl,6xl}` -- type scale up to 4.5rem for the largest hero
- `--line-hair` (1px), `--line-ink` (1.5px)
- `--radius-sm` (6px), `--radius` (10px), `--radius-lg` (16px), `--radius-full` (pills)
- `--shadow-sm`, `--shadow`, `--shadow-lg`, `--shadow-xl` (soft paper shadows, tinted indigo)

To re-brand, the highest-leverage moves are:

1. Change `--color-brand` (and its `-strong` / `-soft` shades) and `--color-accent` in `src/styles/theme.css` to the brand pair.
2. Update the site title (logo wordmark) and tagline.
3. Choose a Hero image in the media library; with no image the hero shows the system-diagram panel.
4. Edit hero `headline` and `subheadline` blocks to specific, concrete copy.

## What not to do

- Don't write stock SaaS copy: "Build products people actually want", "Elevate your workflow", "The all-in-one platform for modern teams". These are placeholder. Write what the product actually does, for whom, with one specific outcome.
- Don't ship more than three pricing tiers. Three is the default for a reason -- more makes choice harder, not easier.
- Don't use icon and stock photo combos that fight each other. Pick illustration _or_ photography, not both.
- Don't enable the gradient on every interactive element. The CTA gradient is the signal; if it's on every button, it stops signalling.
- Don't add a hero block followed immediately by another hero block. One hero, then features / testimonials / pricing / FAQ in some order.
- Don't replace the `marketing_pricing` block with a hand-coded table. The block is the data shape downstream renderers expect.
