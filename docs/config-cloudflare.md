# Cloudflare

Where limicon-app runs on Cloudflare, who can open it, and how to deploy it. [`config-supabase.md`](config-supabase.md) covers the database and sign-in, [`config-googlecloud.md`](config-googlecloud.md) covers Google sign-in, and [`process-local-development.md`](process-local-development.md) covers running it locally.

## Where things live

| Piece | Where | Notes |
|---|---|---|
| The app | Cloudflare Worker `limicon-app` in the **Limicon** Cloudflare account, at https://limicon-app.limicon.workers.dev | `wrangler.jsonc` pins the account, so deploys can't land in a personal account. Placed in `aws:us-east-1`; responses carry `cf-placement: remote-IAD` (Ashburn, Virginia). |
| Who can open it | Anyone with the address | The test site is shared by link, with no Cloudflare Access lock. While `SEARCH_INDEXING` in `wrangler.jsonc` is `off`, every page sends `X-Robots-Tag: noindex, nofollow`, so search engines don't list it. Switch it to `on` when limicon.org points here. To lock the site again, the Worker's **Access** tab puts Cloudflare Access in front of it. |
| Database connection | Hyperdrive configuration `limicon-db` | Reaches Supabase through its session pooler, since Hyperdrive couldn't reach the direct connection. Read caching is off, so every page sees current data, including a member's own change the moment after they make it; with it on, Hyperdrive answered repeated reads from a 60-second cache. The app runs next to the database, so uncached reads cost a few milliseconds. Turn caching back on only with `wrangler hyperdrive update <id> --caching-disabled false`, and only alongside a second, uncached configuration for reads that must be fresh. Holds the database password; [`config-supabase.md`](config-supabase.md) covers changing it. |

The Supabase address and publishable key are `vars` in `wrangler.jsonc`, with `GOOGLE_SIGN_IN_ENABLED` and `SEARCH_INDEXING`. All are public. The app holds no secrets: Hyperdrive keeps the database password.

## Deploying

1. `npx wrangler login` once per computer, choosing the Limicon account.
2. `npm run deploy` builds the app and uploads it. The new version serves immediately.

Deploys run from a developer's computer; CI doesn't deploy. Deploy app code that needs a new column only after the migration that adds it ([`config-supabase.md`](config-supabase.md)).
