import { Form, Link, useSearchParams } from "react-router";

import { card, inputClass, PageHeading, secondaryButton } from "~/components/admin-ui";
import { DownloadPanel, SortHeading } from "~/components/download-panel";
import { servicesContext } from "~/context";
import { GUEST_COLUMNS, readGuestFilters, sortLink } from "~/lib/admin-tables";
import { countGuests, listGuests } from "~/lib/orders.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/guests";

/** Needs the `people` privilege (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("people")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Guests · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const filters = readGuestFilters(new URL(request.url).searchParams);
  if (!edition) return { year: null, filters, guests: [], total: 0 };
  const db = services.db();
  const [guests, total] = await Promise.all([listGuests(db, edition.id, filters), countGuests(db, edition.id)]);
  return { year: edition.year, filters, guests, total };
}

/** Everyone with a paid or comp ticket for the edition: the guest list. */
export default function AdminGuests({ loaderData }: Route.ComponentProps) {
  const { guests, total, filters, year } = loaderData;
  const [params] = useSearchParams();
  const byLast = filters.sort === "last";
  const switchSort = new URLSearchParams(params);
  switchSort.set("sort", byLast ? "first" : "last");
  switchSort.set("dir", "asc");

  return (
    <>
      <PageHeading title="Guests">
        <p>Everyone holding a Limicon {year ?? ""} ticket, paid or comped.</p>
      </PageHeading>

      <dl className="mb-6 max-w-xs">
        <div className={`${card} p-4`}>
          <dt className="text-sm font-medium opacity-80">Guests</dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums">{total}</dd>
        </div>
      </dl>

      <div className="mb-4 flex max-w-5xl flex-wrap items-end justify-between gap-3">
        <Form method="get" role="search" className="flex flex-wrap items-end gap-3" key={params.toString()}>
          {byLast && <input type="hidden" name="sort" value="last" />}
          <div>
            <label htmlFor="q" className="block text-sm font-medium">Name or email</label>
            <input id="q" name="q" type="search" defaultValue={filters.q} className={`${inputClass} mt-1 w-60`} />
          </div>
          <button type="submit" className={secondaryButton}>Search</button>
          {filters.q && <Link to={byLast ? "?sort=last" : "/admin/guests"} className="py-1.5 text-sm underline">Clear</Link>}
        </Form>
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`?${switchSort}`} className="text-sm underline">
            Alphabetize by {byLast ? "first" : "last"} name
          </Link>
          <DownloadPanel action="/admin/guests.csv" columns={GUEST_COLUMNS} params={params} what="the guest list" />
        </div>
      </div>

      <p className="mb-2 text-sm" role="status">
        {guests.length === total ? `${total} guests` : `${guests.length} of ${total} guests`}, by {byLast ? "last" : "first"} name
      </p>
      {guests.length === 0 ? (
        <p>{filters.q ? "Nobody matches." : "No guests yet."}</p>
      ) : (
        <div className="max-w-5xl overflow-x-auto rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#EEF3F3] dark:bg-[#16262A]">
              <tr>
                <SortHeading
                  label={byLast ? "Name (last, first)" : "Name"}
                  href={sortLink(params, filters.sort, filters)}
                  active
                  dir={filters.dir}
                />
                <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                <th scope="col" className="px-3 py-2 font-semibold">Address</th>
                <th scope="col" className="px-3 py-2 font-semibold">Profile</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => {
                const name = byLast
                  ? [g.lastName, g.firstName].filter(Boolean).join(", ")
                  : [g.firstName, g.lastName].filter(Boolean).join(" ");
                return (
                  <tr key={g.profileId} className="border-t border-[#E2E8E9] align-top dark:border-[#24363B]">
                    <td className="px-3 py-2 font-semibold">{name || <span className="font-normal opacity-60">No name</span>}</td>
                    <td className="px-3 py-2 break-all">{g.email && <a href={`mailto:${g.email}`} className="underline">{g.email}</a>}</td>
                    <td className="px-3 py-2 whitespace-pre-line">{g.address ?? <span className="opacity-60">—</span>}</td>
                    <td className="px-3 py-2"><Link to={`/admin/users/${g.profileId}`} className="underline">View profile</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
