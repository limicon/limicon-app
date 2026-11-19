import { servicesContext } from "~/context";
import { findMembers } from "~/lib/sessions.server";
import type { Route } from "./+types/host-people";

/**
 * Members who can co-host, for the Host a Session form's co-host search (SES-5). The Members
 * area's middleware already limits it to members.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const people = edition ? await findMembers(services.db(), edition.id, query) : [];
  return Response.json({ people }, { headers: { "Cache-Control": "no-store" } });
}
