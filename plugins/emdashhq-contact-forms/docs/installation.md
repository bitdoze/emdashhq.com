## Install and first form

1. In your EmDash admin open **Registry**, search for **Contact Forms**, and click **Install**. It asks to send email through your site's provider, and to contact `challenges.cloudflare.com` — that host is only used if you turn on Turnstile.
2. Open **Plugins → Contact forms → Settings** and set the default notification email. This is where submissions are sent when a form does not override it.
3. Open **Forms → New form**. Name it, give it a slug such as `contact`, and add fields. Each form can override the recipient, the subject template, the button label, and the success message.
4. Put the form on a page with the **Contact form** block and enter the slug. If your theme does not ship the block yet, copy `site/block-type.json` into the seed, and copy `site/ContactForm.astro` plus `site/capacity-client.ts` into the same components directory. The README walks through it.
5. In **Settings → Email**, activate a provider and send a test email. Without a provider, submissions are still stored — they are just not emailed, and the email log shows why.

Submissions appear in **Plugins → Contact forms → Submissions** and on the dashboard widget as soon as the first visitor writes.

For limited signups, open the form's **Capacity & Limits** section and set a maximum. Leave it blank for unlimited submissions. Enable the remaining-spots badge and customize the closed message if needed. Capacity counts persist when submissions are deleted or pruned. Requires EmDash 1.2 or later with matching sandbox adapters and applied core migrations.
