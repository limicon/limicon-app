# AGENTS.md

Guidance for AI coding agents working in this repository. Claude Code reads it through `CLAUDE.md`.

## Project

limicon-app is limicon's application. The stack isn't chosen yet.

## Documentation

- Project documentation lives in `docs/`.
- Doc files are named `<type>-<name>.md`. The types are:
  - config: usage and configuration of tools or frameworks
  - feature: requirements, design and implementation of the app's features
  - strategy: more abstract or cross-cutting specifications
- When you add, rename or remove a doc, update the table of contents below. Keep the docs and this file in sync with changes.

### Docs table of contents

Each entry names the work that calls for reading the doc.

- [`config-github.md`](docs/config-github.md): GitHub settings, branch protection, CI, Dependabot.
- [`strategy-hosting-options.md`](docs/strategy-hosting-options.md): choosing or setting up hosting, database, logging, alerting, email.