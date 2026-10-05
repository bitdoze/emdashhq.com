# EmDash HQ

The site behind emdashhq.com: a hub for [EmDash CMS](https://github.com/emdash-cms/emdash). It links to tutorials on [bitdoze.com](https://www.bitdoze.com/), shows YouTube videos, lists free and paid themes and plugins, and sells EmDash services. It runs on Cloudflare Workers with D1 and R2.

Built from the EmDash marketing template. Everything below is editable in the admin at `/_emdash/admin`.

## Pages

Every page is an entry in the `pages` collection, built from blocks. The slug is the URL, and the page with the slug `home` is `/`. New pages need no code.

| Page | Route |
|---|---|
| Home | `/` |
| Tutorials | `/tutorials` |
| Videos | `/videos` |
| Themes | `/themes` |
| Plugins | `/plugins` |
| Services | `/services` |
| Contact | `/contact` |
| 404 | fallback |

## Content

| Where in the admin | What it holds |
|---|---|
| Content hub, Tutorials | Articles on bitdoze.com. Cards link out. Topic and level filters. |
| Content hub, Videos | YouTube videos (paste the watch URL). Click-to-load player, so YouTube sets no cookies until play. |
| Content hub, Themes and plugins | Free or paid, with price, link, demo link and screenshot. |
| Content hub, Services | Title, summary, included items, price label, button. Lowest sort order first. |
| Pages | Blocks: hero, features, FAQ, testimonials, pricing, tutorials, videos, themes and plugins, services, call to action, contact methods. |
| Menus | `primary` (header links), `header_cta` (the header button, first item only), `footer_learn`, `footer_resources`, `footer_company`. |
| Settings | Site title, tagline, logo, social links. |

The tutorials, videos, themes and plugins, and services blocks read from the collections, so a new entry shows up on the home page and on its list page.

## Plugins

Two plugins ship with the site, one of each EmDash format:

- **`plugins/emdashhq-contact-forms`** — sandboxed plugin, published to the registry as `@bitdoze.com/emdashhq-contact-forms`. Registered under `sandboxed:` in `astro.config.mjs` and runs in a Worker Loader isolate. Provides the form builder admin pages (Forms, Submissions, Email log), a dashboard widget, public `form`/`submit` routes, and settings (recipient, rate limit, retention, debug logging). Pages embed a form through the `contact_form` block type (seed) rendered by `src/components/blocks/ContactForm.astro`. Mail goes through `ctx.email.send()`, so it uses whichever email provider is active — Cloudflare Email Sending or an SMTP plugin. See `plugins/emdashhq-contact-forms/README.md` for routes, storage and development commands (`emdash-plugin validate/build/bundle/publish`, vitest suite running inside workerd).
- **`plugins/site-scripts`** — native (trusted) plugin, registered under `plugins:`. Adds a settings page at Plugins, Site Scripts, Settings:
  - Plausible, Cloudflare Web Analytics and Google Analytics 4. For Plausible, paste the script URL from your Plausible site (for example `https://plausible.io/js/pa-XXXX.js`, or the same path on a self-hosted domain). A `pa-XXXX.js` URL is loaded together with its `plausible.init()` call. The older `script.js` format also needs the site domain.
  - Free-form HTML in `<head>`, at the start of `<body>` and at the end of `<body>`
  - A master switch that turns every script off without deleting it

Site Scripts' HTML fields are inserted exactly as written and load on public pages only, never under `/_emdash/` — administrator-only input.

The sandbox runner (`sandboxRunner: sandbox()`) plus the `LOADER` Worker Loader binding and the exported `PluginBridge` in `src/worker.ts` are what let sandboxed plugins — the contact forms plugin now, registry installs later — execute. Requires Workers Paid.

## Design

Colors and gradients live in `src/styles/theme.css`, which overrides the defaults in `src/styles/tokens.css`. The fonts are set in `astro.config.mjs` (Archivo and IBM Plex Mono). `DESIGN.md` describes the flat "Drawing Set" look. Section headers, card grids and lists all start at the same left edge, and the contact methods are a card grid like services and resources. Icon names offered in the admin are mapped in `src/lib/icons.ts`; every icon used must also be listed in the `astro-iconset` include list in `astro.config.mjs`.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:4321/_emdash/admin and finish the setup wizard. Choose to include the sample content: it holds the seeded pages, tutorials, video, themes, plugins and services. Edit or replace it in the admin. The contact email `hello@emdashhq.com` in the seed is a placeholder.

```bash
npm run typecheck   # astro check
npm run build
```

## Deploying to Cloudflare

```bash
npx wrangler login
npm run deploy
```

The production account, existing D1 database, R2 bucket, and custom domain are configured in `wrangler.jsonc`. Sandboxed plugins need Workers Paid (Worker Loader). For another installation, provision its resources and update these identifiers before deploying.

`npm run deploy` builds, checks the generated EmDash migration manifest against the configured production D1 database, uploads the Worker, then warms the page cache. Production uses `migrations.runtime: "manual"` to avoid schema/setup probes on visitor requests; development uses `"auto"`. A pending or unknown migration stops deployment. Always use the guarded deployment command.

After an EmDash upgrade, if the check reports pending migrations:

```bash
npm run build
npx emdash migrate --status --wrangler-config wrangler.jsonc
npx emdash migrate --wrangler-config wrangler.jsonc
npm run deploy
```

Review the account and database shown by the interactive migration command before confirming. Unknown migrations or an interrupted remote apply need investigation; inspect status before retrying. This manages core migrations, not changes to the site's content model. See [Core migrations](https://docs.emdashcms.com/deployment/core-migrations/).

Workers Cache keys pages by Worker version, so every deploy starts with an empty page cache. An uncached page takes about 1 to 3 seconds (Worker start, EmDash init, D1 reads); a cached one about 0.1 seconds. The last step of `npm run deploy`, `npm run cache:warm`, requests every sitemap URL until Cloudflare reports a cache hit, so visitors never pay the cold render after a release. Run it on its own after a large content change, or pass an origin: `node scripts/warm-cache.mjs https://emdashhq.com`. It exits with an error if a page does not return 2xx.

The custom domain is already enabled. Set `EMDASH_SITE_URL=https://emdashhq.com` so passkeys, canonical URLs and the sitemap use the public origin. See [Deploy to Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/) for production settings and [the performance guide](emdash-perf-best-practices.md) for measured cases.

`TODO.md` tracks what is done and what is left.
