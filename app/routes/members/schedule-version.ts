import { servicesContext } from "~/context";
import { scheduleVersion } from "~/lib/schedule.server";
import type { Route } from "./+types/schedule-version";

/** The calendar's change marker, for open pages checking whether to reload (CAL-4). */
export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const version = edition ? await scheduleVersion(services.db(), edition.id) : "";
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
