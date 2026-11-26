# Postmark

Postmark sends all of limicon-app's email: sign-in links through Supabase, the app's notifications, and newsletters. [`selection-email.md`](selection-email.md) compares it with the alternatives, and [`config-supabase.md`](config-supabase.md) covers the rest of sign-in.

Status: not set up yet. Facts checked against Postmark's docs on 2026-11-25.

## Where things live

| Piece | Where | Notes |
|---|---|---|
| Account | Postmark, owned by team@limicon.org | Only the Account Owner can request approval. Plan: Basic, $15 a month for 10,000 emails, then $1.80 per 1,000. Between seasons it can drop to the free plan (100 a month) and keep its tokens and webhooks. |
| Server | One Postmark server for the app | Holds the streams, templates (up to 100) and webhooks. Open and click tracking are server settings. |
| Streams | Five on the server, [below](#streams) | Three transactional, two broadcast. |
| Domain | limicon.org, verified in Postmark | A DKIM TXT record and a Return-Path CNAME (`pm_bounces` → `pm.mtasv.net`). Once verified, any `@limicon.org` address can send, team@ included. |
| Secrets | Supabase's SMTP settings, and Worker secrets | Supabase holds the Sign-in stream's SMTP token; the Worker holds the server API token and the webhook's password. |

## Streams

Each stream keeps its own suppression list: addresses Postmark won't send to after a hard bounce, a spam complaint or an unsubscribe. A spam-complaint suppression can't be removed. Streams are split by what a suppression would cost, so no email a member can complain about shares a stream with sign-in.

| Stream | Type | Sends | Members can turn off |
|---|---|---|---|
| Sign-in | Transactional, the server's default | Supabase's email only: sign-in links and email changes | No |
| Account and sessions | Transactional | Ticket confirmations, session changes and cancellations, and host confirmations and follow-ups (REG-7, NOT-1 to NOT-4) | No (NOT-6) |
| Notifications | Transactional | Mentions, replies and comments on a member's post | Yes, each in Settings |
| Updates | Broadcast | A new post on Updates, to members who chose it | Yes: the Settings choice, or Postmark's unsubscribe link |
| Newsletters | Broadcast | Newsletters and announcements (CON-1, NOT-5) | Yes: Postmark's unsubscribe link |

Transactional streams share Postmark's transactional IP addresses, and broadcast streams its broadcast addresses, so the split separates suppressions and statistics, not sending reputation. Postmark's complaint and bounce limits count the whole account ([Limits to watch](#limits-to-watch)).

The Updates email goes to every member who chose it at once, which fits Postmark's description of broadcast email ("multiple recipients at once"). With a stream of its own, Postmark's unsubscribe from it matches the one Settings choice.

**Suppressions reach the app.** Postmark's Subscription Change webhook reports every suppression on every stream. The app turns off the matching Settings choice: a suppression on Notifications turns off email notifications, and one on Updates turns off new-post emails. A suppression on Sign-in or Account and sessions has no setting to turn off, so the app shows admins that the member isn't getting email.

## Setting it up

1. Create the account as team@limicon.org and pick Basic.
2. Add limicon.org under **Sender Signatures**, then add the DKIM and Return-Path records Postmark shows to limicon.org's DNS. Verification takes up to 48 hours; the **Verify** button checks sooner. Add a DMARC record if limicon.org has none: `p=none` is enough to start.
3. Request account approval. Until it's granted, Postmark sends only to addresses at limicon.org. Approval usually takes under 24 hours on weekdays.
4. Turn on SMTP in the server's Settings, and set up Supabase's sign-in email ([below](#supabase-sign-in-email)).
5. Rename the default stream to Sign-in, create the other four [streams](#streams), and request broadcast approval. The bulk sending API refuses every call until it's granted.
6. Add the Worker secrets and the unsubscribe webhook ([below](#newsletters)) once the app's sending code exists.

## Supabase sign-in email

Supabase sends sign-in links through Postmark's SMTP server. In the Supabase dashboard, under **Authentication → Emails → SMTP Settings**:

| Setting | Value |
|---|---|
| Host | `smtp.postmarkapp.com` |
| Port | `587`, with STARTTLS |
| Username, password | The Sign-in stream's SMTP token: its Access Key and Secret Key, from the stream's Settings |
| Sender | team@limicon.org, named Limicon |

Supabase can't add Postmark's stream header, and mail without it goes to the server's default stream, Sign-in. A stream's SMTP token sends only through that stream, so Supabase never holds the server API token. Postmark shows the Secret Key once.

Supabase limits sign-in emails per hour on its own, under **Authentication → Rate Limits**. Raise it before registration opens.

## Newsletters

Postmark sends broadcast email; it holds no lists, has no visual editor and keeps no campaign reports. The app keeps the list (PRD MIG-1, MIG-3) and the admin console composes.

- **Sending.** The bulk API (`/email/bulk`) takes one body, or a template, with per-recipient fields, and Postmark paces delivery. Name the stream in `MessageStream` on every call, transactional ones included: Postmark's docs disagree on the default. One malformed address rejects the whole request, so check addresses first. The API's header is `X-Postmark-Server-Token`.
- **Templates.** Mustachio: `{{ name }}` fields, `{{#each}}` loops, sections that show only when a value exists, and layouts that wrap a template's content.
- **Unsubscribes.** Postmark adds an unsubscribe link and RFC 8058 one-click headers to every broadcast message, and adds whoever unsubscribes to that stream's suppression list, which the app hears about ([Streams](#streams)). One unsubscribe covers everything the stream sends. Handling unsubscribes in the app instead needs Postmark's approval.
- **Webhooks.** Postmark doesn't sign them. Put a username and password in the webhook's address (`https://user:password@…`) and check them in the Worker. Postmark retries 5xx, 408 and 429 answers over about an hour, so the same event can arrive twice. An event type that keeps failing for 48 hours is turned off until it's verified again.
- **Lists.** Postmark's terms allow only permission-based lists and ban purchased ones. Its broadcast guide advises against mailing anyone not contacted in the last 3 months, and against role addresses such as info@. Send to recent attendees first, then older contacts in small batches.

## Limits to watch

Postmark's terms let it suspend or cancel the account, transactional sending included, when:

- spam complaints reach 0.1% of emails sent, or
- bounces reach 10%.

The terms don't say over what period or which emails the rates count. Gmail's own limit is 0.3% complaints.

## Open choices

- **Broadcast sending domain.** Postmark recommends a subdomain for broadcast email, such as `news.limicon.org`, with its own DKIM and Return-Path, so newsletters build a reputation apart from sign-in. The PRD names team@limicon.org as the sender.
- **Announcements to ticket holders.** NOT-5's event emails share the Newsletters stream and its one opt-out, or get a broadcast stream of their own so members can leave the newsletter and keep event news. Postmark's docs put the limit at 10 or 15 streams per server.
- **Open and click tracking.** Off keeps members' reading private and links unchanged. On shows opens, which Apple Mail inflates, and rewrites links through Postmark.

## Sources

[Pricing](https://postmarkapp.com/pricing), [monthly pricing](https://postmarkapp.com/support/article/1107-how-does-monthly-pricing-work), [pausing billing](https://postmarkapp.com/support/article/1295-how-to-pause-your-monthly-billing), [account approval](https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work), [verifying a domain](https://postmarkapp.com/support/article/1046-how-do-i-verify-a-domain), [SMTP](https://postmarkapp.com/developer/user-guide/send-email-with-smtp), [message streams](https://postmarkapp.com/message-streams), [creating streams](https://postmarkapp.com/support/article/1207-how-to-create-and-send-through-message-streams), [bulk API](https://postmarkapp.com/developer/api/bulk-email), [suppressions API](https://postmarkapp.com/developer/api/suppressions-api), [Subscription Change webhook](https://postmarkapp.com/developer/webhooks/subscription-change-webhook), [webhooks](https://postmarkapp.com/developer/webhooks/webhooks-overview), [List-Unsubscribe headers](https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header), [template syntax](https://postmarkapp.com/support/article/1077-template-syntax), [broadcast best practices](https://postmarkapp.com/guides/best-practices-for-broadcast-sending), [terms](https://postmarkapp.com/terms-of-service)
