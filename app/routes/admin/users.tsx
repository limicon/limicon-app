import { data, Form, Link, redirect, useSearchParams } from "react-router";

import { Badge, formatWhen, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { RoleBadges, RolePicker } from "~/components/role-picker";
import { servicesContext } from "~/context";
import { listRoles, setUserRoles } from "~/lib/admin-roles.server";
import { ACCOUNT_FILTERS, readUserFilters, ROLE_FILTERS, TICKET_FILTERS, USER_SORTS, USERS_PER_PAGE } from "~/lib/admin-users";
import { isUuid } from "~/lib/admin.server";
import { listUsers } from "~/lib/admin-users.server";
import type { UserRow } from "~/lib/admin-users.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/users";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Users · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const query = new URL(request.url).searchParams;
  const filters = readUserFilters(query);
  const db = services.db();
  const [roles, privileges] = await Promise.all([listRoles(db), services.privileges()]);
  const shared = {
    filters,
    roles: roles.map(({ key, name }) => ({ key, name })),
    canManageRoles: privileges.has("admin"),
    viewerId: services.viewer!.userId,
    done: query.get("done"),
  };
  if (!edition) return { ...shared, year: null, users: [], total: 0 };
  const { users, total } = await listUsers(db, edition.id, filters);
  return { ...shared, year: edition.year, users, total };
}

/**
 * Sets a person's roles from the list, for admins only. Admins can give anyone Admin but remove
 * it only from themselves.
 */
export async function action({ context, request }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  if (!(await services.privileges()).has("admin")) throw data("Only admins can change roles.", { status: 403 });
  const form = await request.formData();
  const profileId = form.get("profileId");
  if (!isUuid(profileId)) throw data("Not found", { status: 404 });
  const roles = form.getAll("role").filter((r): r is string => typeof r === "string");
  const result = await setUserRoles(services.db(), profileId, roles, services.viewer!.userId);
  if (!result.ok) return data({ problem: result.problem }, { status: 409 });
  const back = new URL(request.url).searchParams;
  back.set("done", "role");
  throw redirect(`/admin/users?${back}`);
}

const statusBadge = {
  paid: { tone: "green", label: "Paid" },
  comp: { tone: "blue", label: "Comp" },
  refunded: { tone: "gray", label: "Refunded" },
} as const;

/** Every account, with its ticket for this edition and its roles, searchable and filterable. */
export default function AdminUsers({ loaderData, actionData }: Route.ComponentProps) {
  const { users, total, filters, year, roles, canManageRoles, viewerId, done } = loaderData;
  const roleFilters = [...ROLE_FILTERS, ...roles.map((r) => ({ value: `r:${r.key}`, label: `Role: ${r.name}` }))];
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
          change their name or account, or to keep notes.
          {canManageRoles && " Change someone's roles with Change in the Roles column; a person can hold several."}
        </p>
      </PageHeading>
      {canManageRoles && (
        <div className="mb-5 flex flex-wrap gap-3">
          <Link to="/admin/roles/new" className={primaryButton}>+ Add role</Link>
          <Link to="/admin/roles" className={secondaryButton}>See and edit roles</Link>
        </div>
      )}
      {done === "role" && !actionData && <Notice>Roles saved. They apply the next time the person opens a page.</Notice>}
      {actionData?.problem && <Notice tone="problem">{actionData.problem}</Notice>}

      <Form method="get" role="search" className="mb-5 flex max-w-5xl flex-wrap items-end gap-3" key={params.toString()}>
        <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
          <label htmlFor="q" className="block text-sm font-medium">Name or email</label>
          <input id="q" name="q" type="search" defaultValue={filters.q} className={`${inputClass} mt-1`} />
        </div>
        <Select name="ticket" label="Ticket" options={TICKET_FILTERS} value={filters.ticket} />
        <Select name="role" label="Role" options={roleFilters} value={filters.role} />
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
                  <td className="px-3 py-2">
                    {canManageRoles ? (
                      <RolePicker profileId={user.id} current={user.permissions} roles={roles} isSelf={user.id === viewerId} compact />
                    ) : (
                      <RoleBadges current={user.permissions} roles={roles} />
                    )}
                    {user.hostedSessions > 0 && <span className="mt-1 block"><Badge tone="gray">Host ({user.hostedSessions})</Badge></span>}
                  </td>
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
