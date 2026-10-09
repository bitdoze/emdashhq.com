## Where do submissions go?

Into your site's own database, under **Plugins → Contact forms → Submissions**. Nothing is sent to a third party — the only outbound calls are the notification email through your provider and, if enabled, Turnstile verification.

## Does it send email without a provider configured?

No, and that is fine — submissions are still stored with the email status `skipped`. Once you activate a provider under **Settings → Email**, notifications and visitor confirmations start sending, and the email log records every attempt.

## How does it stop spam?

Three passive defenses are always on: a hidden honeypot field, a minimum-fill-time trap, and a per-IP hourly submission limit you can tune in settings. When that is not enough, paste Cloudflare Turnstile site and secret keys into the plugin settings and every form is verified before anything is stored.

## Can visitors get a confirmation email?

Yes. A form can send the visitor a confirmation using its own subject template. Subject templates support `{form}`, `{site}` and any submitted `{field_key}` placeholder, and replies to notification mail go to the visitor's email field.

## Can I get the submissions out?

The submissions page copies the filtered view as CSV, and an authenticated `export` route serves the same CSV for scripting or API tokens.

## Can submissions be deleted automatically?

Set **Keep submissions for (days)** in the plugin settings. A scheduled task deletes submissions and email log entries older than the limit; `0` keeps everything.

## Does the public form expose the recipient address?

No. The public form route returns only the fields, labels, and options — the recipient and notification settings never leave the admin.
