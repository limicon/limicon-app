import { redirect } from "react-router";

import { servicesContext } from "~/context";
import type { Route } from "./+types/sign-out";

export async function action({ context }: Route.ActionArgs) {
  // Ends this device's session only, so members stay signed in elsewhere.
  await context.get(servicesContext).supabase.auth.signOut({ scope: "local" });
  throw redirect("/");
}

export function loader() {
  throw redirect("/");
}
