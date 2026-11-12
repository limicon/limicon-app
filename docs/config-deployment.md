# Deployment

Where the hosted limicon-app lives, and how to deploy it and change its database. [`config-local-development.md`](config-local-development.md) covers running it locally.

## Where things live

| Piece | Where | Notes |
|---|---|---|
| The app | Cloudflare Worker `limicon-app` in the **Limicon** Cloudflare account, at https://limicon-app.limicon.workers.dev | `wrangler.jsonc` pins the account, so deploys can't land in a personal account. Placed in `aws:us-east-1`; responses carry `cf-placement: remote-IAD` (Ashburn, Virginia). |
| Who can open it | Cloudflare Access, on all traffic: the main address and every preview | Only members of the Limicon Cloudflare account get in. To let in other teammates without making them account members, add their addresses to the application's policy in the Zero Trust dashboard (https://one.dash.cloudflare.com), with the **Emails** selector. Never use **Emails ending in** with personal addresses: `gmail.com` would let in every Gmail user. |
| Database connection | Hyperdrive configuration `limicon-db` | Reaches Supabase through its session pooler, since Hyperdrive couldn't reach the direct connection. Caches reads for 60 seconds by default. |
| Database and sign-in | Supabase project `limicon-app` (`kgvkzvocadtlbntpmutq`) in the **Limicon** Supabase organization, `us-east-1` | Automatic row-level security is on, so new tables start locked. |

Supabase's **Authentication → URL Configuration** has the Site URL `https://limicon-app.limicon.workers.dev` and the redirect URL `https://limicon-app.limicon.workers.dev/auth/callback`. Change both if the app's address changes.

The Supabase address and publishable key are `vars` in `wrangler.jsonc`. Both are public. The app holds no secrets: Hyperdrive keeps the database password.

## Deploying

1. `npx wrangler login` once per computer, choosing the Limicon account.
2. `npm run deploy` builds the app and uploads it. The new version serves immediately.

Deploys run from a developer's computer; CI doesn't deploy.

## Changing the hosted database

The hosted database holds real data, so follow `AGENTS.md` → Production safety: one command at a time, with a human's go-ahead before each write.

1. `npx supabase login` once per computer, then `npx supabase link --project-ref kgvkzvocadtlbntpmutq`.
2. `npx supabase db push --remote --dry-run` lists the migrations that would run, without running them.
3. After a go-ahead, `npx supabase db push --remote` applies them. Supabase asks for its own confirmation; an agent adds `--yes` only once the human has approved that exact push.
4. Check the result with a read-only query: `npx supabase db query --remote --read-only "<sql>"`.

Deploy app code that needs a new column only after the migration that adds it.

## Sign-in email

Hosted Supabase's built-in email sends only to members of the Limicon Supabase organization, about two emails an hour. Other people can't sign in until an email service is set up as Supabase's SMTP sender.

## Changing the database password

The password lives only in the Hyperdrive configuration. After resetting it in Supabase (**Project Settings → Database**), update Hyperdrive in your own Terminal with `npx wrangler hyperdrive update`, then clear the shell history. A password with only letters and numbers avoids quoting and URL-encoding problems.
