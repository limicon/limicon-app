# Cloudflare

Where limicon-app runs on Cloudflare, who can open it, and how to deploy it. [`config-supabase.md`](config-supabase.md) covers the database and sign-in, [`config-googlecloud.md`](config-googlecloud.md) covers Google sign-in, and [`process-local-development.md`](process-local-development.md) covers running it locally.

## Where things live

| Piece | Where | Notes |
|---|---|---|
| The app | Cloudflare Worker `limicon-app` in the **Limicon** Cloudflare account, at https://limicon-app.limicon.workers.dev | `wrangler.jsonc` pins the account, so deploys can't land in a personal account. Placed in `aws:us-east-1`; responses carry `cf-placement: remote-IAD` (Ashburn, Virginia). |
| Who can open it | Cloudflare Access, on all traffic: the main address and every preview | The Worker's **Testers** policy lists each allowed email address. Visitors sign in with their Cloudflare login or with a one-time code emailed by Cloudflare. To add or remove someone, open the Worker's **Access** tab, then **Manage access**. Login methods are under **Manage Access app → Login methods**, where **Accept all available identity providers** is on. Never allow by email domain with personal addresses: `gmail.com` would let in every Gmail user. A tester also needs to be on Google's test-user list ([`config-googlecloud.md`](config-googlecloud.md)) until the hosted app sends its own email. |
| Database connection | Hyperdrive configuration `limicon-db` | Reaches Supabase through its session pooler, since Hyperdrive couldn't reach the direct connection. Caches reads for 60 seconds by default. Holds the database password; [`config-supabase.md`](config-supabase.md) covers changing it. |

The Supabase address and publishable key are `vars` in `wrangler.jsonc`. Both are public. The app holds no secrets: Hyperdrive keeps the database password.

## Deploying

1. `npx wrangler login` once per computer, choosing the Limicon account.
2. `npm run deploy` builds the app and uploads it. The new version serves immediately.

Deploys run from a developer's computer; CI doesn't deploy. Deploy app code that needs a new column only after the migration that adds it ([`config-supabase.md`](config-supabase.md)).
