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

## Analytics and header scripts

The local plugin in `plugins/site-scripts` adds a settings page at Plugins, Site Scripts, Settings. It supports:

- Plausible, Cloudflare Web Analytics and Google Analytics 4. For Plausible, paste the script URL from your Plausible site (for example `https://plausible.io/js/pa-XXXX.js`, or the same path on a self-hosted domain). A `pa-XXXX.js` URL is loaded together with its `plausible.init()` call. The older `script.js` format also needs the site domain.
- Free-form HTML in `<head>`, at the start of `<body>` and at the end of `<body>`
- A master switch that turns every script off without deleting it

Scripts load on public pages only, never under `/_emdash/`. The HTML fields are inserted exactly as written, so only administrators should have access to them.

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

The first deploy creates the D1 database `emdashhq` and the R2 bucket `emdashhq-media` from `wrangler.jsonc`. Sandboxed plugins need Workers Paid (Worker Loader).

For the custom domain, add the `emdashhq.com` zone to the same Cloudflare account, uncomment `routes` in `wrangler.jsonc`, and redeploy. Set `EMDASH_SITE_URL=https://emdashhq.com` so passkeys, canonical URLs and the sitemap use the public origin. See [Deploy to Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/) for production settings.

`TODO.md` tracks what is done and what is left.
