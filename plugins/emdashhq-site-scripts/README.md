# emdashhq-site-scripts

Analytics and custom code injection for [EmDash](https://emdashcms.com) CMS,
editable in the admin — no rebuilds to add or remove a tracker.

- **Plausible** — paste the script URL from your Plausible site (the newer
  `pa-XXXX.js` form is loaded together with its `plausible.init()` call; the
  older `script.js` format works with just your site domain). Self-hosted
  Plausible domains are supported.
- **Cloudflare Web Analytics** — paste the beacon token.
- **Google Analytics 4** — paste the measurement ID (`G-…`, `GT-…`, `AW-…`).
- **Custom HTML** — three free-form areas: `<head>`, start of `<body>`, end
  of `<body>`. For verification meta tags, GTM noscript iframes, fonts,
  preconnects, chat widgets.
- **Master switch** — one toggle disables everything without deleting your
  settings.

Every provider value is validated before render (bad tokens and IDs are
skipped with a warning in the logs), and nothing is ever injected on
`/_emdash/` admin pages.

## Install

```bash
npm install emdashhq-site-scripts
```

```js
import siteScripts from "emdashhq-site-scripts";

emdash({
  plugins: [siteScripts],
});
```

Then open **Plugins → Site Scripts & Analytics → Settings** in the admin
and paste your IDs or HTML. Changes apply on the next page render.

## Requirements

- EmDash `>=1.0.0`.
- **In-process registration only.** The plugin uses `page:fragments`, which
  EmDash deliberately never invokes for sandboxed plugins — raw scripts and
  HTML ship as first-party page code outside any sandbox boundary. For the
  same reason it is distributed on npm, not the EmDash plugin registry (the
  registry only carries sandboxed builds). Do not register it under
  `sandboxed:` — it loads but fragments are silently skipped.
- Your layout must render the fragment insertion points with the public page
  context. EmDash templates already do this in `Base.astro`:

  ```astro
  <EmDashHead page={pageCtx} />
  <EmDashBodyStart page={pageCtx} />
  <EmDashBodyEnd page={pageCtx} />
  ```

  If your theme doesn't, fragments have nowhere to go.

## Settings

| Setting | Type | Effect |
| --- | --- | --- |
| `enabled` | boolean | Master switch. `false` stops all injection without clearing the other fields. Default `true`. |
| `plausibleSrc` | url | Plausible script URL. A `pa-XXXX.js` URL is emitted with its `plausible.init()` call and needs nothing else. For the older `script.js`, also set the domain below. Empty + domain set = `https://plausible.io/js/script.js`. |
| `plausibleDomain` | string | `data-domain` for the older Plausible script format (e.g. `example.com`, comma-separated for rollups). Ignored for `pa-XXXX.js` URLs. |
| `cloudflareBeaconToken` | string | Cloudflare Web Analytics token; emits `beacon.min.js` with `data-cf-beacon`. |
| `gaMeasurementId` | string | GA4 measurement ID (`G-`, `GT-`, `AW-`); emits the `gtag.js` loader and `gtag("config")`. |
| `headHtml` | string (multiline) | Raw HTML at the end of `<head>`: verification meta, fonts, preconnects. |
| `bodyStartHtml` | string (multiline) | Raw HTML right after `<body>` opens: GTM noscript iframes, skip links. |
| `bodyEndHtml` | string (multiline) | Raw HTML before `</body>`: chat widgets, deferred scripts. |

All fields are optional; empty ones emit nothing. Provider values that fail
validation are skipped and logged, never rendered.

## Security notes

- The custom HTML areas render **verbatim**. Treat them as trusted
  administrator input — anyone who can edit plugin settings can ship
  arbitrary JavaScript to visitors.
- Declared capability: `hooks.page-fragments:register`.
- The plugin makes no network requests and stores nothing; settings live in
  EmDash's own plugin settings store.

## Development

```bash
npm run validate   # manifest check
npm run typecheck  # tsc
npm run build      # dist/plugin.mjs + generated descriptor
npm run test       # vitest inside workerd via @emdash-cms/plugin-test
npm publish        # distribute through npm
```

Built for [emdashhq.com](https://emdashhq.com). MIT license.
