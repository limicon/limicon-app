import { Link } from "react-router";

import { card, formatWhen, PageHeading } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { formatDollars } from "~/lib/admin-forms";
import { getOverview, type Overview } from "~/lib/admin.server";
import type { Route } from "./+types/overview";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Overview · Admin · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) return { year: null, overview: null };
  return { year: edition.year, overview: await getOverview(services.db(), edition.id) };
}

/** The console's front page: how registration and hosting are going for the current edition. */
export default function AdminOverview({ loaderData }: Route.ComponentProps) {
  const { overview, year } = loaderData;
  if (!overview) {
    return (
      <PageHeading title="Overview">
        <p>No Limicon edition is set up yet.</p>
      </PageHeading>
    );
  }
  const active = overview.tickets.paid + overview.tickets.comp;
  return (
    <>
      <PageHeading title="Overview">
        <p>How Limicon {year} is going. Ticket and session numbers count this edition only.</p>
      </PageHeading>

      <section aria-labelledby="registration-heading">
        <h2 id="registration-heading" className="text-xl font-semibold">Registration</h2>
        <dl className="mt-3 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ticket holders" value={active} detail={`${overview.tickets.paid} paid · ${overview.tickets.comp} comp`} to="/admin/tickets" />
          <Stat label="Ticket revenue" value={formatDollars(overview.revenueCents)} detail={overview.tickets.refunded ? `${overview.tickets.refunded} refunded` : "Before Stripe fees"} />
          <Stat label="Accounts" value={overview.accounts} detail={`${overview.newAccountsThisWeek} new in the last 7 days`} />
          <Stat label="Admins" value={overview.admins} detail={overview.pendingInvitations ? `${overview.pendingInvitations} invited, not yet signed in` : "No invitations waiting"} to="/admin/team" />
        </dl>
        <div className="mt-4 grid max-w-5xl gap-4 lg:grid-cols-[3fr_2fr]">
          <WeeklyChart weekly={overview.weekly} />
          <TierBreakdown byTier={overview.byTier} />
        </div>
      </section>

      <section aria-labelledby="sessions-heading" className="mt-10">
        <h2 id="sessions-heading" className="text-xl font-semibold">Sessions</h2>
        <dl className="mt-3 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="On the calendar" value={overview.sessions.published} to="/admin/sessions?show=published" />
          <Stat label="Drafts" value={overview.sessions.drafts} to="/admin/sessions?show=drafts" />
          <Stat label="Hosts" value={overview.sessions.hosts} detail={`${overview.guidelineAcceptances} accepted the guidelines`} />
          <Stat label="Co-creation meetings" value={overview.sessions.cocreation} to="/admin/sessions?show=cocreation" />
        </dl>
      </section>
    </>
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

function TierBreakdown({ byTier }: { byTier: Overview["byTier"] }) {
  const max = Math.max(1, ...byTier.map((tier) => tier.tickets));
  return (
    <figure className={card}>
      <figcaption className="font-semibold">Ticket holders by tier</figcaption>
      {byTier.length === 0 ? (
        <p className="mt-3 text-sm">No tickets yet.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="sr-only">
            <tr>
              <th>Tier</th>
              <th>Tickets</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byTier.map((tier) => (
              <tr key={tier.name}>
                <th scope="row" className="py-1.5 pr-3 font-medium whitespace-nowrap">{tier.name}</th>
                <td className="w-full py-1.5">
                  <div className="flex items-center gap-2">
                    <div aria-hidden="true" className="h-3 rounded-r bg-[#2E6B78] dark:bg-[#8CC7D3]" style={{ width: `${(tier.tickets / max) * 100}%`, minWidth: "2px" }} />
                    <span className="tabular-nums">{tier.tickets}</span>
                  </div>
                </td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap tabular-nums opacity-80">{formatDollars(tier.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
