## 1.2.0

- Per-form Capacity & Limits settings: maximum submissions, remaining-spots label, closed message, and badge toggle.
- Atomic sandbox storage acceptance prevents concurrent requests from oversubscribing. Interrupted inbox writes recover on the next submission or hourly cron.
- Public capacity metadata endpoint and JSON submission responses; full forms return HTTP 409 with the configured message.
- Updated Astro renderer and companion browser helper poll capacity and lock closed forms.
- Capacity counts survive inbox deletion and retention. Existing forms remain unlimited by default.
- Requires EmDash 1.2 or later and matching sandbox adapters. Copy both updated site renderer files when upgrading.

## 1.1.1

- Registry listing gains an icon, a banner, screenshots, an install guide, a FAQ, and this changelog. No changes to the plugin itself.

## 1.1.0

- Optional Cloudflare Turnstile verification on every form: set the site key and secret key in plugin settings and submissions are verified before storing.
- New `network:request` capability restricted to `challenges.cloudflare.com` for that check.
- Verbose debug logging setting, useful while wiring a new email provider.

## 1.0.0

- First release. Form builder in the admin with eight field types, a submissions inbox, an email delivery log, and a dashboard widget.
- Notification and visitor-confirmation email through the site's active provider via `ctx.email.send()`.
- Honeypot, minimum-fill-time, and per-IP hourly rate limit on by default; optional retention cleanup for old submissions.
- Public `form` and `submit` routes plus the Contact form page block shipped in `site/`.
