/**
 * Admin roles in the database: listing and saving them, giving people roles, and reading what a
 * person may do. Callers that change roles check the viewer has the `roles` privilege.
 */
import { ALL_PRIVILEGES, FULL_ROLE, isPrivilege, roleKeyFromName, type Privilege, type Role } from "~/lib/admin-roles";
import type { Db } from "~/lib/db.server";

type RoleRow = { key: string; name: string; privileges: string[]; builtIn: boolean; holders: number };

function toRole(row: RoleRow): Role {
  return {
    ...row,
    privileges: row.builtIn && row.key === FULL_ROLE ? [...ALL_PRIVILEGES] : row.privileges.filter(isPrivilege),
  };
}

/** Every role, Full access first, with how many people hold each. */
export async function listRoles(sql: Db): Promise<Role[]> {
  const rows = await sql<RoleRow[]>`
    select r.key, r.name, r.privileges, r.built_in as "builtIn",
           (select count(*) from public.admin_permissions a where a.permission = r.key)::int as holders
    from public.admin_roles r
    order by r.built_in desc, lower(r.name)
  `;
  return rows.map(toRole);
}

export async function getRole(sql: Db, key: string): Promise<Role | null> {
  return (await listRoles(sql)).find((r) => r.key === key) ?? null;
}

/** What the person may do in the console: their role's privileges, or nothing. */
export async function getPrivileges(sql: Db, userId: string): Promise<Set<Privilege>> {
  const [row] = await sql<RoleRow[]>`
    select r.key, r.name, r.privileges, r.built_in as "builtIn", 0 as holders
    from public.admin_permissions a join public.admin_roles r on r.key = a.permission
    where a.profile_id = ${userId}
    limit 1
  `;
  return new Set(row ? toRole(row).privileges : []);
}

/** Creates a role, or returns "duplicate" when another role has the name. */
export async function createRole(sql: Db, name: string, privileges: Privilege[]): Promise<{ key: string } | "duplicate"> {
  const existing = await sql<{ key: string; name: string }[]>`select key, name from public.admin_roles`;
  if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  const key = roleKeyFromName(name, new Set(existing.map((r) => r.key)));
  await sql`insert into public.admin_roles (key, name, privileges) values (${key}, ${name}, ${privileges}::text[])`;
  return { key };
}

/** Renames a role or changes what it may do. The built-in Full access role can't change. */
export async function updateRole(sql: Db, key: string, name: string, privileges: Privilege[]): Promise<"saved" | "duplicate" | "built-in"> {
  if (key === FULL_ROLE) return "built-in";
  const clash = await sql`select 1 from public.admin_roles where lower(name) = lower(${name}) and key <> ${key}`;
  if (clash.length) return "duplicate";
  await sql`update public.admin_roles set name = ${name}, privileges = ${privileges}::text[] where key = ${key} and not built_in`;
  return "saved";
}

/** Deletes a role nobody holds or is invited to. Returns false otherwise. */
export async function deleteRole(sql: Db, key: string): Promise<boolean> {
  const rows = await sql`
    delete from public.admin_roles r
    where r.key = ${key} and not r.built_in
      and not exists (select 1 from public.admin_permissions a where a.permission = r.key)
      and not exists (select 1 from public.admin_invitations i where i.permission = r.key)
    returning key
  `;
  return rows.length > 0;
}

/**
 * Gives a person a role, replacing any they held, or takes their role away (`roleKey` null).
 * Callers stop admins changing their own role, so nobody locks themselves out.
 */
export async function setUserRole(sql: Db, profileId: string, roleKey: string | null, by: string) {
  await sql.begin(async (tx) => {
    await tx`delete from public.admin_permissions where profile_id = ${profileId}`;
    if (roleKey) {
      await tx`insert into public.admin_permissions (profile_id, permission, granted_by) values (${profileId}, ${roleKey}, ${by})`;
    }
  });
}
