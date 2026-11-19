import { Form, Link, useSearchParams } from "react-router";

import { card, formatWhen, inputClass, PageHeading, secondaryButton } from "~/components/admin-ui";
import { DownloadPanel, SortHeading } from "~/components/download-panel";
import { servicesContext } from "~/context";
import { formatDollars } from "~/lib/admin-forms";
import { getTierBreakdown, listTiers } from "~/lib/admin.server";
import { ORDER_COLUMNS, ORDER_STATUSES, readOrderFilters, sortLink } from "~/lib/admin-tables";
import { getOrderSummary, listOrders } from "~/lib/orders.server";
import type { Route } from "./+types/orders";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Orders · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const filters = readOrderFilters(new URL(request.url).searchParams);
  if (!edition) return { year: null, filters, orders: [], summary: null, tiers: [], byTier: [] };
  const db = services.db();
  const [orders, summary, tiers, byTier] = await Promise.all([
    listOrders(db, edition.id, filters),
    getOrderSummary(db, edition.id),
    listTiers(db, edition.id),
    getTierBreakdown(db, edition.id),
  ]);
  return { year: edition.year, filters, orders, summary, tiers: tiers.map(({ id, name }) => ({ id, name })), byTier };
}

/** Every order for the edition: who, when, which ticket, how many, whether it went through. */
export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { orders, summary, filters, tiers, byTier, year } = loaderData;
  const [params] = useSearchParams();
  const heading = (key: (typeof ORDER_COLUMNS)[number]["key"], label: string) => (
    <SortHeading label={label} href={sortLink(params, key, filters, key === "date" ? "desc" : "asc")} active={filters.sort === key} dir={filters.dir} />
  );

  return (
    <>
      <PageHeading title="Orders">
        <p>Every Limicon {year ?? ""} order, newest first. Click a heading to sort by it, and again to reverse.</p>
      </PageHeading>

      {summary && (
        <dl className="mb-6 grid max-w-5xl gap-3 sm:grid-cols-3">
          <Stat label="Orders" value={summary.orders} detail={summary.incomplete ? `${summary.incomplete} incomplete, not counted` : "Paid and comped"} />
          <Stat label="Tickets purchased" value={summary.ticketsPurchased} detail="Some orders buy more than one" />
          <Stat label="Revenue" value={formatDollars(summary.revenueCents)} detail="Before Stripe fees" />
        </dl>
      )}

      <div className="mb-4 flex max-w-5xl flex-wrap items-end justify-between gap-3">
        <Form method="get" role="search" className="flex flex-wrap items-end gap-3" key={params.toString()}>
          {filters.sort !== "date" && <input type="hidden" name="sort" value={filters.sort} />}
          <div>
            <label htmlFor="q" className="block text-sm font-medium">Name or email</label>
            <input id="q" name="q" type="search" defaultValue={filters.q} className={`${inputClass} mt-1 w-60`} />
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium">Status</label>
            <select id="status" name="status" defaultValue={filters.status} className={`${inputClass} mt-1`}>
              {ORDER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tier" className="block text-sm font-medium">Ticket</label>
            <select id="tier" name="tier" defaultValue={filters.tier ?? ""} className={`${inputClass} mt-1`}>
              <option value="">All tickets</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={secondaryButton}>Filter</button>
          <Link to="/admin/orders" className="py-1.5 text-sm underline">Clear</Link>
        </Form>
        <DownloadPanel action="/admin/orders.csv" columns={ORDER_COLUMNS} params={params} what="orders" />
      </div>

      <p className="mb-2 text-sm" role="status">
        {orders.length} {orders.length === 1 ? "order" : "orders"}
        {filters.status === "pending" && orders.length > 0 ? " that didn't finish paying. Open someone to email them." : ""}
      </p>
      {orders.length === 0 ? (
        <p>No orders match.</p>
      ) : (
        <div className="max-w-5xl overflow-x-auto rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#EEF3F3] dark:bg-[#16262A]">
              <tr>
                {heading("name", "Name")}
                {heading("date", "Order date")}
                {heading("ticket", "Ticket")}
                {heading("quantity", "Quantity")}
                {heading("status", "Status")}
                {heading("price", "Price")}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[#E2E8E9] dark:border-[#24363B]">
                  <td className="px-3 py-2">
                    <Link to={`/admin/users/${o.profileId}`} className="font-semibold underline">{o.name ?? o.email ?? "Unknown"}</Link>
                    {o.name && o.email && (
                      <a href={`mailto:${o.email}`} className="block break-all opacity-80 hover:underline">{o.email}</a>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatWhen(o.createdAt)}</td>
                  <td className="px-3 py-2">{o.tier ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{o.quantity}</td>
                  <td className="px-3 py-2"><OrderStatus status={o.status} /></td>
                  <td className="px-3 py-2 tabular-nums">{o.status === "comp" ? "Comped" : formatDollars(o.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className={`${card} mt-10 max-w-5xl`}>
        <summary className="cursor-pointer font-semibold">Details: ticket holders by tier</summary>
        {byTier.length === 0 ? (
          <p className="mt-3 text-sm">No tickets yet.</p>
        ) : (
          <table className="mt-3 w-full max-w-lg text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="py-1 font-semibold">Tier</th>
                <th scope="col" className="py-1 text-right font-semibold">Ticket holders</th>
                <th scope="col" className="py-1 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {byTier.map((t) => (
                <tr key={t.name} className="border-t border-[#E2E8E9] dark:border-[#24363B]">
                  <td className="py-1">{t.name}</td>
                  <td className="py-1 text-right tabular-nums">{t.tickets}</td>
                  <td className="py-1 text-right tabular-nums">{formatDollars(t.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </>
  );
}

/** Paid in green and incomplete in red, each with its word, so color isn't the only signal. */
function OrderStatus({ status }: { status: "pending" | "paid" | "comp" | "refunded" }) {
  const look = {
    paid: { label: "Paid", className: "bg-[#CDEBE3] text-[#0F4A3C]" },
    pending: { label: "Incomplete", className: "bg-[#F8D7D4] text-[#7A1C14]" },
    comp: { label: "Comped", className: "bg-[#D6E6F5] text-[#173A5C]" },
    refunded: { label: "Refunded", className: "bg-[#E2E8E9] text-[#2F4447]" },
  }[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${look.className}`}>{look.label}</span>;
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div className={`${card} p-4`}>
      <dt className="text-sm font-medium opacity-80">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="mt-1 text-sm opacity-80">{detail}</dd>}
    </div>
  );
}
