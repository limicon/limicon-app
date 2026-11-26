# Supabase

The hosted Supabase project behind limicon-app's database and sign-in, and how to change it. [`config-cloudflare.md`](config-cloudflare.md) covers how the app reaches it, and [`process-local-development.md`](process-local-development.md) covers the local Supabase.

## Where things live

| Piece | Where | Notes |
|---|---|---|
| Database and sign-in | Supabase project `limicon-app` (`kgvkzvocadtlbntpmutq`) in the **Limicon** Supabase organization, `us-east-1` | Free plan, Nano compute. Automatic row-level security is on, so new tables start locked. |

**Authentication → URL Configuration** has the Site URL `https://limicon-app.limicon.workers.dev` and the redirect URL `https://limicon-app.limicon.workers.dev/auth/callback`. Change both if the app's address changes.

The Google sign-in provider's secret is under **Authentication → Sign In / Providers → Google**; [`config-googlecloud.md`](config-googlecloud.md) covers the client it belongs to.

## Changing the hosted database

The hosted database holds real data, so follow `AGENTS.md` → Production safety: one command at a time, with a human's go-ahead before each write.

1. `npx supabase login` once per computer, then `npx supabase link --project-ref kgvkzvocadtlbntpmutq`.
2. `npx supabase db push --remote --dry-run` lists the migrations that would run, without running them.
3. After a go-ahead, `npx supabase db push --remote` applies them. Supabase asks for its own confirmation; an agent adds `--yes` only once the human has approved that exact push.
4. Check the result with a read-only query: `npx supabase db query --remote --read-only "<sql>"`.

Deploy app code that needs a new column only after the migration that adds it.

`db push` applies every migration file in `supabase/migrations/`, committed or not, so read the dry run's list: another agent working in the same folder may have left an unfinished migration there. To apply one migration alone, after a go-ahead for it, run its file inside `begin;` and `commit;` with `npx supabase db query --remote -f <file>`, then record it with `npx supabase migration repair --status applied <version> --remote`, so the next push skips it.

## Admins

Admins manage roles in the console: the Users, Roles and Team pages ([`feature-admin-console.md`](feature-admin-console.md)). A role is a row in `admin_roles`; a person holds a role through a row in `admin_permissions`, whose `permission` names the role's key. The built-in Admin role's key is `full`. Holding any role lets a person into the Members area without a ticket.

The Team page invites by email, and the first time that address signs in, the new-account trigger turns the invitation into the role and removes it. The same invitation in SQL, a production write that needs a go-ahead like any other, with the address in lowercase:

```sql
insert into public.admin_invitations (email, permission) values ('name@example.org', 'full');
```

Addresses go only into the database, never into the repository, which is public. Admins can't remove the Admin role from anyone but themselves in the console; taking it from someone else is a production write in `admin_permissions`.

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

Hosted Supabase's built-in email sends only to members of the Limicon Supabase organization, about two emails an hour. Other people can't sign in until Postmark is set up as Supabase's SMTP sender ([`config-postmark.md`](config-postmark.md)).

## Changing the database password

The password lives only in the Hyperdrive configuration. After resetting it in Supabase (**Project Settings → Database**), update Hyperdrive in your own Terminal with `npx wrangler hyperdrive update`, then clear the shell history. A password with only letters and numbers avoids quoting and URL-encoding problems.
