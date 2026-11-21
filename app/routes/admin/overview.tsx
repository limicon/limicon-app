import { Link } from "react-router";

import { card, formatWhen, PageHeading } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { formatDollars } from "~/lib/admin-forms";
import { getOverview, type IncompleteOrder, type Overview, type OverviewTotals, type RecentBuyer } from "~/lib/admin.server";
import type { Route } from "./+types/overview";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Overview · Admin · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) return { year: null, overview: null, canSeeOrders: false };
  const [overview, privileges] = await Promise.all([getOverview(services.db(), edition.id), services.privileges()]);
  // Money and buyers' names need the `orders` privilege; every admin sees the counts.
  const canSeeOrders = privileges.has("orders");
  if (!canSeeOrders) {
    overview.recentBuyers = [];
    overview.incomplete = [];
    overview.totals.revenueCents = 0;
    overview.thisWeek.revenueCents = 0;
  }
  return { year: edition.year, overview, canSeeOrders };
}

/** The console's front page: how registration and hosting are going for the current edition. */
export default function AdminOverview({ loaderData }: Route.ComponentProps) {
  const { overview, year, canSeeOrders } = loaderData;
  if (!overview) {
    return (
      <PageHeading title="Overview">
        <p>No Limicon edition is set up yet.</p>
      </PageHeading>
    );
  }
  const { totals, thisWeek, recentBuyers, incomplete } = overview;
  return (
    <>
      <PageHeading title="Overview">
        <p>How Limicon {year} is going. Ticket numbers count this edition only.</p>
      </PageHeading>

      <section aria-labelledby="totals-heading">
        <h2 id="totals-heading" className="text-xl font-semibold">Totals</h2>
        <TotalsRow totals={totals} pendingInvitations={overview.pendingInvitations} showMoney={canSeeOrders} />
      </section>

      {canSeeOrders && <IncompletePurchases orders={incomplete} />}

      <section aria-labelledby="week-heading" className="mt-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 [&::-webkit-details-marker]:hidden">
            <h2 id="week-heading" className="text-xl font-semibold">
              <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span> This week
            </h2>
            <span className="text-sm opacity-80">
              The last 7 days · {recentBuyers.length} {recentBuyers.length === 1 ? "purchase" : "purchases"} · open to see who
            </span>
          </summary>
          {canSeeOrders ? <BuyerList buyers={recentBuyers} /> : <p className="mt-3 text-sm">Your admin role doesn't include buyers' names.</p>}
        </details>
        <TotalsRow totals={thisWeek} showMoney={canSeeOrders} />
      </section>

      <div className="mt-6 grid gap-4">
        <WeeklyChart weekly={overview.weekly} />
      </div>

      <section aria-labelledby="sessions-heading" className="mt-10">
        <h2 id="sessions-heading" className="text-xl font-semibold">Sessions</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label={`On the ${year} calendar`} value={overview.sessions.published} to="/admin/sessions?show=published" />
          <Stat label="Drafts" value={overview.sessions.drafts} to="/admin/sessions?show=drafts" />
          <Stat label="Hosts" value={overview.sessions.hosts} />
        </dl>
      </section>
    </>
  );
}

function TotalsRow({ totals, pendingInvitations, showMoney }: { totals: OverviewTotals; pendingInvitations?: number; showMoney: boolean }) {
  return (
    <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Ticket holders" value={totals.ticketHolders} detail={`${totals.paid} paid · ${totals.comp} comp`} to="/admin/guests" />
      {showMoney ? (
        <Stat label="Ticket revenue" value={formatDollars(totals.revenueCents)} detail="Before Stripe fees" to="/admin/orders" />
      ) : (
        <Stat label="Ticket revenue" value="—" detail="Not in your admin role" />
      )}
      <Stat label="Accounts" value={totals.accounts} to="/admin/users" />
      <Stat
        label="Admins"
        value={totals.admins}
        detail={pendingInvitations === undefined ? undefined : pendingInvitations ? `${pendingInvitations} invited, not yet signed in` : "No invitations waiting"}
        to="/admin/team"
      />
    </dl>
  );
}

/** Checkouts people started and didn't finish, newest first, so an admin can follow up. */
function IncompletePurchases({ orders }: { orders: IncompleteOrder[] }) {
  return (
    <section aria-labelledby="incomplete-heading" className={`mt-6 rounded-lg border p-4 ${orders.length ? "border-[#E8B4B0] bg-[#FCEDEC] dark:bg-[#2A1513]" : "border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="incomplete-heading" className="text-xl font-semibold">
          {orders.length ? `⚠ ${orders.length} incomplete ${orders.length === 1 ? "purchase" : "purchases"}` : "Incomplete purchases"}
        </h2>
        {orders.length > 0 && (
          <Link to="/admin/orders?status=pending" className="text-sm underline">See them in Orders</Link>
        )}
      </div>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm">None. Everyone who started buying a ticket finished.</p>
      ) : (
        <>
          <p className="mt-1 text-sm">These people started buying a ticket and didn't finish paying. Email them to follow up.</p>
          <div className="mt-3 overflow-x-auto rounded border border-[#E8B4B0] bg-white dark:bg-[#12201F]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FCEDEC] dark:bg-[#2A1513]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Ticket</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Price</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderId} className="border-t border-[#F3D3D0] dark:border-[#3A2220]">
                    <td className="px-3 py-2">
                      <Link to={`/admin/users/${o.profileId}`} className="font-semibold underline">{o.name ?? o.email ?? "Unknown"}</Link>
                    </td>
                    <td className="px-3 py-2 break-all">{o.email && <a href={`mailto:${o.email}`} className="underline">{o.email}</a>}</td>
                    <td className="px-3 py-2">{o.tier ?? "No tier"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDollars(o.amountCents)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatWhen(o.startedAt, { dateStyle: "medium", timeStyle: "short" })} UTC</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Who bought in the last 7 days, newest first, so an admin can reach out. */
function BuyerList({ buyers }: { buyers: RecentBuyer[] }) {
  if (buyers.length === 0) return <p className="mt-3 text-sm">Nobody has bought a ticket in the last 7 days.</p>;
  return (
    <div className="mt-3 mb-4 overflow-x-auto rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#EEF3F3] dark:bg-[#16262A]">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Name</th>
            <th scope="col" className="px-3 py-2 font-semibold">Email</th>
            <th scope="col" className="px-3 py-2 font-semibold">Ticket</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Price</th>
            <th scope="col" className="px-3 py-2 font-semibold">When</th>
          </tr>
        </thead>
        <tbody>
          {buyers.map((b) => (
            <tr key={b.orderId} className="border-t border-[#E2E8E9] dark:border-[#24363B]">
              <td className="px-3 py-2">
                <Link to={`/admin/users/${b.profileId}`} className="font-semibold underline">{b.name ?? b.email ?? "Unknown"}</Link>
              </td>
              <td className="px-3 py-2 break-all">{b.email && <a href={`mailto:${b.email}`} className="underline">{b.email}</a>}</td>
              <td className="px-3 py-2">{b.tier ?? "No tier"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{b.status === "comp" ? "Comped" : formatDollars(b.amountCents)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatWhen(b.at, { dateStyle: "medium", timeStyle: "short" })} UTC</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, detail, to }: { label: string; value: number | string; detail?: string; to?: string }) {
  const body = (
    <>
      <dt className="text-sm font-medium opacity-80">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="mt-1 text-sm opacity-80">{detail}</dd>}
    </>
  );
  return (
    <div className={`${card} p-4`}>
      {to ? (
        <Link to={to} className="block hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/** Registrations per week as columns, with a hover label on each and a table for screen readers. */
function WeeklyChart({ weekly }: { weekly: Overview["weekly"] }) {
  const max = Math.max(1, ...weekly.map((week) => week.tickets));
  const total = weekly.reduce((sum, week) => sum + week.tickets, 0);
  const label = (weekOf: string) => formatWhen(`${weekOf}T00:00:00Z`, { month: "short", day: "numeric" });
  return (
    <figure className={card}>
      <figcaption className="font-semibold">
        Registrations by week <span className="font-normal opacity-80">· last 12 weeks · {total} in all</span>
      </figcaption>
      <div aria-hidden="true" className="mt-4 flex h-40 items-end gap-0.5 border-b border-[#C9DADC] dark:border-[#3A5359]">
        {weekly.map((week) => (
          <div key={week.weekOf} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-8 rounded-t bg-[#2E6B78] group-hover:bg-[#15383F] dark:bg-[#8CC7D3] dark:group-hover:bg-[#C4E4EA]"
              style={{ height: week.tickets ? `${(week.tickets / max) * 100}%` : "2px", opacity: week.tickets ? 1 : 0.35 }}
            />
            <div className="pointer-events-none absolute bottom-full mb-1 hidden rounded bg-[#15383F] px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block dark:bg-[#E3EEF0] dark:text-[#15383F]">
              Week of {label(week.weekOf)}: {week.tickets}
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-xs opacity-80">
        <span>{label(weekly[0]!.weekOf)}</span>
        <span>This week</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-semibold">Week of</th>
              <th className="py-1 text-right font-semibold">Registrations</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((week) => (
              <tr key={week.weekOf} className="border-t border-[#E2E8E9] dark:border-[#24363B]">
                <td className="py-1">{label(week.weekOf)}</td>
                <td className="py-1 text-right tabular-nums">{week.tickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
