# EmDash HQ site and plugin review

Reviewed: 10 October 2026.

Scope: the Astro site, deployment and cache configuration, CMS rendering, and all three local plugins: Contact Forms 1.1.1, Widgets 1.0.3, and Site Scripts 1.0.0. This is a technical review with a browser spot check, not a complete accessibility or penetration audit. Recommendations have not been implemented.

## Overall assessment

The site has a coherent visual identity and a sound CMS architecture. Preserve the Print Edition theme, server rendering, request-scoped query reuse, content cache hints, and deployment migration guard. The most valuable next work is Contact Forms validation and export safety, plugin data cache invalidation, and Widgets progressive enhancement.

There are **4 P1 findings and 9 P2 findings** below. No unconditional P0 outage was established. Several problems depend on configuration or failure conditions; those conditions are stated explicitly.

Priority meanings: **P1** should be addressed in the next corrective release; **P2** should follow in a focused maintenance pass.

## Verification performed

| Check | Result |
| --- | --- |
| Site `npm run typecheck` | Passed: 133 files, 0 errors, 0 warnings, 3 unused-code hints in `scripts/update-blog-content.mjs`. |
| Site `npm run build` | Passed. Vite reported chunks above 500 kB; their impact on public pages was not established. |
| Contact Forms manifest validation and tests | Passed: 11 tests. |
| Widgets manifest validation and tests | Passed: 8 tests. |
| Site Scripts manifest validation and tests | Passed: 2 tests. |
| Typechecks in all three plugin packages | Passed. |
| Widgets source/component mirrors | All 23 checked files match their site copies byte for byte. |
| Widgets block definitions versus seed | All 19 definitions match. |
| Browser inspection | Public production home, contact, widget gallery, and plugins pages at 1440 px and 390 px; no horizontal document overflow in those samples. |
| Theme switching | Contact page changed to the expected dark color scheme at both widths. |
| JavaScript-disabled gallery | Confirmed: only 1 of 3 tab panels is visible. Mobile navigation remains visible. |
| Isolated validation reproductions | Required checkbox values `off` and `no` return no validation error; CSV value `=1+1` remains unchanged. |
| Impeccable detector | 85 advisories: 82 palette reports and 3 left-border reports. These are not 85 confirmed defects; see notes below. |

Build and plugin test commands initially encountered sandbox socket restrictions. They passed after rerunning with approved access. The test runner also emitted workerd broken-pipe diagnostics, but all three suites completed successfully.

Browser observations concern the deployed site; they do not prove it runs exactly the reviewed checkout. No production form submissions, emails, deployments, or CMS writes were performed. No authenticated admin browser session, full contrast scan, 200% zoom pass, or cold-cache performance benchmark was performed.

## P1 findings

### 1. Contact Forms accepts unchecked required checkboxes

**Location:** [public.ts](plugins/emdashhq-contact-forms/src/public.ts), lines 80–105 and 332–340.

Missing checkbox inputs become `off`, which passes the generic nonempty check. The checkbox branch does not enforce a checked value. An arbitrary nonempty value also passes and is then stored as `off`. This makes a required checkbox enforceable only by the browser, which direct clients can bypass.

**Recommendation:** validate checkbox state explicitly before the generic string check. Required checkboxes must be checked; define accepted checked/unchecked representations and reject unexpected values. Preserve unchecked optional checkboxes as `off`.

**Acceptance:** omitted, `off`, and unexpected required-checkbox values are rejected by the submit route; `on` is accepted. Add route-level coverage rather than relying on native browser validation.

### 2. Contact Forms CSV exports preserve spreadsheet formulas

**Location:** [public.ts](plugins/emdashhq-contact-forms/src/public.ts), line 355 and `csvCell()` at line 411; [admin.ts](plugins/emdashhq-contact-forms/src/admin.ts), `viewCsv()` at line 717.

`cf_page` is visitor-controlled and becomes `submission.pageUrl`. Both CSV serializers escape CSV delimiters but leave formula prefixes unchanged. A posted `cf_page` of `=1+1` becomes a spreadsheet formula when exported and opened by an administrator. The private export route does not eliminate the risk because the untrusted input originated on the public submit route.

**Recommendation:** share one serializer between downloadable and copyable exports. Normalize page metadata to a valid site URL/path, and apply a documented spreadsheet-safe text policy to untrusted cells. Test formula prefixes, quotes, delimiters, tabs, and carriage returns in the spreadsheet applications you support. CSV quoting alone is insufficient, and no mitigation is universal across spreadsheet applications and programmatic consumers. [OWASP CSV Injection guidance](https://community.owasp.org/attacks/CSV_Injection).

**Acceptance:** a crafted page value cannot become an executable formula in the supported export workflow; ordinary multiline messages and commas still export correctly.

### 3. Form field keys can overwrite the submission protocol

**Location:** [admin.ts](plugins/emdashhq-contact-forms/src/admin.ts), lines 1089–1103; [public.ts](plugins/emdashhq-contact-forms/src/public.ts), lines 71–77; [ContactForm.astro](src/components/blocks/ContactForm.astro), hidden inputs beginning at line 59.

The field-key pattern accepts keys such as `cf_slug`, `cf_hp`, `cf_ts`, and `cf_page`. The renderer already uses those names. Since form parsing keeps the last value for each name, a user-facing field can overwrite routing or anti-spam metadata. For example, a text field called `cf_hp` can cause a legitimate message to receive a success redirect without being stored.

**Recommendation:** reserve the entire `cf_` prefix when creating or editing fields. Also validate stored definitions at submission time, and reject duplicate protocol inputs. Flag existing conflicting fields in the admin so owners can rename them deliberately.

**Acceptance:** the admin rejects reserved keys; a stored conflicting definition cannot silently lose a submission.

### 4. Cached pages lack dependencies for plugin-owned form and widget data

**Location:** [ContactForm.astro](src/components/blocks/ContactForm.astro), lines 35–46; [widgets/config.ts](src/components/blocks/widgets/components/config.ts), `callRoute()` and `getWidgetPosts()`; [middleware.ts](src/middleware.ts); [astro.config.mjs](astro.config.mjs), `routeRules`.

The site correctly tags CMS content and Site Scripts settings. However, form definitions, Widgets settings, and latest-post data are fetched through public plugin calls without registering equivalent page-cache dependencies. Contact Forms storage writes also have no corresponding page purge in this repository.

**Impact:** a cached form can retain old fields or availability after an admin edit. Enabling Turnstile while old form HTML remains cached can make the server require a token the cached page does not produce. A latest-post widget can retain an old list on a page whose other queries do not depend on that collection. The one-hour freshness window and long stale window increase the importance of explicit invalidation.

This is a code-supported integration gap; it was not reproduced by mutating production. EmDash's live documentation confirms that public pages control their cache policy and tag purges refresh Workers Cache. [EmDash Workers Cache documentation](https://docs.emdashcms.com/deployment/cloudflare/#workers-cache).

**Recommendation:** register dependencies for rendered plugin settings, form definitions, and queried collections, and invalidate them after successful relevant writes. Extend the existing Site Scripts pattern where appropriate. Disable page caching for submission-status responses; keep visitor-specific messages out of shared HTML. Do not enable cross-version caching.

**Acceptance:** warm a form page, edit its fields or enable Turnstile, and verify a subsequent anonymous request receives the new form. Warm a page containing only a latest-post widget, publish another post, and verify the list changes without a deploy.

## P2 findings

### 5. Widgets hides tab content before JavaScript enhancement

**Location:** [WidgetTabs.astro](plugins/emdashhq-widgets/site/components/WidgetTabs.astro), lines 37–53 and 61–84. The site mirror has the same behavior.

The component promises stacked panels without JavaScript, but HTML already includes `hidden` on every panel except the first. The remaining tab buttons have `tabindex=-1` and no working selection behavior without JavaScript. Production browser inspection confirmed that two of three gallery panels remain inaccessible with scripts disabled.

**Recommendation:** render all panel content visibly in the initial HTML, then apply hidden state and tab semantics after successful initialization. Add Home/End support while revisiting keyboard behavior, and ensure text-only panels can receive keyboard focus when needed. Patch the package source first and copy it into the site mirror.

**Acceptance:** all panels remain readable without JavaScript; with JavaScript, click and keyboard selection update the visible panel and ARIA state correctly.

### 6. Contact form validation errors discard the visitor's message

**Location:** [public.ts](plugins/emdashhq-contact-forms/src/public.ts), lines 130–138 and 342–344; [ContactForm.astro](src/components/blocks/ContactForm.astro), fields at lines 109–181. The distributable component has the same blank-field behavior.

Server validation returns a 303 with field names only. Reloaded inputs have no submitted values, and the error message merely asks visitors to check highlighted fields. A phone-number format or length rejection can therefore erase a carefully written message. `aria-invalid` is present, but individual error reasons and help text are not associated with inputs using `aria-describedby`.

**Recommendation:** preserve values during recoverable errors, provide a reason next to each invalid field, associate help/error text with its input, and focus an error summary or the first invalid field. Keep messages out of query strings and shared caches. For the no-JavaScript path, use a private response or a short-lived visitor-bound recovery mechanism.

**Acceptance:** a server-rejected field preserves the other values, including a long message; keyboard and screen-reader users can locate the error and understand how to fix it.

### 7. Delivery/logging failures can turn an already saved submission into an error response

**Location:** [public.ts](plugins/emdashhq-contact-forms/src/public.ts), `sendSubmissionEmail()` at lines 172–217 and post-storage work at lines 365–408.

Storing the submission before sending email is good. Subsequent email-log writes and the final submission update can still reject the request before its success redirect. A visitor may retry an already stored message, creating duplicates. A notification may also have been delivered even though later bookkeeping fails.

**Recommendation:** treat durable storage as the acceptance boundary, handle later bookkeeping failures explicitly, and introduce an idempotency key for retries. Prefer retryable background delivery with a visible pending/failed status over requiring the visitor to resubmit after an email or log failure.

**Acceptance:** inject an email-log or final-update failure after storage; the visitor still receives an accurate receipt and a retry does not create a second submission or duplicate delivery.

### 8. Turnstile verification failure deliberately accepts submissions

**Location:** [public.ts](plugins/emdashhq-contact-forms/src/public.ts), lines 222–262; [admin.ts](plugins/emdashhq-contact-forms/src/admin.ts), setup help describing a “hard check”.

Missing HTTP access, a non-2xx verifier response, malformed JSON, or a fetch exception results in acceptance when a nonempty token was supplied. This is an explicit availability choice, but it is weaker than the admin help suggests. There is also no explicit verifier timeout in this function.

**Recommendation:** expose and document an outage policy. A strict policy should return a recoverable unavailable status; an availability policy could quarantine unverified submissions and suppress automatic visitor replies until reviewed. Bound verification time and distinguish successful verification from outage acceptance in logs.

Both shipped renderers already use the correct `cf-turnstile` class; there is no confirmed client embedding defect. [Cloudflare's embedding documentation](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).

**Acceptance:** test success, rejection, timeout, non-2xx, malformed response, and unavailable HTTP capability. The behavior and admin explanation agree.

### 9. The hourly contact-form limit counts accepted submissions, not attempts

**Location:** [public.ts](plugins/emdashhq-contact-forms/src/public.ts), lines 298–318 and 347–366.

The code counts stored submissions, then writes later. Concurrent valid requests can observe the same count and exceed the configured limit. Requests rejected by validation or Turnstile are not counted, and the Turnstile request happens before the limit check.

**Recommendation:** enforce a separate, atomic request/attempt budget before expensive verification, and retain the stored-submission count as an additional control if useful. Use a platform-supported rate limiter or atomic budget; a per-process map is insufficient across Worker instances. Apply the same budget to optional confirmation mail.

**Acceptance:** concurrent requests at the threshold cannot exceed the intended budget, and repeated invalid attempts consume that budget. This concurrency behavior was inferred from the code, not load-tested against production.

### 10. Site Scripts tests do not cover any successful injection

**Location:** [plugin.test.ts](plugins/emdashhq-site-scripts/tests/plugin.test.ts), lines 14–27; [plugin.ts](plugins/emdashhq-site-scripts/src/plugin.ts); [middleware.ts](src/middleware.ts).

Both tests expect `null`. They do not verify a configured Plausible tracker, Cloudflare beacon, GA script, custom HTML placement, the master switch, or the site's cache purge after a settings change. Since this plugin must run in-process, sandbox-oriented tests alone cannot establish successful production fragment injection.

**Recommendation:** add positive tests using the native execution path or the actual fragment builder. Cover both Plausible formats and init behavior, enabled/disabled state, invalid IDs, insertion placement, and admin exclusion. Add an integration check for authenticated save followed by successful purge, plus the existing `CACHE_PURGE_FAILED` response.

**Acceptance:** a deliberately broken successful-injection path makes a test fail. The public layout emits each configured contribution once, and admin pages emit none.

The current in-process registration and raw administrator HTML model are appropriate. Trusted custom HTML is an intentional capability, not an XSS finding by itself.

### 11. Cache warming can report success with pages still cold

**Location:** [warm-cache.mjs](scripts/warm-cache.mjs), lines 35–42 and 116–125.

Failed sitemap reads are warnings, so warming can proceed with only `/`. After the last pass, cold and uncacheable pages are also warnings; the script prints `Cache warm.` and exits successfully if responses were 2xx. Deployment success therefore does not establish the stated guarantee that every sitemap page is warm.

**Recommendation:** fail or explicitly mark a partial warm when sitemap enumeration fails or required public pages remain cold. Distinguish intentionally uncacheable routes from unexpectedly uncached pages. Add request timeouts and retain the warm step in `npm run deploy`.

**Acceptance:** unavailable sitemap, persistent cache MISS, and unexpected BYPASS produce an accurate non-success outcome; fully warmed pages succeed. Test using a local HTTP fixture rather than repeatedly deploying.

### 12. Statistics can overstate freshness and delay a first render

**Location:** [site-stats.ts](src/lib/site-stats.ts), lines 29–33, 85–118, 156–175, and 199–205; [SiteStats.astro](src/components/blocks/SiteStats.astro), source note and labels.

The strip labels npm downloads as “installs”, although downloads are not a measured count of installations. It says the figures refresh daily even when BuiltWith fails and the manual value survives. The rendered note does not expose `updatedAt` or distinguish manual from successfully refreshed values. A rolling baseline delta is labeled “this week” although it does not always represent a full seven-day comparison.

When tracked rows have never refreshed, `getSiteStats()` waits for three sequential external fetches with no explicit timeouts. An unavailable source can delay a cold home render even though the stats are supplementary.

**Recommendation:** label npm figures as downloads, disclose manual/stale source state and last successful update, and either keep dated seven-day samples or label the delta as change since the recorded baseline. Fetch independent sources concurrently with deadlines; keep first-render output useful without awaiting every external source. Avoid registering cache tags as a substitute for bounding the fetch work.

**Acceptance:** a failing stats source does not hold the home response indefinitely, and visible wording accurately distinguishes downloads, estimates, manual data, and dated changes.

### 13. Several mobile controls are shorter than a comfortable touch target

**Location:** [Base.astro](src/layouts/Base.astro), `.theme-btn` and `.nav-toggle`; [ContactForm.astro](src/components/blocks/ContactForm.astro), `.cf-submit`.

Production measurements: theme buttons are 25 px high, Send is 36 px high, and the menu toggle is 42 × 42 px. These can be awkward for one-handed use. These measurements alone do not establish a WCAG 2.2 AA failure; 44 × 44 is an ergonomic improvement target, not the AA minimum.

**Recommendation:** give mobile controls at least 44 px of usable height while preserving the existing typography and layout. Place visual overrides in `theme.css`, as the project requires; keep reusable renderer adjustments in their plugin source copies.

**Acceptance:** measured mobile hit areas reach the intended size, with no wrapping or overflow at 320 px and 390 px.

## Design and implementation quality

The cream paper, indigo serif headlines, rose marker, and architecture drawing express a specific CMS hub. The main tutorial action is clear on desktop and mobile. Preserve this identity. On a phone, the tall headline and architecture illustration delay access to actual tutorials; consider a compact mobile diagram and tighter hero spacing once the functional findings are resolved.

Provisional technical scores, limited to the reviewed samples:

| Dimension | Score / 4 | Reason |
| --- | --- | --- |
| Accessibility | 2 | Labels, skip link, focus and ARIA state exist; tab fallback and error recovery need work. Full contrast compliance is unverified. |
| Performance | 3 | Cached sampled requests were fast, videos use facades, images are responsive; first-refresh stats can block. |
| Responsive design | 3 | No overflow in eight inspected route/width combinations; small touch targets remain. |
| Theming | 3 | Shared tokens and dark switching work in the sample; full widget contrast parity needs a dedicated pass. |
| Implementation integrity | 3 | Strong shared CMS patterns and synchronized widget mirrors; plugin cache dependencies and fallback behavior are incomplete. |
| **Total** | **14 / 20** | **Good foundation, with specific corrective work. This is not an accessibility certification.** |

Detector interpretation: most palette advisories come from intentional fallback colors inside `var(--token, fallback)` in distributable widgets. The site supplies those tokens. Notice, quote, and series left borders also serve clear content functions. Do not mechanically remove these styles or count the advisories as confirmed design defects.

## Maintenance recommendations

- Add one documented root verification command or CI workflow that runs the site typecheck/build and all plugin checks. The root package currently has no aggregate test script, so a site build does not prove the plugin suites passed.
- Automate the existing Widgets mirror and seed-definition comparisons. They are synchronized now; prevent later drift rather than fixing a nonexistent mismatch.
- Refresh documentation: README's design paragraph still calls the theme the Drawing Set and omits Playfair Display. AGENTS.md's stats description differs from the current registry/BuiltWith implementation. PRODUCT.md describes the contact email as both placeholder and confirmed.
- The Impeccable context loader also reported an unset `buildPath` preference. Record code-first or comp-first when visual direction work is next requested; it does not block this review.
- Decide on and document data retention and backup/restore procedures for submissions and media. Confirm actual production settings before changing them; the plugin's default retention of zero keeps records indefinitely.
- Investigate the build's large chunks by route before optimizing. EmDash's admin bundles can legitimately be large; the warning alone does not demonstrate a slow public site.

## Recommended order of work

1. Fix required-checkbox validation, reserved keys, and CSV serialization; add meaningful regression tests for the confirmed cases.
2. Add plugin page-cache dependencies and invalidation, with a warm-cache integration check for form edits and latest posts.
3. Fix tab progressive enhancement and preserve contact-form values on errors.
4. Harden post-storage delivery, outage handling, and request limits; expand Site Scripts positive coverage.
5. Make cache warming and statistics report accurate outcomes, then improve mobile hit areas and update the docs.

For the UI work, `$impeccable harden` fits forms and fallback behavior, `$impeccable adapt` fits mobile controls, and `$impeccable optimize` fits the optional stats work. Finish with `$impeccable polish` after the functional fixes, then rerun the technical audit.

The supporting browser JSON and screenshots from this run are in `/tmp/emdashhq-review-oct-*`; they are temporary evidence, not committed project assets. The headless browser was closed after inspection.
