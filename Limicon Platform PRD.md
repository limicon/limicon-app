# Limicon Platform PRD

Nov 5, 2026 · @Naryan · Updated Nov 12, 2026

Limicon gets one integrated web app, installable on phones as a PWA, that replaces Wix, Airtable, Google Calendar, Google Forms, Google Drive and YouTube. Registration is expected to open in January 2027, so ticketing ships first and the sessions calendar follows before the event.

## About Limicon

Limicon is an open-space convention that runs for about four weeks each spring around the equinox. More than 90% of it happens online, with a few local in-person gatherings, mostly in Canada. Participants join from around the world. Anyone with a ticket can host a session, and sessions appear on the calendar without approval. The 2027 dates are not set yet.

The Organizing Team works in Eastern time across all four US time zones. The app shows every time in the viewer's own time zone.

**Who builds it**

- **Lead builder:** builds the app and co-owns the repository.
- **James:** coding expert and repository co-owner. He reviews, approves and troubleshoots.
- **Naryan:** vibe-coding coach.
- **Megan:** data architecture support.

The team decides the foundation (database, hosting, data architecture) together. Visual design comes from a collective design session, and the lead builder implements it.

## Goals and success measures

**Problems today**

- Members sign in to several platforms: Wix, Airtable, Hylo, Miro, Castalia, Google Forms and YouTube.
- The Google Calendar embed lags behind session changes.
- Hosts submit sessions in Airtable, then use separate Google Forms for content, feedback and session harvest.
- Organizers run tickets in Wix and sessions in Airtable, so registrations and sessions do not connect.
- Hosts cannot edit a session after they submit it.
- Recordings reach the Organizing Team by email. The lead builder downloads each one and uploads it to YouTube.
- Much of the work behind Limicon is invisible at Happy Money, especially behind-the-scenes work.

**Goals**

1. One account per person, with Google sign-in or email, that stays signed in and carries over year to year.
2. Ticketing with fixed tiers and discount codes, paid through Limicon's existing Stripe account.
3. A sessions calendar where hosts submit and edit sessions and attendees browse, RSVP and keep a personal schedule.
4. Calendar changes reach attendees within seconds, with an email when a session they joined changes time.
5. Every Limicon tool lives inside the app except Miro and Castalia, which stay as external links.
6. Session content, recordings and harvests live on a searchable Content tab instead of Drive and YouTube.
7. The app records contributions so Happy Money can recognize work people do not see.
8. Running costs stay between $20 and $100 a month.
9. The build stays simple enough for one lead builder to maintain, with team support.

**Success measures**

| Measure | Target |
| --- | --- |
| Platforms a member signs in to for core Limicon activity | 1 (plus external Miro and Castalia links) |
| Delay between a host saving a session change and the calendar showing it | Under 10 seconds |
| Members who complete registration without organizer help | 95% |
| Sessions submitted through the app rather than Airtable | 100% |
| Google Forms in use for Limicon | 0 |
| Recordings moved by hand by an organizer | 0 once built-in video ships (Phase 3) |
| Monthly running cost | $20 to $100 |

## Users and roles

| Role | Who | Can do |
| --- | --- | --- |
| Public | Anyone without an account | Read the public pages. Join the mailing list. Create an account and buy a ticket. See session titles only. |
| Registered | Account holder with a ticket for the current edition | Everything Public can do, plus the Members area: calendar, RSVP, My Schedule, host a session, forms, profile, directory, messages, Content tab. |
| Session Host | Registered member who created or co-hosts a session | Create, edit, unpublish and delete their own sessions. See their RSVP list. Email their registrants. Set privacy and recording options. |
| Alumni | Account holder whose tickets are all for past editions | Their own account, messages and contacts, plus members and content tagged with the editions they attended. Nothing from editions they did not attend, including the current one. |
| Volunteer | Member helping with a specific project, such as Stewardship | Permissions to be defined per project (see Open questions). |
| Admin | Organizing Team (seven people today) | Full access by default. Narrower admin permissions, such as access to the team inbox, can be granted per person. |

**Access rules**

- Each person needs their own account and ticket. There is no guest checkout and no multi-seat purchase.
- A ticket for an edition unlocks that edition's Members area. People can register at any time, including during the event.
- Members-only pages are hidden from the menu for people who lack access, so locked sections do not appear as dead ends.
- Admin access is built as named permissions on top of a single Admin role. The team can then split permissions later without a schema change.

## Scope and phases

This PRD covers Phases 0 to 2 in detail. Phases 3 and 4 appear as a roadmap.

| Phase | Contents | Target |
| --- | --- | --- |
| 0. Bedrock | PRD, design guide (from the collective design session), development plan, technology selection, repo and delivery setup, coordination process (project board, bug and feedback intake) | November to December 2026 |
| 1A. Registration | Public pages, admin site editing, accounts, ticketing with discount codes, mailing list, contact migration, contribution log | When registration opens (expected January 2027) |
| 1B. Sessions | Host a Session, sessions calendar, My Schedule, notifications, session forms (harvest, content, host feedback), Members area | Before the calendar opens |
| 2. Personalization | Profiles, directory, messaging, surveys, Content tab, Stitchfest portal, contribution report | Before the event |
| 3. Wish list | Built-in video rooms with automatic recording, AI harvesting and summaries, Updates tab, participant matching, recognition and bounty system, Liminal Calendar import, network map | After launch, by consensus |
| 4. Fine-tuning | Finalize the session form after the AI consensus. End-to-end test of the ticket, host, edit, attend, content and feedback flows | Before the event |

A January prototype covers sign-in, Stripe checkout in test mode, hosting a session, and the calendar with RSVP. Testing runs throughout the build: weekly in the tech group, every two weeks with the Organizing Team, and ad hoc in between.

During the event, admins add relevant Liminal Calendar events to the Limicon calendar. The Members area does not link to the Liminal Calendar, which covers events outside Limicon's month.

**Out of scope for now**

- Automatic import from the Liminal Calendar. The data model keeps sessions exportable so an integration can follow.
- Native iOS and Android apps. The mobile experience is a PWA.
- AI recording, transcription and summaries. Phase 1 stores each session's consent choices so Phase 3 can use them.
- Running the Happy Money and Stitchfest votes. These happen live on a call. The app supplies the information they need (see Open questions).

## Technology

| Area | Choice |
| --- | --- |
| Framework | React Router 8, in TypeScript |
| Database, sign-in, file storage, realtime | Supabase, in the `us-east-1` (North Virginia) region |
| Database access | Server code connects through Cloudflare Hyperdrive with an ordinary Postgres driver, and checks permissions itself on every read and write. The browser never queries the database. Row-level security is enabled on every table with no policies, so nothing else can read the tables. |
| Hosting | Cloudflare Workers, with the placement hint `aws:us-east-1` so the app runs next to the database |
| Payments | Limicon's existing Stripe account, Stripe Checkout in USD. The statement descriptor stays "Transdisciplinary Lead East York". |
| Email | Sent from team@limicon.org on the limicon.org domain, which Limicon controls |
| App install | PWA |

[`docs/strategy-frontend-selection.md`](docs/strategy-frontend-selection.md), [`docs/strategy-hosting-options.md`](docs/strategy-hosting-options.md) and [`docs/strategy-database-selection.md`](docs/strategy-database-selection.md) compare the options in detail.

## Phase 1A requirements: registration

### Accounts and sign-in

- **AUTH-1** Sign up and sign in with Google or with email (magic link or password; the team picks one in Phase 0).
- **AUTH-2** Sessions persist for at least 30 days on a device so members stay signed in.
- **AUTH-3** One account per person. Accounts persist across years and keep their history.
- **AUTH-4** Members can reset access themselves and delete their account.
- **AUTH-5** Admin is a role with named permissions. Admins with the right permission can grant and revoke admin access.

### Registration and ticketing

- **REG-1** A visitor creates an account first, then buys a ticket. No guest checkout.
- **REG-2** The registration form collects:
  - first and last name, and email
  - location (city, state or province, country)
  - how they heard about Limicon
  - agreement to the Code of Conduct and the Privacy Policy
  - a confirmation that they will add team@limicon.org to their contacts
  - a confirmation that they will check the website and FAQ before emailing questions

  Agreements store a timestamp. Admins can edit these questions.
- **REG-3** Ticket tiers are fixed and all give the same access. 2026 tiers were Community $25, Standard $50, Abundant $100 and Benefactor $200. Admins set the tier names and prices for each edition.
- **REG-4** The tier picker shows admin-editable text above the tiers. By default it says:
  - Limicon aims to be financially accessible.
  - Anyone who can't pay can email team@limicon.org for a discount code.
  - Anyone who wants to give more than the Benefactor tier can get in touch.
  - Card statements show "Transdisciplinary Lead East York".
- **REG-5** Discount codes: admins create codes as a percentage or fixed amount off, with an optional expiry, usage limit and tier restriction. Admins can also create a single-use code for one person. A 100% code completes registration without payment.
- **REG-6** Payment runs through Stripe Checkout. The app records the tier, amount paid, discount code and edition.
- **REG-7** A completed ticket unlocks the Members area for that edition. A confirmation email goes out automatically, and Stripe sends the receipt.
- **REG-8** Refunds are requested by email to team@limicon.org. Admins mark a ticket refunded in the console, and Stripe issues the refund.
- **REG-9** Admins can view all registrations and issue comp tickets.
- **REG-10** Admins can open and close registration. When it is closed, the page shows a message and a mailing list sign-up.

### Contacts and migration

- **MIG-1** All existing contacts move into the app: Wix contacts, mailing list sign-ups and past ticket holders.
- **MIG-2** Past ticket holders get a ticket record for each edition they attended, marked as imported. This gives them alumni access and the year tags (for example Limicon 2026).
- **MIG-3** Admins can tag contacts and filter and export by tag and edition.

### Public pages and site editing

- **PUB-1** The public pages are Home, Invitation, Co-Create, History, FAQ, Contact, Accessibility, Privacy Policy and Code of Conduct.
  - Co-Create keeps its Meetings, Sessions and Open Space Technology Principles sections.
  - History keeps the 2024 and 2025 content as it is, and adds 2026.
- **PUB-2** Admins have full editing rights over site content without code: page text, images, links, page order and menu items, and publish or unpublish.
- **PUB-3** The mailing list form stores emails in the app and lets admins export them.
- **PUB-4** The Contact form sends to team@limicon.org.
- **PUB-5** The Accessibility page teaches visitors how to adjust their device and browser settings to suit their needs.
- **PUB-6** The visual design follows the design guide from the collective design session. It is a fresh design, not a copy of the Wix site.

### Contribution log

Happy Money pays admins and volunteers for the work of running Limicon, so the contribution log records that work only. General conference participation is not a contribution.

- **CON-1** From launch, the app records contribution activity by admins and volunteers on the Limicon container. This covers:
  - edits to site content and pages
  - newsletters and announcements
  - answers to questions about Limicon itself (not about a specific session)
  - posts and replies about the Limicon container
  - data exports and analysis, discount codes, comp tickets and moderation actions
  - time spent on these tasks, where the app can measure it
- **CON-2** The team records anything the app cannot capture by hand, as it does today.
- **CON-3** The app may also record general participation (sessions hosted, RSVPs, forms and posts) for event statistics. This is kept apart from contributions, and the privacy notice tells members it is recorded.

## Phase 1B requirements: sessions

### Session submission (Host a Session)

- **SES-1** Registered members open the Host a Session form from the Members area and from the main menu.
- **SES-2** Before the form unlocks, the host must open the host guidelines, scroll to the end and click to accept them. The acceptance is stored with a timestamp. Hosts accept once per edition.
- **SES-3** Hosts can save a draft, publish, edit and delete their own sessions. There is no approval step and no limit on the number of sessions.
- **SES-4** Published sessions appear on the calendar immediately. Admins can unpublish or edit any session.
- **SES-5** Hosts can add co-hosts who are registered members.
- **SES-6** Publishing requires a title, theme, format, date, start and end time. A session can be published without a meeting link. The session page then shows "Link coming soon", and the host gets a reminder to add the link.
- **SES-7** The form offers help to hosts without a video room, pointing them to team@limicon.org for a shared room.
- **SES-8** Hosts choose a privacy option and an AI consent option. The final wording of both waits for the AI consensus (see AI and privacy).
- **SES-9** Admins can mark an entry as an Organizing Team co-creation meeting. These meetings appear on the same calendar and can be filtered.
- **SES-10** Validation runs on the server.

### Sessions calendar and RSVP

- **CAL-1** Three views: three-day, month and chronological list. The three-day view is the default on desktop and the list view is the default on phones.
- **CAL-2** Filter and search by day, week, theme, format, session or co-creation meeting, and keyword.
- **CAL-3** Times display in the viewer's time zone, with a selector to change it. The server stores UTC and each session's time zone. Daylight-saving changes during the event window display correctly for every viewer.
- **CAL-4** Any create, edit or cancel shows on every open calendar within 10 seconds, without a page reload.
- **CAL-5** Members RSVP and cancel an RSVP in one click. An optional capacity and waitlist apply when a host sets them.
- **CAL-6** When a member RSVPs, they choose whether to get a reminder before that session.
- **CAL-7** My Schedule lists the sessions a member joined and updates the moment they RSVP.
- **CAL-8** Members subscribe to My Schedule through an ICS feed and add single sessions to Google, Apple or Outlook calendars.
- **CAL-9** Admins can turn the calendar on and off. When it is off, the calendar shows an explanatory message and hosts cannot submit sessions.
- **CAL-10** Session detail pages show:
  - description, theme and format
  - host and time
  - the meeting link, to members only
  - the privacy option and RSVP count

### Notifications

- **NOT-1** Everyone who RSVPed gets an email when a session changes date or time, or is cancelled.
- **NOT-2** Members who opted in at RSVP get a reminder before that session.
- **NOT-3** Hosts get a reminder before each session they host, including a prompt to add the meeting link if it is missing.
- **NOT-4** Hosts get a confirmation when a session is published. After the session, they get a follow-up with links to the content submission and host feedback forms.
- **NOT-5** Ticket holders get event-level emails that admins schedule, such as the opening reminder. They do not get a reminder for every session.
- **NOT-6** Members control marketing email preferences. Transactional email always sends.

### Session forms

These in-app forms replace the Google Forms. Admins can edit their questions.

- **FRM-1 Session Harvest.** Any registered member can fill it in, for any session. It asks:
  - which session they attended
  - one takeaway
  - what they would like to feed back into the system
  - what they felt attracted towards or repelled by
  - the session summed up in one word
- **FRM-2 Session Content.** Hosts upload slides, documents, recordings and transcripts, or link to them, to share with members. Uploads attach to the session and appear on the Content tab.
- **FRM-3 Host Feedback.** Only the session's hosts can fill it in. Host and session are filled in automatically. It asks:
  - number of participants
  - general feedback (paragraph)
  - what the experience was like (check all that apply): had fun, felt nervous or anxious, met my expectations, didn't meet my expectations, went according to my plan, strayed wildly from my plan, made meaningful connections, received meaningful insights or learnings, other
  - how it went (paragraph)
  - feedback for organizers (paragraph)
  - whether any tensions arose
- **FRM-4** If a host reports tensions, the form asks:
  - which tensions (check all that apply): interruptions, disrespectful behavior, unsolicited feedback or critiques, conflicts among participants, other
  - a description of what happened
  - whether they want support from the Organizing Team

  A request for support alerts admins who hold the moderation permission.
- **FRM-5** Admins see all responses in the console and export them as CSV.

### Members area

- **MEM-1** The Members home links to the calendar, My Schedule, Host a Session, the session forms, the Content tab (Phase 2), the directory and messages (Phase 2), and Accessibility.
- **MEM-2** Miro and Castalia appear as external links. Admins set the URLs for each edition.
- **MEM-3** Host guidance, tips, session attributes and the session boilerplate from today's Host a Session page live in the Members area.

### Admin console

- **ADM-1** The admin console has tabs for users and contacts, tickets, discount codes, sessions, forms, emails, site content, reports, and permissions.
- **ADM-2** Admins can export users, registrations, sessions and form responses as CSV.

## Session form fields

The session editor is shared for host create, host edit and admin edit. It adapts the editor from the Festival for Re-imagining the Economy site. The privacy and AI fields stay provisional until the AI consensus.

| Field | Control | Required | Rules and notes |
| --- | --- | --- | --- |
| Session title | Text | Yes | Maximum 60 characters, with a live counter |
| Description | Textarea | No | What will happen and who it suits |
| Intention | Textarea | No | Purpose or hoped-for takeaways |
| Theme | Single select | Yes | Collective Sensemaking and Systems Thinking; Spirituality, Ritual and Contemplative Practice; Practical Tools, Skills and Resources; Personal Growth and Inner Work; Consciousness Exploration; Play, Games and Experimentation; Community, Belonging and Relational Culture; Creative Expression and Storytelling; Conference Meta and Co-Creation Spaces |
| Format | Single select | Yes | Lecture, Collaborative, Experiential or Embodied, Narrative or Storytelling, Interactive Workshop, Discussion, Playful, Social |
| Online or in person | Select | Yes | Defaults to online. In-person sessions show a city and a venue note instead of a meeting link |
| Date | Date picker | Yes to publish | Within the event window set by admins |
| Start and end time | Time pickers | Yes to publish | End after start. Minimum 15 minutes. Entered in the host's time zone, stored in UTC |
| Time zone | Select | Yes | Defaults to the host's profile time zone |
| Meeting link | URL | No | Shown to signed-in members only. Warn on invalid or non-https links |
| Maximum participants | Number | No | Blank means unlimited |
| Waitlist when full | Checkbox | No | Default off |
| Privacy and recording | Single select | Yes | Private (not recorded); recording available to session participants; recording available to all Limicon members; recording publicly available |
| AI Assistant consent | Select and checkboxes | Yes | See AI and privacy |
| Co-hosts | Member search | No | Registered members only |
| Pre-reading | Links and file uploads | No | PDF, DOC, DOCX, TXT; 10 MB maximum per file |
| Cover image | Image upload | No | JPEG, PNG or WebP; compressed on upload |
| Co-creation meeting (admin only) | Checkbox | n/a | Marks an Organizing Team meeting |
| Status (admin only) | Select | n/a | Draft, published, cancelled, completed |

**Actions on the form**

- Save draft: stores the session with status draft and skips publish-only validation.
- Publish to calendar: validates the publish-required fields, then sets the status to published.
- Delete session: hosts can delete their own sessions after a confirmation. If members have RSVPed, the app notifies them and marks the session cancelled instead of removing it.

## Phase 2 requirements

### Profiles and directory

- **PRO-1** Profile fields: first and last name, photo, location, bio (150 characters), extended bio (up to 1,000 words), links, keywords, and organizations.
- **PRO-2** A members-only directory with search by name and keyword. Emails never appear in the directory.
- **PRO-3** Each member controls whether they appear in the directory and whether others can message them. Both default to on.
- **PRO-4** Current members see current members. Alumni see members tagged with the editions they attended. Profiles are never public.

### Messaging and discussion

- **MSG-1** One-to-one direct messages between members who allow messages, with unread indicators and email notification preferences.
- **MSG-2** Group conversations that any member can create, with a title, replies and emoji reactions.
- **MSG-3** A discussion feed with an admin-only announcements channel and a member channel for requests and offers.
- **MSG-4** The Organizing Team moderates together and informally, guided by the Code of Conduct. Members can report a message or member, and every admin sees the report. Admins can mute or deactivate an account.
- **MSG-5** Message content is visible only to the people in the thread. Admins see a message only when someone reports it.
- **MSG-6** Alumni keep their own messages and contacts from the editions they attended.

### Content tab

- **CNT-1** Sessions are listed in chronological order, with search and filters by edition, theme and format.
- **CNT-2** Each session page gathers the session details, content uploads (FRM-2), recordings and harvest highlights. What it shows is limited to what the session's privacy option allows.
- **CNT-3** Recordings play on the site. YouTube embeds remain a fallback if video hosting costs exceed the budget.
- **CNT-4** Each edition's content stays available to the members of that edition, including as alumni.

### Surveys

The host feedback survey (FRM-3), emailed to hosts after each session, is the only survey Limicon runs.

- **FBK-1** Admins can build further surveys from text, rating and multiple-choice questions and attach them to the event or to a session, if the team adds one later.
- **FBK-2** Admins see responses in the console and export them as CSV.

### Stitchfest

Stitchfest gives members with outside projects a set time to present, after which participants vote to fund them.

- **STI-1** A Stitchfest information page.
- **STI-2** A submission form for registered members to propose a project.
- **STI-3** Admins review submissions, accept presenters and set each presenter's time slot, which appears on the calendar.
- **STI-4** Admins export submissions and the presenter lineup.

### Contribution report

- **CON-4** Admins see a contribution report per person and per edition, built from the contribution log, to support the Happy Money discussion. Only admins can see it.
- **CON-5** Happy Money voting stays live on the closing call. The app supplies the report, not the vote.

## Phase 3 roadmap

- **Built-in video rooms.** Hosts run sessions inside Limicon instead of on their own Zoom. Hosts would no longer need a paid account, organizers could set accessibility options, and recordings and transcripts would flow straight to the Content tab. Cost against the budget needs a check first.
- **AI harvesting and summaries,** within each session's consent:
  - transcripts, speaker insights and key takeaways on the Content tab
  - an Updates tab with Today at Limicon, daily themes, tensions, proposed action items and open questions
- **Participant matching and session recommendations.**
- **Recognition and bounty system** that builds on the contribution log.
- **Liminal Calendar import** and a network map.

## Data model

The model separates an account (a person, permanent) from a ticket (a person's participation in one edition). Each Limicon year is an edition. The names below are a starting point for the Phase 0 data architecture review.

| Table | Purpose | Key fields |
| --- | --- | --- |
| profiles | One row per person, linked to the auth account | name, photo, location, bio, extended bio, links, keywords, time zone, allow\_messages, show\_in\_directory |
| admin\_permissions | Who holds which admin permission | profile, permission, granted\_by, granted\_at |
| editions | One row per Limicon year | year, start and end dates, registration\_open, calendar\_open, Miro and Castalia URLs |
| ticket\_tiers | Tiers per edition | edition, name, price, sort order |
| discount\_codes | Admin-created codes | code, type (percent or amount), value, expires\_at, max\_uses, tier restriction |
| tickets | A person's registration for an edition | profile, edition, tier, amount\_paid, discount\_code, stripe\_session\_id, status, imported |
| registration\_answers | Answers to registration questions | ticket, question, answer, agreed\_at |
| contacts, contact\_tags | Migrated and mailing list contacts | email, name, source, tags |
| sessions | A session or co-creation meeting | edition, title, description, intention, theme, format, online or in person, start, end, time zone, meeting\_link, max\_participants, waitlist\_enabled, privacy\_option, ai\_consent fields, is\_cocreation\_meeting, status |
| session\_hosts | Host and co-host link | session, profile, role |
| host\_guideline\_acceptances | Guideline sign-off | profile, edition, accepted\_at |
| session\_rsvps | Attendance | session, profile, status (registered or waitlisted), wants\_reminder, created\_at |
| session\_resources | Pre-reading, content uploads and recordings | session, kind, title, url or file path, visibility |
| forms, form\_questions, form\_responses | Harvest, host feedback, content and surveys | scope (event or session), question type, answer, respondent |
| notifications\_log | Email sent, for idempotency | profile, type, session, sent\_at |
| activity\_log | Contribution log | profile, edition, action type, target, duration where known, created\_at |
| conversations, conversation\_members, messages, reactions | Direct and group messaging | type, title, body, author, created\_at |
| reports | Moderation | reporter, target message or profile, reason, status |
| stitchfest\_submissions | Stitchfest portal | profile, edition, project fields, status, presentation slot |
| site\_pages | Editable site content | slug, title, body, menu position, published |
| mailing\_list | Public sign-ups | email, source, subscribed\_at |

**Rules**

- Server code checks every read and write against the member's role and editions, so a member reads only what those allow. Row-level security is enabled on every table with no policies, which blocks every other route to the data.
- The meeting link is hidden from Public visitors and from accounts without a ticket for the edition.
- Session times are stored in UTC with the session's time zone.
- Deleting an account anonymizes its messages and removes personal fields.

## AI and privacy

Phase 1 collects each host's AI consent choices and stores them with the session. No AI feature ships until the AI co-creation sessions reach consensus. The team still has to decide how involved AI will be, and the session form will be reviewed after that. Until then the consent fields follow Lauren's proposal.

**Consent fields on every session (provisional)**

| Question | Answer | Effect |
| --- | --- | --- |
| May the Limicon AI Assistant attend this session? | Yes or No | No ends the questions. Without the assistant, Limicon cannot record or transcribe the session. |
| Which permissions are granted? | Recording, transcription, full analysis, anonymized analysis, anonymized themes only (select all that apply) | The assistant may do only what is checked. |

**Rules**

- The consent section opens with a plain headline. It says what the assistant does and that it acts only within the host's permissions.
- Hosts can change consent until the session starts. Each change is logged with the time and the person.
- Any AI feature must read the session's stored permissions before it acts. Where only anonymized output is allowed, it removes names and avoids direct quotes. It skips sessions where it is not permitted.
- Recordings and transcripts are stored privately and shown only at the level the host chose.

**Privacy and compliance**

- Members accept the Privacy Policy and the Code of Conduct at registration, and the timestamp is stored.
- Limicon serves a global audience. The team confirms which laws the Privacy Policy names (for example GDPR, CCPA and PIPEDA). It also sets retention periods for recordings, transcripts, messages and the contribution log.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Scale | Supports 700 registered members, with about 400 expected. The calendar stays fast with 500 sessions and several hundred members browsing at once. |
| Cost | Total running cost of $20 to $100 a month across hosting, database, storage and email. Video storage and streaming are checked against this budget before Phase 2. |
| Platform | Responsive web app, installable as a PWA on iOS, Android and desktop. Current versions of Chrome, Safari, Firefox and Edge. |
| PWA | Web manifest and icons, a service worker that caches the app shell, and My Schedule readable offline. Push notifications are optional and follow platform support. |
| Performance | Pages usable in under 3 seconds on a mid-range phone over 4G. Calendar changes visible to others within 10 seconds. |
| Availability | No planned downtime during the event window. Daily database backups with a tested restore. |
| Accessibility | The build targets WCAG 2.2 AA: keyboard navigation, screen reader labels, sufficient contrast, reduced-motion support. Limicon has made no public commitment to a standard. |
| Security | Server code checks permissions on every read and write, and row-level security with no policies on every table blocks all other access. Stripe handles card data, and the app stores no card numbers. Stripe webhooks are verified by signature. Secrets live in the host's environment settings, never in the repo. |
| Privacy | Least-privilege data access. Admins see only what their permissions cover. Meeting links and profiles are visible to ticketed members only. |
| Email | Sent from team@limicon.org with SPF, DKIM and DMARC set up on limicon.org. One-click unsubscribe on marketing email. |
| Global use | All times shown in the viewer's time zone. Interface in English for 2027, with text kept in a translation-ready structure. |
| Maintainability | Typed code, automated tests on the registration, ticketing and calendar flows, preview deployments for every change, and a short runbook for organizers. |
| Observability | Error tracking and an admin view of failed emails and failed payments. |

## Open questions

| # | Question | Owner |
| --- | --- | --- |
| 1 | What are the 2027 event dates and the registration opening date? | Organizing Team |
| 2 | Admin permission levels: which permissions exist (for example team inbox, site content, finance) and who holds each? | Organizing Team meeting |
| 3 | Volunteer roles such as Stewardship: which projects are there, and what can each see and do? | Organizing Team meeting |
| 4 | Which Hylo functions (proposals, projects, requests and offers, feed, DMs) must Phase 2 replace? | Organizing Team |
| 5 | How involved can AI be, and what is the final session form wording for privacy and AI consent? | AI co-creation sessions |
| 6 | When do the AI sessions conclude, and who records the consensus? | Organizing Team |
| 7 | What fields does a Stitchfest submission need, is the Stitchfest page public or members-only, and does its vote happen in the app or on the live call? | Organizing Team |
| 8 | Can contact and purchase records be shared with AI tools during the migration? | Organizing Team |
| 9 | Do recordings move into Limicon storage, and at what cost per month? | Lead builder, James |
| 10 | Magic link or password for email sign-in? | Team, Phase 0 |
| 11 | Which laws does the Privacy Policy name, and how long are recordings, transcripts, messages and the contribution log kept? | Organizing Team |
| 12 | How do calendar changes reach open pages within 10 seconds (CAL-4)? With no row-level security policies, browsers can't subscribe to Supabase Realtime database changes, and Hyperdrive caches reads for 60 seconds by default. | Lead builder, James |
| 13 | Does Hyperdrive reach Supabase's direct connection, which is IPv6-only without the IPv4 add-on, or does it need the session pooler? A test project settles it. | Lead builder, James |
