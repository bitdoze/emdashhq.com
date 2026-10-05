# emdashhq-contact-forms

A contact form plugin for [EmDash](https://emdashcms.com) CMS. Build forms in
the admin, drop them into pages with a block, store every submission in the
site database, and deliver notification email through whichever email provider
is already configured — Cloudflare Email Sending or any SMTP provider via
`emdash-smtp`. The plugin never talks to an email service itself; it calls
`ctx.email.send()`, so it works with both options and any future provider.

## What you get

- **Forms** admin page — create and edit forms, manage fields (text, email,
  tel, url, number, textarea, select, checkbox), reorder, enable/disable.
- **Submissions** admin page — every entry stored in the database with page,
  IP, country and user-agent; filter by form/status/email result, mark
  read/unread/archive, resend the notification email, copy as CSV.
- **Email log** admin page — every send attempt (notification, visitor
  confirmation, manual resend) with status, duration and the provider's error
  message.
- **Dashboard widget** — unread count, active forms, recent submissions.
- **Anti-spam** — hidden honeypot, minimum-fill-time trap, and a per-IP hourly
  rate limit (configurable in plugin settings).
- **Retention** — optional automatic pruning of old submissions and log
  entries via a scheduled cron task.

## Install

This is a **sandboxed** plugin — it runs in an isolated Worker, not in the
host process. Your site needs a sandbox runner: on Cloudflare that's
`sandboxRunner: sandbox()` plus the `LOADER` Worker Loader binding and an
exported `PluginBridge` class (see the
[plugin sandbox docs](https://docs.emdashcms.com/deployment/plugin-sandbox/);
requires Workers Paid).

### From the registry (recommended)

The plugin is published as `@bitdoze.com/emdashhq-contact-forms`. With a
sandbox runner configured, open **Registry** in the admin, search
`@bitdoze.com/emdashhq-contact-forms`, and select **Install**.

### From source / npm

```bash
npm install emdashhq-contact-forms
```

Register the generated descriptor in `astro.config.mjs` under `sandboxed`
(not `plugins`):

```js
import { sandbox } from "@emdash-cms/cloudflare";
import contactForms from "emdashhq-contact-forms";

emdash({
  sandboxRunner: sandbox(),
  sandboxed: [
    contactForms, // descriptor object, not a factory call
    // ...your other plugins, including the email provider
  ],
});
```

Activate it in the admin under **Plugins** (the plugin declares the
`email:send` capability, which EmDash shows you at install).

## Wire the page block

EmDash block types live in the site seed — a plugin cannot inject one — so two
files ship in this package's `site/` directory for you to copy:

1. **`site/block-type.json`** — paste this object into `blockTypes` in
   `seed/seed.json`, and add `"contact_form"` to your page field's
   `validation.allowedTypes` list (skip if the field has no `allowedTypes` —
   all types are already allowed).
2. **`site/ContactForm.astro`** — copy into `src/components/blocks/` and map
   it where your blocks are rendered, e.g. in a `defineBlockComponents` map:

   ```ts
   contact_form: ContactForm,
   ```

   The component is self-contained (no site imports) and reads the usual CSS
   custom properties with fallbacks. Restyle the `.cf-*` classes to taste.

   If your site already has a styled version, keep it — only the two
   constants matter: it calls the plugin's public `form` route for the
   definition and posts to the `submit` route.

Reseed so the block type reaches the database, then restart the dev server so
`emdash-env.d.ts` picks up the generated block type:

```bash
npx emdash seed seed/seed.json --database <dev-db> --no-content --on-conflict=update
npm run dev   # regenerates types on boot
```

## Use

1. **Plugins → Contact forms → Settings**: set a default notification email.
2. **Plugins → Contact forms → Forms → New form**: name it, give it a slug
   (e.g. `contact`), optionally override the recipient, subject template,
   button label and success message, then add fields.
3. In the page editor, add a **Contact form** block and type the slug into its
   *Form slug* field.
4. **Settings → Email**: activate your provider and send a test email. Without
   a provider, submissions are still stored — they just aren't emailed.

Subject templates support `{form}`, `{site}` and any submitted
`{field_key}` placeholder. Replies to notification email go to the visitor's
first `email` field via `replyTo`.

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /_emdash/api/plugins/emdashhq-contact-forms/form?slug=<slug>` | public | Public form definition (no email addresses exposed). |
| `POST /_emdash/api/plugins/emdashhq-contact-forms/submit` | public | Form-data submission; answers `303` back to the referring page with `cf`, `cf_status`, `cf_fields` params. |
| `GET /_emdash/api/plugins/emdashhq-contact-forms/export?form=<slug>&status=<s>` | admin | CSV export, for API-token use. |
| `POST /_emdash/api/plugins/emdashhq-contact-forms/admin` | admin | Block Kit interactions for the admin pages and widget. |

`cf_status` values: `sent` (emailed), `saved` (stored, no email), `invalid`
(`cf_fields` lists the bad field keys), `rate_limited`, `error`.

## Storage

Three plugin collections: `forms` (definitions), `submissions` (entries with a
snapshot of field labels so old submissions still render after edits),
`email_log` (delivery attempts). All are queryable in the admin UI and pruned
by the retention setting.

## Development

```bash
npm run validate   # manifest check
npm run typecheck  # tsc
npm run build      # dist/plugin.mjs + generated descriptor in dist/index.mjs
npm run test       # vitest via @emdash-cms/plugin-test (runs inside workerd)
npm run bundle     # publishable tarball
npm run login      # Atmosphere OAuth (publisher account)
npm run publish    # push the release to your PDS / the registry
```

Sandboxed plugins bundle everything — runtime dependencies belong in
`devDependencies`. Block Kit builders come from `@emdash-cms/blocks/server`
(the main entry point pulls in the host's React renderer and blows the
256 KB bundle cap).
