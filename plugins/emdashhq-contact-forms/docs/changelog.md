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
