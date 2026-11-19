# devjournal - the limicon-app team development journal

This journal keeps humans, and secondarily agents, up to date on significant code changes and architectural decisions.

Each entry: **Date** | **Author** | **Title**, followed by at most 360 characters of description, usually one sentence. Author is the person, plus `(with <agent>)` when an agent helped. Most recent first. When a rebase conflicts here, keep both entries, in date order, with their original dates.

---

## 2026-11-19 | Lauren (with Opus 5.5) | Admin access is a role with privileges

Each admin holds one role from `admin_roles`; its privileges (`app/lib/admin-roles.ts`) decide which console pages they can open, checked by `requirePrivilege`. Full access is built in. Ticket settings moved into Settings, and the Tickets tab is gone.

---

## 2026-11-19 | Lauren (with Opus 5.5) | Admins build the website's pages from sections

Public pages, the home page included, are `site_pages` rows built from sections (text, images, columns, buttons, the event). Admins edit them on the page itself (`?edit=1`) or in the console's Website tab, add pages, and order the menu. `docs/feature-admin-console.md` covers it.

---

## 2026-11-19 | Lauren (with Opus 5.5) | Admins edit the event, registration form and policies

The console adds Orders, Guests and Policies, edits the event's name, dates, image and About, and edits the registration form's fields. Rich text is TipTap JSON, cleaned on save; uploads go to the R2 bucket `limicon-media`, which must exist before the next deploy (`config-cloudflare.md`).

---

## 2026-11-18 | Lauren (with Opus 5.5) | The Privacy Policy and Code of Conduct are public pages

`/privacy` and `/conduct` carry the 5 February 2026 texts, linked from a site map at the foot of every public page and from the registration checkboxes. They stand in until the Organizing Team revises both for 2027; the text lives in `app/content/policies.tsx`.

---

## 2026-11-18 | Lauren (with Opus 5.5) | Admins manage users, sessions and the FAQ

The console adds Users (search, filters, roles, deactivation, private notes, CSV), editing any session in place, an FAQ that admins write for the public `/faq` page, and Settings (renamed from Edition) with any number of member links. Deactivated accounts lose the Members area and console.

---

## 2026-11-18 | Lauren (with Opus 5.5) | Members RSVP, with My Schedule

One click RSVPs or cancels, with capacity and a waitlist that promotes the earliest in line. The schedule toggles between the Limicon Schedule and My Schedule. Reminders will come from members' own calendars, so Limicon sends none (CAL-6). Deleting a session with RSVPs unpublishes it instead.

---

## 2026-11-18 | Lauren (with Opus 5.5) | The admin console opens at /admin

Admins get Overview (analytics), Edition (dates, switches, links, ticket tiers), Sessions, Tickets (comp tickets, CSV) and Team (add or remove admins by email). Any admin permission opens it; changing the team needs `full`. `docs/feature-admin-console.md` covers it.

---

## 2026-11-18 | Lauren (with Opus 5.5) | Members see the schedule in their own time zone

Members > Schedule lists published sessions by day, color-coded by theme, searchable by title, host and description, with session pages. Times show in the zone a member picks (saved on their profile) or their browser's. Open pages check every 10 seconds and refresh when the calendar changes (CAL-4).

---

## 2026-11-18 | Lauren (with Opus 5.5) | Registration questions come before the ticket

`/tickets` asks the REG-2 questions, including eight optional reflection questions, and saves them before payment. Answers belong to the profile and edition, one row per question key from `app/lib/registration-form.ts`; agreements keep the time first agreed. Tier choice and Stripe come next.

---

## 2026-11-17 | Lauren (with Opus 5.5) | Members can host sessions

Members accept the host guidelines once per edition, then draft, publish, edit and delete sessions. The form follows limicon.org's: start time plus length, several session types, participant experience flags, and a recording question. The PRD's session form table records the changes; `app/lib/zoned-time.ts` converts times.

---

## 2026-11-17 | Lauren (with Opus 5.5) | Admins can be invited by email

An `admin_invitations` row grants admin permissions to an address before it has an account; the first sign-in turns it into `admin_permissions` rows. The Organizing Team holds `full` for now. `docs/config-supabase.md` covers inviting an admin. Addresses live only in the database, never in the repo.

---

## 2026-11-17 | Lauren (with Opus 5.5) | The test site is shared by link

Cloudflare Access is off, so anyone with limicon-app.limicon.workers.dev can open it, and Google sign-in is published for any Google account. Pages send `noindex` while `SEARCH_INDEXING` is `off`, keeping the site out of search results until limicon.org points here.

---

## 2026-11-17 | Lauren (with Opus 5.5) | The Members area is its own site, open to ticket holders

Routes split into `routes/public/` (a typical site whose menu has one Members link) and `routes/members/` (its own layout and menu). A ticket for the current edition, or any admin permission, opens it; everyone else gets a pop-up explaining a ticket is needed. Only the root middleware reads the Worker's environment.

---

## 2026-11-16 | James (with Opus 5.5) | Docs-only changes skip the checks

A change that touches only `docs/` and the root `AGENTS.md`, `CLAUDE.md` and `README.md` skips CI's typecheck, tests, build and e2e jobs, which still show green, and skips the checks before a commit. `scripts/is-docs-only.mjs` makes the call; anything it can't decide runs everything.

---

## 2026-11-14 | James (with Opus 5.5) | Playwright runs the e2e tests

`npm run test:e2e` builds the app and runs the Playwright specs in `e2e/` in Chromium against the built Worker under `vite preview`, with the local Supabase, which it starts and stops if it isn't already running. Sign-in tests read the email link from Mailpit. CI runs the suite in its own job. Run `npx playwright install chromium` once before the first local run.

---

## 2026-11-13 | James (with Opus 5.5) | Node 26, and installs refuse unapproved install scripts

`.nvmrc` pins Node 26, and CI follows it. `.npmrc` skips package versions under 3 days old, and fails an install when a dependency has install scripts that `package.json` `allowScripts` doesn't cover; record a decision with `npm install-scripts approve|deny <pkg>`.

---

## 2026-11-12 | Lauren (with Opus 5.5) | The app is live behind Cloudflare Access

limicon-app runs at limicon-app.limicon.workers.dev, open only to Limicon Cloudflare account members. Hyperdrive reaches the hosted Supabase through its session pooler; the direct connection failed. `docs/config-cloudflare.md` covers deploying, and `docs/config-supabase.md` changing the hosted database.

---

## 2026-11-12 | Lauren (with Opus 5.5) | The app runs locally, with email sign-in

The React Router 8 app, local Supabase, first tables and email sign-in are in. `docs/process-local-development.md` covers running it. CI typechecks, tests (including that every table blocks Data API reads) and builds on each push. Google sign-in waits for an OAuth client.

---

## 2026-11-12 | Lauren (with Opus 5.5) | React Router 8, with Supabase through Hyperdrive

The app is React Router 8 on Cloudflare Workers, placed in `aws:us-east-1` next to Supabase. Server code reaches Postgres through Hyperdrive and checks permissions itself; RLS stays on with no policies. PRD open questions 12 and 13 cover live calendar updates and the Hyperdrive connection.

---

## 2026-11-11 | James (with Opus 5.5) | Agents follow a commit process

Agents commit by `docs/process-commit.md`: they commit on their own, then show you the commit. Ask for changes, or type `y` to push. Agents also write devjournal entries themselves, only for changes that affect how teammates work.

---

## 2026-11-07 | James (with Opus 5.5) | Devjournal created

This file now records significant code changes and architectural decisions for the team.

---

## 2026-11-06 | James | limicon-app is public

The repo went public with the team's agreement. The org security configuration `limicon-org-config-1` is applied to it: Dependabot alerts and security updates, CodeQL, and private vulnerability reporting.
