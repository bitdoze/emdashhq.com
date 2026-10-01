This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
npm run dev              # Start the Astro dev server
npx emdash types      # Regenerate TypeScript types from a running site
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
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- When Astro's cache is enabled, pass content-query hints to `Astro.cache.set(cacheHint)`. Use the `WithCacheHint` variants for site settings, menus, taxonomies, and widget areas rendered by cached routes.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## This Template

The site for emdashhq.com: a hub for EmDash CMS. It links to tutorials on bitdoze.com, shows YouTube videos, lists free and paid themes and plugins, and sells EmDash services. It started from the EmDash marketing template and keeps its block editor.

Voice: plain and specific. No hype, no invented testimonials, no em dashes. Seeded tutorials and the video are real (bitdoze.com and its YouTube channel). Service copy and `hello@emdashhq.com` are placeholders until the owner confirms them.

## Pages

One route, `src/pages/[...slug].astro`, renders every entry in the `pages` collection. The slug is the URL, `home` is `/`, and `/home` redirects to `/`. A missing slug rewrites to `404.astro`. New pages need no code.

Seeded pages: `home`, `tutorials`, `videos`, `themes`, `plugins`, `services`, `contact`.

## Schema

- `pages`: `title`, `content` (a `blocks` field).
- Content hub collections (grouped in the admin): `tutorials`, `videos`, `resources` (themes and plugins), `services`. Each has a `featured` boolean. Blocks query them with `getEmDashCollection` and filter in JavaScript.
- No taxonomies.
- Menus: `primary` (header links), `header_cta` (only the first item is used, as the header button), `footer_learn`, `footer_resources`, `footer_company`. Footer column headings are the menu labels.
- Site settings: `title`, `tagline`, `logo`, `social` (YouTube, GitHub, X). Social links render in the footer.

## Blocks

Eleven block types, mapped to `src/components/blocks/*.astro` in `src/components/MarketingBlocks.astro` with `defineBlockComponents()`.

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

Constraints worth remembering:

- Every stored block has immutable `_type`, `_version`, and `_key` values. Components receive the generated value as `value`; do not treat blocks as Portable Text nodes.
- Block fields cannot contain nested object groups, and repeaters cannot contain nested repeaters.
- Render every stored URL through `sanitizeHref()`. `src/lib/links.ts` wraps it (`linkAttrs`, `optionalLink`) and opens absolute web links in a new tab.
- Image fields are objects. Render them with `<Image>` from `emdash/ui`.
- Icon names in select fields map to Phosphor icons in `src/lib/icons.ts`. Add a new icon in three places: the seed's select options, `ICON_MAP`, and the `astro-iconset` `include` list in `astro.config.mjs`.
- `.card-grid`, `.hub-card`, `.badge` and the filter chips are shared classes in `src/styles/theme.css` and `FilterBar.astro`. Reuse them.
- Everything in a section starts at the container's left edge: `.section-header` (use `SectionHeader.astro`), `.card-grid` (a short last row stays left), lists, `.section-link` and `.empty-note`. Do not add `margin: auto` or `text-align: center` to a section child. Only a hero with `centered` set is centered.
- A row or card that contains a stretched `.card-link::after` must be `position: relative`, or the overlay covers the page above it.
- Block and collection fields are defined in `seed/seed.json`. After changing them, start the dev server so it rewrites `emdash-env.d.ts`.

## Plugin: Site Scripts

`plugins/site-scripts` is a native plugin, registered in `astro.config.mjs` and linked as a file dependency in `package.json`. Its `page:fragments` hook injects analytics (Plausible as a `pa-XXXX.js` script plus its init call, or the older `script.js` plus a domain; Cloudflare Web Analytics; Google Analytics 4) and three free-form HTML areas (head, body start, body end) on public pages, never under `/_emdash/`. Settings are edited at Plugins, Site Scripts, Settings in the admin. The HTML areas are raw, so they are trusted administrator input.

## Visual character

The Drawing Set: every page is a numbered sheet of engineering drawings for one working CMS. Blue ink on drafting paper in light mode; a true blueprint (Prussian ground, pale ink line-work) in dark mode. Archivo for display and body, IBM Plex Mono for annotations, metadata, labels and buttons. The world is flat: shadows are off and gradients resolve to solid ink; depth comes from line weight (1px hairlines, 1.5px ink rules) and layered rules. Hover speaks in registration marks and paper-blue tints, never lifts or glow. Blue carries the header rule, sheet numbers, stamp buttons, hero schematic, approval blocks and the footer cover sheet.

## Customisation

Design tokens live in `src/styles/tokens.css` with their default values. To restyle the site, override tokens in `src/styles/theme.css` -- declarations there are unlayered, so they always beat the `@layer base` defaults. Don't edit `tokens.css` or `Base.astro` for visual changes.

Colours are defined with `light-dark(<light>, <dark>)`, so each token carries both modes. Overriding with a plain colour changes light and dark at once; use `light-dark()` in the override to keep them distinct. There is no separate dark palette to maintain.

Webfonts are configured in `astro.config.mjs` under `fonts:`. Archivo is bound to `--font-body` (headings follow via `--font-heading: var(--font-body)`); IBM Plex Mono is bound to `--font-mono` for annotations, metadata and buttons. If you swap a face, keep the mono/annotation voice separate from the text voice.

CSS variables worth knowing (see `tokens.css` for the full list):

- `--color-brand`, `--color-brand-strong`, `--color-brand-soft`, `--color-on-brand`, `--color-brand-ring`
- `--color-accent`, `--color-accent-soft`
- `--gradient-brand`, `--gradient-brand-strong`, `--gradient-brand-soft`, `--gradient-headline` (all resolve to solid ink in this theme)
- `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-border`
- `--color-success`, `--color-warning`, `--color-danger`
- `--font-body`, `--font-heading`, `--font-mono` (from the font pipeline), `--font-weight-heading` (700), `--font-weight-display` (800)
- `--font-size-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl,6xl}` -- type scale up to 4.5rem for the largest hero
- `--line-hair` (1px), `--line-ink` (1.5px) -- the drawing line weights
- `--radius-sm` (2px), `--radius` (2px), `--radius-lg` (4px), `--radius-full`
- `--shadow-sm`, `--shadow`, `--shadow-lg`, `--shadow-xl` (all `none` in this theme)

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
