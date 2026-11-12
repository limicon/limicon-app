# devjournal - the limicon-app team development journal

This journal keeps humans, and secondarily agents, up to date on significant code changes and architectural decisions.

Each entry: **Date** | **Author** | **Title**, followed by at most 360 characters of description, usually one sentence. Author is the person, plus `(with <agent>)` when an agent helped. Most recent first. When a rebase conflicts here, keep both entries, in date order, with their original dates.

---

## 2026-11-11 | James (with Opus 5.5) | Agents follow a commit process

Agents commit by `docs/process-commit.md`: they commit on their own, then show you the commit. Ask for changes, or type `y` to push. Agents also write devjournal entries themselves, only for changes that affect how teammates work.

---

## 2026-11-07 | James (with Opus 5.5) | Devjournal created

This file now records significant code changes and architectural decisions for the team.

---

## 2026-11-06 | James | limicon-app is public

The repo went public with the team's agreement. The org security configuration `limicon-org-config-1` is applied to it: Dependabot alerts and security updates, CodeQL, and private vulnerability reporting.
