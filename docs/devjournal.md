# devjournal - the limicon-app team development journal

This journal keeps humans, and secondarily agents, up to date on significant code changes and architectural decisions.

Each entry: **Date** | **Author** | **Title**, followed by at most 360 characters of description, usually one sentence. Author is the person, plus `(with <agent>)` when an agent helped. Most recent first. When a rebase conflicts here, keep both entries, in date order, with their original dates.

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
