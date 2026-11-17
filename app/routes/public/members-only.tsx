import { redirect } from "react-router";

import { MembersMessage } from "~/components/members-message";
import { servicesContext } from "~/context";
import type { Route } from "./+types/members-only";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Members area · Limicon" }];
}

/** Where members-only addresses send anyone without access. */
export async function loader({ context }: Route.LoaderArgs) {
  const membership = await context.get(servicesContext).membership();
  if (membership.status === "member") throw redirect("/members");
  return { status: membership.status, editionYear: membership.editionYear };
}

export default function MembersOnly({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-md p-4 pt-16">
      <MembersMessage status={loaderData.status} editionYear={loaderData.editionYear} />
    </main>
  );
}
