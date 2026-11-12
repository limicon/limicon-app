import { env } from "cloudflare:workers";
import { data, Form, redirect, useNavigation } from "react-router";

import { servicesContext } from "~/context";
import { normalizeEmail } from "~/lib/validation";
import type { Route } from "./+types/sign-in";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign in · Limicon" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  if (context.get(servicesContext).viewer) throw redirect("/account");
  return {
    googleEnabled: env.GOOGLE_SIGN_IN_ENABLED === "true",
    linkFailed: new URL(request.url).searchParams.has("error"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase } = context.get(servicesContext);
  const form = await request.formData();
  // Supabase sends people back here after Google or the email link, with a one-time code.
  const callbackUrl = new URL("/auth/callback", request.url).toString();

  if (form.get("intent") === "google") {
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (result.error || !result.data.url) {
      return data({ error: "Google sign-in isn't available right now.", sentTo: null }, { status: 503 });
    }
    throw redirect(result.data.url);
  }

  const email = normalizeEmail(form.get("email"));
  if (!email) {
    return data({ error: "Enter a valid email address.", sentTo: null }, { status: 400 });
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl },
  });
  if (error) {
    return data(
      { error: "We couldn't send the link. Wait a minute and try again.", sentTo: null },
      { status: 502 },
    );
  }
  return { error: null, sentTo: email };
}

export default function SignIn({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  if (actionData?.sentTo) {
    return (
      <main className="mx-auto max-w-md p-4 pt-16">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-4">
          We sent a sign-in link to <strong>{actionData.sentTo}</strong>. Open it in this browser,
          on this device, to finish signing in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pt-16">
      <h1 className="text-2xl font-semibold">Sign in or create an account</h1>
      {loaderData.linkFailed && (
        <p role="alert" className="mt-4 text-red-700 dark:text-red-400">
          That sign-in link didn't work. Links expire after an hour and only work in the browser
          that asked for them. Request a new one below.
        </p>
      )}

      <Form method="post" className="mt-6 space-y-3">
        <label htmlFor="email" className="block font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={actionData?.error ? "sign-in-error" : undefined}
          className="w-full rounded border border-gray-400 px-3 py-2"
        />
        {actionData?.error && (
          <p id="sign-in-error" role="alert" className="text-red-700 dark:text-red-400">
            {actionData.error}
          </p>
        )}
        <button
          type="submit"
          name="intent"
          value="email"
          disabled={busy}
          className="w-full rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
        >
          Email me a sign-in link
        </button>
      </Form>

      {loaderData.googleEnabled && (
        <Form method="post" className="mt-4">
          <button
            type="submit"
            name="intent"
            value="google"
            disabled={busy}
            className="w-full rounded border border-gray-400 px-3 py-2 disabled:opacity-60"
          >
            Continue with Google
          </button>
        </Form>
      )}
    </main>
  );
}
