# Google Cloud

The Google Cloud OAuth client behind "Continue with Google". [`config-supabase.md`](config-supabase.md) covers the Supabase side of sign-in, and [`process-local-development.md`](process-local-development.md) covers turning it on locally.

## Where things live

The sign-in client lives in the Google Cloud project `limicon-app`, in Limicon's Google organization (limicon.org). That organization only admits limicon.org accounts, so work in the console signed in as team@limicon.org.

- **Client:** `limicon-app (Supabase)`, a web application with client ID `112299629836-usta4iqneno4n9473en3bcisdvj4fsdd.apps.googleusercontent.com`. Its authorised redirect URIs are Supabase's callbacks: `https://kgvkzvocadtlbntpmutq.supabase.co/auth/v1/callback` and, for local development, `http://127.0.0.1:54371/auth/v1/callback`.
- **Secret:** only in Supabase, under **Authentication → Sign In / Providers → Google**. Google shows a secret once, when it's created; to replace one, add a new secret in the client, put it in Supabase, then delete the old one.
- **Audience:** External, in **Testing**, so only the test users listed under **Audience** can sign in with Google. Publish the app before registration opens. It asks only for name, email and profile picture.
- **The button:** `GOOGLE_SIGN_IN_ENABLED` in `wrangler.jsonc` shows "Continue with Google" on the sign-in page.

Google's sign-in screen names `kgvkzvocadtlbntpmutq.supabase.co`, the address that handles sign-in. Showing a Limicon address there needs a Supabase custom domain, a paid add-on.
