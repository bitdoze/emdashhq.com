# EmDash performance best practices: Astro, Cloudflare Workers, and self-hosting

A slow navigation can come from CMS startup, database reads, uncached HTML, oversized assets, or animations that delay visible content. Each needs a different fix.

This guide explains how to measure those costs and improve an EmDash site without compromising content freshness. Start with the general and code sections, then follow the advice for your hosting platform.

The before-and-after examples adapt fixes from a real EmDash code review, using generic collections and configuration. Replace example fields with your schema. Code that uses `Astro` belongs in an Astro component or route's frontmatter unless stated otherwise.

## 1. General: measure the request that is actually slow

### Compare cache misses, cache hits, and cold startup

Measure the same public URL twice. Record response status, time to first byte (TTFB), cache status, and timing headers:

```bash
curl --compressed -sS -D - -o /dev/null \
  -H 'Accept: text/html' \
  -w '\nTTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n' \
  https://example.com/
```

A fast second request may only show that HTML caching works. It does not establish that database reads or CMS initialization are fast.

Measure three conditions separately:

| Condition | What it helps you investigate |
| --- | --- |
| HTML cache hit | Cached delivery and browser/network overhead |
| HTML cache miss with a warm runtime | Content queries, plugin hooks, and rendering |
| HTML cache miss with a cold runtime | Initialization plus the normal rendering work |

Use production builds. Development adds compilation and hot reload, and does not reproduce production HTML caching. Take several samples, retain slow results, and compare the same regions and request conditions.

On Cloudflare, record `CF-Cache-Status` and `CF-Ray`. A cached response may retain the original `Server-Timing` headers; those timings describe the cached render, not database work performed on the hit.

### Use a simple page to find shared overhead

Compare a collection listing with a page that has no listing. If both are slow, inspect their shared work: CMS initialization, site settings, menus, and plugin contributions.

Use browser DevTools to separate document waiting time from CSS, fonts, images, JavaScript, and animation delays. A heading that fades in late can make an otherwise completed navigation feel slow.

## 2. Code: reduce and coordinate CMS reads

### Query only the entries you need

Apply supported filtering and ordering in the CMS query. Request the displayed limit rather than fetching a large collection and slicing it afterward.

**Before: fetch a large subset, filter it, then slice it.** This example assumes a `posts` collection with a `featured` boolean:

```ts
const result = await getEmDashCollection("posts", {
  status: "published",
  limit: 100,
});

const posts = result.entries
  .filter((entry) => entry.data.featured)
  .slice(0, 6);
```

**After: ask the database for the ordered, filtered result.** For an SQLite-backed schema where the boolean is stored as an integer:

```ts
import { getEmDashCollection } from "emdash";

const result = await getEmDashCollection("posts", {
  status: "published",
  where: { featured: "1" },
  limit: 6,
  orderBy: { published_at: "desc" },
});

if (result.error) throw result.error;
if (Astro.cache.enabled) Astro.cache.set(result.cacheHint);

const posts = result.entries;
```

Replace the collection and fields with those defined in your schema. Verify boolean filter representation against the adapter you use rather than assuming every database stores booleans identically. See the [EmDash query API](https://docs.emdashcms.com/reference/api/).

Filtering after a limited query can produce incorrect results. A matching entry outside the fetched subset will never reach the filter. Sorting that subset afterward also does not give the correct global order.

**Check the fix:** put a matching entry beyond the old subset in a development dataset. Confirm it appears in the correct order, and that the query requests the displayed limit.

### Handle cursors deliberately

When a result includes `nextCursor`, use it to request the next batch. Keep a stable query order, and detect repeated cursors if you build a traversal helper.

If a display condition must run in JavaScript, such as validating an external video identifier, continue fetching until you fill the displayed limit or exhaust the collection.

For growing archives, use visible pagination instead of fetching every entry into one document. Explain whether browser-side filters affect the current page or the entire archive.

**Before:** a helper fetches one batch and calls it “all entries,” or filters out invalid entries and returns fewer cards than requested.

**After:** follow cursors until a bounded list is full. This reusable helper accepts an eligibility check for conditions that cannot be expressed in the database query:

```js
import { getEmDashCollection } from "emdash";

async function loadPosts(context, limit, isEligible = () => true) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("A positive display limit is required");
  }

  const entries = [];
  const seen = new Set();
  let cursor;

  do {
    const result = await getEmDashCollection("posts", {
      status: "published",
      orderBy: { published_at: "desc" },
      limit: Math.min(100, limit - entries.length),
      cursor,
    });
    if (result.error) throw result.error;
    if (context.cache.enabled) context.cache.set(result.cacheHint);

    entries.push(...result.entries.filter(isEligible));
    if (entries.length >= limit) return entries.slice(0, limit);

    cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) {
      throw new Error("Repeated pagination cursor");
    }
    if (cursor) seen.add(cursor);
  } while (cursor);

  return entries;
}

const posts = await loadPosts(Astro, 6);
```

For an explicit export or small “show all” feature, traverse until the cursor ends instead of stopping at a display limit. Keep large public archives paginated.

**Check the fix:** use more entries than one batch can return, include ineligible entries, and confirm both completeness and termination.

### Start independent reads together

Load independent settings, menus, and content queries with `Promise.all`. Keep dependent work in order: you need a content entry before you know which collections its blocks reference.

Reuse results within the request. EmDash already deduplicates supported reads during a render; check what is still repeated before adding another cache. If you need application memoization, scope it to the request so previews or user-specific results cannot leak between visitors.

`Promise.all` alone does not ensure that a remote database adapter executes requests concurrently. Check adapter batching separately.

**Before: a content query delays independently needed layout reads.**

```ts
const content = await getEmDashEntry("posts", Astro.params.slug ?? "");
const [settings, menu] = await Promise.all([
  getSiteSettingsWithCacheHint(),
  getMenuWithCacheHint("primary"),
]);
```

**After: overlap content and layout reads, and register every dependency.**

```ts
import {
  getEmDashEntry,
  getMenuWithCacheHint,
  getSiteSettingsWithCacheHint,
} from "emdash";

const [content, settings, menu] = await Promise.all([
  getEmDashEntry("posts", Astro.params.slug ?? ""),
  getSiteSettingsWithCacheHint(),
  getMenuWithCacheHint("primary"),
]);

if (content.error) throw content.error;
if (Astro.cache.enabled) {
  Astro.cache.set(content.cacheHint);
  Astro.cache.set(settings.cacheHint);
  Astro.cache.set(menu.cacheHint);
}
```

If layout reads already run in parallel, check whether content loading still precedes them unnecessarily. If several components share a custom query helper, store its promise on request-owned state rather than a global result snapshot.

**Check the fix:** compare render wall time. If it stays unchanged on D1, check whether page-query coalescing is enabled.

### Fail before sending a successful document

Check query errors before treating an entry as missing or a list as empty. Complete essential CMS reads before streaming the success response.

For a transient database failure:

- Log the details on the server.
- Return a generic 503 response.
- Set `Cache-Control: no-store` and disable Astro route caching with `Astro.cache.set(false)`.
- Include `Retry-After` when appropriate.

Keep genuine missing content as 404 and successful empty queries as empty states. Otherwise, an outage can become a cached empty page.

**Before:** destructure `entry`, ignore `error`, and return 404 whenever `entry` is missing.

**After:** distinguish database failure from missing content before rendering:

```ts
import { getEmDashEntry } from "emdash";

let result;
try {
  result = await getEmDashEntry("posts", Astro.params.slug ?? "");
  if (result.error) throw result.error;
} catch (error) {
  console.error("Content query failed", error);
  Astro.cache.set(false);
  return new Response("Temporarily unavailable. Please try again.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "30",
    },
  });
}

if (Astro.cache.enabled) Astro.cache.set(result.cacheHint);
if (!result.entry) return Astro.rewrite("/404");

const post = result.entry;
```

Complete essential collection reads inside the same error boundary before rendering starts.

**Check the fix:** simulate an unavailable database in development. The response should be 503/no-store, while a genuinely missing slug still returns 404.

## 3. Caching: make freshness part of the implementation

### Give each cache a clear job

| Layer | Purpose | Required discipline |
| --- | --- | --- |
| Browser asset cache | Reuse CSS, fonts, scripts, and images | Hashed URLs and suitable asset headers |
| Rendered HTML cache | Avoid application execution for public responses | Content dependencies and write-driven invalidation |
| EmDash object cache | Reuse selected query results across requests | Adapter-specific invalidation and propagation |
| Request memoization | Avoid repeated work during one render | Request isolation |

Object caching and rendered HTML caching are separate. Invalidating query results does not automatically remove HTML stored by a proxy or CDN.

EmDash route-cache fills intentionally bypass selected object-cache snapshots to obtain fresh database data. Preserve that safeguard. Optimize the miss path rather than allowing old query results to repopulate recently purged HTML. See [EmDash object caching](https://docs.emdashcms.com/deployment/object-cache/).

### Register every rendered dependency

Pass content query `cacheHint` values to `Astro.cache.set()` when caching is enabled. For settings, menus, taxonomies, and widgets, use the corresponding `WithCacheHint` helpers.

Register dependencies for every cursor batch and for empty results. An empty list still needs invalidation when an editor publishes its first entry.

A useful freshness check is to publish, edit, and remove an entry, then inspect every cached view that displays it. Repeat for menu and site-setting changes.

**Before: hints disappear when the result is empty.**

```ts
if (result.entries.length > 0) {
  Astro.cache.set(result.cacheHint);
}
```

**After: register a successful query's dependency even when it has no entries.**

```ts
if (result.error) throw result.error;
if (Astro.cache.enabled) Astro.cache.set(result.cacheHint);
```

**Check the fix:** cache an empty list, publish its first entry, and confirm the list refreshes without waiting for expiry.

### Invalidate HTML after plugin settings change

When a plugin embeds analytics, custom HTML, or other settings into a response:

1. Tag the rendered responses with that configuration dependency.
2. Authenticate and authorize the settings update.
3. Save the settings successfully.
4. Purge the dependent HTML through the actual cache provider.
5. Check the purge result and report a failure if the cache was not refreshed.

An awaited purge call does not always prove success. Inspect whether the provider throws on failure or returns a result you must check. Test removal as well as addition: removed scripts must disappear from cached documents.

**Before:** an authorized settings save succeeds, but already cached HTML continues to embed the old configuration.

**After:** use a dependency tag on public responses that render the configuration:

```ts
if (Astro.cache.enabled) {
  Astro.cache.set({ tags: ["plugin-config"] });
}
```

For native Cloudflare Workers Cache, the server-side purge after a successful authorized save can check the returned result:

```js
// Cloudflare Worker code, after authorization and a committed settings save.
const { cache } = await import("cloudflare:workers");
const result = await cache.purge({ tags: ["plugin-config"] });

if (!result.success) {
  throw new Error("Settings saved, but HTML cache refresh failed");
}
```

Integrate that failure with your handler's response: tell the administrator that the settings were saved but cache refresh failed. Use the destination provider's purge mechanism when self-hosting. Keep this operation behind the existing authorized settings workflow.

**Check the fix:** remove an injected script and inspect the next public document. Also confirm that a rejected settings request does not trigger a purge.

### Choose expiry from content requirements

Set cache lifetimes according to how quickly edits must appear. Pair longer public HTML lifetimes with dependable invalidation. Use stale-while-revalidate only where temporarily serving older content is acceptable.

Exclude admin, authenticated, preview, personalized, and error responses from shared caching. Verify both cache lookup bypass and cache storage behavior for those requests.

## 4. Cloudflare Workers: optimize the origin miss path

### Enable D1 batching for concurrent reads

The EmDash D1 adapter offers per-request SELECT coalescing.

**Before: sessions are enabled, but page-query batching is omitted.**

```js
d1({ binding: "DB", session: "auto" })
```

**After: enable coalescing alongside sessions.**

```js
import { d1 } from "@emdash-cms/cloudflare";

// Inside emdash({ ... })
database: d1({
  binding: "DB",
  session: "auto",
  coalesce: true,
}),
```

This groups compatible reads issued in the same event-loop turn into a D1 batch. It is especially useful when a layout loads several menus and settings concurrently. CMS startup batching and page-query batching are separate; the presence of one does not prove the other is enabled.

Compare render time and TTFB on real MISS responses before and after the change. Logical query counts may stay the same because batching reduces physical calls, not the number of statements. Summed query durations can overlap and exceed elapsed time.

Coalescing is documented as experimental. Keep dependent reads and writes sequential: a buffered read issued concurrently with a write may execute after that write. See [EmDash D1 configuration](https://docs.emdashcms.com/reference/configuration/).

**Check the fix:** measure a cache miss on a layout with several independent reads. Compare render time rather than expecting the logical query count to decrease.

### Verify read replication before relying on it

`session: "auto"` configures EmDash's use of D1 sessions. You must also enable read replication on the database itself through Cloudflare.

Before enabling replicas:

- Confirm the database's current replication setting.
- Decide whether anonymous visitors can tolerate replication lag.
- Verify authenticated bookmark behavior and writes.
- Test a publish, HTML purge, and cache refill for freshness.

Use D1 result metadata such as `served_by_region` and `served_by_primary` when diagnosing routing. Configuration alone does not prove that a request reached a replica. See [D1 read replication](https://developers.cloudflare.com/d1/configuration/read-replication/).

### Move migration verification into deployment

For a provisioned production database, deployment-managed migrations can remove schema/setup checks from visitor requests.

**Before:** production relies on default runtime migration behavior, and the deployment command only builds and uploads.

**After:** move verification into the release and retain automatic migrations in development:

```js
// Inside emdash({ ... })
migrations: {
  runtime: "manual",
  dev: "auto",
},
```

Use this only with a release process that verifies the schema before uploading:

```bash
npm run build && \
npx emdash migrate --check --wrangler-config wrangler.jsonc && \
npx wrangler deploy
```

Chain these steps so a failed migration check stops deployment. Keep the generated `.emdash/migrations.json` paired with the build, and ensure the check and upload select the same account, environment, and database.

If known migrations are pending, inspect status, apply them against the reviewed target, and rerun the check. Investigate unknown migration records or an interrupted remote apply before retrying. Keep automatic migration behavior in development when useful.

Manual mode removes migration work, not the runtime's plugin, settings, or other initialization reads. See [EmDash core migrations](https://docs.emdashcms.com/deployment/core-migrations/).

For example, make the guarded command the standard deployment entry in `package.json`:

```json
{
  "scripts": {
    "deploy": "astro build && emdash migrate --check --wrangler-config wrangler.jsonc && wrangler deploy"
  }
}
```

**Check the fix:** confirm a pending migration blocks upload in a development or staging release. Inspect cold production timing headers to confirm setup/migration probes are removed; remaining initialization may still take time.

### Use the correct cache and deployment configuration

Deploy Astro's built application with its generated adapter configuration. Confirm the bindings for database, media, object cache, and sessions.

Distinguish Workers Cache from the older Cache API and zone CDN cache. Use the invalidation mechanism for the system that actually stores your HTML. By default, Workers Cache partitions by Worker version; enabling cross-version caching changes the release invalidation requirements. See [Workers Cache purging](https://developers.cloudflare.com/workers/cache/purge/).

Keep the EmDash scheduled handler and the required Cron Trigger so publishing and maintenance continue to run. A page-warming job does not replace content invalidation.

### Measure placement and server bundle costs

Consider Smart Placement when repeated remote service calls dominate. Compare representative regions and account for the latency of forwarding requests. Do not guess a database location or assume placement improves every application. See [Workers placement](https://developers.cloudflare.com/workers/configuration/placement/).

Inspect server startup separately from browser downloads. A large admin asset in the build output is not evidence that public navigation downloads it. Check the actual public network requests, and remove unused server integrations or broad icon imports where appropriate.

## 5. Self-hosting: keep the application and its data durable

### Choose a topology before choosing caches

| Deployment | Database and media | Cache considerations |
| --- | --- | --- |
| One Node process | SQLite on persistent local disk; local uploads or object storage | Process-local object cache; optional HTML proxy cache |
| Several Node processes | Shared PostgreSQL and shared object storage | Invalidation must reach every process and the HTML cache |
| Remote database | Supported PostgreSQL or libSQL adapter; durable media | Monitor connections, network latency, and query time |

A minimal single-process configuration is:

```js
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
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

Mount `/data` on persistent storage and keep the integrations and plugins your application needs. Supply encryption keys and other credentials through the process environment; the standalone Node entry does not automatically load `.env`. See [EmDash Node deployment](https://docs.emdashcms.com/deployment/nodejs/).

### Keep SQLite on suitable storage

Use local disk or a block volume for SQLite WAL, rather than a network filesystem. Give the process write access to the database directory.

Back up through a consistent SQLite backup procedure. Copying only the main database file can omit committed data still in the WAL. Back up media and the required encryption key, and verify restoration. See [EmDash backups](https://docs.emdashcms.com/guides/backups/).

### Configure the reverse proxy deliberately

Terminate HTTPS at a controlled proxy, enable compression, and serve hashed assets with reusable cache headers.

If caching HTML at the proxy, implement public-response eligibility and CMS-driven invalidation there. Astro dependency hints do not automatically configure an arbitrary proxy. Content, menu, setting, and plugin changes must refresh the affected HTML.

Memory object caching is per process. Before adding more instances, establish how writes invalidate every instance. Reuse database pools through the selected adapter rather than creating clients inside each component.

### Keep processes and scheduled work running

Use a process supervisor or container restart policy. Keep at least one Node process running for scheduled publishing and maintenance.

Separate liveness from readiness: a responding process can still have an unavailable database, storage backend, or plugin sandbox. Apply and verify deployment migrations before switching production traffic when using manual runtime migration mode.

## 6. Frontend: reduce delivery cost and visible delay

### Reuse large stylesheets

Avoid forcing every stylesheet inline. Large repeated CSS increases each HTML document and cannot be reused independently across navigation.

**Before:** `build.inlineStylesheets` is set to `"always"`.

**After:** let Astro separate larger stylesheets:

```js
// In Astro configuration
build: {
  inlineStylesheets: "auto",
},
```

Compare decoded HTML size, transferred bytes, and stylesheet reuse across several navigations. Keep small critical rules inline when useful.

**Check the fix:** inspect the built document and navigate between pages. Shared stylesheet URLs should be reused, and large CSS blocks should no longer be repeated in every document.

### Make important content visible immediately

Show headings, menus, and primary actions without an entrance opacity delay. Use decorative animation where it adds value, and respect reduced-motion preferences.

**Before: important text starts invisible.**

```css
.hero-title {
  opacity: 0;
  animation: reveal 700ms ease 300ms forwards;
}
```

**After: render the heading immediately and restrict motion to decoration.**

```css
.hero-title {
  opacity: 1;
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .hero-decoration {
    animation: none;
  }
}
```

**Check the fix:** navigate directly to the page and confirm the heading and actions are visible as soon as the document renders.

Inspect existing prefetch behavior before changing it. Confirm that hovering triggers the expected request and that navigation reuses it. Prefetch can improve a later click while leaving the first uncached origin request slow.

### Defer expensive media and check the enhanced experience

Use the EmDash Image component for CMS image objects, preserve dimensions, and avoid loading below-the-fold media eagerly. Load third-party video players on demand with a usable fallback link and stable aspect ratio.

Limit fonts and weights to actual usage. Measure initial font transfers and reuse on later navigation before changing preload behavior.

Keep mobile navigation usable before JavaScript enhancement. Support Escape and focus return for menu disclosures. When replacing a focused media link with a player, move focus to the replacement.

**Before:** keyboard activation removes the focused video link, leaving focus without a useful destination.

**After:** in the existing player activation handler, preserve focus when replacing the facade:

```js
// facade is the existing link; iframe is the configured replacement player.
const restoreFocus = facade.contains(document.activeElement);
iframe.tabIndex = 0;
facade.replaceWith(iframe);
if (restoreFocus) iframe.focus();
```

Keep modifier-click behavior and the no-JavaScript watch link in the original handler. Configure the iframe title, allowed features, and validated video URL before replacement.

**Check the fix:** activate the video with the keyboard and confirm focus moves to the player; modifier-click should still open the watch link normally.

### Prevent theme collisions from bundled styles

**Before:** public and admin styles both declare `:root` surface tokens, so stylesheet order can produce incorrect public colors.

**After:** give public theme declarations deliberate scope or specificity. If the competing rule is `:root`, an override such as this takes precedence without depending on load order:

```css
html:root {
  --color-surface: light-dark(#ffffff, #0b2440);
}
```

Use colors that match your theme and its existing `color-scheme` controls. Keep dedicated text-on-button colors when brand colors change between modes, and check both normal and hover contrast.

For a flat theme, use a valid shadow value:

```css
html:root {
  --shadow: none;
}
```

Avoid putting an entire shadow expression inside `light-dark()`, which accepts colors. If the design needs a shadow, define its geometry separately from its color.

**Check the fix:** inspect computed surface, text, button, and shadow values in both modes. A successful build does not establish that custom-property values are valid when used.

### Keep mobile navigation available before enhancement

**Before:** mobile CSS hides the menu unconditionally, so it remains inaccessible when JavaScript fails.

**After:** start with an accessible navigation list and apply collapsed styling only after the toggle handler is installed. For a single header navigation:

```css
.nav-toggle { display: none; }
.nav-panel { display: flex; }

@media (max-width: 56rem) {
  .nav-panel { flex-direction: column; }
  .nav-enhanced .nav-toggle { display: inline-flex; }
  .nav-enhanced .nav-panel:not(.is-open) { display: none; }
}
```

Use a native button with `aria-controls="nav-panel"` and `aria-expanded="false"`, and give the navigation container `id="nav-panel"`. Install the behavior in a processed Astro script:

```js
const toggle = document.querySelector(".nav-toggle");
const panel = document.querySelector("#nav-panel");

if (toggle instanceof HTMLButtonElement && panel instanceof HTMLElement) {
  const setOpen = (open) => {
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  setOpen(false);
  document.documentElement.classList.add("nav-enhanced");
}
```

If using Astro's client router, adapt setup and cleanup to its navigation lifecycle rather than accumulating listeners.

**Check the fix:** disable JavaScript and confirm links remain available. With JavaScript enabled, test the toggle, Escape, `aria-expanded`, and returned keyboard focus.

### Normalize equivalent URLs

**Before:** both `/articles` and `/articles/` return full documents, splitting the HTML cache and confusing current-link comparisons.

**After:** choose one form, redirect the other, and preserve query parameters. For a catch-all content route using trailing slashes:

```ts
if (Astro.params.slug && !Astro.url.pathname.endsWith("/")) {
  return Astro.redirect(
    `${Astro.url.pathname}/${Astro.url.search}`,
    301,
  );
}
```

Apply this policy to content routes, preserving the behavior of asset and API URLs. Make menu matching and sitemap generation use the same canonical form.

**Check the fix:** request both forms, confirm one redirects, and verify the sitemap advertises the final URL.

## 7. A practical order for implementation

Work through the highest-value changes first:

1. **Measure:** separate HTML hits, warm-runtime misses, and cold-runtime misses.
2. **Reduce reads:** apply database filters and ordering, request bounded results, and handle pagination.
3. **Coordinate reads:** overlap independent work and enable supported database batching.
4. **Make caching correct:** register all dependencies and verify invalidation after edits and removals.
5. **Prepare deployment:** verify core migrations before using manual runtime mode.
6. **Reduce delivery cost:** reuse CSS and fonts, defer media, and remove delays on essential content.
7. **Check the result:** repeat production measurements and confirm errors, previews, and authenticated responses remain uncached.

Choose one canonical URL form and redirect aliases to avoid splitting the HTML cache. Confirm sitemap locations resolve to those canonical URLs. Recheck these behaviors after framework or CMS upgrades.

Keep a short release record with versions, measurement conditions, typical results, and slow samples. A faster cached response is useful, but the uncached request still needs its own performance budget.
