import { data } from "react-router";

import { servicesContext } from "~/context";
import { toCsv } from "~/lib/admin-forms";
import { ORDER_COLUMNS, pickColumns, readOrderFilters, type OrderColumn } from "~/lib/admin-tables";
import { listOrders, type OrderRow } from "~/lib/orders.server";
import { requireAdmin, requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/orders-csv";

export const middleware: Route.MiddlewareFunction[] = [requireAdmin, requirePrivilege("orders")];

const STATUS: Record<OrderRow["status"], string> = { paid: "Paid", pending: "Incomplete", comp: "Comped", refunded: "Refunded" };

const cell: Record<OrderColumn, (o: OrderRow) => unknown> = {
  name: (o) => o.name,
  email: (o) => o.email,
  date: (o) => o.createdAt,
  ticket: (o) => o.tier,
  status: (o) => STATUS[o.status],
  price: (o) => (o.status === "comp" ? "Comped" : (o.amountCents / 100).toFixed(2)),
};

/** The orders table as a spreadsheet, with only the columns ticked (ADM-2). */
export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  const query = new URL(request.url).searchParams;
  const columns = pickColumns(ORDER_COLUMNS, query);
  const orders = await listOrders(services.db(), edition.id, readOrderFilters(query), query.get("filtered") === "1");
  const csv = toCsv(
    columns.map((c) => (c.key === "date" ? "Order date (UTC)" : c.key === "price" ? "Price (USD)" : c.label)),
    orders.map((o) => columns.map((c) => cell[c.key](o))),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="limicon-${edition.year}-orders.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
