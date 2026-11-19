import { data } from "react-router";

import { servicesContext } from "~/context";
import { toCsv } from "~/lib/admin-forms";
import { GUEST_COLUMNS, pickColumns, readGuestFilters, type GuestColumn } from "~/lib/admin-tables";
import { listGuests, type GuestRow } from "~/lib/orders.server";
import { requireAdmin, requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/guests-csv";

export const middleware: Route.MiddlewareFunction[] = [requireAdmin, requirePrivilege("people")];

/** The guest list as a spreadsheet, with only the columns ticked (ADM-2). */
export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  const url = new URL(request.url);
  const query = url.searchParams;
  const columns = pickColumns(GUEST_COLUMNS, query);
  const guests = await listGuests(services.db(), edition.id, readGuestFilters(query), query.get("filtered") === "1");
  const cell: Record<GuestColumn, (g: GuestRow) => unknown> = {
    firstName: (g) => g.firstName,
    lastName: (g) => g.lastName,
    email: (g) => g.email,
    address: (g) => g.address,
    profile: (g) => `${url.origin}/admin/users/${g.profileId}`,
  };
  const csv = toCsv(
    columns.map((c) => c.label),
    guests.map((g) => columns.map((c) => cell[c.key](g))),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="limicon-${edition.year}-guests.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
