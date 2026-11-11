# Limicon Platform PRD

Nov 5, 2026 · @Naryan

Limicon gets one integrated web app with a mobile PWA, replacing Wix, Airtable, Google Calendar and Google Forms, with a working prototype in January 2027.

## Goals and success measures

The rebuild gives members one Limicon account, one place to register, host, schedule and RSVP, and a sessions calendar that updates in close to real time.

**Problems today**

- Members sign in to several platforms: Wix, Airtable, Hylo, Miro, Castalia, Google Forms and YouTube.
- The Google Calendar embed lags behind session changes.
- Hosts submit sessions in Airtable, then separate Google Forms for content and feedback.
- Organizers run tickets in Wix and sessions in Airtable, so registrations and sessions do not connect.

**Goals**

1. One account per person, with Google sign-in or email, that stays signed in and carries over year to year.
2. Ticketing with pay-what-you-can, fixed tiers and discount codes, paid through Stripe.
3. A sessions calendar where hosts submit and edit sessions and attendees browse, RSVP and keep a personal schedule.
4. Calendar changes reach attendees within seconds, with an email when a session they joined changes time.
5. Keep Hylo out of the stack. Miro and Castalia remain external links.
6. Keep the build simple enough that a small vibe-coding team can maintain it after launch.

**Success measures**

| Measure | Target |
| --- | --- |
| Platforms a member signs in to for core Limicon activity | 1 (plus external Miro and Castalia links) |
| Delay between a host saving a session change and the calendar showing it | Under 10 seconds |
| Members who complete registration without organizer help | 95% |
| Sessions submitted through the app rather than Airtable | 100% |
| Working prototype for team testing | January 2027 |

## Users and roles

Four roles cover Limicon. A Session Host is a Registered member with extra rights over their own sessions, and Admin is a separate flag on an account.

| Role | Who | Can do |
| --- | --- | --- |
| Public | Anyone without an account | Read the home, invitation, co-create, history, FAQ, contact, accessibility, privacy and conduct pages. Join the mailing list. Create an account and buy a ticket. |
| Registered | Account holder with a ticket for the current year | Everything Public can do, plus the Members area: browse and filter the sessions calendar, RSVP, keep My Schedule, submit a session, edit their profile, send messages, give feedback. |
| Session Host | Registered member who created or co-hosts a session | Create, edit, unpublish and delete their own sessions. See their RSVP list. Email their registrants. Set the privacy and recording options for their sessions. |
| Admin | Organizing team | Manage users and tickets, create discount codes, edit or cancel any session, turn the calendar on and off, send email, moderate messages, export data, edit site content. |

**Access rules**

- Each person needs their own account and ticket. There is no guest checkout and no multi-seat purchase.
- A ticket for a given year unlocks that year's Members area. An account with a past ticket keeps access to alumni content.
- Members-only pages are hidden from the menu for people who lack access, so locked sections do not appear as dead ends.
- Public visitors see session titles only, matching today's site.

## Scope and phases

This PRD covers Phases 0 to 2 in detail. Phases 3 and 4 appear as a roadmap. The January prototype is a working slice of Phase 1 that the tech team can test end to end.

| Phase | Contents | Target |
| --- | --- | --- |
| 0. Bedrock | PRD, design guide, development plan, technology selection, repo and delivery setup | November to December 2026 |
| Prototype | Account sign-in, Stripe checkout in test mode, host a session, sessions calendar with RSVP, Members area shell | January 2027 |
| 1. The Basics | Public info pages, accounts, ticketing with discount codes, host a session, sessions calendar, My Schedule, change notifications | Before registration opens |
| 2. Personalization | Profiles, member directory and search, messaging, feedback surveys, Stitchfest portal | Before the event |
| 3. Wish list | AI summaries and content tab, built-in video rooms, participant matching, recognition and bounty system, network map | After launch, by consensus |
| 4. Fine-tuning | End-to-end test of ticket, host, edit, attend and feedback flows | Before the event |

**Out of scope for now**

- Liminal Calendar integration. The data model will keep sessions exportable so the integration can follow.
- Hylo. Replaced by in-app messaging in Phase 2.
- Miro and Castalia. These stay as external links in the Members area.
- Native iOS and Android apps. The mobile experience is a PWA.
- AI recording, transcription and summaries. Phase 1 stores each session's consent choices so Phase 3 can use them.

## Phase 1 requirements

Phase 1 delivers the Must Haves from the planning doc: one account, registration with payment, and a sessions calendar that stays current.

### Accounts and sign-in

- **AUTH-1** Sign up and sign in with Google or with email (magic link or password; the team picks one in Phase 0).
- **AUTH-2** Sessions persist for at least 30 days on a device so members stay signed in.
- **AUTH-3** One account per person. Accounts persist across years and keep their history.
- **AUTH-4** Members can reset access themselves and delete their account.
- **AUTH-5** Admin is a flag on an account. Admins can grant and revoke it.

### Registration and ticketing

- **REG-1** A visitor creates an account first, then buys a ticket. No guest checkout.
- **REG-2** Ticket types: pay what you can (member enters an amount) and fixed tiers. Admins set tier names, prices and the pay-what-you-can minimum.
- **REG-3** Payment runs through Stripe Checkout in USD. The app records the amount paid and the ticket year.
- **REG-4** Discount codes: admins create codes as a percentage or fixed amount off, with an optional expiry, usage limit and tier restriction. A 100% code completes registration without payment.
- **REG-5** A completed ticket unlocks the Members area for that year. A confirmation email goes out automatically, and Stripe sends the receipt.
- **REG-6** Admins can view all registrations, issue comp tickets and mark refunds. Stripe handles the refund itself.
- **REG-7** Registration can be opened and closed by an admin. When closed, the page shows a message and a mailing list sign-up.

### Session submission (Host a Session)

- **SES-1** Registered members open the Host a Session form from the Members area and from the main menu.
- **SES-2** The form collects the fields in the next section. Hosts can save a draft, publish, edit and delete their own sessions.
- **SES-3** Published sessions appear on the calendar immediately. Admins can unpublish or edit any session.
- **SES-4** Hosts can add co-hosts who are registered members.
- **SES-5** Hosts choose a privacy option (private, recording shared with participants, with all members, or public) and an AI consent option (see the AI and privacy section).
- **SES-6** Validation runs on the server. Publishing requires a title, date, start and end time, and a meeting link.
- **SES-7** The form shows host guidance, tips and the session boilerplate that the Host a Session page carries today.

### Sessions calendar and RSVP

- **CAL-1** Three views: month calendar, three-day view and chronological list.
- **CAL-2** Filter and search by day, week, theme, format and keyword.
- **CAL-3** Times display in the member's local time zone, with a time zone selector. The server stores UTC.
- **CAL-4** Any create, edit or cancel shows on every open calendar within 10 seconds, without a page reload.
- **CAL-5** Members RSVP and cancel an RSVP in one click. An optional capacity and waitlist apply when a host sets them.
- **CAL-6** My Schedule lists the sessions a member joined and updates the moment they RSVP.
- **CAL-7** Members subscribe to My Schedule through an ICS feed and add single sessions to Google, Apple or Outlook calendars.
- **CAL-8** An admin switch turns the calendar on and off. When off, the calendar shows an explanatory message and hosts cannot submit sessions.
- **CAL-9** Session detail pages show description, theme, format, host, time, meeting link (members only), privacy option and RSVP count.

### Notifications

- **NOT-1** A member receives an email when a session they joined changes date or time, or is cancelled.
- **NOT-2** A member receives a reminder 24 hours before each session they joined.
- **NOT-3** A host receives a confirmation when a session is published, and a follow-up after the session with links to submit content and complete feedback.
- **NOT-4** Members control marketing email preferences. Transactional email always sends.

### Public pages and admin

- **PUB-1** Rebuild Home, Invitation, Co-Create, History (2024, 2025, 2026 when available), FAQ, Contact, Accessibility, Privacy and Code of Conduct. Content stays editable by admins without code changes.
- **PUB-2** The mailing list form stores emails in the app and lets admins export them.
- **PUB-3** The Contact form sends to the Limicon team address.
- **ADM-1** Admin console with tabs for users, tickets, discount codes, sessions, emails and site content.
- **ADM-2** Export users, registrations and sessions as CSV.

## Session form fields

These fields adapt the session editor from the Festival for Re-imagining the Economy site (one shared editor for host create, host edit and admin edit) to Limicon's themes, formats and privacy options. Limicon sessions are online, so in-person fields are left out.

| Field | Control | Required | Rules and notes |
| --- | --- | --- | --- |
| Session title | Text | Yes | Maximum 60 characters, with a live counter |
| Description | Textarea | No | What will happen and who it suits |
| Intention | Textarea | No | Purpose or hoped-for takeaways |
| Theme | Single select | Yes | The nine Limicon themes: Collective Sensemaking and Systems Thinking; Spirituality, Ritual and Contemplative Practice; Practical Tools, Skills and Resources; Personal Growth and Inner Work; Consciousness Exploration; Play, Games and Experimentation; Community, Belonging and Relational Culture; Creative Expression and Storytelling; Conference Meta and Co-Creation Spaces |
| Format | Single select | Yes | Lecture, Collaborative, Experiential or Embodied, Narrative or Storytelling, Interactive Workshop, Discussion, Playful, Social |
| Date | Date picker | Yes to publish | Within the event window set by admins |
| Start and end time | Time pickers | Yes to publish | End after start. Minimum 15 minutes. Entered in the host's time zone, stored in UTC |
| Time zone | Select | Yes | Defaults to the host's profile time zone |
| Meeting link | URL | Yes to publish | Shown to signed-in members only. Warn on invalid or non-https links |
| Maximum participants | Number | No | Blank means unlimited |
| Waitlist when full | Checkbox | No | Default off |
| Privacy and recording | Single select | Yes | Private (not recorded); recording available to session participants; recording available to all Limicon members; recording publicly available |
| AI Assistant consent | Select and checkboxes | Yes | See the AI and privacy section |
| Co-hosts | Member search | No | Registered members only |
| Pre-reading | Links and file uploads | No | PDF, DOC, DOCX, TXT; 10 MB maximum per file |
| Cover image | Image upload | No | JPEG, PNG or WebP; compressed on upload |
| Status (admin only) | Select | n/a | Draft, published, cancelled, completed |

**Actions on the form**

- Save draft: stores the session with status draft and no validation of publish-only fields.
- Publish to calendar: validates every publish-required field, then sets status published.
- Delete session: hosts can delete their own sessions after a confirmation. If members have RSVPed, the app notifies them and marks the session cancelled instead of removing it.

**Session content and feedback**

The two Google Forms the hosts use today become in-app forms: session content submission (links and files for the session record) and host feedback. Both reach the host from the follow-up email in NOT-3.

## Phase 2 requirements

Phase 2 replaces the Hylo functions the team uses (profiles, discussion, direct messages) and adds feedback and Stitchfest.

### Profiles and directory

- **PRO-1** Profile fields: first and last name, photo, location, bio (150 characters), extended bio (up to 1,000 words), links, keywords, and organizations.
- **PRO-2** Members-only directory with search by name and keyword. Emails never appear in the directory.
- **PRO-3** Each member controls whether they appear in the directory and whether others can message them. Defaults are on, and members can change them in Settings.
- **PRO-4** Profiles are visible to registered members of the current year and to alumni. They are never public.

### Messaging and discussion

- **MSG-1** One-to-one direct messages between members who allow messages, with unread indicators and email notification preferences.
- **MSG-2** Group conversations that any member can create, with a title, replies and emoji reactions.
- **MSG-3** A discussion feed with an admin-only announcements channel and a member channel for requests and offers.
- **MSG-4** Members can report a message or member. Admins review reports in the console, and can mute or deactivate an account. Moderation follows the Code of Conduct.
- **MSG-5** Message content is visible to the participants of the thread and to no one else, including admins, except through a report.

### Feedback and surveys

- **FBK-1** Admins build short surveys from text, rating and multiple-choice questions and attach them to the event or to a session.
- **FBK-2** Hosts receive a feedback form after their session. Attendees can leave optional feedback on any session they joined.
- **FBK-3** Admins see responses in the console and export them as CSV.

### Stitchfest

- **STI-1** A Stitchfest information page, public or members-only as the team decides.
- **STI-2** A submission form for registered members, with fields to be defined once the team describes what Stitchfest collects.
- **STI-3** Admins review, tag and export submissions.

## Data model

The model separates an account (a person, permanent) from a ticket (a person's participation in one year's Limicon). Every year is an edition, so next year's event changes one record rather than the schema. The names below are a starting point for the Phase 0 data architecture review.

| Table | Purpose | Key fields |
| --- | --- | --- |
| profiles | One row per person, linked to the auth account | name, photo, bio, extended bio, links, location, keywords, time zone, is\_admin, allow\_messages, show\_in\_directory |
| editions | One row per Limicon year | year, start and end dates, registration\_open, calendar\_open |
| ticket\_tiers | Fixed and pay-what-you-can options per edition | edition, name, price, is\_pwyc, pwyc\_minimum |
| discount\_codes | Admin-created codes | code, type (percent or amount), value, expires\_at, max\_uses, tier restriction |
| tickets | A person's registration for an edition | profile, edition, tier, amount\_paid, discount\_code, stripe\_session\_id, status |
| sessions | A scheduled session | edition, title, description, intention, theme, format, start, end, time zone, meeting\_link, max\_participants, waitlist\_enabled, privacy\_option, ai\_consent fields, status |
| session\_hosts | Host and co-host link | session, profile, role |
| session\_rsvps | Attendance | session, profile, status (registered or waitlisted), created\_at |
| session\_resources | Pre-reading and content uploads | session, kind, title, url or file path |
| notifications\_log | Email sent, for idempotency | profile, type, session, sent\_at |
| surveys, survey\_questions, survey\_responses | Feedback and surveys | scope (event or session), question type, answer |
| conversations, conversation\_members, messages, reactions | Direct and group messaging | type, title, body, author, created\_at |
| reports | Moderation | reporter, target message or profile, reason, status |
| stitchfest\_submissions | Stitchfest portal | profile, edition, fields to be defined, status |
| site\_content | Editable page content | slug, title, body, published |
| mailing\_list | Public signups | email, source, subscribed\_at |

**Rules**

- Row-level security applies to every table. A member reads only what their role allows.
- The meeting link is hidden from Public visitors and from members without a ticket for the edition.
- Session times are stored in UTC with the host's time zone for display.
- Deleting an account anonymizes its messages and removes personal fields.

## AI and privacy

Phase 1 collects each host's AI consent choices and stores them with the session. No AI feature ships until the November co-creation sessions on AI reach consensus. The consent fields follow Lauren's proposal, so Phase 3 can build on them without changing the form.

**Consent fields on every session**

| Question | Answer | Effect |
| --- | --- | --- |
| May the Limicon AI Assistant attend this session? | Yes or No | No ends the questions. Without the assistant, the session cannot be recorded or transcribed by Limicon. |
| Which permissions are granted? | Recording, transcription, full analysis, anonymized analysis, anonymized themes only (select all that apply) | The assistant may do only what is checked. |

**Rules**

- The consent form carries a plain headline that says what the assistant does and that it acts only within the host's permissions.
- Hosts can change consent until the session starts. The change is logged with the time and the person.
- The privacy option (private, participants, all members, public) and the AI consent remain two separate settings. The open question from the team is whether the privacy levels need new wording now that AI bots are in use.
- Any later AI feature must read the session's stored permissions before it acts. It removes names and avoids direct quotes for sessions that allow anonymized output only, and it skips locked sessions.
- Recordings and transcripts, when they exist, are stored privately and shown only at the level the host chose.

**Deferred to Phase 3**

- Recordings, transcripts, speaker insights and key takeaways on a Content tab with search.
- A Today at Limicon summary, daily themes, tensions, proposed action items and open questions.
- Session recommendations and participant matching.

**Privacy and compliance**

- Members accept a privacy notice and the Code of Conduct at sign-up, and the timestamp is stored.
- Limicon serves a global audience, so the team confirms which laws to name in the privacy policy (for example GDPR, CCPA and PIPEDA) and sets retention periods for recordings, transcripts and messages.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Scale | Supports 700 registered members and about 400 expected. Last year's event ran 309 or more sessions, so the calendar must stay fast with 500 sessions and several hundred members browsing at once. |
| Platform | Responsive web app, installable as a PWA on iOS, Android and desktop. Current versions of Chrome, Safari, Firefox and Edge. |
| PWA | Web manifest and icons, a service worker that caches the app shell, and My Schedule readable offline. Push notifications are optional and follow platform support. |
| Performance | Pages usable in under 3 seconds on a mid-range phone over 4G. Calendar changes visible to other users within 10 seconds. |
| Availability | No planned downtime during the event window. Daily database backups with a tested restore. |
| Accessibility | WCAG 2.2 AA. Keyboard navigation, screen reader labels, sufficient contrast, reduced-motion support. Accessibility page stays public. |
| Security | Row-level security on all tables. Stripe handles card data, and the app stores no card numbers. Stripe webhooks verified by signature. Secrets held in the host's environment settings, never in the repo. |
| Privacy | Least-privilege data access. Admins see only what their tasks require. Meeting links and profiles are visible to ticketed members only. |
| Email | Transactional email from a verified Limicon domain with SPF, DKIM and DMARC set up. One-click unsubscribe on marketing email. |
| Global use | All times shown in the user's time zone. Interface in English for 2027, with text kept in a translation-ready structure. |
| Maintainability | Typed code, automated tests on the registration, ticketing and calendar flows, preview deployments for every change, and a short runbook for organizers. |
| Observability | Error tracking and a simple admin view of failed emails and failed payments. |
