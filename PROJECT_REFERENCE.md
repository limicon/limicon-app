# Festival Platform — Comprehensive Project Reference

> **Purpose:** AI-readable blueprint of the **Festival for Re-imagining the Economy** platform (`weall-can-festival`). Use this document when designing or implementing similar unconference / multi-session event platforms with registration, sessions, networking, knowledge harvest, and staff consoles.
>
> **Live product:** https://reimaginefestival.ca  
> **Package:** `weall-can-festival` `0.1.0`  
> **Scope date:** 2026-11-05  
> **Primary in-repo sources of truth:** `festival_prd_v1.2.md`, `architecture.md`, `types/supabase.ts`, `supabase/migrations/`, `components/session/session-editor.tsx`, `lib/sessions/validation.ts`, `lib/constants.ts`

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Tech stack](#2-tech-stack)
3. [High-level architecture](#3-high-level-architecture)
4. [Personas, roles, and access control](#4-personas-roles-and-access-control)
5. [Feature catalog](#5-feature-catalog)
6. [Route map](#6-route-map)
7. [API surface (summary)](#7-api-surface-summary)
8. [Create / edit session (“create event”) — exhaustive field inventory](#8-create--edit-session-create-event--exhaustive-field-inventory)
9. [Other major forms — field inventories](#9-other-major-forms--field-inventories)
10. [Database catalog](#10-database-catalog)
11. [Enums and allowed values cheat sheet](#11-enums-and-allowed-values-cheat-sheet)
12. [Storage buckets](#12-storage-buckets)
13. [Background jobs and integrations](#13-background-jobs-and-integrations)
14. [i18n, design system, and coding conventions](#14-i18n-design-system-and-coding-conventions)
15. [Environment variables](#15-environment-variables)
16. [Reusable patterns for similar projects](#16-reusable-patterns-for-similar-projects)
17. [File index (key paths)](#17-file-index-key-paths)

---

## 1. Product overview

### What it is

An **online unconference platform** for a multi-day festival. Participants create accounts, pay (or contribute $0), complete an onboarding survey, propose and host sessions, RSVP to sessions, harvest reflections after sessions, browse a participant directory, message and connect with others, explore a knowledge graph and AI “Ask the Festival” Q&A, and complete a post-festival impact assessment.

Staff use separate consoles:

| Console | Who | Purpose |
|---------|-----|---------|
| **Admin** | `admin_flag` | Full CRM, events, artifacts/transcripts, email, analytics, landing CMS, map tuning |
| **Care** | `care_team_flag` or admin | Care team chat, resources, email inbox |
| **Narration** | `narrator_flag` or admin | Narration chat, resources, daily journal |
| **Synthesis** | `synthesizer_flag` or admin | Research: overview, harvest analytics, impact, systems maps, seeds, anonymized transcripts |

### Core participant journey

```text
Landing → Register (email/Google) → Stripe Checkout OR $0 value contribution
  → Entry survey (profile) → Dashboard
  → Propose sessions / RSVP / Participants / Harvest / Settings
  → (optional) Impact assessment after festival
```

### Domain language

| Term in UI / code | Meaning |
|-------------------|---------|
| **Event / Session** | A single scheduled gathering (workshop, discussion, etc.). DB table: `events`. UI often says “session”; APIs often say “event”. |
| **Harvest** | Post-session reflection + shared summaries + knowledge commons |
| **Registration** | Festival-wide ticket/account completion (`users.registration_complete`) — distinct from session RSVP |
| **RSVP / Register for session** | Join a specific session (`user_to_event` role `registered` / `waitlisted`) |
| **Guest join** | Public RSVP without full festival account (`event_guest_registrations`) |
| **Artifacts** | Transcripts + AI summaries attached to a session (`resources`, `summaries`) |
| **Knowledge Graph** | Force-layout graph of sessions/themes/connections |
| **Builds from** | Directed link from a new session to prior completed sessions |

---

## 2. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 15.3** App Router + Turbopack | React **19.1**, TypeScript **5.8** |
| Styling | **Tailwind CSS 4.1** | Utility-first; design tokens in `design_style.md` |
| i18n | **next-intl 4.13** | Locales: `en`, `fr-CA`; `localePrefix: 'as-needed'` |
| Database / Auth / Storage | **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) | PostgreSQL + Auth + Storage + RLS + RPCs |
| Vector search | **pgvector** | Embeddings `vector(1536)` via OpenAI `text-embedding-3-small` |
| Payments | **Stripe** Checkout | Standard $30 CAD, Supporter $100 CAD, PWYW / $0 |
| Email | **Resend** + **react-email v6** + **Svix** | Campaigns, automations, inbound replies |
| Rich text (email) | **TipTap** | Compose body |
| Background jobs | **Inngest** | Artifacts, Fireflies bot, graph rebuild, synthesis |
| Meeting transcripts | **Fireflies.ai** GraphQL + webhooks | Bot join + transcript ingest |
| AI | **OpenAI** | `gpt-4o-mini` chat/summaries; embeddings |
| Documents | **unpdf** + **markitdown-ts** | PDF/office → markdown/text |
| Charts | **recharts** | Admin insights / synthesis |
| Hosting | **Vercel** | Hobby cron: once daily |
| Analytics | **@vercel/speed-insights** + custom `page_views` | |
| Icons | **lucide-react** | |
| Zip | **jszip** | Bulk transcript downloads |

---

## 3. High-level architecture

```text
┌──────────── Participants (locale en | fr-CA) ────────────┐
│  landing → register/Stripe → survey → dashboard           │
│  schedule · sessions · harvest · participants · settings  │
└───────────────────────┬──────────────────────────────────┘
                        │ Supabase Auth + RLS
┌───────────────────────▼──────────────────────────────────┐
│  Role consoles: Admin │ Care │ Narration │ Synthesis      │
└───────┬───────────────┬───────────────┬──────────────────┘
        │               │               │
   Resend CRM     Fireflies bot    OpenAI + pgvector
   Vercel cron         │               │
        │         webhook ingest   Inngest jobs
        ▼               ▼               ▼
              Supabase Postgres + Storage
```

### Client patterns

- **Default:** React Server Components; fetch with server Supabase client.
- **Mutations:** Mix of **Route Handlers** under `app/api/**` (dominant for complex/async flows) and some direct client Supabase updates (e.g. profile form). `architecture.md` prefers Server Actions for simple forms; the live app still uses many API routes.
- **Clients:**
  - `lib/supabase/client.ts` — browser
  - `lib/supabase/server.ts` — RSC / Route Handlers
  - `lib/supabase/admin.ts` — service-role
  - `lib/supabase/middleware.ts` — session refresh + route gates

### Security pillars

1. **RLS on every table** — no anonymous privileged reads.
2. **Meeting-link gating** — `meeting_link` only for host / co-host / registered (via `events_public` + `user_can_view_meeting_link`).
3. **Transcript privacy** — raw transcript `content_text` readable by admins + hosts/co-hosts only; participants see anonymized summaries.
4. **Privilege column protection** — triggers block clients from escalating `admin_flag` / care / narrator / synthesizer.
5. **Staff mutex** — `admin_flag` must not combine with care/narrator/synthesizer flags.

---

## 4. Personas, roles, and access control

### Profile flags (`public.users`)

| Flag / field | Meaning |
|--------------|---------|
| `registration_complete` | Paid or $0 path finished |
| `survey_complete` | Entry survey finished |
| `admin_flag` | Admin console |
| `care_team_flag` | Care console |
| `narrator_flag` | Narration console |
| `synthesizer_flag` | Synthesis console |
| `deactivated_at` | Soft-ban; middleware signs out |
| `messageable_flag` | Appear in DMs / accept messages (default true) |
| `matching_opt_out` | Hide from serendipity matching |
| `privacy_consent_at` / `privacy_sentiment` | Consent capture |
| `impact_assessment_completed_at` | Post-festival survey done |
| `amount_paid` | Cents paid via Stripe / recorded |
| `value_contribution` | Free-text for $0 path |

### Session attendance roles (`user_to_event.role`)

`host` | `co_host` | `registered` | `attendee` | `waitlisted`

Composite PK `(user_id, event_id, role)` — a user may hold multiple roles on one event.

### Middleware gates (locale-stripped path)

| Condition | Behavior |
|-----------|----------|
| Protected route, no user | → `/login?next=…` |
| `deactivated_at` set | sign out → login error |
| `/admin/*` | `rpc('is_admin')` |
| `/care/*` | care **or** admin |
| `/narration/*` | narrator **or** admin |
| `/synthesis/*` | synthesizer **or** admin |
| No `registration_complete` on protected app | → `/register` |
| Registered, no `survey_complete` | → `/survey` |
| Survey complete on `/survey` | → `/dashboard` |

**Protected prefixes:** `/dashboard`, `/schedule`, `/sessions`, `/participants`, `/harvest`, `/settings`, `/admin`, `/care`, `/narration`, `/synthesis`.

**API guards:** `requireAdminApi`, `requireCareApi`, `requireNarrationApi`, `requireSynthesisApi`, `requireParticipantApi`.

---

## 5. Feature catalog

### 5.1 Public / landing

- Co-created landing page (approved stickies, doodles, images; topic pills)
- FAQ (CMS entries + public submit form)
- Legal: privacy, terms, care statement
- Preliminary synthesis (public content)
- Email preference center (`/email/preferences`)
- Guest session join links (`/join/[eventId]`)
- Contact dialog (optional “send to care team”)
- Post-festival interest signup when registration is closed

### 5.2 Auth & registration

- Email/password sign-up + Google OAuth
- Forgot / reset password
- Payment tiers: PWYW, Standard ($30 CAD), Supporter ($100 CAD)
- $0 / value-contribution path without Stripe charge
- Stripe Checkout + webhook → `registration_complete`
- Entry survey / onboarding profile (required before dashboard)

### 5.3 Dashboard

- Home metrics / festival pulse
- Daily wellbeing log (score 1–10)
- Self-reported “people introduced” count
- Leaderboards by metric (opt-in visibility prefs)
- Privacy consent gate / impact assessment shell

### 5.4 Schedule & sessions

- Calendar / list schedule with format colour coding
- RSVP / un-RSVP with capacity + waitlist promotion
- Host propose session (`SessionEditor`)
- Host edit, draft vs publish, delete
- Co-hosts (search participants)
- Pre-reading materials (links + file uploads)
- Cover image
- “Builds from” prior sessions (knowledge-graph edges)
- Online vs in-person modes; external ticket URL
- Per-session ICS + festival-wide ICS feed
- Guest public registration for a session
- Host registrant list + notify registrants
- Host Fireflies “send bot” / artifact upload & summary edit
- Admin: edit any event, highlight tone, cancel, Fireflies controls

### 5.5 Participants hub

- Searchable directory (no emails exposed)
- Profile cards / modal
- Sector-based matching (“serendipity”) + opt-out
- 1:1 messaging (messageable flag)
- Manual connections with strength 1–4 + reason flags (work/social/learning)
- Network map (force layout; admin-tunable)
- Organization network view
- Group chats (threads, posts, GIFs, reactions, tone colours)

### 5.6 Harvest / knowledge commons

Tabs: Explore summaries | My harvests | Knowledge Graph | Preliminary Synthesis | Ask the Festival

- Post-session reflection (4 questions + privacy checkbox for Q4)
- Upload harvest resources
- Explore anonymized session summaries / artifacts
- Knowledge graph (layout modes, edge comments/edits)
- Festival synthesis markdown content
- Ask the Festival (RAG over embeddings; rate-limited)
- Host harvest view for own sessions

### 5.7 Settings

- Profile edit (same fields as survey, plus names)
- Timezone + allow IP timezone detection
- Messageable / matching toggles
- Metric visibility for leaderboards
- Impact assessment entry point

### 5.8 Admin console

- Users CRM: flags, deactivate, notes, sectors, bios
- Events list + edit (admin mode of SessionEditor)
- Artifacts processing queue (upload, reprocess, reset)
- Transcripts bulk download + name-matrix CSV (ack + audit log)
- Knowledge graph admin tuning
- Participant insights (themes regen, ask LLM)
- Analytics timeseries
- Map settings (knowledge graph + participant map)
- Value offers (email targeting for free/paid cohorts)
- FAQ CMS + submissions inbox
- Landing pills + contribution moderation
- Email CRM: compose, campaigns, automations, templates, inbox

### 5.9 Care / Narration / Synthesis consoles

- Shared pattern: chat threads/posts/reactions + link resources + comments
- Care: dedicated email inbox
- Narration: daily journal (`daily_journals`)
- Synthesis: overview, enhanced harvest, impact charts/export, systems maps, analysis seeds, resources, anonymized transcript download + review workflow, custom synthesis prompt per user

### 5.10 Impact assessment

Multi-step post-festival survey (healthy economy, distributed, regenerative, conscious, relational, overall, host/testimonial). Draft via PATCH; final POST. Visible to synthesizers for aggregate analysis.

---

## 6. Route map

### Locale-aware participant app (`app/[locale]/…`)

| Group | Paths |
|-------|-------|
| Landing | `/`, `/faq`, `/privacy`, `/terms`, `/care-statement`, `/preliminary-synthesis`, `/email/preferences`, `/join/[eventId]` |
| Auth | `/login`, `/login/forgot-password`, `/login/reset-password`, `/register`, `/register/value`, `/register/success`, `/survey` |
| Dashboard | `/dashboard`, `/schedule`, `/schedule/[id]`, `/sessions`, `/sessions/new`, `/sessions/[id]/edit`, `/participants`, `/harvest`, `/harvest/[id]`, `/harvest/[id]/host`, `/settings` |

### Non-locale staff consoles

| Group | Paths |
|-------|-------|
| Admin | `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/events`, `/admin/events/[id]/edit`, `/admin/artifacts`, `/admin/transcripts`, `/admin/knowledge-graph`, `/admin/participant-insights`, `/admin/analytics`, `/admin/map-settings`, `/admin/value-offers`, `/admin/faq`, `/admin/landing-pills`, `/admin/landing-contributions`, `/admin/email`, `/admin/email/compose`, `/admin/email/campaigns`, `/admin/email/campaigns/[id]`, `/admin/email/automations`, `/admin/email/templates`, `/admin/email/inbox` |
| Care | `/care`, `/care/chat`, `/care/resources`, `/care/inbox` |
| Narration | `/narration`, `/narration/chat`, `/narration/resources`, `/narration/journal` |
| Synthesis | `/synthesis`, `/synthesis/overview`, `/synthesis/harvest`, `/synthesis/impact`, `/synthesis/maps`, `/synthesis/maps/[id]`, `/synthesis/seeds`, `/synthesis/resources`, `/synthesis/transcripts` |

### Auth callbacks (no locale)

`/auth/callback`, `/auth/signout`

---

## 7. API surface (summary)

~137 Route Handlers under `app/api/**`. Grouped:

| Domain | Examples |
|--------|----------|
| Stripe / register | `POST /api/stripe/checkout`, `POST /api/stripe/webhook`, `POST /api/register/value` |
| Sessions | `POST /api/sessions`, `PATCH/DELETE /api/sessions/[id]`, materials, co-hosts, artifacts, calendar, notify, registrants, fireflies |
| Schedule | `POST/DELETE /api/schedule/[id]/rsvp` |
| Admin events | `GET /api/admin/events`, `GET/PATCH /api/admin/events/[id]`, Fireflies send |
| Harvest | reflection, resources, explore, ask, graph (+ layout, connections, comments) |
| Participants | directory, search, profile, matches, matching-opt-out, connect, network, map-config, messages, group-chats |
| Email CRM | campaigns, automations, templates, send, preview, test, upload, segments, inbox |
| Care / Narration / Synthesis | chat, resources, inbox, journal, seeds, maps, impact, transcripts |
| Integrations | `POST /api/fireflies/webhook`, `POST /api/resend/webhook`, `GET/POST /api/inngest`, `GET /api/cron/email-automations` |
| Misc | contact, FAQ submit, landing contributions, impact-assessment, dashboard prefs/wellbeing/leaderboard, analytics page-view, calendar ICS |

---

## 8. Create / edit session (“create event”) — exhaustive field inventory

### Important naming note

There is **no modal titled “Create Event.”** The primary create/edit surface is the full-page **`SessionEditor`**:

| Role | Route | Props |
|------|-------|-------|
| Host create | `/sessions/new` | `mode="create"` |
| Host edit | `/sessions/[id]/edit` | `mode="edit"` |
| Admin edit | `/admin/events/[id]/edit` | `mode="edit"` `adminMode` |

**Component:** `components/session/session-editor.tsx`  
**Validation:** `lib/sessions/validation.ts` → `validateSessionForm`  
**Constants:** `lib/constants.ts` (`SESSION_FORMATS`, `SESSION_MODES`, `SESSION_STATUSES`)  
**i18n keys:** `messages/en.json` → `sessions.editor`

A legacy `components/session/session-submission-form.tsx` exists with a subset of fields but is **not** wired to the main pages.

### Submit APIs

| Action | Method | Endpoint | Backend |
|--------|--------|----------|---------|
| Create | `POST` | `/api/sessions` | RPC `create_session_with_host` |
| Host edit | `PATCH` | `/api/sessions/{eventId}` | RPC `update_session` |
| Admin edit | `PATCH` | `/api/admin/events/{eventId}` | `update_session` + direct status/highlight updates |
| Delete (host) | `DELETE` | `/api/sessions/{eventId}` | RPC `delete_session_by_host` |
| Co-hosts | `POST` / `DELETE` | `/api/sessions/{id}/co-hosts[/{userId}]` | `user_to_event` |
| Materials | `POST` / `DELETE` | `/api/sessions/{id}/materials[/{resourceId}]` | `resources` + storage |
| Builds-from | via session payload | RPC `set_session_builds_from` | junction `event_builds_from` |

### JSON payload keys (create / edit)

```text
event_name, description, format, intention, session_mode,
meeting_link, location, external_ticket_url,
session_date, start_time_local, end_time_local, timezone,
builds_from, max_registrations, waitlist_enabled, publish,
cover_image_url
```

**Admin-only extras:** `status`, `highlight_tone`

### Server validation rules (`validateSessionForm`)

| Rule | Detail |
|------|--------|
| Title required | trimmed non-empty |
| Title max length | **60** characters |
| Date + start + end required | via `session_date` + local times **or** ISO `start_time`/`end_time` |
| End after start | strict |
| Min duration | **15 minutes** |
| Online max duration | **180 minutes** (Fireflies recording limit) |
| Format | must be in `SESSION_FORMATS` if provided |
| Publish + online | `meeting_link` required |
| Publish + in_person | `location` required |
| Location max | **200** characters |
| Max participants | positive integer if set; blank → `null` (unlimited) |
| URLs | `external_ticket_url`, `cover_image_url`, optional legacy `pre_reading_url` must be http(s) |
| Mode default | `online` if invalid/missing |
| Waitlist default | `false` |
| Mode clears opposite field | online clears `location`; in_person clears `meeting_link` |

### Primary DB mapping (`events`)

| Column | Form field | Notes |
|--------|------------|-------|
| `event_id` | — | UUID PK; returned on create |
| `event_name` | Session title | Required, ≤60 |
| `description` | Description | Optional |
| `cover_image_url` | Cover image | Optional; bucket `session-covers` |
| `format` | Format | Optional enum (see below) |
| `intention` | Intention | Optional free text |
| `pre_reading_url` | — | **Legacy**; still accepted by API, **not** shown in SessionEditor (materials UI replaced it) |
| `session_mode` | Session type | `online` \| `in_person` |
| `meeting_link` | Meeting link | Online only; gated in `events_public` |
| `location` | Location | In-person only |
| `external_ticket_url` | Ticket link | When external-ticket checkbox on |
| `start_time` / `end_time` | Date + start/end + timezone | Combined server-side to timestamptz |
| `max_registrations` | Max participants | Optional |
| `waitlist_enabled` | Enable waitlist | Boolean |
| `status` | Publish / draft / admin status | `draft` \| `published` \| `cancelled` \| `completed` |
| `highlight_tone` | Schedule highlight | Admin only |
| `fireflies_meeting_id` | — | Set by Fireflies scheduling on publish (not a form field) |
| `canonical_transcript_id` / `canonical_summary_id` | — | Artifact pipeline |
| `artifact_processing_status` | — | `idle` \| `queued` \| `processing` \| `ready` \| `error` |
| `last_edited_by` / `last_edited_at` | — | Audit |
| `date_added` | — | Created timestamp |

Related rows: `user_to_event` (host/co_host), `event_builds_from`, `resources` (pre_reading).

---

### Field-by-field UI inventory — `SessionEditor`

#### Section A — Session details

| UI label | Control | Required | Default | Options / validation | Helper / UX | DB / API key |
|----------|---------|----------|---------|----------------------|-------------|--------------|
| **Event status** *(admin edit only)* | `<select>` | No | existing or `draft` | `draft`, `published`, `cancelled`, `completed` | — | `status` |
| **Schedule highlight** *(admin edit only)* | Tone swatches + “none” | No | existing / none | `accent`, `secondary`, `tertiary`, `quaternary`, `muted` | Colours session outline on schedule | `highlight_tone` |
| **Session title** | text | **Yes** | `''` | `maxLength=60`; counter `N / 60` | Placeholder e.g. “Building community-owned energy” | `event_name` |
| **Description** | textarea (~4 rows) | No | `''` | trimmed if present | “What will happen…” | `description` |
| **Cover image** | file picker | No | existing URL | JPEG/PNG/WebP; client compress; ~8 MB client gate | “Optional. Shown as thumbnail…” | `cover_image_url` |
| **Format** | `<select>` | No | `''` | Empty “Choose a format” + `Workshop`, `Discussion`, `Presentation`, `Open Space`, `Other`. Legacy stored `Demo` → `Presentation` | Used for schedule colour coding | `format` |
| **Intention** | textarea (~3 rows) | No | `''` | — | Takeaways / purpose placeholder | `intention` |
| **Which previous sessions does this build from?** | Multi-checkbox dropdown | No | `[]` | UUIDs from `GET /api/sessions/previous` | “Optional. Shows as directed connection in Knowledge Graph.” | `builds_from` |

#### Section B — When

| UI label | Control | Required | Default | Validation | Helper | API keys |
|----------|---------|----------|---------|------------|--------|----------|
| **Date** | `type="date"` | **Yes** | from `start_time` or empty | Required; weekday label shown | — | `session_date` |
| **Start time** | `ClockTimeInput` | **Yes** | from existing | Required | — | `start_time_local` |
| **End time** | `ClockTimeInput` | **Yes** | from existing | End > start; ≥15 min; online ≤180 min | — | `end_time_local` |
| Timezone (implicit) | from user prefs | — | user’s IANA tz | Sent on submit | “Enter times in {timezone}.” | `timezone` |

#### Section C — Where

| UI label | Control | Required | Default | Validation / options | Helper | API key |
|----------|---------|----------|---------|----------------------|--------|---------|
| **Session type** | Two toggle buttons | Always set | `online` (or inferred) | `online`, `in_person` | Labels: Online / In person | `session_mode` |
| **Meeting link** | text (`inputMode=url`) | Soft: **required to publish** if online | `''` | Client confirm dialogs for whitespace / multi-URL / invalid / http / local / unusual host | “Any join link works. Zoom… Fireflies…” | `meeting_link` |
| **Location** | text | Soft: **required to publish** if in-person | `''` | `maxLength=200` | Address / room placeholder | `location` |
| **This event requires a ticket from an external site** | checkbox | No | true iff URL exists | Gates ticket URL field | — | (UI only) |
| **Ticket link** | `type="url"` | **Yes if checkbox on** | `''` | Valid http(s) URL | `https://…` placeholder | `external_ticket_url` |

#### Section D — Capacity

| UI label | Control | Required | Default | Validation | Helper | API key |
|----------|---------|----------|---------|------------|--------|---------|
| **Max participants** | number `min=1` | No | `''` → `null` | Positive integer if set | “Leave blank for open” | `max_registrations` |
| **Enable waitlist when full** | checkbox | No | `false` | — | — | `waitlist_enabled` |

#### Section E — Co-hosts (outside main form submit; separate APIs)

| UI | Control | Notes | API / DB |
|----|---------|-------|----------|
| Host (display) | read-only | Current host name | `user_to_event.role='host'` |
| Co-host search | `ParticipantAutocomplete` | Pending list until create succeeds, then API | `POST /api/sessions/{id}/co-hosts` |
| Remove co-host | button | | `DELETE .../co-hosts/{userId}` |

#### Section F — Pre-reading (`PreReadingEditor`)

| UI label | Control | Required | Validation | API / DB |
|----------|---------|----------|------------|----------|
| Link title | text | Yes to add link | — | `resources.resource_name` |
| Link URL | URL text | Yes | Valid URL | `file_url`, `source=external_link`, `file_type=pre_reading` |
| File title | text | No (falls back to filename) | — | `resource_name` |
| File | file | — | PDF/DOC/DOCX/TXT; max **10 MB** | Storage `session-resources`, `source=manual_upload` |

#### Actions

| Control | Behavior |
|---------|----------|
| **Save draft** | `publish: false` → `status=draft` |
| **Publish to schedule** | `publish: true` → `status=published`; may schedule Fireflies for online+link |
| **Save changes** | Admin; treats `status === 'published'` as publish semantics |
| **Delete session** | Host edit only; confirm → `DELETE` |

### Format → schedule colour mapping

| Format | Text / pill hue family |
|--------|------------------------|
| Workshop | violet |
| Discussion | pink |
| Presentation | sky |
| Open Space | amber |
| Other | emerald |

---

## 9. Other major forms — field inventories

### 9.1 Festival registration

**Components:** `registration-flow.tsx`, `email-sign-up-form.tsx`, `value-contribution-form.tsx`

#### Email sign-up

| Field | Type | Required | Validation | Storage |
|-------|------|----------|------------|---------|
| First name | text | Yes | required | `users.first_name` |
| Last name | text | Yes | required | `users.last_name` |
| Email | email | Yes | required | auth + `users.email` |
| Password | password | Yes | min **6** | auth |
| Confirm password | password | Yes | must match | client-only |

Also: Google OAuth button (no form fields).

#### Payment tier

| Field | Type | Required | Options | Submit |
|-------|------|----------|---------|--------|
| Ticket tier | radio | Yes | `pwyw` (default), `standard` ($30 CAD / 3000¢), `supporter` ($100 CAD / 10000¢) | — |
| Your amount (CAD) | number `min=0` | if pwyw | default `15` | If pwyw & ≤0 → `/register/value`; else `POST /api/stripe/checkout` `{ tier, custom_amount? }` |

#### Value contribution ($0)

| Field | Type | Required | API |
|-------|------|----------|-----|
| Free-text contribution | textarea | Optional empty OK | `POST /api/register/value` → `users.value_contribution`; then `/survey` |

### 9.2 Entry survey / profile (`ProfileForm`)

**Modes:** `onboarding` (survey) | `settings`  
**Persist:** Supabase client update on `users` + `user_organizations`  
**Sectors:** `SECTOR_INTERESTS` in `lib/constants.ts` (24 options — see §11)

| Field | Type | Mode | Required | Limits | DB |
|-------|------|------|----------|--------|-----|
| First name | text | settings | Yes | — | `first_name` |
| Last name | text | settings | Yes | — | `last_name` |
| Profile photo | `image/*` | both | No | compressed; bucket `avatars` | `profile_photo_url` |
| Bio | textarea | both | No | **max 150** chars | `bio` |
| Organizations | combobox multi | both | No | create/link | `user_organizations` |
| Sector interests | checkbox grid | both | No | from `SECTOR_INTERESTS` | `sector_interests` `string[]` |
| Hope from festival | textarea | both | No | — | `hope_from_festival` |
| Connection goals | textarea | both | No | — | `connection_goals` |
| Topics of interest | textarea | both | No | — | `topics_of_interest` |
| Extended bio | textarea | both | No | ≤**1000** words | `extended_bio` |
| Messageable | checkbox | onboarding | No | default true | `messageable_flag` |
| Matching opt-out | checkbox | onboarding | No | default false | `matching_opt_out` |
| (onboarding submit) | — | onboarding | — | sets | `survey_complete=true` |

### 9.3 Guest session join

**Component:** `guest-register-form.tsx`  
**API:** `POST /api/join/{eventId}/register` → `event_guest_registrations`

| Field | Type | Required | DB column |
|-------|------|----------|-----------|
| Name | text | Yes | `name` |
| Email | email | Yes | `email` |
| Organization | text | No | `organization` |
| Role | text | No | `role` (guest’s self-described role — not host/registered) |

Status becomes `registered` or `waitlisted` based on capacity. Guest receives `access_token` for magic-link style access.

### 9.4 Post-festival signup (registration closed)

| Field | Type | Required | Validation | DB |
|-------|------|----------|------------|-----|
| Name | text | Yes | — | splits to name fields |
| Email | email | Yes | — | email |
| Interest | textarea | Yes | `minLength=10` | `post_festival_interest` + mailing-list flag |

### 9.5 Harvest reflection

**Component:** `reflection-form.tsx`  
**API:** `POST /api/harvest/{eventId}/reflection`  
**DB:** `reflections` UNIQUE `(user_id, event_id)`

| Key | Label | Placeholder | Required |
|-----|-------|-------------|----------|
| `q1_highlight` | What stood out? | A moment, idea, or person that stayed with you… | No (empty OK) |
| `q2_feeling` | How did you feel? | Energy, mood, or emotional tone of the session… | No |
| `q3_takeaways` | What are you taking away? | Insights, questions, or intentions… | No |
| `q4_connections` | What connections emerged? | People, themes, or ideas you want to follow… | No |
| `q4_connections_private` | Keep Q4 / reflection private (checkbox) | If true, reflection treated as author-only | No default false |

Harvest file upload: title optional; file PDF/DOC/DOCX/TXT/MD; max **10 MB**.

### 9.6 Impact assessment (7 steps)

**API:** `PATCH` draft / `POST` submit `/api/impact-assessment`  
**DB:** `impact_assessments` (1:1 `user_id`)

| Step | Fields | Types | Required on final submit |
|------|--------|-------|--------------------------|
| 1 Healthy economy | sentence completion | textarea | **Yes** |
| 2 Distributed | Likert 1–5; participation text; optional comments | rating + text | rating **Yes** |
| 3 Regenerative | energy in / out / field (1–5); comments | 3 ratings | all 3 **Yes** |
| 4 Conscious | voice heard / emergence (1–5); comments | 2 ratings | both **Yes** |
| 5 Relational | people met enum + possible + comments | `0` \| `1_2` \| `3_5` \| `6_plus` | people met **Yes** |
| 6 Overall | pattern + shift | textareas | at least one **Yes** |
| 7 Host / testimonial | differently, keep, testimonial, share-ok | text + bool | optional |

Also tracks `current_step` 0–7 and `completed_at`.

### 9.7 Admin user edit

**Component:** `user-detail-manager.tsx`  
**API:** `PATCH /api/admin/users/{id}`; notes CRUD under `/notes`

Editable: first/last name, bio (≤150), messageable, admin/care/narrator/synthesizer flags (mutex), sector interests, hope/connection/topics, deactivate/reactivate (`deactivated_at`), admin notes body (1–5000).

Read-only display: email, joined, amount paid, value contribution, post-festival interest.

### 9.8 Email composer + segment builder

#### Composer fields

| Field | Type | Options / notes |
|-------|------|-----------------|
| Campaign name (internal) | text | soft required |
| Subject | text | merge variables; character count |
| Header style | select | see `EMAIL_HEADER_VARIANTS` |
| Send type | select | `marketing` \| `transactional` |
| Load template | select | from templates API |
| Body | TipTap rich text | default greets `{{first_name}}` |
| Audience | SegmentBuilder | required for send |

#### Segment filters (`EmailSegmentFilters`)

| Control | Maps to |
|---------|---------|
| Specific people vs filters | `user_ids[]` vs `filters` |
| All registered | `registration_complete: true` |
| Survey incomplete | `survey_complete: false` (+ registered) |
| Incomplete registration | `registration_complete: false` |
| Deactivated only | `deactivated_only: true` |
| Hosts / co-hosts | `hosts_only` |
| Post-festival mailing list | `post_festival_mailing_list_only` |
| Admins only | `admins_only` |
| Impact complete / incomplete | `impact_assessment_complete` bool |
| RSVP to session | `event_id` |
| Sector interest | `sector_interests` |
| Exclude marketing opt-out | `exclude_marketing_opt_out` (implicit for marketing) |

Also available in types: `paid_only`, `free_only`.

#### Merge variables

`first_name`, `last_name`, `email`, `tier`, `amount_paid`, `dashboard_url`, `survey_url`, `schedule_url`, `join_url`, `meeting_link`, `location`, `event_name`, `event_start`, `rsvp_sessions`, `hosted_sessions`, `unsubscribe_url`

#### Automation triggers

`registration_complete` | `survey_incomplete_after_3d` | `session_reminder_24h` | `session_cancelled` | `session_rsvp` | `session_waitlisted`

### 9.9 Map settings (admin)

#### Knowledge graph (`graph_config`)

| Label | Key | Typical UI range |
|-------|-----|------------------|
| Similarity threshold | `similarity_threshold` | 0–1 |
| Theme edge weight | `theme_edge_weight` | 0–2 |
| Similarity edge weight | `similarity_edge_weight` | 0–2 |
| Reflection blend weight | `reflection_weight` | 0–1 |
| Max links per session | `max_edges_per_session` | 1–30 |
| Repulsion strength | `repulsion_strength` | 0.1–5 |
| Link distance base | `link_distance_base` | 50–500 |
| Chronological vertical spread | `chronological_spread` | 0.2–3 |
| Upcoming belt spread | `upcoming_ring_extra` | 0–1500 |

Actions: Save & rebuild / Save only / Rebuild now.

#### Participant map (`participant_map_config`)

Force-layout knobs: `repulsion_strength`, `alpha_decay`, `alpha_min`, `velocity_decay`, `settle_velocity`, `max_ticks`, `collision_padding`, `label_clearance`, `unconnected_empty_zone`, `disconnected_ring_extra`, plus `link_distance_1..4` and `link_strength_1..4`, and `isolate_positions` JSON.

### 9.10 Other dialogs (brief)

| Dialog | Key fields | API |
|--------|------------|-----|
| Create group chat | title (≤120), opening post (≤2000) or GIF URL, tone | `POST /api/participants/group-chats` |
| Contact | name, email, message (≥10), send-to-care checkbox | `POST /api/contact` |
| FAQ submit | question (≥10), name, email | `POST /api/faq/submit` |
| Landing contribution | sticky text + tone; doodle canvas; or image + caption | landing contributions API |
| Synthesis prompt | textarea (≥10 to save) | `PATCH /api/synthesis/prompt` → `users.synthesis_prompt` |
| Host summary edit | markdown textarea | session artifacts API |

Group chat / landing tones: `accent` | `secondary` | `tertiary` | `quaternary` | `muted` (+ `white` for landing pills).

---

## 10. Database catalog

> Types from `types/supabase.ts` (~49 tables) plus migration-only tables. Prefer regenerating types after schema changes. Prefer reading sessions via view **`events_public`** (masks `meeting_link` / `location`).

### 10.1 Users / orgs / CRM

#### `users` (PK `user_id` → `auth.users`)

`user_id`, `email` (UNIQUE), `first_name`, `last_name`, `bio` (≤150), `extended_bio`, `profile_photo_url`, `sector_interests` `string[]`, `hope_from_festival`, `connection_goals`, `topics_of_interest`, `value_contribution`, `amount_paid` (cents), `stripe_customer_id`, `messageable_flag`, `admin_flag`, `care_team_flag`, `narrator_flag`, `synthesizer_flag`, `survey_complete`, `registration_complete`, `date_joined`, `deactivated_at`, `timezone`, `allow_ip_timezone`, `dashboard_prefs` jsonb, `people_introduced_count`, `privacy_consent_at`, `privacy_sentiment` (`excited`|`mixed`|`reluctant`), `matching_opt_out`, `post_festival_mailing_list_flag`, `post_festival_interest`, `impact_assessment_completed_at`, `synthesis_prompt`.

#### `organizations`

`org_id`, `org_name` (UNIQUE, length 2–120), `org_description`, `created_at`

#### `user_organizations`

Composite PK `(user_id, org_id)`

#### `admin_user_notes`

`note_id`, `user_id`, `author_id`, `body` (1–5000), `created_at`, `updated_at`

#### `wellbeing_logs`

PK-ish `(user_id, logged_on)`; `score` 1–10; `created_at`

### 10.2 Events / registration

#### `events`

See §8 field mapping. Status/format/mode/artifact enums in §11.

#### View `events_public`

Public-facing event fields with meeting link / location masking.

#### `user_to_event`

`user_id`, `event_id`, `role`, `attendance_confirmed`, `joined_at` — PK `(user_id, event_id, role)`

#### `event_guest_registrations`

`guest_id`, `event_id`, `name`, `email`, `organization`, `role`, `status` (`registered`|`waitlisted`), `access_token`, `registered_at`

#### `event_builds_from` (migration; may lag types)

PK `(event_id, builds_from_event_id)`; no self-reference.

### 10.3 Harvest / resources / AI

#### `reflections`

`reflection_id`, `user_id`, `event_id`, `q1_highlight`, `q2_feeling`, `q3_takeaways`, `q4_connections`, `q4_connections_private`, `processed`, `submitted_at` — UNIQUE `(user_id, event_id)`

#### `resources`

`resource_id`, `event_id`, `user_id`, `resource_name`, `resource_description`, `file_url`, `file_type` (`pre_reading`|`transcript`|`recording`|`summary`|`resource`), `source` (`manual_upload`|`fireflies_api`|`youtube`|`external_link`), `content_text`, `is_canonical`, `processed`, `embedding` vector(1536), `created_at`

#### `summaries`

`summary_id`, `resource_id`, `event_id`, `key_insights`, `action_items`, `raw_chunks` jsonb, `generated_at`

#### `themes`

`theme_id`, `theme_name`, `theme_description`, `confidence_score` (0–1), `status` (`draft`|`emerging`|`established`), `status_override`, `is_seeded`, `evolution_log` jsonb, `embedding`, `created_at`

### 10.4 Graphs / network

#### `graph_connections`

Polymorphic edges: `source_type`/`target_type` ∈ `user`|`event`|`organization`|`theme`; nullable FK columns for each; `connection_description` (≤150); `connection_weight`; `sentiment_score` (−1…1); `reason_work`/`reason_social`/`reason_learning`; `first_detected`/`last_detected`.  
**Also in SQL (may lag types):** `connection_explanation`, soft-delete columns, editor FKs.

#### `graph_snapshots`

Historical weight/sentiment per connection.

#### `user_to_user`

Manual connections: `from_user_id`, `to_user_id`, `strength` 1–4, `strength_label`, `notes`, reason booleans, `created_at`.

#### Migration-only config

`graph_config` (singleton), `graph_layout_defaults` (`organic`|`chronological`), `graph_connection_comments`, `participant_map_config`.

### 10.5 Messaging

#### DMs — `participant_messages`

`message_id`, `from_user_id`, `to_user_id`, `body` (1–2000), `read_at`, `created_at`

#### Group chat

`group_chat_threads` (`title` 1–120, `tone`, soft delete), `group_chat_posts` (body and/or `gif_url`), `group_chat_reactions` UNIQUE `(post_id, user_id, emoji)`

Care / Narration stacks mirror group chat + resource boards (migration tables).

#### `daily_journals`

PK `journal_date`; `body_html`; narrator/admin write.

#### Email inboxes

`email_messages`, `care_messages`, `inbox_threads` (`inbox` ∈ `admin`|`care`)

### 10.6 Email CRM

| Table | Purpose |
|-------|---------|
| `email_preferences` | marketing opt-out + unsubscribe token |
| `email_templates` | reusable bodies + header_variant |
| `email_campaigns` | draft/send state, segment_json, stats_json |
| `email_campaign_recipients` | per-recipient delivery state |
| `email_events` | Resend webhook events |
| `email_automations` | trigger_type + delay + segment |
| `email_automation_deliveries` / `email_guest_deliveries` | idempotency logs |

### 10.7 Synthesis / impact / transcripts

| Table | Purpose |
|-------|---------|
| `impact_assessments` | post-festival survey 1:1 user |
| `synthesis_seeds` | LLM analysis questions + status |
| `synthesis_seed_sources` | excerpts with role `arose`\|`insight`\|`tension`\|`quote` |
| `synthesis_systems_maps` | generated graph_json from seed_ids |
| `synthesis_resources` (+ comments) | link board |
| `transcript_download_log` | admin ack audit (`single`\|`bulk`\|`name_matrix`) |
| `transcript_participants` | code_name ↔ display_name matrix |
| `transcript_reviews` | synthesizer review markers PK `(event_id, user_id)` |

Postgres enum: `relational_people_met_bucket` = `"0"` | `"1_2"` | `"3_5"` | `"6_plus"`.

### 10.8 Directory / landing / FAQ / analytics

| Table | Purpose |
|-------|---------|
| `participant_match_cache` | similar/different matches JSON |
| `participant_insights_theme_snapshots` | admin themes job |
| `participant_insights_ask_queries` / `ask_festival_queries` | rate-limit ledgers |
| `faq_entries` / `faq_submissions` | CMS + inbox |
| `landing_topic_pills` | hero/cloud pills |
| `landing_contributions` | sticky/doodle/image moderation |
| `page_views` | path analytics |

### 10.9 Core relationship map

```text
auth.users ──1:1──► users
users ◄──► user_organizations ◄──► organizations
users ◄──► user_to_event ◄──► events
events ──► resources ◄── events.canonical_{transcript,summary}_id
resources ──► summaries
users + events ──► reflections
users ◄──► user_to_user
graph_connections ──polymorphic──► users | events | organizations | themes
events ◄──► event_builds_from ◄──► events
users ──1:1──► email_preferences, impact_assessments, participant_match_cache
email_campaigns ──► recipients ──► email_events
synthesis_seeds ──► seed_sources
group/care/narration threads ──► posts ──► reactions
```

---

## 11. Enums and allowed values cheat sheet

| Field | Allowed values |
|-------|----------------|
| `events.status` | `draft`, `published`, `cancelled`, `completed` |
| `events.format` | `Workshop`, `Discussion`, `Presentation`, `Open Space`, `Other` (legacy `Demo`→Presentation) |
| `events.session_mode` | `online`, `in_person` |
| `events.highlight_tone` | `accent`, `secondary`, `tertiary`, `quaternary`, `muted` |
| `events.artifact_processing_status` | `idle`, `queued`, `processing`, `ready`, `error` |
| `user_to_event.role` | `host`, `co_host`, `registered`, `attendee`, `waitlisted` |
| Guest registration status | `registered`, `waitlisted` |
| `resources.file_type` | `pre_reading`, `transcript`, `recording`, `summary`, `resource` |
| `resources.source` | `manual_upload`, `fireflies_api`, `youtube`, `external_link` |
| `themes.status` | `draft`, `emerging`, `established` |
| Graph node types | `user`, `event`, `organization`, `theme` |
| `user_to_user.strength` | 1–4 → labels: Met once or twice / Casual acquaintance / Collaborator or friend / Close collaborator or intimate friend |
| Chat / highlight tones | `accent`, `secondary`, `tertiary`, `quaternary`, `muted` (+ `white` landing) |
| Landing contribution type | `sticky`, `doodle`, `image` |
| Landing / FAQ moderation | contributions: `pending`\|`approved`\|`rejected`; FAQ entries: `draft`\|`published`; submissions: `pending`\|`answered`\|`dismissed` |
| Email campaign_type | `marketing`, `transactional` |
| Email campaign status | `draft`, `sending`, `sent`, `failed`, `test` |
| Email recipient status | `pending`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `complained`, `failed` |
| Email header_variant | `festival_banner`, `geometric_dots`, `session_reminder`, `minimal`, `pop_card`, `color_ribbon`, `shape_burst` |
| Automation trigger_type | see §9.8 |
| Inbox direction / inbox | `inbound`\|`outbound`; `admin`\|`care` |
| Synthesis/insights job status | `idle`, `processing`, `ready`, `error` |
| Seed source role | `arose`, `insight`, `tension`, `quote` |
| `privacy_sentiment` | `excited`, `mixed`, `reluctant` |
| Transcript download_kind | `single`, `bulk`, `name_matrix` |
| Payment tiers | `pwyw`, `standard`, `supporter` |
| Graph layout_mode | `organic`, `chronological` |

### Sector interests (exact list)

```text
Accessibility, Arts & Culture, Basic Needs, Business, Changemaking, Climate,
Community Economics, Democracy & Governance, Education & Childcare, Finance,
Food & Agriculture, Health, Housing, Indigenous Economies, Justice & Equity,
Leadership, Measurement & Goals, Movements & Visions, Nature, Other,
Policy & Regulation, Social Enterprise, Sustainable Communities, Systemic Innovation
```

---

## 12. Storage buckets

| Bucket | Public | Size | MIME / path notes |
|--------|--------|------|-------------------|
| `avatars` | yes | 5 MB | jpeg/png/webp/gif; `{user_id}/…` |
| `session-resources` | yes | 10 MB | pdf/doc/docx/txt/md; `{event_id}/…`; artifacts under `artifacts/{transcript\|summary}/` — listing restricted for transcripts |
| `session-covers` | yes | 2 MB | jpeg/png/webp; host write |
| `landing-contributions` | yes | 5 MB | doodle/image uploads |
| `email-assets` | yes | default | admin write; public read |

---

## 13. Background jobs and integrations

### Inngest functions (`lib/inngest/functions/…`)

| Function id | Purpose |
|-------------|---------|
| `session-artifacts-process` | Process session artifacts + graph rebuild |
| `session-graph-rebuild` | Rebuild knowledge graph |
| `session-fireflies-send-bot` | Admit Fireflies bot (~90s after start) |
| `session-fireflies-pull-transcript` | Pull/backfill transcript |
| `participant-insights-themes-regenerate` | Admin AI themes |
| `synthesis-seed-analyze` | Seed LLM analysis |
| `synthesis-systems-map-generate` | Systems map generation |

Enqueue falls back to **direct** processing if `INNGEST_EVENT_KEY` missing. Serve: `app/api/inngest/route.ts` (`maxDuration=300`).

### Fireflies

- GraphQL `addToLiveMeeting` — password arg must be named `meeting_password` (not `password`).
- Webhook V2: `meeting.transcribed` (+ optional `bot_joined`) → ingest → artifact pipeline.
- Do **not** ingest Fireflies AI summaries; app builds de-identified commons summary.
- Transcripts stored as `[MM:SS] Name: text` for de-identification.

### Stripe

- Checkout Session for paid tiers; webhook `checkout.session.completed` sets registration.
- Receipts via Stripe Customer emails (not Resend PDFs).

### Resend

- Transactional + campaigns; automations; inbound Reply-To tokens → admin/care inbox.
- Daily cron `GET /api/cron/email-automations` (`0 14 * * *` UTC) with `CRON_SECRET`; session reminders use an **18–30h** window (Hobby single daily cron).

### OpenAI

- Summaries, themes, embeddings, Ask the Festival, participant insights, synthesis seeds/maps.
- Models: `gpt-4o-mini`, `text-embedding-3-small`.

---

## 14. i18n, design system, and coding conventions

### i18n

- Locales: `en`, `fr-CA`
- Messages: `messages/en.json`, `messages/fr-CA.json` (+ legal JSON under `messages/legal/`)
- Participant routes under `app/[locale]/…`
- Staff consoles **skip** intl middleware (`/admin`, `/care`, `/api`, `/auth/` — but not `/care-statement`)

### Design system (`design_style.md`)

**Playful Geometric:** cream paper `#FFFDF5`, violet accent `#8B5CF6`, hard shadows, chunky borders, Memphis-inspired shapes. Admin fonts: Outfit + Plus Jakarta Sans.

### Coding standards (`architecture.md`)

- RSC by default; `'use client'` only for interactive UI
- Tailwind utility-only (except dynamic graph coordinates)
- RLS mandatory
- Meeting-link privacy gating
- Inngest for async pipelines
- Await Next.js 15 async `cookies()` / `headers()` / `params`

---

## 15. Environment variables

Typical production set (see `.env.local.example`):

| Variable | Role |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + SSR |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin / cron / ingest |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs / emails |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Payments |
| `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_SUPPORTER` | Price IDs |
| `STRIPE_WEBHOOK_SECRET` | Webhook verify |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_WEBHOOK_SECRET` / `RESEND_INBOUND_DOMAIN` | Email |
| `CRON_SECRET` | Cron + internal workers |
| `OPENAI_API_KEY` | AI pipeline |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Background jobs |
| `FIREFLIES_API_KEY` / `FIREFLIES_WEBHOOK_SECRET` | Transcripts |
| `CONFERENCE_START_DATE` | Schedule windows |
| Team contact user IDs | Care / legal routing |

---

## 16. Reusable patterns for similar projects

When cloning this architecture for another festival / unconference / multi-track conference:

1. **Separate festival registration from session RSVP** — two different completion states and tables.
2. **Session editor as source of truth** — one shared editor for host create/edit and admin edit (`adminMode` for privileged fields).
3. **Draft vs publish** — soft requirements (meeting link / location) only on publish.
4. **Capacity + waitlist promotion RPCs** — never trust client-side seat counts alone.
5. **Role flags + middleware RPCs** — keep staff consoles outside participant i18n trees if desired.
6. **Mask sensitive join info** — DB view + helper RPC rather than trusting the client to hide links.
7. **Artifacts pipeline** — Fireflies (or Zoom) webhook → store raw transcript privately → AI de-identified summary for commons → embeddings → graph.
8. **Email CRM** — segment JSON + merge tags + automation trigger idempotency keys.
9. **Polymorphic knowledge graph** — typed edges between users/events/orgs/themes with admin-tunable layout config.
10. **Guest join path** — allow public RSVP without forcing full account creation.
11. **Builds-from / lineage** — first-class prior-session links for narrative continuity.
12. **Audit downloads of sensitive data** — acknowledgment + `transcript_download_log`-style table.
13. **Prefer text-check “enums” in Postgres** unless you need a true enum (this project has only one Postgres enum).
14. **Regenerate Supabase types** after migrations — several care/narration/graph tables lag `types/supabase.ts`.

### Minimal schema starter for a similar product

If building a smaller sibling product, start with:

1. `users` (+ auth flags: registration/survey/admin)
2. `events` + `user_to_event` + `events_public` view
3. `organizations` + `user_organizations`
4. Session editor fields from §8 (even if you drop Fireflies/builds-from initially)
5. RSVP + waitlist RPCs
6. Optional: `reflections`, `resources`, email preferences, Stripe checkout

Then layer: participants network, harvest AI, email CRM, staff consoles.

---

## 17. File index (key paths)

| Concern | Path |
|---------|------|
| Create/edit session UI | `components/session/session-editor.tsx` |
| Session validation | `lib/sessions/validation.ts` |
| Shared constants / sectors / formats | `lib/constants.ts` |
| Create session API | `app/api/sessions/route.ts` |
| Host edit API | `app/api/sessions/[id]/route.ts` |
| Admin event API | `app/api/admin/events/[id]/route.ts` |
| Profile / survey form | `components/profile/profile-form.tsx` |
| Registration flow | `components/auth/registration-flow.tsx` |
| Guest join | `components/join/guest-register-form.tsx` |
| Harvest reflection | `components/harvest/reflection-form.tsx` + `lib/harvest/constants.ts` |
| Email types / segments | `lib/email/types.ts`, `components/admin/email/segment-builder.tsx` |
| Map settings page | `app/(admin)/admin/map-settings/page.tsx` |
| Generated DB types | `types/supabase.ts` |
| Migrations | `supabase/migrations/` |
| PRD | `festival_prd_v1.2.md` |
| Architecture standards | `architecture.md` |
| Design tokens | `design_style.md` |
| Agent brief | `CURSOR_CONTEXT.md` |
| This document | `PROJECT_REFERENCE.md` |

---

*End of reference. Prefer this file + live form components + `types/supabase.ts` over stale folder maps in older docs when they disagree.*
