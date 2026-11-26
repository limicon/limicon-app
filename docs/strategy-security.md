# Security

How limicon-app keeps data and accounts safe, in one place: what guards each kind of request, where every secret lives, what's reachable without signing in, and the known gaps. Check a new feature against [When adding something](#when-adding-something).

Status: checked against the code on 2026-11-25.

## How access works

- **The database.** Only server code reaches Postgres, through Hyperdrive. Row-level security is on for every table with no policies, and the Data API is off, so nothing else can read the tables ([`selection-database.md`](selection-database.md), [`config-supabase.md`](config-supabase.md)). `supabase/tests/rls-backstop.test.ts` fails if a table lacks row-level security or gains a policy.
- **Who's asking.** Middleware in `app/middleware/services.server.ts` verifies the Supabase session on every request. Route middleware then gates each area:
  - `requireViewer`: signed in.
  - `requireMembership`: the Members area (ticket holders and admins), on its layout.
  - `requireAdmin`: the console, on its layout. Signed-in people without a role get a plain not-found.
  - `requirePrivilege(...)`: a console page that needs a role's privilege ([`feature-admin-console.md`](feature-admin-console.md)).
- **Each object.** Loaders and actions check the viewer may see or change the specific row, such as a host editing only sessions they host.
- **Other sites' forms.** The session cookie is `SameSite=Lax`, so a form another site posts here arrives signed out. Sign-out is a form post too.
- **What people write.** Rich text is stored as TipTap JSON, cleaned against an allowlist on save (`cleanRichText`), with `https:` links only. Nothing renders raw HTML.
- **What people upload.** Images and files are checked by size, extension and first bytes, stored in R2 under random keys, and served with the app's own content type and a sandboxing CSP (`app/routes/media.ts`).

## Secrets

The repository is public: no secret goes in it, or in `wrangler.jsonc` `vars`.

| Secret | Lives in | Reaches | Replacing it |
|---|---|---|---|
| Database password | Supabase, and Hyperdrive's `limicon-db` configuration | All data, past row-level security | [`config-supabase.md`](config-supabase.md) → Changing the database password |
| Google sign-in client secret | Supabase's Google provider settings, and developers' `supabase/.env` for local Google sign-in | Acting as the sign-in client | [`config-googlecloud.md`](config-googlecloud.md) |
| Calendar client ID, secret and team@'s refresh token | Worker secrets | Reading and changing all of team@'s calendars | `npm run calendar:connect`; revoking the app under team@'s Google Account stops it ([`config-googlecloud.md`](config-googlecloud.md)) |
| Supabase secret API keys | Supabase | Everything, through the Data API, which is off. The app doesn't use them | Supabase's API key settings |
| Postmark Sign-in stream SMTP token *(planned)* | Supabase's SMTP settings | Sending through that one stream | [`config-postmark.md`](config-postmark.md) |
| Postmark server token, webhook password *(planned)* | Worker secrets | Sending on every stream; calling the app's webhook | [`config-postmark.md`](config-postmark.md) |
| Stripe secret key, webhook signing secret *(planned)* | Worker secrets | Payments and refunds | Stripe's dashboard |

Public by design: the Supabase URL and publishable key, and the calendar ids.

## Accounts

The services above sit in Limicon's Cloudflare account, Supabase organization, GitHub organization and Google organization. team@limicon.org owns the Google Cloud project and both calendars, holds the calendar sync's grant, and will own Postmark. Anyone who can deploy the Worker can run code that uses its secrets.

## Reachable without signing in

- The public website, including sign-in and its callback. Everything under `/members` and `/admin` needs an account.
- `/media/<key>`: uploaded images and files, to anyone with the address. Keys are random UUIDs, so addresses can't be guessed, but a shared one works for anyone. Voice notes aren't served there: `/members/feedback/voice/...` gives them only to their author and admins.
- *Planned:* the Postmark and Stripe webhooks.

The Cron Trigger has no address; only Cloudflare starts it.

## Known gaps

Most pressing first.

- **No site-wide security headers.** No `frame-ancestors` or `X-Frame-Options`, so another site can frame any page, the console included, and trick a click. App pages have no CSP either; only media and voice notes set their own.
- **The session cookie is readable by page scripts.** `@supabase/ssr` sets `httpOnly: false` by default, and the app keeps it, which matters if a script injection ever gets through. The app has no browser Supabase client, so `httpOnly: true` may work; check sign-in and refresh with it.
- **Removed photos stay served.** Replacing or removing a profile picture or session photo changes the key in the database but leaves the file in R2, at the same address, cached for a year. The event image and voice notes do delete what they replace.
- **The calendar grant covers all of team@'s calendars.** A narrower scope, such as `calendar.app.created`, might cover what the sync needs; unconfirmed.
- **The production Google sign-in secret sits on developers' machines** for local Google sign-in. A separate development client would keep it off them.
- **The calendar refresh token expires after six months unused.** The sync calls Google only when something is queued, so a quiet off-season could break it until `calendar:connect` runs again.
- **Postmark doesn't sign webhooks.** The plan is a password in the webhook's address, checked by the Worker.

## When adding something

- **A table** has row-level security on and no policies; the backstop test catches a miss.
- **A route** outside the Members and admin layouts declares its own middleware, as the admin CSV and upload routes do. A console page names its privilege with `requirePrivilege`. Its loader or action checks the specific object, not just the area.
- **A secret** goes in Worker secrets or the platform that uses it, and gets a row in [Secrets](#secrets).
- **A webhook** authenticates every call (Stripe's signature, Postmark's password), and handles the same event arriving twice.
- **User-written content** goes through an allowlist cleaner such as `cleanRichText`, never raw HTML.
- **An upload kind** checks type by first bytes and is served with the app's own content type.
- **A Google or other third-party grant** asks for the narrowest scope that works, and its config doc names the account that holds it.
