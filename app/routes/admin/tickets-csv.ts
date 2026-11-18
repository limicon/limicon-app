import { data } from "react-router";

import { servicesContext } from "~/context";
import { toCsv } from "~/lib/admin-forms";
import { listTickets } from "~/lib/admin.server";
import { requireAdmin } from "~/middleware/services.server";
import type { Route } from "./+types/tickets-csv";

export const middleware: Route.MiddlewareFunction[] = [requireAdmin];

/** The current edition's registrations as a spreadsheet (ADM-2). */
export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  const tickets = await listTickets(services.db(), edition.id);
  const csv = toCsv(
    ["Name", "Email", "Tier", "Status", "Paid (USD)", "Imported", "Registered (UTC)"],
    tickets.map((t) => [t.name, t.email, t.tier, t.status, (t.amountPaidCents / 100).toFixed(2), t.imported ? "yes" : "no", t.createdAt]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="limicon-${edition.year}-registrations.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
