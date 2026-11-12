# Database selection

Which Postgres service limicon-app uses: Supabase or PlanetScale. Both work with both candidate hosts in [`strategy-hosting-options.md`](strategy-hosting-options.md). The team provisionally chose Supabase on 2026-11-11.

Status: Checked against vendor docs on 2026-11-07. [Testing](#testing) was checked on 2026-11-10, and [connecting from each host](#connecting-from-each-host) and [where permissions live](#where-permissions-live) on 2026-11-11. Prices are USD per month, before tax. Figures marked *(estimate)* weren't on the vendor pages that were read; confirm them before relying on them.

## What the choice depends on

- **On-demand hosting.** Both hosts start the app on demand, so it opens database connections in bursts. It connects through a pooler, a service that shares a few real connections among many short-lived ones: Cloudflare's Hyperdrive, or the database's own. Poolers in transaction mode limit what the app can do; see [Connecting through a pooler](#connecting-through-a-pooler).
- **Ten quiet months a year.** A fixed price is paid every month, so the monthly floor matters more than usage rates.
- **Recovery.** How far back the data can be restored, and whether that's included.
- **Where permissions live.** In the database's row-level security, or in the app. See [Where permissions live](#where-permissions-live).
- **Leaving.** Both are plain Postgres, so moving is a `pg_dump` and restore. Built-in sign-in and file storage are what tie an app to a vendor.

## Side by side

| | Supabase | PlanetScale |
|---|---|---|
| **When idle** | Free pauses after a week without activity. Pro never pauses. | Always on. |
| **Backups and restore** | Free has none. Pro keeps daily backups for 7 days. Restore to any point is $100 a month extra per 7 days. | Backups every 12 hours, kept 2 days. Restore to any point back to the oldest backup. |
| **Speed** | Fast in the same region as the app. Free has a shared CPU and 500 MB of RAM; Pro has a 1 GB Micro instance. | Fast in the same region as the app, with regions on AWS, Google Cloud and Azure. PS-5 has 1/16 of a vCPU and 512 MB. Local NVMe disks start at $50. |
| **From Cloudflare Workers** | Through Hyperdrive, which Cloudflare says should use the direct connection. That connection is IPv6-only unless the $4/month IPv4 add-on is on, which needs Pro. Or through supabase-js over HTTPS, with no pooler. | Through Hyperdrive. PlanetScale databases can be created from Cloudflare's dashboard. |
| **From Vercel** | Shared pooler in transaction mode, on every plan. A Vercel Marketplace integration. | PgBouncer pooler, billed separately. |
| **Sign-in** | Supabase Auth, built in. See [Sign-in](#sign-in). | None. |
| **Extras** | File storage. Realtime. A Data API for the browser; see [Where permissions live](#where-permissions-live). | Database branches. |
| **Cheapest production setup** | $0 on Free, if you run your own backups. Pro is $25. | $5 for one node (512 MB). $15 for three nodes with failover. |
| **Expected cost per year** *(estimate)* | $0 on Free. About $50 with Pro in the busy months only, $300 on Pro all year. The IPv4 add-on adds $4 a month while on Pro. | $60 for one node, $180 for three. |

At this size, speed depends mostly on distance. A database in a different region from the app adds tens of milliseconds to every query. A 200 MB database mostly fits in memory, even at the smallest sizes.

Expected costs use the hosting doc's busy and quiet months: a 200 MB database, 100,000 requests in a busy month and 10,000 in a quiet one. Supabase Pro for busy months only needs an organisation of its own, because Supabase doesn't mix plans within an organisation.

Supabase Free can work for this app, with conditions:

- **Size.** 200 MB is under Free's 500 MB limit.
- **Pausing.** Supabase pauses a Free project after a week of too little database activity. Its guidance is that a few real requests a day usually prevent that.
- **Backups.** Free has no automated backups. A scheduled `pg_dump` to private storage covers the gap.
- **Project slots.** Each person gets two active free projects across every organisation they own or administer.

## Connecting from each host

- **Hyperdrive caches reads.** It caches read queries for 60 seconds by default, so a page can show data up to a minute old after a write, such as an RSVP count. Caching can be turned off for a configuration, or a second configuration without caching can serve the reads that must be fresh.
- **Hyperdrive wants a direct connection.** Cloudflare says to give Hyperdrive the direct connection string, since Hyperdrive does the pooling. Supabase's direct connection is IPv6-only by default, and Cloudflare's docs don't say whether Hyperdrive reaches IPv6. One forum report describes Hyperdrive failing against Supabase's direct connection even with the IPv4 add-on. Supabase's session pooler is IPv4 on every plan, with none of transaction mode's limits. For limicon-app, on Supabase Free without the IPv4 add-on, creating the Hyperdrive configuration against the direct connection failed and the session pooler worked, so the app uses the session pooler.
- **Native drivers.** With Hyperdrive, the app uses an ordinary Postgres driver such as Postgres.js or node-postgres, not a vendor's serverless driver.
- **Placement.** On Cloudflare, a placement hint such as `aws:us-east-1` runs the app next to a database in North Virginia. On Vercel, the function region does the same.

## Connecting through a pooler

A pooler in transaction mode hands a connection to the app for one transaction at a time. So:

- Prepared statements must be turned off (`prepare: false` in Postgres.js and Drizzle).
- Settings made with `SET`, `LISTEN`/`NOTIFY` and temporary tables don't carry over between transactions.
- Supabase's shared pooler doesn't support query pipelining.

A session-mode pooler, or a direct connection, has none of these limits.

## Where permissions live

Postgres row-level security (RLS) lets the database check, row by row, who may read or change data. There are two ways to use it.

- **RLS as the permission system.** The browser queries the database through Supabase's Data API, using the signed-in user's token, and RLS policies decide what each user sees. Every rule, such as "alumni see only the editions they attended", becomes an SQL policy, which needs its own tests.
- **RLS as a backstop.** The app's server code connects with a database role that bypasses RLS and checks permissions itself. RLS stays enabled with no policies, so nothing else can read the tables. This is the shape when the app connects through Hyperdrive or a pooler with an ordinary driver.

PlanetScale has no Data API, so it supports only the second shape.

## Sign-in

Supabase Auth keeps users in the app's own Postgres, in a schema of its own, so app tables can link to them directly. Its sign-in token works with Postgres row-level security, so the database itself can check who may read each row. It covers passwords, magic links, one-time codes, about 19 social providers, and SAML single sign-on on Pro. Its built-in email sender is for testing only (2 emails an hour, to team addresses), so production sign-in emails need an email service with SMTP, such as Resend or Cloudflare's Email Sending.

PlanetScale has no sign-in of its own, so it would pair with Better Auth or Clerk. The three compare like this:

| | Where users live | Free allowance | Ties the app to |
|---|---|---|---|
| **Supabase Auth** | The Supabase database. | 50,000 monthly active users; 100,000 on Pro. | Supabase. |
| **Better Auth in the app** | Any Postgres. It's an open-source library, so the app runs it and adds its tables through migrations. | No fee. | Nothing beyond the library. |
| **Clerk** | Clerk's servers, synced to the app by webhook. | 50,000 monthly retained users. Pro is $25. | Clerk. |

Every free allowance covers at least 10,000 users a month, so cost is unlikely to decide it. The choice is about where users live and what it ties the app to.

## Testing

Tests need a database on a developer's machine, in CI (the checks GitHub runs on each pull request), and sometimes for a preview deploy of a pull request.

### On a developer's machine and in CI

| | What it is | Works with | Limits |
|---|---|---|---|
| **Postgres in Docker** | The official Postgres image, at the same major version as production. GitHub Actions runs it as a service container, free on a public repo. | Both, since both are plain Postgres. | No vendor sign-in, file storage or pooler. |
| **Supabase CLI** | `supabase start` runs Supabase's stack in Docker: Postgres, Auth, Storage and more. | Supabase, especially with Supabase Auth and row-level security. | Many containers, so heavier than plain Postgres. |
| **PGlite** | Postgres compiled to WebAssembly, running inside the Node test process without Docker. Each test file can have its own in-memory database. | Fast unit tests, with either option. `pglite-socket` lets ordinary Postgres drivers connect to it. | One connection, shared through a multiplexer that its docs say doesn't behave exactly like a normal server. No SSL. Not for testing concurrency or the pooler. |

PlanetScale has no local version; its docs assume development happens on its cloud branches.

Local Postgres accepts what a transaction-mode pooler rejects, such as prepared statements and `SET`. An app that will connect through a pooler can run PgBouncer in transaction mode locally to catch that before deploying.

### In the cloud

A branch is a separate database made for a pull request or test run and deleted afterwards.

| | Starts with | Created and deleted | Cost |
|---|---|---|---|
| **Supabase** | Schema from the repo's migrations, plus a seed file. No production data by default. | One per pull request through the GitHub integration, deleted when it's merged or closed. Long-lived branches, for staging, are also available. | Paid plans only. $0.01344 an hour per branch at the smallest size, not covered by compute credits. |
| **PlanetScale** | Nothing: no schema or data, unless restored from a backup. | From the dashboard. Up to 100 per database by default. | Billed only while the branch exists. The rate isn't in the docs *(estimate: $5 a month prorated, with about two months of branch hours included per database)*. |

## Questions that decide it

1. **Should permissions live in RLS or in the app?** RLS as the permission system needs Supabase's Data API. Permissions in the app work with both.
2. **Should sign-in come with the database?** Supabase includes it, which saves setup and ties the app to Supabase. Better Auth keeps users in any Postgres, run by the app itself.
3. **How far back must data be recoverable, and at what price?** Supabase Free has no backups, and restore to any point costs $100 a month on Pro. PlanetScale includes it.
4. **Do preview deploys need a database of their own?** Supabase's branches start from migrations and a seed file; PlanetScale's start empty. Both cost a little per hour.

## Sources

- Supabase: [Pricing](https://supabase.com/pricing), [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres), [IPv4 add-on pricing](https://supabase.com/docs/guides/platform/manage-your-usage/ipv4), [Dedicated IPv4 address](https://supabase.com/docs/guides/platform/ipv4-address), [Auth](https://supabase.com/docs/guides/auth), [Auth email (SMTP)](https://supabase.com/docs/guides/auth/auth-smtp), [Local development](https://supabase.com/docs/guides/local-development), [Branching](https://supabase.com/docs/guides/deployment/branching) and [its billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
- PlanetScale: [Pricing](https://planetscale.com/pricing), [Postgres backups](https://planetscale.com/docs/postgres/backups), [Postgres branching](https://planetscale.com/docs/postgres/branching), [Postgres pricing](https://planetscale.com/docs/postgres/pricing)
- Cloudflare: [Hyperdrive with Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/), [Hyperdrive with PlanetScale](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/planetscale-postgres/), [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), [PlanetScale Postgres with Workers](https://blog.cloudflare.com/deploy-planetscale-postgres-with-workers), [Forum report: Hyperdrive and Supabase's direct connection](https://www.answeroverflow.com/m/1432774244328017981)
- Vercel: [Postgres on Vercel](https://vercel.com/docs/postgres)
- PGlite: [Overview](https://pglite.dev/docs/), [pglite-socket](https://pglite.dev/docs/pglite-socket)
- Sign-in: [Better Auth installation](https://www.better-auth.com/docs/installation), [Clerk pricing](https://clerk.com/pricing)
