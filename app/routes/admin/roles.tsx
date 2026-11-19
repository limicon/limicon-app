import { Link } from "react-router";

import { Badge, card, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { PRIVILEGES } from "~/lib/admin-roles";
import { listRoles } from "~/lib/admin-roles.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/roles";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Roles · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const roles = await listRoles(context.get(servicesContext).db());
  return { roles, done: new URL(request.url).searchParams.get("done") };
}

const doneMessages: Record<string, string> = {
  created: "Role added. Give it to people on the Users page.",
  saved: "Role saved. Everyone who holds it has the new privileges now.",
  deleted: "Role deleted.",
};

/** The admin roles and what each may do. */
export default function AdminRoles({ loaderData }: Route.ComponentProps) {
  const { roles, done } = loaderData;
  return (
    <>
      <PageHeading title="Roles">
        <p>
          A role is a set of things an admin may do. Each admin holds one role; change who holds which on the{" "}
          <Link to="/admin/users?role=admin" className="underline">Users</Link> page.
        </p>
      </PageHeading>
      {done && doneMessages[done] && <Notice>{doneMessages[done]}</Notice>}
      <p className="mb-6">
        <Link to="/admin/roles/new" className={primaryButton}>+ Add role</Link>
      </p>
      <ul className="grid max-w-4xl gap-3">
        {roles.map((role) => (
          <li key={role.key} className={`${card} grid gap-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-semibold">{role.name}</h2>
              {role.builtIn && <Badge tone="blue">Built in: can do everything</Badge>}
              <span className="text-sm opacity-80">{role.holders} {role.holders === 1 ? "person" : "people"}</span>
              {!role.builtIn && <Link to={`/admin/roles/${role.key}`} className={secondaryButton}>Edit</Link>}
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {PRIVILEGES.filter((p) => role.privileges.includes(p.key)).map((p) => (
                <li key={p.key}><Badge tone="gray">{p.label}</Badge></li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
