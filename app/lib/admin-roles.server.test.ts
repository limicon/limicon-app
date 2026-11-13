/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import { ALL_PRIVILEGES, checkRoleChange, checkRoleForm, roleKeyFromName } from "./admin-roles";
import { createRole, deleteRole, getPrivileges, getRoleNames, getUserRoles, listRoleRemovals, listRoles, setUserRoles, updateRole } from "./admin-roles.server";
import type { Db } from "./db.server";
import { getMembership } from "./membership.server";

// Runs against the local Supabase database from `npm run db:start`.
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54372/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

async function account(tx: Db) {
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${`role-test-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  return user!.id;
}

describe("roles", () => {
  test("a person can hold several roles, and their privileges add up", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      const bo = await account(tx);
      await setUserRoles(tx, ada, ["full"], ada);
      expect(await createRole(tx, "Site editor", ["website"])).toEqual({ key: "site_editor" });
      expect(await createRole(tx, "site EDITOR", ["orders"])).toBe("duplicate");

      expect(await setUserRoles(tx, bo, ["bookkeeper", "site_editor"], ada)).toEqual({ ok: true });
      expect([...(await getPrivileges(tx, bo))].sort()).toEqual(["orders", "website"]);
      expect(await getRoleNames(tx, bo)).toEqual(["Bookkeeper", "Site editor"]);
      expect(await getMembership(tx, bo)).toMatchObject({ isAdmin: true, status: "member" });

      expect(await setUserRoles(tx, bo, ["bookkeeper"], ada, "Site work is done")).toEqual({ ok: true });
      expect([...(await getPrivileges(tx, bo))]).toEqual(["orders"]);
      expect(await setUserRoles(tx, bo, [], ada, "Left the team")).toEqual({ ok: true });
      expect((await getMembership(tx, bo)).isAdmin).toBe(false);
    });
  });

  test("admins make admins, but only remove admin status from themselves while another admin remains", async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx`delete from public.admin_permissions where permission = 'full'`;
      const ada = await account(tx);
      const bo = await account(tx);
      await setUserRoles(tx, ada, ["full"], ada);
      expect(await setUserRoles(tx, ada, [], ada, "Stepping down")).toMatchObject({ ok: false, problem: expect.stringContaining("only admin") });
      expect(await setUserRoles(tx, bo, ["full", "bookkeeper"], ada)).toEqual({ ok: true });
      expect([...(await getPrivileges(tx, bo))].sort()).toEqual([...ALL_PRIVILEGES].sort());

      expect(await setUserRoles(tx, bo, ["bookkeeper"], ada, "Too many admins")).toMatchObject({ ok: false, problem: expect.stringContaining("someone else") });
      expect(await getUserRoles(tx, bo)).toContain("full");
      expect(await setUserRoles(tx, ada, [], ada, "Stepping down")).toEqual({ ok: true });
      expect(await getUserRoles(tx, ada)).toEqual([]);
    });
  });

  test("a role changes for everyone holding it, can't be deleted while held, and Admin is fixed", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      await createRole(tx, "Registration team", ["settings", "orders"]);
      await setUserRoles(tx, ada, ["registration_team"], ada);

      expect(await updateRole(tx, "registration_team", "Registration desk", ["orders"])).toBe("saved");
      expect([...(await getPrivileges(tx, ada))]).toEqual(["orders"]);
      expect(await updateRole(tx, "full", "Everything", ["orders"])).toBe("built-in");

      expect(await deleteRole(tx, "registration_team")).toBe(false);
      await setUserRoles(tx, ada, [], ada, "Desk closed");
      expect(await deleteRole(tx, "registration_team")).toBe(true);
      expect(await deleteRole(tx, "full")).toBe(false);
      expect((await listRoles(tx)).map((r) => [r.key, r.name])).toContainEqual(["full", "Admin"]);
    });
  });

  test("removing a role needs a reason, which is kept with who removed whom and when", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      const bo = await account(tx);
      await tx`update public.profiles set first_name = 'Ada' where id = ${ada}`;
      await setUserRoles(tx, ada, ["full"], ada);
      await createRole(tx, "Greeters", ["website"]);
      // Adding needs no reason.
      expect(await setUserRoles(tx, bo, ["bookkeeper", "greeters"], ada)).toEqual({ ok: true });

      // Removing without one is refused and changes nothing.
      for (const reason of [undefined, "", "   "]) {
        expect(await setUserRoles(tx, bo, ["greeters"], ada, reason)).toMatchObject({ ok: false, problem: expect.stringContaining("why") });
      }
      expect(await setUserRoles(tx, bo, ["greeters"], ada, "x".repeat(301))).toMatchObject({ ok: false });
      expect((await getUserRoles(tx, bo)).sort()).toEqual(["bookkeeper", "greeters"]);
      expect(await listRoleRemovals(tx, { profileId: bo })).toEqual([]);

      expect(await setUserRoles(tx, bo, ["greeters"], ada, "  Handed the books to Cy  ")).toEqual({ ok: true });
      expect(await getUserRoles(tx, bo)).toEqual(["greeters"]);
      // The record keeps the role's name after the role is deleted.
      await setUserRoles(tx, bo, [], ada, "Greeting is done");
      await deleteRole(tx, "greeters");

      const history = await listRoleRemovals(tx, { profileId: bo });
      expect(history.map((r) => [r.roleName, r.reason, r.removedBy])).toEqual([
        ["Greeters", "Greeting is done", "Ada"],
        ["Bookkeeper", "Handed the books to Cy", "Ada"],
      ]);
      expect(history[0]!.removedAt).toBeInstanceOf(Date);
      expect((await listRoleRemovals(tx)).slice(0, 2).map((r) => r.id)).toEqual(history.map((r) => r.id));
    });
  });
});

test("checkRoleChange asks for a reason only when a role is taken away", () => {
  const base = { isSelf: false, otherAdmins: 1 };
  expect(checkRoleChange({ ...base, current: ["bookkeeper"], next: ["bookkeeper", "full"] })).toEqual({ ok: true });
  expect(checkRoleChange({ ...base, current: ["bookkeeper"], next: [] })).toMatchObject({ ok: false });
  expect(checkRoleChange({ ...base, current: ["bookkeeper"], next: [], reason: "Left" })).toEqual({ ok: true });
  expect(checkRoleChange({ ...base, current: ["full"], next: [], reason: "Left" })).toMatchObject({ ok: false, problem: expect.stringContaining("someone else") });
});

test("checkRoleForm needs a name and at least one known privilege", () => {
  const form = (fields: Record<string, string | string[]>) => ({
    get: (n: string) => (Array.isArray(fields[n]) ? fields[n]![0] : (fields[n] ?? null)),
    getAll: (n: string) => (fields[n] === undefined ? [] : Array.isArray(fields[n]) ? fields[n] : [fields[n]]),
  });
  expect(checkRoleForm(form({ name: " Greeters ", privilege: ["website", "admin", "made-up"] }))).toEqual({ ok: true, name: "Greeters", privileges: ["website"] });
  expect(checkRoleForm(form({ name: "admin", privilege: ["orders"] }))).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  expect(checkRoleForm(form({ name: "", privilege: [] }))).toMatchObject({ ok: false, errors: { name: expect.any(String), privileges: expect.any(String) } });
});

test("roleKeyFromName makes a unique key", () => {
  expect(roleKeyFromName("Site editor", new Set())).toBe("site_editor");
  expect(roleKeyFromName("Site editor", new Set(["site_editor"]))).toBe("site_editor_2");
});
