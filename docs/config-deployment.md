# Deployment

Where the hosted limicon-app lives, and how to deploy it and change its database. [`config-local-development.md`](config-local-development.md) covers running it locally.

## Where things live

| Piece | Where | Notes |
|---|---|---|
| The app | Cloudflare Worker `limicon-app` in the **Limicon** Cloudflare account, at https://limicon-app.limicon.workers.dev | `wrangler.jsonc` pins the account, so deploys can't land in a personal account. Placed in `aws:us-east-1`; responses carry `cf-placement: remote-IAD` (Ashburn, Virginia). |
| Who can open it | Cloudflare Access, on all traffic: the main address and every preview | The Worker's **Testers** policy lists each allowed email address. Visitors sign in with their Cloudflare login or with a one-time code emailed by Cloudflare. To add or remove someone, open the Worker's **Access** tab, then **Manage access**. Login methods are under **Manage Access app → Login methods**, where **Accept all available identity providers** is on. Never allow by email domain with personal addresses: `gmail.com` would let in every Gmail user. A tester also needs to be on Google's test-user list (see [Google sign-in](#google-sign-in)) until the hosted app sends its own email. |
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

## Data API

The Data API is off, since the app reads data through Hyperdrive. PostgREST still runs, and logs `schema "pg_pgrst_no_exposed_schemas" does not exist` for its missing placeholder schema. The hosted database points it at an empty schema instead ([Supabase's guide](https://supabase.com/docs/guides/troubleshooting/schema-pg_pgrst_no_exposed_schemas-does-not-exist)):

```sql
create schema pgrst_no_exposed_schemas;
alter role authenticator set pgrst.db_schemas = 'pgrst_no_exposed_schemas';
notify pgrst;
```

This role setting overrides the dashboard and is invisible to migrations. Undo it before turning the Data API back on:

```sql
alter role authenticator reset pgrst.db_schemas;
notify pgrst;
```

## Sign-in email

Hosted Supabase's built-in email sends only to members of the Limicon Supabase organization, about two emails an hour. Other people can't sign in until an email service is set up as Supabase's SMTP sender.

## Google sign-in

The sign-in client lives in the Google Cloud project `limicon-app`, in Limicon's Google organization (limicon.org). That organization only admits limicon.org accounts, so work in the console signed in as team@limicon.org.

- **Client:** `limicon-app (Supabase)`, a web application with client ID `112299629836-usta4iqneno4n9473en3bcisdvj4fsdd.apps.googleusercontent.com`. Its authorised redirect URIs are Supabase's callbacks: `https://kgvkzvocadtlbntpmutq.supabase.co/auth/v1/callback` and, for local development, `http://127.0.0.1:54321/auth/v1/callback`.
- **Secret:** only in Supabase, under **Authentication → Sign In / Providers → Google**. Google shows a secret once, when it's created; to replace one, add a new secret in the client, put it in Supabase, then delete the old one.
- **Audience:** External, in **Testing**, so only the test users listed under **Audience** can sign in with Google. Publish the app before registration opens. It asks only for name, email and profile picture.
- **The button:** `GOOGLE_SIGN_IN_ENABLED` in `wrangler.jsonc` shows "Continue with Google" on the sign-in page.

Google's sign-in screen names `kgvkzvocadtlbntpmutq.supabase.co`, the address that handles sign-in. Showing a Limicon address there needs a Supabase custom domain, a paid add-on.

## Changing the database password

The password lives only in the Hyperdrive configuration. After resetting it in Supabase (**Project Settings → Database**), update Hyperdrive in your own Terminal with `npx wrangler hyperdrive update`, then clear the shell history. A password with only letters and numbers avoids quoting and URL-encoding problems.
