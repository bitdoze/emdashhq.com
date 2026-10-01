# EmDash HQ: TODO

Goal: `emdashhq.com` is a hub for EmDash CMS. It links to tutorials on bitdoze.com, shows YouTube videos, lists free and paid themes and plugins, and sells EmDash services. Everything is editable from the EmDash admin. The site runs on Cloudflare Workers (D1 + R2).

Legend: `[x]` done and checked, `[ ]` still to do, **(you)** needs an action from you.

## Decisions

- **One theme, many pages.** Every page (`/`, `/tutorials`, `/videos`, `/themes`, `/plugins`, `/services`, `/contact`, any new page) is an entry in the `pages` collection made of blocks. One route, `src/pages/[...slug].astro`, renders them all.
- **Content lives in collections, not in blocks.** Tutorials, videos, themes and plugins, and services are separate collections. Dynamic blocks query them, so one new entry shows up on the home page and on its list page.
- **Header scripts and analytics** are handled by a native plugin, `Site Scripts`, with a settings form in the admin (Plugins, Site Scripts, Settings). **Header links** are the `primary` menu, and the header button is the first item of the `header_cta` menu.
- **Native plugin, not sandboxed.** `page:fragments` (raw script injection) is trusted-only in EmDash 1.0. The plugin lives in `plugins/site-scripts`, so it needs no registry.
- **No invented social proof.** The testimonials block exists but is not seeded. Add real quotes only.

## Phase 0: Inputs from you

- [ ] **(you)** Confirm the real services, prices and contact email. The seed uses placeholder service copy ("Contact for a quote") and `hello@emdashhq.com`.
- [ ] **(you)** Add the first real themes and plugins (name, link, free or paid, price, screenshot). The seed lists the official marketing template and two official Cloudflare plugins as free examples.
- [ ] **(you)** Upload a logo and favicon (Settings, General). The header shows the site title until then.
- [ ] **(you)** Pick the analytics provider: Plausible, Cloudflare Web Analytics or Google Analytics 4 are supported.

## Phase 1: Content model (`seed/seed.json`)

- [x] Collections: `tutorials`, `videos`, `resources` (themes and plugins), `services`, plus `pages` with blocks.
- [x] Blocks: `site_tutorials`, `site_videos`, `site_resources`, `site_services`, `site_cta`, `site_contact`, and a hero with an eyebrow. Features, FAQ, pricing and testimonials kept from the template.
- [x] Menus: `primary`, `header_cta`, `footer_learn`, `footer_resources`, `footer_company`.
- [x] Site settings: title, tagline, social links (YouTube, GitHub, X), taken from bitdoze.com.
- [x] Seed content: two real EmDash articles from bitdoze.com, one real EmDash video from the YouTube channel, labelled placeholders for the rest.
- [x] Seed validates with `emdash seed --validate`, and all seven pages render from a fresh database.

## Phase 2: Head and body scripts (`plugins/site-scripts`)

- [x] Native plugin with a `page:fragments` hook, registered in `astro.config.mjs`.
- [x] Settings form: master switch, Plausible, Cloudflare Web Analytics, Google Analytics 4, and free-form HTML for head, start of body and end of body.
- [x] Plausible accepts both formats: a per-site `pa-XXXX.js` URL (loaded with the `plausible.init()` call, also on self-hosted domains) and the older `script.js` plus domain.
- [x] Checked in a dev server: every field is injected on public pages, the master switch removes them all, and the form renders in the admin.
- [x] Skips `/_emdash/` paths.
- [ ] Not built: a "skip logged-in editors" switch. The page fragment event carries no user, so it needs another approach (a cookie check in the injected script, for example).
- [ ] Later: per-page script targeting (for example a pixel only on `/services`).

## Phase 3: Theme and components

- [x] Drawing Set blue tokens in `src/styles/theme.css`, light and dark (see `DESIGN.md`). Archivo plus IBM Plex Mono.
- [x] One left edge: every section header, card grid, list, hero and CTA starts at the container edge. A short last row of cards starts at the left too. `.section-header` no longer centers itself.
- [x] Stretched card links (`.card-link::after`) are contained by a `position: relative` row. Before this fix the tutorial row overlay covered the home hero buttons.
- [x] Contact methods render as a card grid (`site_contact`), the same sheet cards as services and resources.
- [x] Features, pricing and testimonials blocks follow the flat rules (no gradient, shadow, lift, pill badge or 20px radius). They are not seeded, so their rendering is checked by type only.
- [x] Hero buttons go through `optionalLink`, so external links open in a new tab.
- [x] `Base.astro`: header menu with active link, header button from the `header_cta` menu, mobile menu, footer columns from menus, social icons, plugin fragments.
- [x] Cards for tutorials, videos (click-to-load YouTube through `youtube-nocookie.com`), themes and plugins (free/paid badge, price), services.
- [x] Client-side filters: tutorial topic, free or paid. Without JavaScript every card shows.
- [x] CTA block, contact block, empty states for every dynamic block.
- [x] `[...slug].astro` replaces the hard-coded home, contact and pricing pages. `/home` redirects to `/`. Unknown slugs return a real 404.
- [x] Original hero illustration replaced with an on-brand one (`public/hero-visual.svg`).
- [ ] Later: detail pages for themes and plugins (`/themes/[slug]`) with gallery and changelog.
- [ ] Later: a rich text block for an About page.
- [ ] Later: newsletter signup (needs a mail provider decision).

## Phase 4: Cloudflare Workers deploy

- [x] `wrangler.jsonc`: worker `emdashhq`, D1 `emdashhq`, R2 `emdashhq-media`. `wrangler deploy --dry-run` succeeds (about 4.2 MB gzip, so it needs Workers Paid).
- [ ] **(you)** `npx wrangler login`, then `npm run deploy`. The first deploy creates the D1 database and R2 bucket.
- [ ] **(you)** Open `/_emdash/admin`, finish setup, register your passkey, and choose to include the sample content.
- [ ] **(you)** Custom domain: put the `emdashhq.com` zone in the same Cloudflare account, uncomment `routes` in `wrangler.jsonc`, redeploy.
- [ ] **(you)** Set `EMDASH_SITE_URL=https://emdashhq.com` so passkeys, sitemap and canonical URLs use the public origin. Check the Cloudflare deploy doc for any other production secrets.
- [x] Workers cache for `/` and list pages (`routeRules`, 1 hour fresh, 7 days stale-while-revalidate, purged by tag on publish), and the KV object cache.
- [x] `npm run deploy` warms every sitemap page after upload (`npm run cache:warm`). Each deploy empties the version-keyed Workers Cache, and an uncached page took 1 to 3 seconds on its first visit.
- [ ] Later: warm the purged pages after a publish too. A content edit purges its tagged pages, so the next visit to each one is still a cold render.
- [ ] Optional: the `cloudflareEmail` plugin for magic-link sign-in and invites.

## Phase 5: Content entry (in the admin)

- [ ] Replace the placeholder services with the real ones.
- [ ] Add every EmDash article from bitdoze.com as a tutorial (topic and level fields).
- [ ] Add every EmDash video from the YouTube channel (paste the watch URL).
- [ ] Add free and paid themes and plugins.
- [ ] Fill in the SEO title and description on each page.
- [ ] Add a default social image (Settings, SEO) and search engine verification codes.
- [ ] Turn on analytics in Plugins, Site Scripts.

## Phase 6: Checks

- [x] `npm run typecheck` passes (0 errors) and `npm run build` succeeds.
- [x] Dev server on a fresh database: all seven pages return 200, unknown paths return 404, `/home` returns 301.
- [x] No horizontal scroll at 360 px on any page. Mobile menu, topic filter and video player tested.
- [x] Light and dark mode checked on the home page.
- [x] Alignment review after the fixes: home, tutorials, videos, themes, plugins, services and contact at 1440 px and 390 px. Headers, cards and lists share one left edge (144 px, 24 px) and nothing scrolls sideways. Dark mode checked on home, tutorials, videos, services and contact. FAQ question and answer text share a left edge when open. Hero button clicks reach the button.
- [ ] A pass on a real phone.
- [ ] Render check for the features, pricing and testimonials blocks (add them to a draft page in the admin).
- [ ] Lighthouse on `/` (mobile).
- [ ] `robots.txt` and sitemap respond on the production domain.
- [ ] Analytics events arrive from the production domain and not from `/_emdash/`.
- [ ] Not tested: an actual deploy, D1 and R2 on Cloudflare, and the setup wizard flow (the dev bypass seeded the content during testing).

## Backlog ideas

- Import new YouTube videos from the channel RSS feed with the existing Worker cron trigger.
- A "free vs paid" comparison page for themes and plugins.
- A sponsored or affiliate flag on paid resources (`rel="sponsored"`).
