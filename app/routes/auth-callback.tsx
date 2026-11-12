import { redirect } from "react-router";

import { servicesContext } from "~/context";
import type { Route } from "./+types/auth-callback";

/**
 * Where Google and email sign-in links return. Trades the one-time code for a session, which
 * the root middleware writes into cookies.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) throw redirect("/sign-in?error=link");

  const { error } = await context.get(servicesContext).supabase.auth.exchangeCodeForSession(code);
  if (error) throw redirect("/sign-in?error=link");

  throw redirect("/account");
}
