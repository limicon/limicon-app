# Database selection

Which Postgres service limicon-app uses. [`strategy-hosting-options.md`](strategy-hosting-options.md) pairs a database with each hosting option; this doc compares the databases on their own. Supabase, Neon and PlanetScale work with any host. Railway, Render, Fly.io and AWS also offer their own. Nothing is chosen yet.

Status: Checked against vendor docs on 2026-11-07. Railway, Render and Fly.io figures come from the hosting doc, checked 2026-11-04 to 2026-11-06. [Testing](#testing) was checked on 2026-11-10. Prices are USD per month, before tax. Figures marked *(estimate)* weren't on the vendor pages that were read; confirm them before relying on them.

## What the choice depends on

- **How the app runs.** An always-on server keeps a few database connections open and reuses them. An app that starts on demand (Vercel, Lambda, Cloudflare Workers) opens connections in bursts, so it connects through a pooler, a service that shares a few real connections among many short-lived ones. Poolers in transaction mode limit what the app can do; see [Connecting through a pooler](#connecting-through-a-pooler).
- **Ten quiet months a year.** A fixed price is paid every month. A database that pauses when idle costs less in quiet months, but the first request after a pause waits for it to wake.
- **Recovery.** How far back the data can be restored, and whether that's included.
- **Leaving.** All the options are plain Postgres, so moving is a `pg_dump` and restore. Built-in sign-in and file storage are what tie an app to a vendor.

## Side by side

| | Supabase | Neon | PlanetScale | Host's own (Railway, Render, Fly.io) | AWS (RDS, Aurora) |
|---|---|---|---|---|---|
| **When idle** | Free pauses after a week without activity. Pro never pauses. | Pauses after 5 minutes idle and wakes on the next query, in a few hundred milliseconds. Can be turned off on Launch. | Always on. | Always on. | RDS is always on. Aurora Serverless can pause after 5 minutes to a day idle; waking takes about 15 seconds, or 30 or more after a day paused. |
| **Backups and restore** | Free has none. Pro keeps daily backups for 7 days. Restore to any point is $100 a month extra per 7 days. | Restore to any point in the last 6 hours on Free, up to 7 days on Launch. The restore history is billed at $0.20/GB-month, cents at this size. | Backups every 12 hours, kept 2 days. Restore to any point back to the oldest backup. | Railway: daily backups kept 6 days, weekly 27, monthly 89, with no restore to a point; wiping a volume deletes its backups. Render: any point in the last 3 days (Hobby) or 7 (Pro). Fly.io: backups and automatic failover included. | Restore to any point, kept for a configurable period *(estimate: up to 35 days)*. |
| **Speed** | Fast in the same region as the app. Free has a shared CPU and 500 MB of RAM; Pro has a 1 GB Micro instance. | Fast in the same region as the app. The smallest size is shared compute with 1 GB of RAM. | Fast in the same region as the app, with regions on AWS, Google Cloud and Azure. PS-5 has 1/16 of a vCPU and 512 MB. Local NVMe disks start at $50. | The shortest path: the database shares a private network with the server. | Fast inside the same AWS region as the app. The smallest RDS size is about 1 GB of RAM *(estimate)*. |
| **From an on-demand host** | Shared pooler in transaction mode, on every plan. | Built-in pooler, up to 10,000 connections. | PgBouncer pooler, billed separately. Cloudflare's Hyperdrive pools for Workers. | Not needed: the server and database share a private network. | RDS Proxy. It keeps connections open, so Aurora with it never pauses. |
| **From an always-on server** | Direct connections are IPv6 only. IPv4 is a $4 add-on on Pro, or use the shared pooler in session mode, which has no transaction-mode limits. | Direct or pooled. | Direct. | Direct. | Direct. |
| **Sign-in** | Supabase Auth, built in. See [Sign-in](#sign-in). | Neon Auth, a managed Better Auth. | None. | None. | Cognito, a separate AWS service. |
| **Extras** | File storage. | A database branch per preview deploy. | Database branches. | None. | None. |
| **Cheapest production setup** | $0 on Free, if you run your own backups. Pro is $25. | Launch: usage only, no monthly fee. | $5 for one node (512 MB). $15 for three nodes with failover. | Railway: part of its usage bill. Render: $6. Fly.io: $38. | RDS about $14 with minimum storage *(estimate)*. |
| **Expected cost per year** *(estimate)* | $0 on Free. About $50 with Pro in the busy months only, $300 on Pro all year. | About $60–110: about $13–19 in a busy month, $3–8 in a quiet one. | $60 for one node, $180 for three. | Railway: included in its about $100. Render: $72. Fly.io: $456. | About $170 for RDS. Aurora with pausing can be less. |

At this size, speed depends mostly on distance. A database in a different region from the app adds tens of milliseconds to every query. A 200 MB database mostly fits in memory, even at the smallest sizes.

Expected costs use the hosting doc's busy and quiet months: a 200 MB database, 100,000 requests in a busy month and 10,000 in a quiet one.

- **Neon** charges for the hours its compute is awake, at $0.106 an hour for the smallest size (0.25 CU, 1 GB RAM). A busy month keeps it awake most of the day. Free's 100 hours would cover a quiet month, but a busy month would use them up and the database would stop until the next month.
- **Supabase Pro for busy months only** needs an organisation of its own, because Supabase doesn't mix plans within an organisation.

## Connecting through a pooler

A pooler in transaction mode hands a connection to the app for one transaction at a time. So:

- Prepared statements must be turned off (`prepare: false` in Postgres.js and Drizzle).
- Settings made with `SET`, `LISTEN`/`NOTIFY` and temporary tables don't carry over between transactions.
- Supabase's shared pooler doesn't support query pipelining.

An always-on server with a direct or session-mode connection has none of these limits.

## Sign-in

Supabase Auth keeps users in the app's own Postgres, in a schema of its own, so app tables can link to them directly. Its sign-in token works with Postgres row-level security, so the database itself can check who may read each row. It covers passwords, magic links, one-time codes, about 19 social providers, and SAML single sign-on on Pro. Its built-in email sender is for testing only (2 emails an hour, to team addresses), so production sign-in emails need an email service such as Resend.

The other databases get sign-in from one of these:

| | Where users live | Free allowance | Ties the app to |
|---|---|---|---|
| **Supabase Auth** | The Supabase database. | 50,000 monthly active users; 100,000 on Pro. | Supabase. |
| **Neon Auth** | The Neon database, and copied into each branch. Only in AWS regions. | 60,000 monthly active users per project; 1 million on Launch. | Neon. |
| **Better Auth in the app** | Any Postgres. It's an open-source library, so the app runs it and adds its tables through migrations. | No fee. | Nothing beyond the library. |
| **Clerk** | Clerk's servers, synced to the app by webhook. | 50,000 monthly retained users. Pro is $25. | Clerk. |
| **Cognito** | AWS. | 10,000 monthly active users, with no expiry. | AWS. |

Every free allowance covers at least 10,000 users a month, so cost is unlikely to decide it. The choice is about where users live and what it ties the app to. Neon Auth is built on Better Auth, so Neon Auth and Better Auth in the app work much the same way.

## Testing

Tests need a database on a developer's machine, in CI (the checks GitHub runs on each pull request), and sometimes for a preview deploy of a pull request.

### On a developer's machine and in CI

| | What it is | Works with | Limits |
|---|---|---|---|
| **Postgres in Docker** | The official Postgres image, at the same major version as production. GitHub Actions runs it as a service container, free on a public repo. | Every option here, since all are plain Postgres. Railway's own image is built on the official one. | No vendor sign-in, file storage or pooler. |
| **Supabase CLI** | `supabase start` runs Supabase's stack in Docker: Postgres, Auth, Storage and more. | Supabase, especially with Supabase Auth and row-level security. | Many containers, so heavier than plain Postgres. |
| **PGlite** | Postgres compiled to WebAssembly, running inside the Node test process without Docker. Each test file can have its own in-memory database. | Fast unit tests, with any option. `pglite-socket` lets ordinary Postgres drivers connect to it. | One connection, shared through a multiplexer that its docs say doesn't behave exactly like a normal server. No SSL. Not for testing concurrency or the pooler. |

Neon Local looks like a local database, but it's a Docker proxy to a Neon branch in the cloud. It can create a branch when it starts and delete it when it stops. PlanetScale has no local version; its docs assume development happens on its cloud branches.

Local Postgres accepts what a transaction-mode pooler rejects, such as prepared statements and `SET`. An app that will connect through a pooler can run PgBouncer in transaction mode locally to catch that before deploying.

### In the cloud

A branch is a separate database made for a pull request or test run and deleted afterwards.

| | Starts with | Created and deleted | Cost |
|---|---|---|---|
| **Neon** | The parent branch's schema and data, copied instantly. Storage costs nothing until the branch is written to. | By API, CLI or Neon Local. Pauses after 5 minutes idle. | Free: 10 branches per project, sharing its 100 CU-hours a month; an 11th is blocked. Launch: $1.50 a month per branch beyond 10, prorated hourly, plus $0.106 an hour while awake. |
| **Supabase** | Schema from the repo's migrations, plus a seed file. No production data by default. | One per pull request through the GitHub integration, deleted when it's merged or closed. Long-lived branches, for staging, are also available. | Paid plans only. $0.01344 an hour per branch at the smallest size, not covered by compute credits. |
| **PlanetScale** | Nothing: no schema or data, unless restored from a backup. | From the dashboard. Up to 100 per database by default. | Billed only while the branch exists. The rate isn't in the docs *(estimate: $5 a month prorated, with about two months of branch hours included per database)*. |
| **Railway** | A copy of the project's services, database included. The docs don't say whether data is copied *(estimate: empty by default, with an option to copy the volume)*. | One per pull request when switched on, optionally for bot PRs such as Dependabot's. Deleted when it's merged or closed. | Railway's usual usage billing, for the server and database while the environment exists. |

## Questions that decide it

1. **Always-on server or on-demand?** On-demand means a pooler and its limits. An always-on server can use the host's own database, which needs no pooler.
2. **Is a wait after quiet periods acceptable?** Neon's few hundred milliseconds rarely shows. Aurora's 15–30 seconds does.
3. **How far back must data be recoverable, and at what price?** Free plans have little or no backup. Supabase charges $100 a month for restore to any point. PlanetScale, Render and RDS include it, and Neon's costs cents at this size.
4. **Should sign-in come with the database?** Supabase and Neon include it, which saves setup and ties the app to them. Better Auth keeps users in any Postgres, run by the app itself.
5. **Do preview deploys need a database of their own?** Neon's branches start with a copy of the data and fit the free plan. Supabase's and PlanetScale's start from migrations or empty, and cost a little per hour.

## Sources

- Supabase: [Pricing](https://supabase.com/pricing), [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres), [IPv4 add-on pricing](https://supabase.com/docs/guides/platform/manage-your-usage/ipv4), [Auth](https://supabase.com/docs/guides/auth), [Auth email (SMTP)](https://supabase.com/docs/guides/auth/auth-smtp), [Local development](https://supabase.com/docs/guides/local-development), [Branching](https://supabase.com/docs/guides/deployment/branching) and [its billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
- Neon: [Pricing](https://neon.com/pricing), [Scale to zero](https://neon.com/docs/introduction/scale-to-zero), [Computes](https://neon.com/docs/manage/computes), [Neon Auth](https://neon.com/docs/auth/overview) and [its plans](https://neon.com/docs/auth/about), [Neon Local](https://neon.com/docs/local/neon-local)
- PGlite: [Overview](https://pglite.dev/docs/), [pglite-socket](https://pglite.dev/docs/pglite-socket)
- Sign-in: [Better Auth installation](https://www.better-auth.com/docs/installation), [Clerk pricing](https://clerk.com/pricing), [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- PlanetScale: [Pricing](https://planetscale.com/pricing), [Postgres backups](https://planetscale.com/docs/postgres/backups), [Postgres branching](https://planetscale.com/docs/postgres/branching), [Postgres pricing](https://planetscale.com/docs/postgres/pricing)
- Railway: [Backups](https://docs.railway.com/reference/backups), [Environments](https://docs.railway.com/guides/environments), [Postgres](https://docs.railway.com/guides/postgresql)
- AWS: [Aurora Serverless auto-pause](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- Render and Fly.io: see [`strategy-hosting-options.md`](strategy-hosting-options.md#sources).
