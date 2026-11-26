# Email selection

Candidate services for the email limicon-app sends. Postmark is chosen, for both transactional and marketing email; the PRD's Technology section records it, and [`config-postmark.md`](config-postmark.md) covers setting it up. Hosted sign-in waits on setting it up: Supabase's built-in email reaches only members of the Supabase organization ([`config-supabase.md`](config-supabase.md)).

Status: Prices and features checked against vendor pages on 2026-11-16, and Postmark's and Resend's prices, limits and terms again on 2026-11-25. Prices are USD per month, before tax. Figures marked *(estimate)* weren't on the vendor pages that were read; confirm them before relying on them.

## What the app sends

**Transactional email** goes to one person because of something they did or something that changed:

- sign-in links, sent by Supabase through an SMTP service (AUTH-1)
- ticket confirmations (REG-7)
- session change and cancellation notices, reminders, and host confirmations and follow-ups (NOT-1 to NOT-4)
- calendar invites on RSVP, if that option is chosen ([`feature-calendaring.md`](feature-calendaring.md))
- Contact form messages to team@limicon.org (PUB-4)

**Marketing email** goes to a list: newsletters and announcements (CON-1), and admin-scheduled event emails to ticket holders (NOT-5). This year's attendees and everyone else get separate mailings, never the same one. Past years' contacts total about 500, and this year's attendees will likely be under 1,000.

The PRD's rules for both:

- Sent from team@limicon.org, with SPF, DKIM and DMARC on limicon.org.
- One-click unsubscribe on marketing email. Members control marketing preferences, and transactional email always sends (NOT-6).
- Contacts and mailing-list sign-ups live in the app, with tags and export (MIG-1, MIG-3, PUB-3).
- Admins see failed emails.
- The whole platform, email included, runs on $20 to $100 a month.

## The options

- **Cloudflare Email Service.** Sending from the same account as the app, through a Workers binding with no API key, a REST API or SMTP. In beta. Cloudflare's FAQ says it supports transactional email only, so newsletters need another service.
- **Resend.** A developer-focused email API, with marketing email (Broadcasts, contacts, Topics) as a separately priced product in the same account. The Festival platform uses it for everything ([`reference-festival.md`](reference-festival.md)); is-app uses it for sign-in email ([`reference-iswebapp.md`](reference-iswebapp.md)).
- **Amazon SES.** The cheapest per email, and the most to build. Handles unsubscribe lists and one-click unsubscribe headers itself, but has no newsletter editor: the app's admin console would compose and send.
- **Postmark.** A transactional API known for deliverability, with separate Broadcast streams for marketing email in the same account.
- **Buttondown** *(newsletters only)*. A newsletter tool with an editor and web archive. is-app uses it for newsletters, syncing members to it as tags.

## Side by side

| | Cloudflare Email Service | Resend | Amazon SES | Postmark | Buttondown |
|---|---|---|---|---|---|
| **Covers** | Transactional only | Both, priced separately | Both; the app builds the newsletter side | Both, in separate streams | Newsletters only |
| **Transactional price** | Included with Workers Paid: 3,000 a month, then $0.35 per 1,000 | Free: 3,000 a month, capped at 100 a day. Pro: $20 for 50,000, then $0.90 per 1,000. 50% off paid plans for registered nonprofits | $0.10 per 1,000, no monthly fee | Free: 100 a month. Basic: $15 for 10,000, then $1.80 per 1,000. Pro: $16.50 for 10,000, then $1.30 per 1,000. No tier between 100 and 10,000, and no nonprofit discount found | – |
| **Newsletter price** | – | Free up to 1,000 contacts. Pro Marketing from $40 for 5,000 contacts, unlimited sends. Doesn't count against the transactional allowance | Same $0.10 per 1,000 | Counts against the same monthly allowance as transactional, at the same price | Free up to 100 subscribers; about $9 for 1,000 *(estimate)*. 50% off for registered nonprofits |
| **At the plan's limit** | Not checked | Sending stops: the API refuses with 429, and the email isn't queued or retried. Paying for overage is a setting, off by default | Not checked | Paid plans keep sending, and the overage is billed with the next month | – |
| **Changing plan** | Not checked | Monthly only. Proration and dropping to Free in quiet months not described | – | Monthly, no contract. Upgrades apply at once; downgrades at the end of the billing cycle. A paid account can drop to Free between seasons and keep its tokens and webhooks | Not checked |
| **Supabase sign-in email** | SMTP | SMTP | SMTP | SMTP | – |
| **From Workers** | Binding, no secret to store | REST API with an API key | REST API signed with AWS credentials *(a small signing library such as `aws4fetch` is the usual route; untested here)* | REST API with a token | REST API, for syncing subscribers |
| **Unsubscribe and preferences** | The app builds them | Topics, with an unsubscribe flow Resend provides. One-click headers not confirmed in the docs read | Contact lists and topics, with one-click headers and a hosted preferences page added automatically | Broadcast streams add an unsubscribe link and RFC 8058 one-click headers, suppress whoever unsubscribes, and tell the app by webhook. Postmark stores no lists: the app holds them | Built in |
| **Calendar invites** | `send()` has no alternative body parts; the older `EmailMessage` takes raw MIME. See [`feature-calendaring.md`](feature-calendaring.md) | Attachments with a content type, no raw MIME | Raw MIME, so any structure | Documented support article for calendar invites | – |
| **Deliverability record** | None yet: new service, no independent tests found | No independent tests found | 77% inbox, 20% spam in one shared-IP test | 83% inbox, 14% spam in the same test; the strongest reputation of the group | No independent tests found |
| **Getting started** | New accounts start with a conservative daily quota that grows with good sending | Free plan works immediately | Starts in a sandbox that sends only to verified addresses; production access is requested from AWS | Account approval before sending outside its own verified domains, usually within a weekday. Broadcast sending is approved separately | Sign up and import |
| **Inbound email** | Email Routing passes mail to a Worker, free | Inbound, used by the Festival for reply-to inboxes | Mail Manager, from $0.10 per 1,000 | Inbound processing | Replies go to the sender's inbox |

## Deliverability

Deliverability is whether email reaches the inbox, rather than spam or nowhere. For a sender of limicon's size, two things decide it:

- **The limicon.org domain's own reputation.** Mailbox providers such as Gmail track it from SPF, DKIM and DMARC alignment, spam complaints, bounces and engagement. It follows the domain to whichever service sends, and the team controls it: mail only people who asked, remove bounces, make unsubscribing easy.
- **The service's shared sending addresses.** At hundreds of emails a day, limicon sends from IP addresses shared with the service's other customers, whatever service it picks. Dedicated addresses need steady high volume to build their own reputation: Resend offers them only to senders above 3,000 a day, and Postmark suggests them from 300,000 a month. So the service matters mostly through how strictly it polices the other senders on those shared addresses.

### What's known about each service

There is no independent test that covers all five. Each service's reputation comes from different, weaker evidence.

- **Postmark** has the strongest record. It led Mailtrap's 2026 test of shared-IP sending on free plans, with 83% reaching the inbox and 14% landing in spam. It approves accounts before they send to anyone, and it sends broadcast email from IP addresses separate from transactional email, so a newsletter's complaints don't affect the addresses sign-in links leave from. Its terms still apply per account: a complaint rate of 0.1% or more, or a bounce rate of 10% or more, lets Postmark suspend or cancel the whole account.
- **Amazon SES** scored 77% inbox and 20% spam in the same test. Its shared addresses carry a very large and varied customer base. AWS reviews an account whose bounce rate reaches 5% or whose complaint rate reaches 0.1%, and may pause all its sending at 10% or 0.5%. A reputation dashboard and CloudWatch alarms show those rates.
- **Resend** has no independent placement data. It sends from shared addresses by default and says domain reputation and authentication drive most deliverability. A bounce rate of 4% or more, or a complaint rate of 0.08% or more, may pause the account's sending.
- **Cloudflare Email Service** has no track record: its sending is new and in beta. It tracks reputation per domain, suggests a separate subdomain for each kind of email, and starts new accounts on a low daily quota. Commentary on how well it will keep abusers off its shared addresses is speculation so far.
- **Buttondown** has no independent placement data.

Mailtrap, which sells email sending itself, ran the test cited above. It was one round, and it didn't include Resend or Cloudflare. Treat its numbers as a rough ordering, not a measurement of limicon's mail.

### The risk in limicon's own list

The biggest deliverability risk for limicon is the first newsletter to the roughly 500 contacts from past years. Some of those addresses will have gone stale since they were collected, and stale addresses bounce, and some become spam traps. A first mailing with 5% bounces puts an SES account under review, and on any service, a review or pause applies to the whole account, including sign-in links. Postmark's terms allow only permission-based lists, and its broadcast guide advises against mailing anyone not contacted in the last 3 months. Ways to reduce it:

- Drop addresses that already bounced from Wix before importing.
- Send the first mailing to recent attendees before older contacts, and watch bounces between batches.
- Send marketing email from a separate subdomain, a separate Postmark stream, or a separate service, so a bad mailing doesn't harm the reputation sign-in links depend on. Only a separate service also keeps a suspension away from sign-in.

### Checking it for limicon

- **Before choosing:** send the same transactional email and newsletter through each candidate's free plan to a seed-list service such as GlockApps, which reports inbox, spam or missing at Gmail, Outlook, Yahoo and others. Use a test subdomain of limicon.org so the main domain's reputation isn't touched.
- **After launch:** Google Postmaster Tools shows limicon.org's domain reputation and spam rate at Gmail.

## One service or two

One service can do both: Resend, Postmark and SES all send transactional and marketing email from one account. Teams often split anyway, for three reasons:

- **Reputation.** A newsletter that draws spam complaints can slow down sign-in links. Postmark's separate streams, Resend's separate products and a separate sending subdomain for marketing (such as `news.limicon.org`) each keep the two apart within one service.
- **Tools.** Transactional email is code: templates, an API, retries. A newsletter wants an editor, previews, a list and an archive, and admins use it without a developer.
- **Cloudflare is transactional only.** If Cloudflare sends the app's email, newsletters go elsewhere regardless.

What pulls toward one service for limicon: contacts, tags and preferences live in the app (MIG-1, MIG-3, NOT-6), and the contribution log records newsletters (CON-1). A separate newsletter tool needs the app's contacts synced out and unsubscribes synced back, as is-app does with Buttondown, or two places for a member's preferences.

## Combinations

| | Transactional | Newsletters | Expected cost, busy month *(estimate)* | Expected cost, quiet month *(estimate)* |
|---|---|---|---|---|
| **A** | Cloudflare | Buttondown | About $2.50, plus Buttondown for 1,000 subscribers and its $9 tagging add-on | $0, plus Buttondown |
| **B** | Resend | Resend | $20 (Pro) | $0, if no day passes 100 transactional emails |
| **C** | SES | SES, composed in the app | About $1.20 | About $0.30 |
| **D** (chosen) | Postmark | Postmark | About $19 (12,000 emails on Basic) | $15 |

Assumptions: a busy month sends 10,000 transactional emails, as in [`selection-hosting.md`](selection-hosting.md), and a quiet month 1,000. Marketing goes to under 1,000 contacts this year, in two mailings a month. Cloudflare's figure is on top of the $5 Workers Paid plan the app already pays.

- **A** spends least on transactional email and gives admins a ready-made newsletter editor. It means a contact sync and two vendors, and Cloudflare's sending is in beta. Separate attendee and non-attendee mailings need Buttondown's tagging add-on.
- **B** is one account and one API, with Topics for preferences. The free marketing plan's 1,000 contacts and 3 segments cover the attendee and non-attendee split this year. The list grows each year, and past 1,000 contacts Pro Marketing adds $40 a month, unless the app syncs only the contacts it currently mails. On Free, a day with more than 100 sign-in links and notifications refuses the rest until the next UTC day, so the season needs Pro, with paying for overage turned on.
- **C** costs almost nothing and handles one-click unsubscribe, and raw MIME settles the calendar-invite format. The app builds the newsletter composer, and someone manages an AWS account.
- **D** is one account with separate streams, keeps sending past its allowance, and has the strongest deliverability record. Its cost tracks emails sent, so a growing list adds little. It has no newsletter editor beyond templates, so the app composes, as with SES.

## Questions that decide it

1. **How do the candidates do in a seed test from limicon.org?** Published deliverability data covers only Postmark and SES, and only roughly.
2. **Who writes newsletters, and where?** An admin console composer (PRD ADM-1 has an emails tab) favours a sending API: SES, Resend or Postmark. A ready-made editor favours Buttondown or Resend Broadcasts.
3. **Does the list stay under 1,000?** This year it does, which keeps Resend Marketing free. Resend Marketing and Buttondown price by contacts held; SES and Postmark by emails sent.
4. **Does the calendar-invite email work?** If invites by email are chosen, test the `text/calendar` part through each candidate before deciding ([`feature-calendaring.md`](feature-calendaring.md)).
5. **How much does one vendor matter?** Cloudflare keeps transactional email with hosting, but newsletters still need a second service.
6. **Must newsletters come from team@limicon.org?** A separate marketing subdomain protects sign-in deliverability but changes the From address the PRD names.
7. **Is Limicon a registered nonprofit?** Buttondown and Resend halve their prices for one; Postmark has no nonprofit discount.

## Sources

- Cloudflare: [Email Service](https://developers.cloudflare.com/email-service/), [pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [limits](https://developers.cloudflare.com/email-service/platform/limits/), [FAQ](https://developers.cloudflare.com/email-service/reference/faq/), [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- Resend: [pricing](https://resend.com/pricing), [quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [send email API](https://resend.com/docs/api-reference/emails/send-email), [Broadcasts](https://resend.com/docs/dashboard/broadcasts/introduction), [Topics](https://resend.com/docs/dashboard/topics/introduction)
- Amazon SES: [pricing](https://aws.amazon.com/ses/pricing/), [subscription management](https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html)
- Postmark: [pricing](https://postmarkapp.com/pricing), [monthly pricing](https://postmarkapp.com/support/article/1107-how-does-monthly-pricing-work), [pausing billing](https://postmarkapp.com/support/article/1295-how-to-pause-your-monthly-billing), [account approval](https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work), [terms](https://postmarkapp.com/terms-of-service), [List-Unsubscribe headers](https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header), [broadcast best practices](https://postmarkapp.com/guides/best-practices-for-broadcast-sending), [calendar invites](https://postmarkapp.com/support/article/1101-how-do-i-send-calendar-invites-with-postmark)
- Buttondown: [pricing](https://buttondown.com/pricing)
- Deliverability: [Mailtrap's inbox placement test](https://mailtrap.io/blog/transactional-email-services/), [Cloudflare deliverability](https://developers.cloudflare.com/email-service/concepts/deliverability/), [SES enforcement thresholds](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html), [Resend dedicated IPs](https://resend.com/docs/knowledge-base/how-do-dedicated-ips-work), [Postmark message streams](https://postmarkapp.com/message-streams)
