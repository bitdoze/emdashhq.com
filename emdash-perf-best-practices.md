# EmDash performance best practices

A guide for EmDash sites on Astro, organized by responsibility and hosting platform. It includes the concrete problems found and fixes implemented in EmDash HQ on 1 October 2026. Self-hosting sections describe a future deployment option; this site currently runs on Cloudflare Workers.

## Contents

1. [General principles and measurement](#1-general-principles-and-measurement)
2. [CMS code and database queries](#2-cms-code-and-database-queries)
3. [Caching and freshness](#3-caching-and-freshness)
4. [Cloudflare Workers optimization](#4-cloudflare-workers-optimization)
5. [Self-hosting on Node.js](#5-self-hosting-on-nodejs)
6. [Frontend and navigation](#6-frontend-and-navigation)
7. [Routing, SEO, and security](#7-routing-seo-and-security)
8. [Deployment and ongoing checks](#8-deployment-and-ongoing-checks)
9. [EmDash HQ case index](#9-emdash-hq-case-index)

## 1. General principles and measurement

### 1.1 Separate the slow paths

Measure cached HTML, an HTML cache miss, database work, asset loading, and visible client motion separately. A fast browser cache does not make slow CMS initialization disappear. A fast server response can still feel slow if text fades in afterward.

**Case: menu clicks on EmDash HQ.** Two consecutive anonymous production GETs per route produced these initial results:

| Route | First TTFB | First cache status | Repeat TTFB | Repeat status |
| --- | ---: | --- | ---: | --- |
| `/tutorials/` | 1,844 ms | EXPIRED | 70 ms | HIT |
| `/videos/` | 1,472 ms | MISS | 95 ms | HIT |
| `/themes/` | 2,378 ms | EXPIRED | 90 ms | HIT |
| `/plugins/` | 2,464 ms | MISS | 112 ms | HIT |
| `/services/` | 2,459 ms | EXPIRED | 86 ms | HIT |
| `/contact/` | 1,678 ms | MISS | 73 ms | HIT |

These are single-location samples, not regional percentiles. The large difference identified the origin miss path as the main investigation target.

**Case: hover prefetch already worked.** Chromium observed a hover request for Tutorials. Clicking completed navigation in approximately 114 ms with a cache reuse/validation transfer of about 300 bytes. The existing `prefetchAll: true`, `defaultStrategy: "hover"` was retained. Investigate the actual delay before selecting another navigation framework or prefetch strategy.

### 1.2 Attribute work before optimizing

Record response status, `CF-Cache-Status`, TTFB, response bytes, `Server-Timing`, and the Cloudflare region indicated by `CF-Ray`. For this site, `X-Site-Data-Ms` now measures page, menu/settings, and collection loading. That measurement excludes earlier CMS setup and later rendering.

**Case: Contact disproved a list-only explanation.** Contact had no collection listing, but its cache miss reported 21 database queries and 968 ms of CMS middleware. Other routes reported 21–22 queries and 514–1,345 ms of middleware. Shared initialization, menus, settings, and plugin work needed attention too.

CMS middleware timing contains the setup, runtime initialization, and render phases: do not add nested timings together. Database timings may overlap. A HIT can retain the original response's timing headers; those values do not indicate new database work on that HIT.

### 1.3 Choose a representative environment

Use a production build for asset sizes and caching behavior. Development deliberately disables Astro's real HTML route cache and also includes compilation, dependency optimization, and hot reload. Development timings are useful for developer experience, not as substitutes for production TTFB. See [Astro route caching](https://docs.astro.build/en/guides/caching/).

Keep a small set of repeatable routes: home, one filtered listing, one collection-free page, a missing page, sitemap, and an unauthorized admin request. Verify desktop and mobile behavior in the same pass.

## 2. CMS code and database queries

### 2.1 Request the result you will display

Apply supported filters and ordering in the CMS query, then request the required limit. Use the schema's exact field and taxonomy names. If a client-side condition cannot be queried, continue reading cursors until the displayed limit is satisfied or the collection ends.

**Case: four blocks fetched 100 entries before slicing.** Tutorials, Videos, Resources, and Services all did this. A block showing three services requested up to 100 rows. A matching resource beyond the first 100 could disappear; service ordering was only correct within that subset.

The shared [hub-content helper](src/lib/hub-content.ts) now applies:

| Collection | CMS filters | CMS order | Default displayed limit |
| --- | --- | --- | ---: |
| Tutorials | `featured` when requested | `published_at: desc` | 6 |
| Videos | `featured` when requested | `published_at: desc` | 3 |
| Resources | `kind`, `price_type`, `featured` when requested | `published_at: desc` | 6 |
| Services | `featured` when requested | `sort_order: asc` | 3 |

Boolean fields in this installed SQLite schema are stored as integers. The public query type accepts strings, so the featured filter uses `where: { featured: "1" }`. Verify storage and query semantics when changing database adapters; do not copy an unverified boolean representation into a different query API.

**Case: invalid videos should not consume the limit.** YouTube IDs still require JavaScript validation. The helper filters invalid URLs and reads another cursor page when necessary to fill a bounded playable list.

### 2.2 Implement complete pagination

A finite CMS query returns `nextCursor`; it does not mean the collection ended. Keep a stable database order and pass that opaque cursor to the next query. Reject a repeated cursor to prevent an endless loop.

**Case: "0 = all" stopped at 100.** The cursor was previously ignored. It now reads batches of 100 until exhaustion. An isolated check used 205 entries and verified three cursor pages, with no silent truncation.

This implementation preserves the editor's existing "all on this page" behavior. Very large collections still produce large documents. For a growing archive, use visible next/previous navigation or numbered pages and query only the current page. Describe whether browser-side filter chips apply to that page or the whole archive. See [EmDash query API](https://docs.emdashcms.com/reference/api/).

### 2.3 Overlap independent reads and reuse results

Start independent work together. Preserve dependent order, such as fetching a page before knowing which blocks it contains. Keep preview/user-sensitive memoization scoped to one request.

**Case: layout concurrency was already present.** `Base.astro` already loaded site settings and five menus with `Promise.all`. Hero's primary-menu read was already deduplicated by EmDash. Adding another identical menu promise would not remove a database query.

The [page route](src/pages/[...slug].astro) now starts page and [site chrome](src/lib/site-data.ts) reads together, then loads independent collection blocks concurrently. Request-scoped `WeakMap` storage hands the results to components without repeating pagination or query processing. No visitor's results are shared with another visitor.

**Case: equivalent fragment contexts had different object identities.** The CMS can overlay SEO separately for head/body rendering, while its contribution cache is keyed by page-context identity. [Site middleware](src/middleware.ts) deduplicates equivalent fragment contexts within the request. This prevents repeated Site Scripts configuration work without storing administrator scripts in a process-global settings snapshot.

### 2.4 Treat query failures as failures

Check `result.error` before deciding that content is missing. Log details server-side. Return a useful 503/500 with no-store caching, and stop the success response before streaming starts.

**Case: database errors became empty successful pages or 404s.** The route and list blocks ignored `error`. The route now preloads all list reads and returns [a generic 503](src/lib/unavailable.ts) with `Retry-After: 30`, `Cache-Control: no-store`, and `Astro.cache.set(false)` on query failure. A real missing page remains a 404; a successful empty list remains an honest empty state.

## 3. Caching and freshness

### 3.1 Keep the layers distinct

| Layer | Stores | Scope | Main purpose |
| --- | --- | --- | --- |
| Browser asset cache | CSS, fonts, images, scripts | One browser | Reuse assets across navigation |
| Rendered HTML cache | Complete anonymous responses | CDN/platform/provider | Avoid running the application on a hit |
| EmDash object cache | Selected query results | KV or one Node process | Reduce database reads when applicable |
| Request memoization | Results during one render | One request | Deduplicate repeated reads |

Configure and invalidate each layer deliberately. A query-cache invalidation does not by itself remove HTML already at the edge. EmDash provides KV and memory backends; Node memory is per process. Its route-cache fills intentionally read fresh database data instead of older object-cache snapshots. See [EmDash object caching](https://docs.emdashcms.com/deployment/object-cache/).

### 3.2 Register every rendered dependency

For collection/entry results, use `cacheHint`; for chrome use the `WithCacheHint` settings/menu/taxonomy/widget helpers. Register hints for empty results and every cursor page, since adding the first item must replace cached emptiness.

```ts
const result = await getEmDashCollection("tutorials", {
  status: "published",
  limit: 6,
  orderBy: { published_at: "desc" },
});
if (result.error) throw result.error;
if (Astro.cache.enabled) Astro.cache.set(result.cacheHint);
```

**Case: all four collection blocks discarded hints.** Only the page entry, menus, and settings were tagged. The helper now registers Tutorials, Videos, Resources, and Services dependencies. Local production response headers confirmed the collection tags on the homepage.

### 3.3 Connect plugin settings to HTML invalidation

Any plugin that embeds configuration in HTML needs a dependency tag and a successful-write purge. Purge after permission checks and committed writes. Report a rejected purge separately from a failed settings write.

**Case: Site Scripts could leave removed analytics in cached HTML.** The installed CMS plugin-settings endpoint saved options without purging public pages. Middleware now tags public responses with `site-scripts`, watches only successful PUTs to that plugin's settings endpoint, and purges the tag. Unauthorized/failed saves do not purge.

**Case: an awaited purge is not always proof of success.** The installed Astro Cloudflare provider discards the native `cache.purge()` result. The production Site Scripts path checks the native `success` flag and treats rate-limit/rejection results as failures. That path is Cloudflare-specific; replace it with the destination provider's confirmed invalidation behavior when moving this project to Node.

### 3.4 Pick expiry from freshness requirements

Current public pages use a one-hour fresh window and a one-day stale-while-revalidate window, with write-driven invalidation. These are this site's settings, not a universal template. Events, inventory, permissions, and scheduled publishing may require different policies.

Verify a content edit actually replaces both the homepage and its listing. Test removal as well as addition. KV propagation and route freshness have different behavior; shortening TTLs alone does not repair missing tags or a missing purge path.

## 4. Cloudflare Workers optimization

### 4.1 Use the adapter's generated production configuration

This project uses `cacheCloudflare()` from `@astrojs/cloudflare/cache`, D1, R2, and KV. The adapter enables Workers Cache in its generated Wrangler configuration. Deploy the built entry/configuration; the source Worker alone does not contain Astro's compiled routes and assets. See [EmDash Cloudflare deployment](https://docs.emdashcms.com/deployment/cloudflare/).

**Case: KV did not eliminate expensive HTML misses.** The installed CMS deliberately bypasses query snapshots when filling route-cached anonymous HTML. This is a freshness safeguard. Keep it and optimize the real miss path rather than disabling it to improve a benchmark.

### 4.2 Understand Worker cache scope

Workers Cache sits before Worker execution. The older Cache API and zone CDN cache are different systems. Zone-level purge calls do not invalidate Workers Cache. Use the platform/provider associated with the actual rendered-response cache.

By default, Workers Cache partitions entries by Worker version, so a new deployment starts cold. An explicit `cross_version_cache` changes that assumption. This project does not enable that option. Confirm the new version's response markers after deployment; do not add an unauthenticated purge endpoint. See [Cloudflare Workers cache purging](https://developers.cloudflare.com/workers/cache/purge/).

**Case: old pages lacked new tags.** Within a shared cache namespace they would require a purge. Here, deployment version isolation gives the release a fresh HTML cache. The new `site-scripts` tag handles subsequent configuration changes within the deployed version.

### 4.3 Profile database trips, not just query totals

D1 latency includes network and database work. A JavaScript `Promise.all` does not guarantee one physical call or parallel execution on a shared session. The installed adapter coalesces SELECTs and orders physical batches on the session. Measure statements, batches, and their boundaries before changing the CMS adapter.

This project keeps `d1({ binding: "DB", session: "auto" })`. D1 read replication requires the Sessions API; selecting this adapter option alone does not prove replicas are enabled or that a particular read reached one. Check deployment state and freshness requirements before changing it. See [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/).

Worker placement is an experiment when repeated remote database trips dominate. Compare miss-path timings from representative visitor regions before enabling it. Moving compute nearer an origin changes the network tradeoff. No placement or database replication setting was changed in this implementation. See [Workers placement](https://developers.cloudflare.com/workers/configuration/placement/).

### 4.4 Reduce runtime and asset weight separately

Restrict icon sets and avoid importing unused server integrations. Inspect the server bundle for cold initialization costs. Inspect the public network separately from the admin bundle.

**Case: the build warned about a large CMS admin chunk.** The approximately 8.3 MB admin registry asset was not downloaded by ordinary public navigation. It was not evidence that a menu click loaded 8 MB of JavaScript. The configuration already restricts Phosphor icons; that optimization was retained.

### 4.5 Keep scheduled maintenance working

Retain the EmDash Worker entry and scheduled handler when wrapping the deployment. This site has a once-per-minute maintenance cron. Check scheduled publishing against the cache policy; warming all pages repeatedly is not a replacement for correct invalidation.

## 5. Self-hosting on Node.js

This section is a migration plan, not a claim that Node was benchmarked or deployed here. The query, error, routing, and frontend fixes above transfer; Cloudflare bindings, edge cache, and purge calls do not transfer unchanged.

### 5.1 Choose the smallest suitable topology

| Topology | Data/storage choice | Cache choice | Operational concern |
| --- | --- | --- | --- |
| One always-on Node process | SQLite on local persistent disk; local uploads or object storage | EmDash memory object cache; optional reverse-proxy HTML cache | Disk durability and backups |
| Several Node processes | Shared PostgreSQL, shared object storage | A shared HTML cache/invalidation design; per-process object caching needs explicit coordination | A write in one process must not leave another serving stale data |
| Node with remote SQLite-compatible service | libSQL and shared object storage | Cache based on measured network cost and the service's consistency behavior | Database network latency and credentials |

EmDash's documented SQLite deployment assumes one process with persistent disk; PostgreSQL is the documented shared-database option for several processes. See [EmDash database options](https://docs.emdashcms.com/deployment/database/).

### 5.2 Replace platform configuration deliberately

Use Astro's Node adapter with server output. Replace D1 with the chosen Node database and R2's Worker binding with local or S3-compatible storage. A minimal single-process pattern is:

```js
import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import emdash, { local, memoryCache } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    emdash({
      database: sqlite({ url: "file:/data/emdash.db" }),
      storage: local({
        directory: "/data/uploads",
        baseUrl: "/_emdash/api/media/file",
      }),
      objectCache: memoryCache(),
    }),
  ],
});
```

This illustrates platform wiring, not the full config for this React/plugin/font site. Keep required integrations and plugin registration when porting. Configure encryption/auth/storage credentials in the runtime environment. The standalone entry does not automatically load `.env`. See [EmDash Node deployment](https://docs.emdashcms.com/deployment/nodejs/).

### 5.3 Preserve the same correctness at the reverse proxy

Terminate HTTPS at a controlled proxy/load balancer and trust only the expected forwarded headers. Verify the public origin and canonical URLs. Enable compression and reuse hashed assets. Set public HTML lifetimes explicitly if caching HTML at the proxy.

Exclude admin, authenticated API, preview, personalized, and error responses from shared HTML caching. Wire CMS content/menu/settings/plugin changes to the HTML cache's invalidation mechanism. Astro cache hints still express dependencies, but a new host must implement the purge behavior; merely retaining `routeRules` does not configure an arbitrary reverse proxy.

**Transferred case:** a missing Tutorials cache hint produces stale listings on Node behind a reverse proxy just as it does on Cloudflare. The database backend does not repair a missing rendered-response dependency.

### 5.4 Keep storage and the process durable

Mount the SQLite directory and upload directory outside the disposable container layer. EmDash uses SQLite WAL; use a consistent backup procedure rather than copying just the `.db` file while committed changes may be in `-wal`. Place WAL storage on local/block disk, not a network filesystem.

Keep an always-on Node process for scheduled tasks, and use supervision/restart limits. Do not assume a sleeping host can publish scheduled entries on time. Separate liveness (process responds) from readiness (database, storage, migrations, sandbox ready). Verify restore procedures and the matching encryption key. See [EmDash Node operations](https://docs.emdashcms.com/deployment/nodejs/) and [backups](https://docs.emdashcms.com/guides/backups/).

### 5.5 Do not let memory caching hide multi-process staleness

EmDash memory cache is local to one process. Before scaling horizontally, establish how writes invalidate every process and the HTML proxy. A generic Redis recommendation is not an implementation: the documented built-in object adapters are KV and memory. Select or implement an adapter only after checking the current EmDash contract.

For remote PostgreSQL/libSQL, monitor connection pressure, query duration, and network latency. Place app and data near each other when measurements support it. Reuse clients/pools according to the selected adapter; avoid constructing a new external client inside every block render.

## 6. Frontend and navigation

### 6.1 Reuse shared CSS

Let large shared stylesheets be separate hashed assets so the browser can reuse them across documents. Keep inline CSS for genuinely small critical rules. Compare decoded HTML and transferred bytes separately.

**Case: `inlineStylesheets: "always"`.** Approximately 79,253 bytes of CSS were embedded in each production page. Around 69,695 bytes were combined app/component styles, including statically imported blocks absent from that page. The config now uses `"auto"`; the local production homepage sample had approximately 11 KB of inline styles plus reusable CSS links. This is a delivery improvement, not a controlled production navigation benchmark.

### 6.2 Keep useful content visible immediately

Avoid entrance opacity on headings, menus, and actions. Limit decorative motion to a deliberate location and respect reduced motion.

**Case: Hero restarted a 0.7-second entrance on every document navigation.** Some diagram labels finished approximately 1.7 seconds after rendering started. Hero text/actions now appear immediately; decorative drawing is restricted to the home cover.

### 6.3 Defer third-party media and minimize initial assets

Keep dimensions/aspect ratio stable. Render CMS image objects with EmDash's Image component. Load a video player when requested, with a usable watch link before JavaScript runs. Select font faces/weights from actual usage, then measure their effect before changing font preload behavior.

**Case: first-load fonts were approximately 141 KB across eight files.** Later navigations reused them from browser cache. This matters for initial loading, but did not explain the multi-second origin miss. Fonts and the existing preload/prefetch choice were left unchanged.

**Case: the YouTube facade already reduced initial work.** It remains click-to-load. The replacement iframe now receives focus when activation removed the focused anchor; modifier-click behavior is preserved.

### 6.4 Make navigation resilient

Expose navigation in the basic HTML/CSS experience. Hide it only after a working disclosure toggle is attached. Add Escape handling and return focus to the toggle. Normalize menu paths consistently.

**Case: mobile menu disappeared without JavaScript.** Below 900 px the menu used `display: none`, with no fallback. It is now visible until enhancement. Chromium confirmed the no-JavaScript menu, Escape closing, and focus behavior.

### 6.5 Check real computed theme values

Custom properties can contain invalid syntax without a build error. Check computed colors, surfaces, shadows, and interactive states in both modes. Keep normal small text at 4.5:1 contrast or above.

**Cases from this site:**

- White labels over bright dark-mode blue gradients had approximately 2.97–3.68:1 contrast. Solid control ink now provides 8.72:1 normal and 6.70:1 hover contrast.
- Small dark-mode links on the card surface were 4.05:1. Brighter ink gives 8.26:1 on that surface.
- Shadow tokens wrapped entire shadow expressions in `light-dark()`, which is invalid. The intended flat theme now explicitly uses `none`.
- The bundled admin CSS could override public `:root` surface tokens, producing white cards in dark mode. Public token declarations now use `html:root` to avoid relying on stylesheet order.

The retained Drawing Set design uses rules and registration marks for depth; no new decorative shadows or gradients were added.

## 7. Routing, SEO, and security

### 7.1 Make URL generation match real routes

Use a single canonical slash policy. Redirect aliases and preserve query parameters. Compare both stored menu URLs and the current path with the same normalization. Handle absolute same-origin links deliberately.

**Case: `/tutorials` and `/tutorials/` both returned 200.** They created separate cache entries; the unslashed form had another approximately 2.51-second MISS. Stored trailing slashes also broke `aria-current` and made Hero label ordinary pages as Cover. The route now redirects to the slashed form; header and Hero share a normalized matcher.

### 7.2 Keep sitemaps and SEO overrides correct

Check every advertised URL against the actual route and canonical tag. A seed edit is not a migration of an existing database. Preserve noindex exclusions and image/date metadata when overriding a sitemap.

**Case: sitemap links returned 404.** `/sitemap-pages.xml` advertised `/pages/tutorials` and `/pages/home`; real routes are `/tutorials/` and `/`. The runtime wrapper now maps those locations correctly. All seven local sitemap URLs returned 200 with matching canonicals. The seed defines `/{slug}` for new installations. The wrapper imports the installed internal CMS sitemap route, so recheck that dependency during upgrades.

**Case: homepage title edits were ignored.** The route passed `undefined` for the homepage title even after computing SEO metadata. It now honors `getContentSeo(page)?.title` and otherwise retains the site-title fallback.

### 7.3 Preserve trust boundaries when optimizing

Continue sanitizing stored links, using appropriate new-tab relationships, and escaping ordinary text. Keep admin/API responses private and noncached. Do not expose query errors or embed configuration secrets in public diagnostics.

**Case: Site Scripts raw HTML is intentional administrator input.** Treat it as trusted administrator code, not as ordinary untrusted form text. The plugin-settings endpoint requires plugin-management permission; anonymous requests were 401/private/no-store. The implemented HTTPS public header adds HSTS without including subdomains. A restrictive public CSP was not invented: it needs a policy matching intentional inline scripts, analytics, and media.

**Case: diagram "telemetry" was static copy.** "Live telemetry" and "Edge response: <20ms" were fixed strings. They were replaced with architectural labels, not performance claims.

## 8. Deployment and ongoing checks

### 8.1 Release procedure

1. Keep the lockfile and run the declared type/build checks.
2. Record the current Worker version for rollback.
3. Deploy the built application with its generated adapter configuration.
4. Verify version-specific markers such as `X-Site-Data-Ms`, stylesheet hashes, corrected diagram copy, and the sitemap. Do not infer a fresh release from a 200 alone.
5. Check whether the host shares HTML across versions. The current Cloudflare default partitions by version; if cross-version caching is enabled, use an authenticated purge through the correct Worker/provider.
6. Warm representative public routes with ordinary anonymous requests and record MISS versus HIT. Do not use random query parameters as the only benchmark.
7. Check missing-page status, slash/home redirects, admin protection, and one desktop/mobile navigation.
8. Record the release version, measurement location, timestamps, and any remaining issue.

### 8.2 Freshness checks after a content change

Verify a publish/edit/delete appears in home and listings. Verify menu/site-setting changes refresh chrome. Verify Site Scripts removal actually disappears from rendered HTML. Use disposable content only when a suitable staging environment or explicit authorization exists.

A deployed-code smoke check is different from exercising real authenticated edits. Keep that distinction in the release record. An isolated stub check of `cache.purge()` is not proof of Cloudflare edge invalidation.

### 8.3 Remaining work on this project

The implementation fixes site-level work and cache correctness. Production miss latency still requires attribution after deployment. Do not label the CMS cold-start issue solved just because local D1 is fast or a cached route is fast. Compare setup/runtime/render timing, physical database trips, and the site data header from real MISS responses.

Visible archive pagination is a future option for large collections. Public CSP, actual authenticated editing/cache separation, and database/placement topology changes need their own scoped work. No unsupported claim of complete security or WCAG certification is made.

### Post-deployment measurements from this case

Final Worker version: `aad7ff53-dd8f-45ca-86ce-0b0591267af5`, deployed 1 October 2026. Two anonymous compressed GETs per route from one measurement location produced the following samples. Responses were served through the ARN Cloudflare region. Contact had already been warmed by the concurrent browser smoke check, so its first sample is a HIT.

| Route | First TTFB | First status | Repeat TTFB | Repeat status | Site data in stored response |
| --- | ---: | --- | ---: | --- | ---: |
| `/` | 2014.8 ms | MISS | 74.5 ms | HIT | 722.0 ms |
| `/tutorials/` | 742.1 ms | MISS | 97.3 ms | HIT | 523.0 ms |
| `/videos/` | 672.4 ms | MISS | 67.3 ms | HIT | 470.0 ms |
| `/themes/` | 1969.9 ms | MISS | 62.1 ms | HIT | 728.0 ms |
| `/plugins/` | 1990.7 ms | MISS | 90.0 ms | HIT | 712.0 ms |
| `/services/` | 2420.7 ms | MISS | 91.4 ms | HIT | 764.0 ms |
| `/contact/` | 78.9 ms | HIT | 98.0 ms | HIT | 617.0 ms |

`X-Site-Data-Ms` on a HIT describes the cached render, not new work. These samples are not a controlled percentage-improvement comparison with the initial review; runtime warmth, traffic, and cache state differ. They show that cold/uncached latency remains material: miss samples ranged from 672.4 to 2,420.7 ms while repeat hits were 62.1–98.0 ms. Further origin work is still required.

Live Chromium also confirmed the existing hover request and a Tutorials menu navigation of approximately 93.4 ms with 300 bytes transferred on the document request. Mobile Contact had no overflow, Escape closed its navigation, and there were zero browser runtime exceptions. All seven sitemap locations matched their canonical pages; aliases returned 301, missing content returned 404, and anonymous plugin settings returned 401/private/no-store. The release's new timing header and HSTS were present.

The production homepage decoded document was approximately 57.5 KB with approximately 11.2 KB inline CSS. The original reviewed document was approximately 100–125 KB with 79.3 KB inline CSS. Large shared styles now have separate reusable stylesheet URLs; this is directly observable even though production origin miss timings remain variable.

## 9. EmDash HQ case index

| Concrete observation | Implemented change | Main category | Files |
| --- | --- | --- | --- |
| MISS/EXPIRED 1.47–2.46 s; HIT 70–112 ms | Overlap page/chrome reads; deduplicate fragment contexts; add data timing | General, Workers, code | `src/pages/[...slug].astro`, `src/lib/site-data.ts`, `src/middleware.ts` |
| Lists discarded cache hints | Register every result/cursor hint | Caching | `src/lib/hub-content.ts`, four Site collection blocks |
| Errors became empty 200/404 | Preload before streaming; 503/no-store | Code, security | Route, helper, `src/lib/unavailable.ts` |
| All capped at 100; filters/order applied afterward | CMS filters/order; bounded limits; cursor traversal | Queries | `src/lib/hub-content.ts` |
| Sitemap `/pages/*` locations returned 404 | Runtime mapping and seed URL pattern | Routing, SEO | `src/pages/sitemap-[collection].xml.ts`, `seed/seed.json` |
| White labels on bright controls failed contrast | Separate solid control colors and brighter dark links | Frontend | `src/styles/theme.css` |
| Approximately 79 KB inline CSS on each document | `inlineStylesheets: "auto"` | Frontend | `astro.config.mjs` |
| Slash variants had separate cache entries and no current-menu state | Canonical redirects and shared path matching | Routing | Route, `src/lib/links.ts`, Base, Hero |
| Site Scripts saved settings without purging HTML | Dependency tag and checked post-save platform purge | Caching, Workers | `src/middleware.ts` |
| Hero text/labels restarted delayed entrances | Immediate content; cover-only decorative draw | Frontend | `src/components/blocks/Hero.astro` |
| Invalid shadow functions and admin surface collisions | Valid flat tokens; protect public token specificity | Frontend | Theme and design documentation |
| Homepage SEO title override discarded | Honor explicit override, preserve fallback | SEO | Page route |
| Mobile nav hidden without JavaScript; Escape ineffective | Progressive enhancement and focus return | Frontend | Base behavior, theme fallback |
| Video replacement lost keyboard focus | Focus iframe after replacing facade | Frontend | `src/components/VideoFacade.astro` |
| Static illustration claimed live latency | Accurate architecture labels | General, frontend | Hero |

See [the original review](REVIEW-2026-10-01.md) for the initial measurements and [the implementation record](FIXES-2026-10-01.md) for validation and release status. Documentation and platform behavior were checked against the linked official sources on 1 October 2026; reverify API exports and cache semantics when upgrading.
