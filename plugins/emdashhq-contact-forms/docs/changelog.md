## 1.1.2

- Required checkboxes now reject omitted or invalid values instead of silently passing.
- Submissions are stored before any email work: if the provider fails afterwards, the row is marked failed but the message is never lost, and the visitor still gets a saved response.
- Submit retries are idempotent: a fingerprint over slug, IP and values suppresses duplicate rows and duplicate emails.
- Rejected submissions repopulate the form with per-field errors via a one-time recovery record.
- Turnstile verification has a ten-second deadline and a configurable outage policy (accept by default).
- The per-IP rate limit is atomic and consumes its budget before Turnstile.
- `cf_` field keys are reserved for the submit protocol and rejected by the admin.
- CSV export and the admin preview neutralize spreadsheet formula injection.
- Hourly cleanup now also prunes stale rate buckets, recovery records and idempotency claims.
- Docs: live demo link carries UTM parameters.

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
