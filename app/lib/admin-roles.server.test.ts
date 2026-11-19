/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import { ALL_PRIVILEGES, checkRoleForm, roleKeyFromName } from "./admin-roles";
import { createRole, deleteRole, getPrivileges, listRoles, setUserRole, updateRole } from "./admin-roles.server";
import type { Db } from "./db.server";
import { getMembership } from "./membership.server";

// Runs against the local Supabase database from `npm run db:start`.
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
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
  test("a new role gives exactly its privileges, and one role replaces another", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      const bo = await account(tx);
      const created = await createRole(tx, "Site editor", ["website"]);
      expect(created).toEqual({ key: "site_editor" });
      expect(await createRole(tx, "site EDITOR", ["people"])).toBe("duplicate");

      await setUserRole(tx, bo, "site_editor", ada);
      expect([...(await getPrivileges(tx, bo))]).toEqual(["website"]);
      expect(await getMembership(tx, bo)).toMatchObject({ isAdmin: true, status: "member" });

      await setUserRole(tx, bo, "full", ada);
      expect([...(await getPrivileges(tx, bo))].sort()).toEqual([...ALL_PRIVILEGES].sort());
      await setUserRole(tx, bo, null, ada);
      expect((await getPrivileges(tx, bo)).size).toBe(0);
      expect((await getMembership(tx, bo)).isAdmin).toBe(false);
    });
  });

  test("a role changes for everyone holding it, can't be deleted while held, and Full access is fixed", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      await createRole(tx, "Registration team", ["settings", "orders"]);
      await setUserRole(tx, ada, "registration_team", ada);

      expect(await updateRole(tx, "registration_team", "Registration desk", ["orders"])).toBe("saved");
      expect([...(await getPrivileges(tx, ada))]).toEqual(["orders"]);
      expect(await updateRole(tx, "full", "Everything", ["orders"])).toBe("built-in");

      expect(await deleteRole(tx, "registration_team")).toBe(false);
      await setUserRole(tx, ada, null, ada);
      expect(await deleteRole(tx, "registration_team")).toBe(true);
      expect(await deleteRole(tx, "full")).toBe(false);
      expect((await listRoles(tx)).map((r) => r.key)).toContain("full");
    });
  });
});

test("checkRoleForm needs a name and at least one known privilege", () => {
  const form = (fields: Record<string, string | string[]>) => ({
    get: (n: string) => (Array.isArray(fields[n]) ? fields[n]![0] : (fields[n] ?? null)),
    getAll: (n: string) => (fields[n] === undefined ? [] : Array.isArray(fields[n]) ? fields[n] : [fields[n]]),
  });
  expect(checkRoleForm(form({ name: " Greeters ", privilege: ["people", "made-up"] }))).toEqual({ ok: true, name: "Greeters", privileges: ["people"] });
  expect(checkRoleForm(form({ name: "", privilege: [] }))).toMatchObject({ ok: false, errors: { name: expect.any(String), privileges: expect.any(String) } });
});

test("roleKeyFromName makes a unique key", () => {
  expect(roleKeyFromName("Site editor", new Set())).toBe("site_editor");
  expect(roleKeyFromName("Site editor", new Set(["site_editor"]))).toBe("site_editor_2");
});
