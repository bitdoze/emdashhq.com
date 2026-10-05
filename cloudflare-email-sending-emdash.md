# Send email from an EmDash site with Cloudflare Email Sending

An EmDash site needs outbound email for four things: magic-link sign-in, team invitations, account recovery, and comment notifications. Without a configured provider the admin still works, but every flow that sends mail returns "Email is not configured" and invite links have to be copied by hand.

On Cloudflare Workers there is a native path that needs no external account and no API key: the `send_email` binding backed by Cloudflare Email Sending, wired into EmDash with the `cloudflareEmail()` plugin. This article walks through the full setup on emdashhq.com, explains what the free and paid plans actually include, and lists the commands used to verify each step.

## Cloudflare email in three lanes

Cloudflare has several features with "email" in the name that do different things. It helps to separate them before wiring anything up.

**Email Routing** receives mail addressed to your domain and forwards it somewhere else. `dragos@emdashhq.com` is a routing rule: mail sent to that address lands in a real mailbox behind it (a Gmail account, for example). Routing is free, unlimited, and available on every plan. Cloudflare does not host mailboxes. Routing alone cannot send anything.

**Email Sending to arbitrary recipients** is the transactional outbound service. This is what a CMS needs for magic links and invites. It requires the Workers Paid plan ($5/month). Each account gets 3,000 outbound emails per month included in the plan, then $0.35 per 1,000 beyond that. Messages that hard-bounce still count toward the quota; messages rejected at the API boundary (bad payload, suppression list) do not.

**Sending to verified destination addresses** is the exception that works on every plan, including Workers Free. A verified destination address is one you proved you own in the Email Routing settings, the same addresses routing rules forward to. Before any domain is onboarded for Email Sending, a `send_email` binding can only deliver to those addresses, and only from an address on a routing domain you own. Those sends are always free and never count against quota or daily limits. This mode is for testing and for "send me a copy" flows, not for a CMS that mails arbitrary users.

|  | Workers Free | Workers Paid ($5) |
| --- | --- | --- |
| Receive + forward inbound mail (Email Routing) | Unlimited | Unlimited |
| Send to verified destination addresses | Free | Free (does not count toward quota) |
| Send to any recipient (Email Sending) | Not available | 3,000/month included, then $0.35 per 1,000 |
| Daily quota | n/a | Starts conservative, scales with sender reputation |

Older tutorials often send Worker email through MailChannels for free. That integration ended; MailChannels is no longer a Cloudflare partner and those instructions fail silently or with binding errors today. Email Sending is the replacement, and on a paid plan it is simpler than MailChannels ever was.

## How EmDash delivers email

EmDash delegates sending to one active provider plugin. The pipeline is: a feature (auth, invites, comments) produces a message, email hooks can transform or cancel it, and the provider plugin's `email:deliver` handler does the send.

- **Development**: `astro dev` auto-activates a built-in console provider when nothing else is selected. It sends nothing; it logs each message to the terminal and keeps the last 100 in memory. You can list them at `GET /_emdash/api/dev/emails` while signed in. Magic links work in dev by copying the URL out of the log.
- **Production**: the console provider is compiled out. If no provider plugin is active, `Settings > Email` in the admin shows no provider and sends fail until one is installed, activated, and selected.
- **On Cloudflare**: `cloudflareEmail()` from `@emdash-cms/cloudflare/plugins` delivers through the Worker's `send_email` binding. Credentials are the binding plus the onboarded domain; there is no token to store or rotate.
- **Anywhere else**: the community `emdash-smtp` plugin family covers generic SMTP and hosted providers (SES, Brevo, Mailgun, Postmark, Resend, SendGrid, Zoho, and more). See [Option 2](#option-2-smtp-and-hosted-providers-with-emdash-smtp).

The admin has a **Send test email** button under `Settings > Email` that exercises the whole pipeline and surfaces provider errors directly. It is the fastest verification step.

## Setup on emdashhq.com

### Step 1: onboard the sender domain

Sending requires the sender's domain to be onboarded to Email Service. The dashboard path is **Compute > Email Service > Email Sending > Onboard Domain**. The CLI does the same job:

```bash
npx wrangler email sending enable emdashhq.com
```

Onboarding creates DNS records automatically:

| Record | Name | Purpose |
| --- | --- | --- |
| MX x3 | `cf-bounce.emdashhq.com` | Route bounce messages back to Cloudflare |
| TXT (SPF) | `cf-bounce.emdashhq.com` | Authorize Cloudflare to send for the domain |
| TXT (DKIM) | `cf-bounce._domainkey.emdashhq.com` | Sign outbound mail |
| TXT (DMARC) | `_dmarc.emdashhq.com` | Policy record (`p=reject` here) |

Verify the state and the exact records Cloudflare expects:

```bash
npx wrangler email sending settings emdashhq.com
npx wrangler email sending dns get emdashhq.com
```

And verify what is live in DNS:

```bash
dig +short MX cf-bounce.emdashhq.com
dig +short TXT cf-bounce.emdashhq.com
dig +short TXT cf-bounce._domainkey.emdashhq.com
dig +short TXT _dmarc.emdashhq.com
```

On emdashhq.com all of these were already present before the code change. DNS on Cloudflare's own resolver typically propagates in minutes. Any address on the onboarded domain is an accepted sender; you do not register `hello@` or `dragos@` individually.

One thing to watch: two identical `v=spf1` TXT records on the same hostname is an RFC violation that can produce a permerror in strict receivers. Email Routing adds one SPF record to the apex and Email Sending adds one to `cf-bounce`. If the apex ends up with a duplicate after repeated onboarding runs, delete the extra in the DNS dashboard.

### Step 2: add the binding

In `wrangler.jsonc`, alongside the existing D1, R2, and KV bindings:

```jsonc
"send_email": [
	{
		"name": "EMAIL"
	}
],
```

The name is what the plugin looks up on the Worker environment. `EMAIL` is the default; a different name has to be passed to the plugin as its `binding` option.

### Step 3: register the plugin

In `astro.config.mjs`:

```js
import { cloudflareEmail } from "@emdash-cms/cloudflare/plugins";

emdash({
	// database, storage, objectCache, migrations...
	plugins: [
		siteScriptsPlugin(),
		cloudflareEmail({
			from: { email: "hello@emdashhq.com", name: "EmDash HQ" },
			replyTo: "dragos@emdashhq.com",
		}),
	],
});
```

Two options matter:

- `from` sets the sender. A bare string or `{ email, name }`. The domain must be onboarded or every send fails with `E_SENDER_NOT_VERIFIED`. A `hello@` style address reads better than a personal mailbox on system mail.
- `replyTo` is where human replies go. With a `hello@` or `no-reply` sender, set it to a mailbox that exists so replies do not get lost. A message-level `replyTo` overrides this.

There is no `wrangler secret` step. The binding is the credential: only your Worker can use it.

### Step 4: deploy

```bash
npm run deploy
```

The site's deploy script builds, verifies the migration manifest against production D1, uploads the Worker, and warms the page cache. A `send_email` binding needs no provisioning; it attaches to whatever Worker declares it.

If the deploy is gated by pending core migrations (the case after upgrading `emdash`), apply them first:

```bash
npx wrangler email sending settings emdashhq.com   # optional re-check
npx emdash migrate --status --wrangler-config wrangler.jsonc
npx emdash migrate --wrangler-config wrangler.jsonc
npm run deploy
```

### Step 5: activate and test in the admin

Registration makes the plugin available; it is not active yet.

1. Open `https://emdashhq.com/_emdash/admin` and go to **Extensions**. Activate the Cloudflare email plugin.
2. Open **Settings > Email**. If it is the only provider, EmDash selects it automatically; otherwise pick it.
3. Click **Send test email** to an address you can check.

A green result means the whole path works: admin, hook pipeline, binding, Email Sending, DNS, and the recipient's filters.

You can also test the binding without involving EmDash at all, which isolates Cloudflare-side problems from CMS-side ones:

```bash
npx wrangler email sending send \
	--from "hello@emdashhq.com" \
	--from-name "EmDash HQ" \
	--to "dragos@emdashhq.com" \
	--subject "Email Sending smoke test" \
	--text "If you can read this, the binding and domain are fine."
```

### Step 6 (optional): verify a real flow

Request a magic link for a second admin account or trigger an invite from the Users page. The mail should arrive signed by `cf-bounce._domainkey.emdashhq.com` with `Reply-To` set to the configured address.

## Limits and behavior worth knowing

- 50 recipients max per message across `to`, `cc`, `bcc`. EmDash system mail is one recipient at a time, far under the cap.
- 5 MiB total message size including attachments (25 MiB when sending only to verified destination addresses).
- New accounts start with a conservative daily quota that grows automatically with sending history and reputation. A limit increase form exists for jumping the queue.
- A suppression list blocks addresses that hard-bounced or complained. Sends to suppressed addresses are rejected at the API boundary (and do not bill), or silently dropped for the remaining recipients if **Drop suppressed recipients** is on.
- Outbound sends appear as **dropped** in the Email Routing dashboard summary even when they delivered. That view is for inbound. Track sends under Email Service observability instead.
- Delivery is at the mercy of SPF/DKIM/DMARC passing. Onboarding writes all three; if mail lands in spam, check those records first, then sender reputation.
- 30 Email Routing + Email Sending domains max per zone, 200 routing rules per domain, 200 verified destination addresses per account.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Email is not configured" | No active provider | Activate the plugin under Extensions, select it under Settings > Email |
| `E_SENDER_NOT_VERIFIED` | `from` domain not onboarded, or DNS still propagating | `wrangler email sending enable <domain>`; re-check with `dns get` and `dig` |
| `E_RECIPIENT_NOT_ALLOWED` | Domain not onboarded and recipient is not a verified destination | Onboard the domain, or only send to verified addresses |
| `E_DAILY_LIMIT_EXCEEDED` / `E_RATE_LIMIT_EXCEEDED` | New-account quota or burst limit | Wait for the rolling window; request an increase for production volume |
| Sends work in dev, fail in prod | Dev used the console provider | The console provider never runs in production; finish Step 5 |
| Mail lands in spam | SPF/DKIM/DMARC problem or fresh sender reputation | `dig` the four records; warm the domain with low-volume real mail |
| Duplicate SPF records on apex | Repeated onboarding runs | Delete the extra TXT in the DNS dashboard |

## Option 2: SMTP and hosted providers with emdash-smtp

The binding is not the only way. The community-maintained [`emdash-smtp`](https://github.com/masonjames/emdash-smtp) plugin family routes EmDash mail through generic SMTP or a hosted provider's API. It needs EmDash 1.0.1 or later and ships in two packages:

- `emdash-smtp` is the trusted install. It covers the full provider catalog plus generic SMTP and local sendmail.
- `emdash-smtp-marketplace` is the sandbox-safe variant for registry/marketplace installs. It runs under `sandboxed:` and needs a `sandboxRunner` (`sandbox()` from `@emdash-cms/cloudflare`, plus the `LOADER` binding) in the EmDash config.

### Providers

Most providers run over HTTPS, so they work identically on Workers and Node: Amazon SES, Brevo, Elastic Email, Emailit, Mailchimp Transactional, MailerSend, Mailgun, Mailjet, Postmark, Resend, SendGrid, SMTP2GO, SparkPost. Google/Gmail, Microsoft 365, and Zoho Mail use their APIs with OAuth tokens (direct token or client credential + refresh token, which the plugin refreshes at send time). Generic SMTP and local sendmail exist only in the trusted package and belong to Node/self-hosted deployments; raw SMTP sockets are not the Workers path.

### Setup

```bash
npm install emdash-smtp
```

```js
import { emdashSmtp } from "emdash-smtp";

emdash({
	// database, storage...
	plugins: [emdashSmtp()],
});
```

Deploy, then in the admin open the plugin's settings (Plugins > SMTP Providers), pick a provider, and paste its credentials. EmDash stores provider credentials as plugin settings in the database, so rotating a key is an admin edit, not a redeploy. Select SMTP under **Settings > Email** and use **Send test email** as before.

### The free-SMTP option: Brevo

Brevo is the pragmatic pick when cost matters more than staying inside Cloudflare. Its Free plan is free forever, no card, and includes transactional email over SMTP and API at **300 sends per day** (roughly 9,000/month if spread evenly). Over the daily cap, transactional mail queues in a retry buffer of up to 1,000 instead of hard-failing. That dwarfs a CMS's actual need: magic links, invites, and comment notices are single-digit emails a day on most sites.

Because Brevo goes through its HTTP API in `emdash-smtp`, it works on Workers Free too. That is the real unlock: a site on the $0 plan cannot use `send_email` to arbitrary recipients at all, but Brevo's free tier covers the entire CMS mail load without touching the Workers bill.

Setup outline:

1. Create a Brevo account and add `emdashhq.com` as a sender domain. Brevo issues its own SPF/DKIM records to add in Cloudflare DNS; they coexist with the Email Sending records since Brevo uses its own DKIM selector and hostname entries.
2. Generate an API key (SMTP & API > API Keys) or an SMTP key (`smtp-relay.brevo.com`, port 587).
3. Paste it into the plugin's Brevo provider settings, select SMTP under Settings > Email, send a test.

### Which one

- **On Workers Paid, low volume, want zero third parties**: `send_email` binding. One binding, one plugin call, nothing to rotate.
- **On Workers Free, or want delivery tracking/templates/a bigger free allowance**: `emdash-smtp` with Brevo (free, 300/day) or another HTTP provider.
- **High volume**: compare $0.35/1,000 over Cloudflare's 3,000/month against provider tiers. Dedicated IPs and warmup are a separate procurement question either way.
- **Not on Cloudflare**: `emdash-smtp` is the only path; there is no `send_email` binding on Node.

## Reference

- EmDash email guide: https://docs.emdashcms.com/guides/email/
- emdash-smtp plugin: https://github.com/masonjames/emdash-smtp
- Brevo free plan limits: https://help.brevo.com/hc/en-us/articles/208580669
- Cloudflare deployment (email section): https://docs.emdashcms.com/deployment/cloudflare/
- Email Sending Workers API: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- Pricing: https://developers.cloudflare.com/email-service/platform/pricing/
- Limits: https://developers.cloudflare.com/email-service/platform/limits/
