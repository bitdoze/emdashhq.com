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
- **Anti-spam** — hidden honeypot, minimum-fill-time trap, a per-IP hourly
  rate limit, and optional Cloudflare Turnstile verification (keys in plugin
  settings).
- **Retention** — optional automatic pruning of old submissions and log
  entries via a scheduled cron task.
- **Capacity**: cap signups per form, show remaining spots, and close the form
  automatically when its last spot is accepted.

## Install

The package is a **standard-format** plugin: the same build runs isolated in
a sandbox or in-process with no sandbox at all. Pick the mode per site.

### Registry install (isolated — Cloudflare or Node.js)

Published as `@bitdoze.com/emdashhq-contact-forms`. Registry installs need a
sandbox runner:

- **Cloudflare**: `sandboxRunner: sandbox()` from `@emdash-cms/cloudflare`,
  the `LOADER` Worker Loader binding, `PluginBridge` exported from the
  Worker entry point, Workers Paid plan.
- **Self-hosted Node.js**: `npm i @emdash-cms/sandbox-workerd workerd`, then
  `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox"`.

With a runner configured, open **Registry** in the admin, search
`@bitdoze.com/emdashhq-contact-forms`, and select **Install**.

### In-process, no sandbox (self-hosted or Workers Free)

The package isn't on npm — install it from a checkout, a git URL or the
release tarball under `dist/`:

```bash
npm install <path-or-git-url>/emdashhq-contact-forms
```

Register the generated descriptor under `plugins:` — it adapts to in-process
execution automatically:

```js
import contactForms from "emdashhq-contact-forms";

emdash({
  plugins: [
    contactForms, // descriptor object, not a factory call
  ],
});
```

Same routes, storage and admin UI — just no isolation or resource limits,
which is fine for a plugin you wrote and control.

### Config-driven sandboxed (alternative to the registry)

```js
import { sandbox } from "@emdash-cms/cloudflare";
import contactForms from "emdashhq-contact-forms";

emdash({
  sandboxRunner: sandbox(),
  sandboxed: [contactForms],
});
```

Activate it in the admin under **Plugins** (the plugin declares the
`email:send` and `network:request` capabilities, which EmDash shows you at
install). `network:request` is restricted to `challenges.cloudflare.com` via
`allowedHosts` and is only used for Turnstile verification.

## Wire the page block

EmDash block types live in the site seed — a plugin cannot inject one — so two
files plus a browser helper ship in this package's `site/` directory:

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

3. **`site/capacity-client.ts`**: copy next to `ContactForm.astro`. The renderer
   imports it for live capacity and submission handling. Keep both files in
   sync when updating; preserve your theme styles if you use a custom renderer.

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

## Anti-spam and Turnstile

Every form carries three passive defenses out of the box: a hidden honeypot
field, a minimum-fill-time trap (both pretend success so bots learn nothing),
and a per-IP hourly submission limit (`rateLimitPerHour` setting).

When passive traps are not enough, enable **Cloudflare Turnstile**:

1. In the Cloudflare dashboard open **Turnstile → Add widget**, add your
   site's hostname, and pick a widget mode (Managed works for most sites).
2. Copy the **site key** and **secret key** into **Plugins → Contact forms →
   Settings**.
3. Every form now renders a Turnstile widget and the submit route verifies
   the token against Cloudflare `siteverify` before storing anything. Missing
   or rejected tokens redirect with `cf_status=challenge`; nothing is stored
   or emailed.

Both keys must be set — with either one empty the widget and the check stay
off. If the siteverify endpoint is unreachable the submission is accepted and
a warning is logged, so a Cloudflare outage never takes your form down. The
secret key is stored with the encrypted plugin-settings envelope.

Upgrading from 1.0.x: the manifest now declares `network:request` with
`allowedHosts: ["challenges.cloudflare.com"]`. EmDash asks you to approve the
new capability on update; until it is approved the plugin keeps working but
Turnstile verification is skipped (a warning is logged if keys are set).

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /_emdash/api/plugins/emdashhq-contact-forms/form?slug=<slug>` | public | Public form definition (no email addresses exposed). |
| `GET /_emdash/api/plugins/emdashhq-contact-forms/capacity?slug=<slug>` | public | Uncached capacity metadata only. |
| `POST /_emdash/api/plugins/emdashhq-contact-forms/submit` | public | Form-data submission; native success/validation uses `303`. With `Accept: application/json`, returns JSON. Capacity rejection always uses `409`. |
| `GET /_emdash/api/plugins/emdashhq-contact-forms/export?form=<slug>&status=<s>` | admin | CSV export, for API-token use. |
| `POST /_emdash/api/plugins/emdashhq-contact-forms/admin` | admin | Block Kit interactions for the admin pages and widget. |

`cf_status` values: `sent` (emailed), `saved` (stored, no email), `invalid`
(`cf_fields` lists the bad field keys), `rate_limited`, `challenge` (Turnstile
verification missing or rejected), `error`.

## Storage

Four plugin collections: `forms` (definitions), `submissions` (entries with a
snapshot of field labels so old submissions still render after edits),
`email_log` (delivery attempts), and `capacity` (lifetime acceptance ledger).
Retention prunes submissions and email logs, while preserving capacity counts.

## Capacity & Limits

After creating a form, open its **Capacity & Limits** section. A blank maximum
means unlimited; a nonnegative whole number caps accepted submissions, and `0`
closes the form immediately. The optional counter label supports `{remaining}`.
Set a custom closed message and turn **Show spots remaining** on to display the
badge. Increasing the maximum reopens a full form; lowering it below the current
count leaves the form closed. A new form starts with an independent count.

The browser checks capacity immediately, every 15 seconds while visible, and
on window focus. It updates on successful submission and locks on a conflict.
This is polling, so another visitor's signup can take up to 15 seconds to appear;
the submit endpoint always enforces capacity atomically. Cached page HTML cannot
override that check. Disabling the badge still enforces capacity.

The public endpoint returns exactly `remaining`, `isClosed`, `totalAllowed`, and
`closedMessage`. Unlimited forms use `null` for the two numbers. Unknown and
disabled forms return `404`. A full form rejects a POST with HTTP `409` and
`{ "error": "capacity_reached", "message": "<closed message>" }`, including
native posts without JavaScript. JSON success includes the confirmed capacity;
validation errors include field keys, and storage contention returns `503`.
Submissions are never automatically retried after an uncertain network outcome.

Acceptance uses sandboxed `ctx.storage.compareAndSet`: the counter increment and
the complete submission are committed together in one ledger record. The inbox
is an idempotent projection, recovered on the next submission or hourly cron if
interrupted. After recovery, the ledger keeps only the count. No raw SQL or host
CMS tables are accessed. Email follows acceptance; a failed recovery/delivery
may require the admin to resend the notification. Email failure never frees a spot.

Counts include all accepted submissions, regardless of read/archive/email status.
Deleting an inbox entry or applying retention does **not** reopen a signup spot.
For existing forms, the initial count includes retained submissions; previously
deleted submissions cannot be reconstructed. Existing forms default to unlimited
with the badge off. Avoid running older plugin versions alongside this version,
since those writers do not participate in the ledger protocol.

Version 1.2 requires EmDash 1.2 or later, matching sandbox adapters, and applied
core database migrations for conditional writes. The new public route and
storage declaration change the install trust contract; review the plugin update
in the admin. Site owners must copy the updated renderer and browser helper to
enable live tracking. No block schema changes are needed.

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
