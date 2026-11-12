# Local development

How to run limicon-app on your own computer, with a local Supabase in Docker standing in for the hosted database and sign-in.

## What you need

- Node.js 24 or later
- Docker Desktop, running
- git

The Supabase CLI and Wrangler (Cloudflare's tool) come with the project's packages, so `npx supabase` and `npx wrangler` work after `npm install`.

## First run

1. `npm install`
2. `npm run db:start` starts Supabase in Docker and applies the migrations in `supabase/migrations/`. The first run downloads several gigabytes of images.
3. `cp .dev.vars.example .dev.vars`, then set `SUPABASE_PUBLISHABLE_KEY` to the **Publishable** key that `npx supabase status` prints.
4. `npm run dev`, then open http://localhost:5173.

## Day to day

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app at http://localhost:5173, reloading on changes. |
| `npm run db:start` / `npm run db:stop` | Starts or stops the local Supabase. Data survives a stop. |
| `npm run db:reset` | Wipes the local database and reapplies every migration. |
| `npx supabase migration new <name>` | Creates an empty, timestamped migration file. |
| `npm run typecheck` | Checks types, after regenerating the Worker's and the routes' types. |
| `npm test` | Runs the tests. The database tests need the local Supabase running. |

`npx supabase status` lists the local addresses, including Mailpit, which catches every email the local Supabase sends, at http://127.0.0.1:54324.

Studio, Supabase's database browser, is off in `supabase/config.toml`. It's the heaviest local service, and when it misses its health check `supabase start` stops everything. To use it, set `enabled = true` under `[studio]` and restart; it then runs at http://127.0.0.1:54323.

## How the pieces connect locally

- **Pages and server code** run in Cloudflare's Workers runtime through its Vite plugin, so local behaviour matches production.
- **Data** goes through the `HYPERDRIVE` binding in `wrangler.jsonc`. Locally, its `localConnectionString` points straight at the Supabase database on port 54322, with no Hyperdrive in between, so there's no read cache.
- **Sign-in** uses the local Supabase API on port 54321. Sign-in emails land in Mailpit, not a real inbox.

## Google sign-in

Off until Limicon has a Google Cloud OAuth client. To turn it on locally, put the client's ID and secret in `supabase/.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, restart Supabase, and set `GOOGLE_SIGN_IN_ENABLED=true` in `.dev.vars`. The client needs `http://127.0.0.1:54321/auth/v1/callback` as an authorised redirect URI.
