import { servicesContext } from "~/context";
import { findMentionable } from "~/lib/community.server";
import type { Route } from "./+types/community-mentions";

/**
 * Members whose names match what's typed after "@" in Community. Names and pictures only, never
 * emails. The Members area's middleware already limits it to members.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const people = await findMentionable(services.db(), query);
  return Response.json({ people }, { headers: { "Cache-Control": "no-store" } });
}
