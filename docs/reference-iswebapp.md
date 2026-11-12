# IS Web App — Project Reference

> **Purpose:** an overview of the IS Web App (`is-app`), the Intentional Society members' app. Use it when borrowing its stack, patterns or tooling. It's a map with pointers, not a field-by-field inventory; open the is-app files it names for detail.
>
> **Repo:** https://github.com/Intentional-Society/is-app
> **Live product:** https://app.intentionalsociety.org
> **Snapshot:** `main` at `6a013bf`, 2026-11-11
> **Sources of truth in is-app:** `AGENTS.md`, `README.md`, `docs/architecture-appstack.md`, `src/server/schema.ts`, `src/server/api.ts`, `package.json`

---

## Contents

1. [Product overview](#1-product-overview)
2. [Tech stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Roles and access](#4-roles-and-access)
5. [Features](#5-features)
6. [Route map](#6-route-map)
7. [Database](#7-database)
8. [Development, testing and CI](#8-development-testing-and-ci)
9. [Where to look in is-app](#9-where-to-look-in-is-app)

---

## 1. Product overview

An authenticated web app for Intentional Society, a small, globally distributed membership network. Signup is by invite code from an existing member. Members fill in a profile, join **programs** (call series, pod cohorts, newsletters), and build a **relationship web**: how deep their relationship with each other member runs.

| Term | Meaning |
|------|---------|
| IS Web App | The product |
| Intentional Society | The organization |
| Member | Anyone with an account |
| Program | A named offering members join |
| Participant | A member currently in a given program |
| Program feature | Functionality that only a program's participants get, attached per program (the message box is the first) |
| Relation | One member's 1–4 rating of how deep their relationship with another runs; stored per direction |

## 2. Tech stack

From `package.json` (Node `24.x`):

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| API | Hono, mounted in Next.js through one catch-all route; typed client via Hono RPC |
| Client data | TanStack Query |
| Styling | Tailwind CSS v4, shadcn/Base UI components, lucide icons |
| Database | Supabase Postgres through Drizzle ORM (`postgres` driver); `drizzle-kit` migrations |
| Auth | Supabase Auth (`@supabase/ssr`): email one-time link/code and password |
| File storage | Supabase Storage (avatars, served by signed URL) |
| Email | Resend for auth email (as Supabase Auth's SMTP relay); Buttondown for newsletters |
| Hosting | Vercel, with a daily Vercel cron |
| Observability | Sentry (errors), Axiom (logs via Vercel log drain) |
| Tooling | TypeScript, Biome, Vitest, Playwright, Testing Library, lefthook |

`docs/architecture-devstack.md` also describes MSW and Storybook, which aren't installed. Where the docs and `package.json` disagree, `package.json` is current.

## 3. Architecture

```text
Browser ── Next.js pages (Server + Client Components)
              │ apiClient (Hono RPC, typed)
              ▼
         /api/* catch-all ── Hono app (src/server/api.ts)
              │   requireAuth → (requireAdmin for /api/admin/*)
              ▼
         Drizzle ── Supabase Postgres
```

- **One data path.** All reads and writes go through the Hono API. Supabase's Data API (PostgREST/GraphQL) is turned off, and every `public` table has RLS enabled with no policies, so the browser's publishable key can't reach data. RLS is a deny gate; authorization logic lives in Hono middleware. See `docs/architecture-appstack.md` and `docs/doc-supabase.md`.
- **Auth.** Supabase issues the session; Hono's `requireAuth` verifies it before any handler runs. Admin is a `profiles.is_admin` flag checked by `requireAdmin` on the `/api/admin` sub-router.
- **Pooler.** Production connects through Supabase's transaction pooler, which constrains multi-statement transactions. See `docs/strategy-db-transactions.md`.
- **Timestamps.** Everything is `timestamptz` and UTC end to end; the browser formats in the viewer's own locale and zone.
- **Migrations.** Forward-only, expand-contract. Production deploys run `drizzle-kit migrate` before `next build` (`vercel.json`). Previews share the prod database but skip migrations, so schema expansion is dispatched before a schema PR merges (`prod:db:expand`). See `docs/strategy-committing.md`.
- **Deploys during use.** Vercel Skew Protection plus an in-app "new version" banner. See `docs/strategy-deployment.md`.
- **Security headers** are set for every route in `next.config.ts`. See `docs/strategy-security.md`.

## 4. Roles and access

| Role | How it's set | Can do |
|------|--------------|--------|
| Signed-out visitor | — | Sign in, sign up with an invite code, reset password |
| Member | Redeemed an invite | Profile, directory, programs, relationship web, invites of their own |
| Participant | Current row in `profile_programs` | A program's attached features, such as posting in its message box |
| Admin | `profiles.is_admin` | `/admin`: members, invites, programs, sign-ins, hidden profiles, Buttondown sync |

Two flags hide a profile from other members: `hidden` (admin-set, for test accounts) and `deactivated_at` (set by the member, reversible by an admin).

## 5. Features

| Feature | Summary | Design doc |
|---------|---------|------------|
| Invites and signup | Members create expiring invite codes with a note; signup redeems one. An invite can carry relation hints for the new member | — |
| Welcome flow | First-visit steps: agreements, profile, programs, then the relationship web | `docs/design-welcome.md` |
| Profiles and directory | Name, slug, bio, keywords, location, avatar, current intention; members directory and an intentions page | `docs/design-profile-pictures.md` |
| Programs | Admin-created offerings with open/closed self-serve signup; membership is soft-deleted so history survives leave/rejoin | `docs/design-programs.md` |
| Program features | A code registry of features attachable per program; detaching keeps the feature's data | `docs/design-programs.md` |
| Message box | Participants leave short messages on a program page; admin visibility setting, prompt, archive and delete with undo | `docs/feature-message-box.md` |
| Relationship web | Each member rates others 1–4, per direction; personal web view (`/myweb`), mini-maps on profiles, suggestions and admin-seeded hints. No global view of the network | `docs/design-relations.md` |
| Newsletter sync | Program membership mirrors to Buttondown subscriber tags; daily cron plus inline resync | `docs/design-buttondown.md` |
| Auth emails | Templates kept in the repo and synced to Supabase | `docs/design-emails.md` |
| Account controls | Set or remove a password, deactivate and reactivate | — |

## 6. Route map

Pages live in `src/app/`:

- **Auth:** `/signin`, `/signup`, `/signout`, `/forgot-password`, `/auth/callback`, `/auth/reset-password`
- **Onboarding:** `/welcome`, `/welcome/agreements`, `/welcome/profile`, `/welcome/programs`
- **Members:** `/me`, `/members`, `/members/[id]`, `/intentions`, `/invites`, `/myweb`, `/programs`, `/programs/[slug]`, `/about`
- **Admin:** `/admin`, `/admin/members`, `/admin/invites`, `/admin/programs`, `/admin/programs/[id]`, `/admin/signins`
- **Dev:** `/colors` (theme tokens)

The API is one Hono app in `src/server/api.ts`, with domain logic in sibling files (`profiles.ts`, `programs.ts`, `relations.ts`, `invites.ts`, `message-box.ts` and others). Route groups: `/api/me`, `/api/members`, `/api/programs`, `/api/invites`, `/api/relations`, `/api/admin/*` and `/api/cron/buttondown-sync`.

## 7. Database

Defined in `src/server/schema.ts`; migrations in `drizzle/`. Drizzle owns migrations; `supabase/migrations/` is unused.

| Table | Holds |
|-------|-------|
| `profiles` | One row per member, keyed to `auth.users.id`: profile fields, `is_admin`, `hidden`, `deactivated_at`, onboarding timestamps, Buttondown id |
| `programs` | Slug, name, markdown blurb and description, `signups_open`, `archived_at`, `buttondown_tag` |
| `profile_programs` | Membership; `left_at` null means current |
| `program_features` | Which features are attached to which programs |
| `message_box_settings`, `message_box_messages` | The message box feature's settings and posts |
| `invites`, `invite_hints` | Invite codes, their state, and relations to suggest to the invitee |
| `relations` | Directed member-to-member ratings and hints |
| `sync_locks` | Lease lock so only one Buttondown sync runs at a time |

Conventions: UUID keys, `timestamptz` everywhere, timestamps instead of booleans for states like archived or left, check constraints for value ranges and paired columns, RLS enabled on every table.

## 8. Development, testing and CI

- **Local stack.** `npm run setup` once, then `npm run dev` starts Supabase in Docker, migrates, seeds test users and runs Next.js. Parallel git worktrees can each run an isolated stack ("lanes"; `docs/strategy-worktree-lanes.md`).
- **Tests.** `npm test` runs Biome, typecheck, Vitest (functional, against the local database) and Playwright (Chromium). Signed-in e2e specs start from saved sessions of seeded accounts.
- **CI** (`.github/workflows/`): `ci.yml` (lint and functional tests, required), `e2e.yml` (Playwright against each Vercel preview), `claude-code-review.yml` and `claude.yml` (AI review), `codeql.yml`, `npm-audit-fix.yml`, `forward-migrate-prod-schema-expansion.yml`.
- **Workflow.** Trunk-based: PRs into `main`, which auto-deploys to production; a ruleset requires up-to-date branches (`scripts/update-main-branch-protection.mjs` keeps it as code). Dependabot groups updates (`.github/dependabot.yml`).
- **AI procedures.** Claude Code skills in `.claude/skills/` for `/commit`, `/pr` and `/ship`; see `docs/spec-portable-ai-procedures.md`.

## 9. Where to look in is-app

| Concern | Path |
|---------|------|
| Agent conventions | `AGENTS.md` |
| Stack rationale | `docs/architecture-appstack.md`, `docs/architecture-devstack.md` |
| Schema | `src/server/schema.ts` |
| API routes | `src/server/api.ts` |
| Auth middleware | `src/server/auth-middleware.ts` |
| Supabase helpers | `src/lib/supabase/` |
| Typed API client | `src/lib/api.ts` |
| Dev scripts | `scripts/` |
| Supabase dashboard settings | `docs/doc-supabase.md` |
| GitHub settings and CI | `docs/doc-github.md` |
| UI tokens and buttons | `docs/strategy-ui.md` |
| Decision log | `docs/devjournal.md` |
| This document | `docs/reference-iswebapp.md` (limicon-app) |
