# Calendaring

How sessions reach members' own calendars (Google, Apple, Outlook and others) and stay in step when they change. [`feature-sessions.md`](feature-sessions.md) covers the sessions themselves: times, lifecycle, repeats and RSVPs. The app's own calendar and My Schedule pages (CAL-1 to CAL-7) are not covered here.

Status: the [Google Calendar](#google-calendar) sync, the schedule's subscribe button and invites on RSVP are built (2026-11-22). The rest of this doc is the earlier design for app-served feeds, invites by app email and add-to-calendar links; where the team hasn't chosen, the options are listed.

## Google Calendar

What's built. Sessions reach members' calendars through two calendars owned by team@limicon.org, which the app keeps up to date through the Google Calendar API.

| Calendar | Holds | Who sees it |
|---|---|---|
| **Limicon Schedule** (public) | One event per published session: title, time, hosts, "Online" or the city, and a link to the session page | Anyone with its address. The schedule's **Subscribe to the Limicon calendar** button explains how to subscribe. |
| **Limicon** (private) | One event per member per session they're going to, with that member as the only guest: the meeting link or venue, and the session page | team@ only. Each member sees just their own invite. team@ can hide this calendar. |

- **Subscribing.** The button on Members > Schedule opens a panel explaining both ways onto a calendar: RSVP for an invite per session, or subscribe for every session as an overlay that members show or hide with its checkbox in their calendar app. The button says "subscribe", never "add": members who imported a copy of the calendar in past years were left with events that never updated. Its links: Google Calendar's `?cid=<calendar id>` page, a `webcal://` link to the calendar's public iCal address for Apple Calendar and Outlook, and a copy button for that address. Google Calendar shows changes at once; other apps when they next refresh.
- **The public calendar leaves out the meeting link and description**, which only members see. Its events link to the session page.
- **Invites.** A member who RSVPs and gets a place, or hosts or co-hosts, gets a Google invite at their sign-in email, marked accepted. Moving the session, or changing its title, link or venue, updates the invite and Google emails the member. Cancelling the RSVP, losing a co-host spot, deactivation, unpublishing or deleting the session cancels it. Waitlisted members get theirs when promoted. Sessions that have ended keep their invites as they are. One event per member, rather than one event with every member as a guest, means no member sees another's address, and adding a member emails nobody else.
- **Overlaps.** A member who subscribes and RSVPs sees a session twice; the panel says so.

### How the sync works

- Triggers on `sessions`, `session_rsvps`, `session_hosts` and members' names and deactivation queue the session in `calendar_sync_queue`. Every write path is covered, the admin console's included, without the app remembering to.
- A sync run claims a queued session, compares what each event should say (`app/lib/google-calendar.ts`, pure and unit-tested) with the content hash of what was last sent (`calendar_events`), and makes only the differences. Event ids come from the session's and member's uuids, so a repeated run updates rather than duplicates.
- Runs start after each form post (`waitUntil`, up to 5 sessions) and every minute from the Worker's Cron Trigger. A session that fails stays queued with `last_error`, and is retried after 1, 2, 4… minutes, up to an hour. A run stops at 40 Google calls, under Workers' limit per invocation, and leaves the rest queued.
- If Google refuses the app's access (401 or 403), the run stops and every session stays queued until access is fixed: run `npm run calendar:connect` again.
- The shared calendar's changes email no one (`sendUpdates=none`); invites email their member (`sendUpdates=all`).
- Don't edit either calendar's events in Google Calendar: the next change to the session overwrites them, and an event deleted there comes back.

### Setup

The sync does nothing until all of these are set. Locally they're unset, so it stays off.

| Setting | Where | Holds |
|---|---|---|
| `GOOGLE_CALENDAR_ID`, `GOOGLE_INVITES_CALENDAR_ID` | `wrangler.jsonc` vars | The two calendars' ids. Not secret: the first is the public calendar's address. |
| `APP_URL` | `wrangler.jsonc` vars | The app's address, for session page links |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` | Worker secrets | The OAuth client and team@'s refresh token |

`npm run calendar:connect` (`scripts/connect-google-calendar.mjs`) sets them all. It asks for the OAuth client's ID and secret ([`config-googlecloud.md`](config-googlecloud.md) → Calendar client), opens Google to sign in as team@limicon.org, finds or creates both calendars, makes Limicon Schedule public, writes the ids into `wrangler.jsonc`, and saves the secrets with `wrangler secret put`. `--dry-run` stops before creating or saving anything. When the sync first runs, it adds every published session, and invites everyone already going to an upcoming one.

### Limits to watch

- Google limits how many invitations an account sends to outside guests a day ([use limits](https://knowledge.workspace.google.com/admin/calendar/avoid-calendar-use-limits)). A failed send stays queued and retries, but check `calendar_sync_queue.last_error` around the day RSVPs open.
- Gmail adds an invite to the calendar on its own only from a known sender, depending on the member's setting. Otherwise the member adds it from the email.

## Ways onto a calendar

The app offers four, and members pick what suits them.

| | What it adds | Follows changes | How soon changes arrive | What the member does |
|---|---|---|---|---|
| **Everything feed** | Every published session in the edition | Yes | At the calendar app's next refresh: hours on Google | Subscribes once |
| **My Schedule feed** | Sessions they RSVPed to or host | Yes | At the calendar app's next refresh | Subscribes once |
| **Invites on RSVP** | Each session they RSVP to, as an invitation | Yes, through update emails | Within a minute or two | Turns invites on once |
| **Add to calendar** | One session, as a one-off copy | No | Never | Clicks on each session |

The NOT-1 change email reaches everyone who RSVPed, whichever way they use. It covers the hours a feed can take to refresh.

**Overlaps.** A session can reach one calendar twice: from the My Schedule feed and an invite, or from the everything feed and either of the others. Members choose one delivery for the sessions they join, in a profile setting: invites, the My Schedule feed, or neither. The page that shows feed links warns about duplicates when invites are on. The everything feed is for browsing, and members who use it alone RSVP in the app.

## A session as a calendar event

Every way onto a calendar describes a session the same way, so the copies match and updates apply to the right event.

| Property | Value |
|---|---|
| `UID` | `session-<session uuid>@limicon.org`. It never changes, and it's the same in feeds, invites and downloads. |
| `DTSTART`, `DTEND` | In UTC (`20270310T170000Z`). Calendar apps show them in the viewer's zone. Sessions have no recurrence rules, so no event needs `RRULE` or `VTIMEZONE`. |
| `SUMMARY` | The title. |
| `LOCATION` | The meeting link for online sessions, which most calendar apps make clickable. City and venue note in person. |
| `URL` | The session page. |
| `DESCRIPTION` | The meeting link, or "Link coming soon" with the session page; the session page link with "RSVP or cancel here"; then the description. |
| `STATUS` | `CONFIRMED`, or `CANCELLED` in a cancellation. |
| `SEQUENCE` | `sessions.calendar_sequence`. It goes up by one when the time, title, meeting link, location or status changes. Invites need it, and feeds carry it too. |
| `DTSTAMP`, `LAST-MODIFIED` | `sessions.calendar_updated_at`. |

- Feeds and invites both carry the meeting link. The trade-off is that a leaked feed URL exposes links until the member resets it.
- Neither carries alarms (`VALARM`). The app's own reminder (NOT-2) and each member's calendar defaults cover reminders.
- **Serializing.** RFC 5545 needs `\`, `;`, `,` and newlines escaped in text, lines folded at 75 octets without splitting a UTF-8 character, and CRLF line endings. Hand-written serializers usually break on one of these. Use a small pure function or a library that runs in Workers, and unit-test it with emoji titles, commas and semicolons, and long descriptions.

## Feeds

### Addresses and tokens

- Each member has one feed token, shared by both feeds: `/calendar/<token>/my-schedule.ics` and `/calendar/<token>/everything.ics`.
- The token is 32 random bytes, base64url-encoded, kept in `calendar_feed_tokens`. It's stored as plain text, because it unlocks only what the database already holds in plain text, such as meeting links. Hashing it would also stop the app showing the address again.
- Members can see and copy their feed addresses, and reset the token, which breaks every existing subscription.
- **Subscribing.** A `webcal://` link opens Apple Calendar, Outlook and most others. Google uses `https://calendar.google.com/calendar/r?cid=<encoded webcal address>`. A copy button covers the rest.
- Feeds are scoped by edition. A feed includes an edition's sessions only if the member holds a ticket for that edition. A member with no qualifying ticket gets an empty calendar. An error response would leave the last copy in place in most calendar apps.
- Each fetch records `last_fetched_at`, which tells members whether a calendar has picked up the feed.
- Keep tokens out of the app's own log lines and error reports.

### Contents

- **My Schedule:** sessions the member RSVPed to or hosts, in every edition they held a ticket for, so past years stay on their calendar. Waitlisted sessions appear with `STATUS:TENTATIVE` and "Waitlist: " before the title.
- **Everything:** every published session in this year's edition, co-creation meetings included (SES-9), for members with a ticket for it.
- Neither includes unpublished sessions. A session that leaves a feed disappears from subscribed calendars at their next refresh.
- Calendar names: `X-WR-CALNAME` such as "Limicon 2027: My Schedule".
- `REFRESH-INTERVAL;VALUE=DURATION:PT1H` and `X-PUBLISHED-TTL:PT1H` ask calendar apps to refresh hourly. Some apps follow them. Google is widely reported to ignore them and publishes no refresh schedule.
- Responses are `text/calendar; charset=utf-8`. Hyperdrive's 60-second read cache does no harm here.

## Invites on RSVP

When a member has invites turned on, RSVPing emails them a calendar invitation for that session, and the app keeps it current.

### What sends what

| Change | Sent to | Message |
|---|---|---|
| RSVP, or promotion from the waitlist | That member | Invite (`METHOD:REQUEST`) |
| Added as host or co-host, if hosts get invites ([open questions](#open-questions)) | That member | Invite |
| RSVP cancelled, or removed as co-host | That member | Cancellation (`METHOD:CANCEL`) for them only |
| Time, title, meeting link or location changes | Everyone holding an invite | Updated invite, with the higher `SEQUENCE` |
| Session unpublished, which includes cancelling and deleting it | Everyone holding an invite | Cancellation |

- Waitlisted members get no invite until they're promoted.
- Sessions that have ended get no updates.
- Description edits send nothing. The invite links to the session page, which always has the latest description.
- Invites go to the member's sign-in email.

### Keeping invites in step

Sync from state. Don't send one message per change.

- `session_calendar_invites` records what each member last received for each session: the email address, the `SEQUENCE` sent, and whether they hold an invite or a cancellation.
- The wanted state is that every member with invites on who is registered for a published session that hasn't ended, or hosts it, holds an invite at the session's current `SEQUENCE`. Everyone else holds a cancellation, or nothing if they never had an invite.
- A sync for one session compares wanted with sent, sends the difference, then records it. Computing the difference is a pure function, so unit-test it.
- **Triggers.** Each write that affects a session starts its sync after the response (`waitUntil`). A Cron Trigger every minute syncs any session whose state is behind, which catches failed sends.
- **Option:** leave updates to the cron, and sync a session only once a minute has passed since its last edit. A host's burst of edits then sends one update. RSVPs and cancellations still sync straight away.
- A crash between sending and recording resends the same `SEQUENCE`, and calendar apps treat that as the same update.

### Delivery: the options

**1. The app sends iCalendar invites by email.**

- Sent through the app's transactional email service ([`selection-email.md`](selection-email.md)), from team@limicon.org or a dedicated address. Each message goes to one member, so members never see each other's addresses.
- The update can travel in the NOT-1 change email itself: one email says what changed and updates the calendar.
- The app runs the invitation protocol (iTIP, RFC 5546): a stable `UID`, a rising `SEQUENCE`, `METHOD:CANCEL` for removals. Feeds need the `UID` and `SEQUENCE` anyway.
- No extra account, credential or vendor. Invites count as ordinary email volume.
- Calendar apps send replies to the organizer address, so that address must be a real mailbox, even though nothing reads it.
- **The open risk is the email format.** Calendar apps recognize an invite from a `text/calendar; method=REQUEST` part. Gmail is lenient. Outlook is reported to need that part inside `multipart/alternative`. Cloudflare Email Service's `send()` takes attachments with a MIME type but has no alternative body parts, and its older `EmailMessage` takes a raw MIME message ([Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)). Test this before choosing.

**2. A Google Calendar organizer account.**

- The app keeps one Google event per session on an organizer calendar in Limicon's Google organization, and adds members as attendees through the Calendar API. Google sends the invites, updates and cancellations, and they display well in every major calendar app.
- The Google event id comes from the session uuid: its hex digits, without the dashes, are a valid id. Creating an event twice then fails instead of making a duplicate.
- Set `guestsCanSeeOtherGuests=false` and `guestsCanInviteOthers=false`.
- **Credentials.** A service account with domain-wide delegation acts as the organizer user. Without delegation, Google refuses to invite attendees. Its JSON key lives in a Worker secret, and the Worker signs the token request with WebCrypto. Google Cloud organizations created since May 2024 block service-account keys until an admin lifts `iam.managed.disableServiceAccountKeyCreation` ([secure by default](https://cloud.google.com/resource-manager/docs/secure-by-default-organizations)).
- **Organizer user.** A dedicated user such as calendar@limicon.org costs a Workspace seat. team@limicon.org could organize instead, but the app's credential would then reach team@'s whole calendar.
- **Who gets emailed.** `sendUpdates=all` is documented as notifying all guests ([events.patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)). If adding one attendee emails every existing guest, each RSVP to a 50-person session emails 49 other people, and the fallback is one Google event per attendee.
- **Limits.** Google publishes daily limits on invitation emails to external guests ([use limits](https://knowledge.workspace.google.com/admin/calendar/avoid-calendar-use-limits)). Compare them with the day RSVPs open, and with a time change on a well-attended session.
- Google's update email arrives alongside the NOT-1 change email, unless NOT-1 skips members with invites on.
- Replies can be read later from each attendee's `responseStatus`.

**Both options:** Gmail adds an invitation to the calendar automatically only from a [known sender](https://support.google.com/calendar/answer/13159188), depending on the recipient's setting. Otherwise it arrives as an email with reply buttons, and answering adds it. A member who has just RSVPed is expecting it.

**What decides it:** whether option 1's email renders as a working invite, update and cancellation in Gmail, Outlook and Apple Calendar through the chosen email service. If it does, option 1 is simpler. If not, option 2 handles the format and brings Google's account, credential and email-fan-out questions.

### Replies to invites

The app doesn't read them. RSVPs live in the app, and each invite says to RSVP or cancel there. A member who declines in their calendar stays registered in the app and keeps their place against capacity. Reading declines later is possible: option 2 reads `responseStatus`, and with option 1, Cloudflare Email Routing can pass the organizer address's mail to a Worker that parses `METHOD:REPLY`.

## Add to calendar

Each session page offers members (CAL-8):

- **Google:** `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=20270310T170000Z/20270310T180000Z&details=…&location=…`
- **Outlook:** `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=…&startdt=…&enddt=…&body=…&location=…`, and the same path on `outlook.office.com` for work accounts.
- **Download** (Apple and others): `/sessions/<id>.ics`, one event with the session's usual `UID`.

These are copies, so changes never reach them. The page says so and points to the feeds and invites. The meeting link is in them for members only, as on the page.

## Data

| Table or column | Holds |
|---|---|
| `sessions.calendar_sequence` | integer, starts at 0, goes up on each change that affects calendars |
| `sessions.calendar_updated_at` | when that last happened |
| `profiles.calendar_delivery` | `invites`, `feed` or `none` |
| `calendar_feed_tokens` | profile (primary key), token (unique), created_at, last_fetched_at |
| `session_calendar_invites` | session and profile (primary key), email, sent_sequence, state (`invited` or `cancelled`), updated_at |

## Testing

- **Unit:** the serializer and the invite difference. Fixtures cover dates on both sides of each daylight-saving change, non-ASCII titles, long descriptions, commas and semicolons, unpublished and waitlisted sessions.
- **Integration:** feed routes against the local Supabase: token checks, a member without a ticket, unpublished sessions left out.
- **End to end:** Mailpit already catches local email, so a test can RSVP and check that the invite email has a `text/calendar` part with `method=REQUEST`.
- **By hand, before launch:** subscribe to a feed, and receive an invite, an update and a cancellation, in Google Calendar (web and phone), Apple Calendar (Mac and iPhone), Outlook.com and Outlook for Windows.

## To verify

- Option 1: the chosen email service sends a `text/calendar; method=REQUEST` part that Gmail, Outlook and Apple Calendar treat as an invite, and updates and cancellations apply to it.
- Option 2: whether adding an attendee with `sendUpdates=all` emails the existing guests.
- Option 2: whether limicon.org's Google accounts are Workspace accounts, and whether the organization blocks service-account keys.
- How often Google, Apple and Outlook refresh a subscribed feed, measured with `last_fetched_at`.
- The Google `cid=` subscribe link and both add-to-calendar URL formats.

## Open questions

- Are invites on or off by default for a new member?
- Do waitlisted sessions belong in the My Schedule feed? Do hosts and co-hosts get invites for their own sessions?
- When a member turns invites on, do they get invites for the upcoming sessions they already RSVPed to? When they turn invites off, do those invites get cancelled?
- One everything feed that marks the member's own sessions ("Going: …"), in place of choosing between two feeds?
- A public everything feed without a token? The Public role sees session titles only.
- A separate calendar email address, for members whose calendar isn't at their sign-in address? It would need a confirmation step before invites switch to it.
