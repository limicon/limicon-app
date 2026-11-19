/**
 * Admin roles in the database: listing and saving them, giving people roles, and reading what a
 * person may do. Callers that change roles check the viewer is an admin.
 */
import { ADMIN_ROLE, ALL_PRIVILEGES, checkRoleChange, isPrivilege, roleKeyFromName, type Privilege, type Role } from "~/lib/admin-roles";
import type { Db } from "~/lib/db.server";

type RoleRow = { key: string; name: string; privileges: string[]; builtIn: boolean; holders: number };

function toRole(row: RoleRow): Role {
  return {
    ...row,
    privileges: row.key === ADMIN_ROLE ? [...ALL_PRIVILEGES] : row.privileges.filter((p) => isPrivilege(p) && p !== "admin") as Privilege[],
  };
}

/** Every role, Admin first, with how many people hold each. */
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

/** What the person may do in the console: every privilege their roles give, added together. */
export async function getPrivileges(sql: Db, userId: string): Promise<Set<Privilege>> {
  const rows = await sql<RoleRow[]>`
    select r.key, r.name, r.privileges, r.built_in as "builtIn", 0 as holders
    from public.admin_permissions a join public.admin_roles r on r.key = a.permission
    where a.profile_id = ${userId}
  `;
  return new Set(rows.flatMap((row) => toRole(row).privileges));
}

/** The keys of the roles a person holds. */
export async function getUserRoles(sql: Db, profileId: string): Promise<string[]> {
  const rows = await sql<{ permission: string }[]>`select permission from public.admin_permissions where profile_id = ${profileId}`;
  return rows.map((r) => r.permission);
}

/** Creates a role, or returns "duplicate" when another role has the name. */
export async function createRole(sql: Db, name: string, privileges: Privilege[]): Promise<{ key: string } | "duplicate"> {
  const existing = await sql<{ key: string; name: string }[]>`select key, name from public.admin_roles`;
  if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  const key = roleKeyFromName(name, new Set(existing.map((r) => r.key)));
  await sql`insert into public.admin_roles (key, name, privileges) values (${key}, ${name}, ${privileges}::text[])`;
  return { key };
}

/** Renames a role or changes what it may do. The built-in Admin role can't change. */
export async function updateRole(sql: Db, key: string, name: string, privileges: Privilege[]): Promise<"saved" | "duplicate" | "built-in"> {
  if (key === ADMIN_ROLE) return "built-in";
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
 * Sets the roles a person holds to `roleKeys`, adding and removing as needed, for the admin `by`.
 * Admins may give anyone Admin, but only take it from themselves while another admin remains
 * (`checkRoleChange`). Unknown role keys are ignored.
 */
export async function setUserRoles(sql: Db, profileId: string, roleKeys: string[], by: string): Promise<{ ok: true } | { ok: false; problem: string }> {
  return sql.begin(async (tx) => {
    const known = new Set((await tx<{ key: string }[]>`select key from public.admin_roles`).map((r) => r.key));
    const next = [...new Set(roleKeys.filter((k) => known.has(k)))];
    const current = (await tx<{ permission: string }[]>`
      select permission from public.admin_permissions where profile_id = ${profileId} for update
    `).map((r) => r.permission);
    const [row] = await tx<{ others: number }[]>`
      select count(*)::int as others from public.admin_permissions where permission = ${ADMIN_ROLE} and profile_id <> ${profileId}
    `;
    const others = row?.others ?? 0;
    const check = checkRoleChange({ current, next, isSelf: profileId === by, otherAdmins: others });
    if (!check.ok) return check;
    await tx`delete from public.admin_permissions where profile_id = ${profileId} and permission <> all(${next})`;
    for (const key of next.filter((k) => !current.includes(k))) {
      await tx`insert into public.admin_permissions (profile_id, permission, granted_by) values (${profileId}, ${key}, ${by})`;
    }
    return { ok: true as const };
  }) as Promise<{ ok: true } | { ok: false; problem: string }>;
}

/** The names of the roles a person holds, Admin first, for showing beside their name. */
export async function getRoleNames(sql: Db, profileId: string): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select r.name from public.admin_permissions a join public.admin_roles r on r.key = a.permission
    where a.profile_id = ${profileId}
    order by r.built_in desc, lower(r.name)
  `;
  return rows.map((r) => r.name);
}
