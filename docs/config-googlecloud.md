# Google Cloud

The Google Cloud OAuth clients behind "Continue with Google" and the Google Calendar sync. [`config-supabase.md`](config-supabase.md) covers the Supabase side of sign-in, and [`process-local-development.md`](process-local-development.md) covers turning it on locally.

## Where things live

The sign-in client lives in the Google Cloud project `limicon-app`, in Limicon's Google organization (limicon.org). That organization only admits limicon.org accounts, so work in the console signed in as team@limicon.org.

- **Client:** `limicon-app (Supabase)`, a web application with client ID `112299629836-usta4iqneno4n9473en3bcisdvj4fsdd.apps.googleusercontent.com`. Its authorised redirect URIs are Supabase's callbacks: `https://kgvkzvocadtlbntpmutq.supabase.co/auth/v1/callback` and, for local development, `http://127.0.0.1:54371/auth/v1/callback`.
- **Secret:** only in Supabase, under **Authentication → Sign In / Providers → Google**. Google shows a secret once, when it's created; to replace one, add a new secret in the client, put it in Supabase, then delete the old one.
- **Audience:** External and published, so anyone with a Google account can sign in. It asks only for name, email and profile picture, so it needed no Google review.
- **Branding:** app name Limicon, with team@limicon.org as the support and developer contact. The home page and privacy policy links point at limicon.org's current pages, which Google requires before publishing; they're shown on Google's sign-in screen and redirect nowhere. The authorized domains are `limicon.org` and `kgvkzvocadtlbntpmutq.supabase.co`. There's no logo: adding one sends the app to Google for review.
- **The button:** `GOOGLE_SIGN_IN_ENABLED` in `wrangler.jsonc` shows "Continue with Google" on the sign-in page.

Google's sign-in screen names `kgvkzvocadtlbntpmutq.supabase.co`, the address that handles sign-in. Showing a Limicon address there needs a Supabase custom domain, a paid add-on.

## Calendar client

The Google Calendar sync ([`feature-calendaring.md`](feature-calendaring.md) → Google Calendar) acts as team@limicon.org through its own OAuth client in the same project.

- **API:** Google Calendar API, enabled in **APIs & Services → Library**.
- **Client:** `limicon-app (Calendar)`, of type **Desktop app**, so `npm run calendar:connect` can sign in through a page on the developer's own machine without registered redirect addresses.
- **Scope:** `https://www.googleapis.com/auth/calendar`, a sensitive scope the app isn't verified for, so Google's consent page warns that it's unverified; team@ continues through **Advanced**. Only team@ ever signs in to this client.
- **Secrets:** the client secret and team@'s refresh token live only in the Worker's secrets, put there by the connect script. Removing the app's access under team@'s Google Account → Security → Third-party connections stops the sync; run the connect script again to restore it.
