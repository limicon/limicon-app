# AGENTS.md

Guidance for AI coding agents working in this repository. Claude Code reads it through `CLAUDE.md`.

## Project

limicon-app is limicon's application: React Router 8 in TypeScript, on Cloudflare Workers placed in `aws:us-east-1`, with Supabase for Postgres, sign-in and storage. Server code reaches Postgres through Hyperdrive and checks permissions itself; row-level security stays enabled with no policies. The Technology section of `Limicon Platform PRD.md` records the stack.

- React Router guidance matched to the installed version is in `.agents/skills/react-router/` and `node_modules/react-router/docs/`. Prefer them to remembered examples from older versions.
- Data access runs only in server code (`*.server.ts`, loaders, actions), through the request's `db()` from `servicesContext`. Every query checks the signed-in member's permissions itself.

## Documentation

- Project documentation lives in `docs/`.
- Doc files are mostly named `<type>-<name>.md`. The types are:
  - config: usage and configuration of external platforms, tools, or frameworks
  - feature: requirements, design and implementation of the app's features
  - process: guides for how to do development tasks
  - reference: descriptions of other external codebases or sources that limicon-app can take inspiration from
  - strategy: more abstract or cross-cutting specifications
- When you add, rename or remove a doc, update the table of contents below. Keep the docs and this file in sync with changes.

### Docs table of contents

Each entry names the work that calls for reading the doc.

- [`devjournal.md`](docs/devjournal.md): catching up on significant code changes and architectural decisions, or adding an entry.
- [`config-cloudflare.md`](docs/config-cloudflare.md): deploying, who can open the hosted app, or the Worker and Hyperdrive settings.
- [`config-github.md`](docs/config-github.md): GitHub settings, branch protection, CI, Dependabot.
- [`config-googlecloud.md`](docs/config-googlecloud.md): the Google sign-in client, its secret, or Google's test users.
- [`config-supabase.md`](docs/config-supabase.md): changing the hosted database, the Data API, sign-in email, or the database password.
- [`process-commit.md`](docs/process-commit.md): making a commit.
- [`process-local-development.md`](docs/process-local-development.md): running the app and the local Supabase, migrations, tests, or turning on Google sign-in locally.
- [`reference-festival.md`](docs/reference-festival.md): designing or implementing a feature adapted from the Festival for Re-imagining the Economy platform, such as the session editor; it covers that platform's schema, forms, roles and integrations.
- [`reference-iswebapp.md`](docs/reference-iswebapp.md): borrowing stack choices, patterns or tooling from the IS Web App (`is-app`), such as Supabase auth and data access, profiles, deploys or CI.
- [`strategy-database-selection.md`](docs/strategy-database-selection.md): choosing the Postgres service and sign-in, deciding where permissions live, connecting the app to the database, or setting up test databases.
- [`strategy-frontend-selection.md`](docs/strategy-frontend-selection.md): choosing between React Router and Next.js, or setting up rendering, data loading and sign-in in either.
- [`strategy-hosting-options.md`](docs/strategy-hosting-options.md): choosing or setting up hosting, logging, alerting, email.
- [`strategy-testing.md`](docs/strategy-testing.md): deciding what kind of test to write, or how much of each.

## Writing

- Docs and code comments describe things as they are now and why they are shaped that way. Leave out past states, removed code, rejected alternatives and the conversation that produced them; git history keeps them. Tighten rationale comments rather than delete them.
- Commit and PR messages state the change and why it matters, without the path of discovery.
- Add a `docs/devjournal.md` entry for decisions teammates should know about.
- **AI attribution:**
  - Commits: a `Co-Authored-By:` trailer with the bare model name and version, no patch level or variant suffix such as "(1M context)".
  - No session links or session trailers anywhere, even when the agent's tooling supplies them.
  - PR bodies need no attribution footer added; the commit trailers cover them.
  - Issue bodies end with `🤖 Filed by <agent>`, and issue and PR comments with `🤖 Written by <agent>`, where `<agent>` is a link to the tool. For example: `🤖 Written by [Claude Code](https://claude.com/claude-code)`.

## Workflow

- The commit that adds the first manifest (such as `package.json`) or workflow also adds `.github/dependabot.yml`, from the draft in `docs/config-github.md`.
- Hold a dependency back with its group's `exclude-patterns` in `.github/dependabot.yml`, not a blanket `ignore`; remove the exclusion when its own PR goes green.

## Testing

- A flake is a bug: find and fix the root cause. A re-run is evidence for a diagnosis, never the fix.

## Production safety

- Never read `.env.prod` or other files holding live secrets, even through a redacting pipe. Ask whether a key is set, or run the script that loads the file.
- Smoke-test a script only in a safe mode: `--dry-run`, a cleared credential variable (`API_TOKEN= node …`), or a deliberately bad target. A loaded credential turns a destructive default into a real prod write.
- Run prod data operations one command at a time: state what it writes, wait for an explicit go-ahead, inspect the result before the next step. After a safety block, only an explicit "run it" authorizes a retry.
