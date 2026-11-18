import { Form, Link, useSearchParams } from "react-router";

import { Badge, formatWhen, inputClass, PageHeading, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { ADMIN_PERMISSIONS } from "~/lib/admin-forms";
import { ACCOUNT_FILTERS, readUserFilters, ROLE_FILTERS, TICKET_FILTERS, USER_SORTS, USERS_PER_PAGE } from "~/lib/admin-users";
import { listUsers } from "~/lib/admin-users.server";
import type { UserRow } from "~/lib/admin-users.server";
import type { Route } from "./+types/users";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Users · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const filters = readUserFilters(new URL(request.url).searchParams);
  if (!edition) return { year: null, filters, users: [], total: 0 };
  const { users, total } = await listUsers(services.db(), edition.id, filters);
  return { year: edition.year, filters, users, total };
}

const statusBadge = {
  paid: { tone: "green", label: "Paid" },
  comp: { tone: "blue", label: "Comp" },
  refunded: { tone: "gray", label: "Refunded" },
} as const;

/** Every account, with its ticket for this edition and its roles, searchable and filterable. */
export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { users, total, filters, year } = loaderData;
  const [params] = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
  const pageLink = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `?${next}`;
  };
  const csv = new URLSearchParams(params);
  csv.delete("page");

  return (
    <>
      <PageHeading title="Users">
        <p>
          Everyone with an account: when they joined, their Limicon {year ?? ""} ticket, and their roles. Open someone to
          change their name, roles or account, or to keep notes.
        </p>
      </PageHeading>

      <Form method="get" role="search" className="mb-5 flex max-w-5xl flex-wrap items-end gap-3" key={params.toString()}>
        <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
          <label htmlFor="q" className="block text-sm font-medium">Name or email</label>
          <input id="q" name="q" type="search" defaultValue={filters.q} className={`${inputClass} mt-1`} />
        </div>
        <Select name="ticket" label="Ticket" options={TICKET_FILTERS} value={filters.ticket} />
        <Select name="role" label="Role" options={ROLE_FILTERS} value={filters.role} />
        <Select name="account" label="Account" options={ACCOUNT_FILTERS} value={filters.account} />
        <Select name="sort" label="Sort" options={USER_SORTS} value={filters.sort} />
        <div className="flex items-end gap-2">
          <button type="submit" className={secondaryButton}>Filter</button>
          <Link to="/admin/users" className="px-1 py-1.5 text-sm underline">Clear</Link>
        </div>
      </Form>

      <div className="mb-3 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm" role="status">
          {total} {total === 1 ? "person" : "people"}
          {pages > 1 ? ` · page ${filters.page} of ${pages}` : ""}
        </p>
        <a href={`/admin/users.csv?${csv}`} className={secondaryButton} download>Download CSV</a>
      </div>

      {users.length === 0 ? (
        <p>Nobody matches.</p>
      ) : (
        <div className="max-w-5xl overflow-x-auto rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#EEF3F3] dark:bg-[#16262A]">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Person</th>
                <th scope="col" className="px-3 py-2 font-semibold">Ticket</th>
                <th scope="col" className="px-3 py-2 font-semibold">Roles</th>
                <th scope="col" className="px-3 py-2 font-semibold">Joined</th>
                <th scope="col" className="px-3 py-2 font-semibold">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-[#E2E8E9] dark:border-[#24363B]">
                  <td className="px-3 py-2">
                    <Link to={`/admin/users/${user.id}`} className="font-semibold underline">
                      {user.name ?? user.email ?? "Unknown"}
                    </Link>
                    {user.name && <span className="block break-all opacity-80">{user.email}</span>}
                    {user.deactivatedAt && <Badge tone="gray">Deactivated</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    {user.ticketStatus ? (
                      <>
                        <Badge tone={statusBadge[user.ticketStatus].tone}>{statusBadge[user.ticketStatus].label}</Badge>
                        {user.tier && <span className="ml-1 opacity-80">{user.tier}</span>}
                      </>
                    ) : (
                      <span className="opacity-60">None</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><Roles user={user} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatWhen(user.joinedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{user.lastSignInAt ? formatWhen(user.lastSignInAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex max-w-5xl items-center gap-3 text-sm">
          {filters.page > 1 && <Link to={pageLink(filters.page - 1)} className="underline">Previous</Link>}
          {filters.page < pages && <Link to={pageLink(filters.page + 1)} className="underline">Next</Link>}
        </nav>
      )}
    </>
  );
}

function Roles({ user }: { user: UserRow }) {
  const roles = [
    ...user.permissions.map((p) => `Admin: ${ADMIN_PERMISSIONS.find((a) => a.value === p)?.label ?? p}`),
    ...(user.hostedSessions ? [`Host (${user.hostedSessions})`] : []),
  ];
  if (!roles.length) return <span className="opacity-60">Member</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} tone={role.startsWith("Admin") ? "amber" : "gray"}>{role}</Badge>
      ))}
    </span>
  );
}

function Select<T extends readonly { value: string; label: string }[]>({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: T;
  value: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <select id={name} name={name} defaultValue={value} className={`${inputClass} mt-1`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
