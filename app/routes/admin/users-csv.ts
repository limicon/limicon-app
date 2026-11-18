import { data } from "react-router";

import { servicesContext } from "~/context";
import { toCsv } from "~/lib/admin-forms";
import { readUserFilters } from "~/lib/admin-users";
import { listUsers } from "~/lib/admin-users.server";
import { requireAdmin } from "~/middleware/services.server";
import type { Route } from "./+types/users-csv";

export const middleware: Route.MiddlewareFunction[] = [requireAdmin];

/** The Users page's matches, every page of them, as a spreadsheet (ADM-2). */
export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  const filters = readUserFilters(new URL(request.url).searchParams);
  const { users } = await listUsers(services.db(), edition.id, filters, null);
  const csv = toCsv(
    ["Name", "Email", `${edition.year} ticket`, "Tier", "Admin permissions", `Sessions hosted in ${edition.year}`, "Joined (UTC)", "Last sign-in (UTC)", "Deactivated (UTC)"],
    users.map((u) => [u.name, u.email, u.ticketStatus ?? "none", u.tier, u.permissions.join(" "), u.hostedSessions, u.joinedAt, u.lastSignInAt, u.deactivatedAt]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="limicon-users.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
