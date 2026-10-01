# Cloudflare performance notes

Changes and findings for keeping D1 reads low on the Cloudflare deployment. Last updated 2026-10-01.

## Changes made

### `astro.config.mjs`

- `prefetch.defaultStrategy`: `viewport` -> `hover`. With `prefetchAll: true`, `viewport` was fetching every same-origin link that scrolled into view (nav, footer menus, card CTAs, about 10-15 URLs per pageview), including from Googlebot's tall render viewport. `hover` prefetches only on real navigation intent.
- `routeRules` `maxAge`: `300` -> `3600` on `/` and `/[...slug]`. Publish already purges cached pages by tag, so the freshness window only controls how often a request triggers an SWR revalidation render. An hour instead of five minutes means fewer wasted renders kicked off by prefetches.
- `routeRules` `swr`: `86400` -> `604800` on `/` and `/[...slug]`. A page with no visit for 25 hours used to fall out of cache and cost the next visitor a cold render. With seven days it answers stale from cache and refreshes in the background. Edits still show up right away because publishing purges by tag.

### `package.json` and `scripts/warm-cache.mjs`

- `npm run deploy` now ends with `npm run cache:warm`. The script reads the custom domain from `dist/server/wrangler.json`, collects every URL from `/sitemap.xml`, and requests each one (up to three passes) until `cf-cache-status` is a hit. A non-2xx page fails the command.

## Slow first click on menu links (2026-10-01)

Symptom: the first click on each header link took one to three seconds; the second click was instant.

Measured on production from one location:

| Request | TTFB | Notes |
| --- | --- | --- |
| Cache `HIT` | 0.07-0.13 s | Worker does not run |
| Cache `MISS`, cold isolate | 0.9-1.7 s (outlier 2.8 s) | `mw` 570-670 ms, `db.count` 20-24; the rest is isolate start for the 18 MB server bundle |
| Cache `MISS`, warm isolate | 0.3-0.4 s | `rt` 0, `mw` 140-200 ms |

Cause: [Workers Cache](https://developers.cloudflare.com/workers/cache/cache-keys/#invalidating-cache-across-deployments) puts the Worker version in the cache key, so every `wrangler deploy` starts from an empty cache. Several deploys on 2026-10-01 meant every page's first visit after each one was a cold render. Hover prefetch cannot hide it: it fires 80 ms after hover, and the render takes longer than the gap between hover and click.

Fix: warm the cache from the sitemap as the last deploy step. The cache is tiered, so one fill from any location stores the page in the upper tier for every data center. `cross_version_cache` was rejected: cached HTML from an older version can reference hashed `/_astro/` files the new version no longer serves.

Still cold: the first visit to a page after a publish purges it, and pages Cloudflare evicts for low traffic.

## Read-path layering (verified in `node_modules/emdash` and live KV)

A public page request passes through three cache layers before D1:

1. **Workers Cache** (`routeRules`, `cacheCloudflare()` provider): serves at the edge without invoking the Worker. `swr: 86400` serves stale while revalidating.
2. **Request cache** (`requestCached`): dedupes identical queries within one render.
3. **KV object cache** (`objectCache: kvCache({ binding: "CACHE" })`): `cachedQuery` read-through cache, keys prefixed `em:`, epoch-based invalidation (`em:epoch:<namespace>` keys; a write bumps the epoch and orphans old keys for TTL reclaim). Default TTL 3600s.

`getMenuWithCacheHint` -> `getMenu` -> `requestCached` -> `cachedQuery` with namespace `menus`. Confirmed live: the `CACHE` namespace (id `415f01d2b42c4740b56818ff28e7eaa6`) holds `em:menus:primary:*:ignore`, `em:menus:header_cta:*:ignore`, `em:menus:footer_learn|footer_resources|footer_company:*:ignore`, `em:settings:all`, `em:content:v2:*` entry/collection results, and the `em:epoch:*` anchors.

The `WithCacheHint` suffix is about page-level cache tags for `Astro.cache.set()` (publish invalidation). It is unrelated to the KV object cache; both layers apply to the same call.

## Why menu queries still showed in D1 top queries

`Base.astro` runs 6 settings/menu queries per render plus per-block collection queries. They hit D1 only when KV misses: cold reads in a region, TTL expiry, epoch bumps after an edit, and every `/_emdash/` request (deliberately `maxAge: 0`). The prefetch change cuts how often uncached renders happen at all.

## Revisions

No manual cleanup needed or possible:

- Remote `revisions` table held 19 rows, exactly 1 per entry, all referenced by `live_revision_id`/`draft_revision_id` on the `ec_*` rows. Unreferenced count: 0. Deleting them would break published entries.
- EmDash prunes automatically: every revision insert queues the entry in `_emdash_revision_prune_queue`; the `* * * * *` cron trigger runs `runSystemCleanup`, which prunes to the 50 newest revisions per entry (`REVISION_KEEP_COUNT` in `node_modules/emdash/src/cleanup.ts`), never deleting live/draft pointers.
- Table state at check time: `revisions` 19, `_emdash_404_log` 11 (capped by cleanup), `audit_logs` 0, `_emdash_media_usage` 0. DB size ~1.8 MB.

## Commands used (for future checks)

```bash
# Remote D1 query
npx wrangler d1 execute emdashhq --remote --json --command "SELECT ..."

# Revision health
npx wrangler d1 execute emdashhq --remote --json --command \
  "SELECT collection, entry_id, COUNT(*) AS n FROM revisions GROUP BY collection, entry_id ORDER BY n DESC"
npx wrangler d1 execute emdashhq --remote --json --command \
  "SELECT * FROM _emdash_revision_prune_queue"

# List object-cache keys in KV
npx wrangler kv key list --namespace-id 415f01d2b42c4740b56818ff28e7eaa6 --prefix "em:"
```

## Watch items

- If `_emdash_menu_items` / `_emdash_menus` stay near the top of D1 insights after the `hover` + `maxAge` deploy, the residual is KV misses (cold regions, TTL expiry) rather than missing caching. A longer KV TTL would reduce it; menu invalidation is epoch-based so a long TTL is safe.
- `_emdash_404_log` DELETE and `_emdash_migrations` COUNT are the per-minute system cleanup cron; they are cheap and expected.
