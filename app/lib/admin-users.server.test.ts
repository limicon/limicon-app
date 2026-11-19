/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import { listMemberLinks, saveMemberLinks } from "./admin.server";
import { readUserFilters } from "./admin-users";
import { setUserRoles } from "./admin-roles.server";
import { addUserNote, deleteUserNote, getUser, listUsers, setDeactivated } from "./admin-users.server";
import type { Db } from "./db.server";
import { addFaq, listAllFaq, listPublishedFaq, moveFaq } from "./faq.server";
import { getMembership } from "./membership.server";

// Runs against the local Supabase database from `npm run db:start`.
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

/** Runs `work` in a transaction that is always rolled back, so tests leave no rows behind. */
async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

/** A tag only this test run's accounts carry, so searches ignore everyone else in the database. */
const tag = `t${crypto.randomUUID().slice(0, 8)}`;

async function newAccount(tx: Db, firstName: string) {
  const email = `${tag}-${firstName.toLowerCase()}@example.org`;
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated', ${tx.json({ given_name: firstName })})
    returning id
  `;
  return user!.id;
}

async function newEdition(tx: Db) {
  const [edition] = await tx<{ id: string }[]>`insert into public.editions (year) values (2099) returning id`;
  return Number(edition!.id);
}

const filters = (query: Record<string, string>) => readUserFilters(new URLSearchParams({ q: tag, ...query }));

describe("listUsers", () => {
  test("filters by ticket, role and account, and searches by email", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await newEdition(tx);
      const ada = await newAccount(tx, "Ada");
      const bo = await newAccount(tx, "Bo");
      const cy = await newAccount(tx, "Cy");
      await tx`insert into public.tickets (profile_id, edition_id, status) values (${ada}, ${editionId}, 'paid')`;
      await setUserRoles(tx, bo, ["full"], ada);
      await setDeactivated(tx, cy, true);

      const names = async (query: Record<string, string>) =>
        (await listUsers(tx, editionId, filters({ sort: "name", ...query }))).users.map((u) => u.name);

      expect(await names({})).toEqual(["Ada", "Bo"]);
      expect(await names({ ticket: "paid" })).toEqual(["Ada"]);
      expect(await names({ ticket: "none" })).toEqual(["Bo"]);
      expect(await names({ role: "admin" })).toEqual(["Bo"]);
      expect(await names({ account: "deactivated" })).toEqual(["Cy"]);
      expect(await names({ account: "all" })).toEqual(["Ada", "Bo", "Cy"]);
      expect((await listUsers(tx, editionId, filters({ account: "all" }))).total).toBe(3);

      const [row] = (await listUsers(tx, editionId, filters({ role: "admin" }))).users;
      expect(row).toMatchObject({ permissions: ["full"], ticketStatus: null, hostedSessions: 0 });
    });
  });
});

describe("one user", () => {
  test("shows tickets, roles and notes; only a note's author deletes it", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await newEdition(tx);
      const ada = await newAccount(tx, "Ada");
      const bo = await newAccount(tx, "Bo");
      await tx`insert into public.tickets (profile_id, edition_id, status) values (${ada}, ${editionId}, 'comp')`;
      await setUserRoles(tx, ada, ["full"], bo);
      await addUserNote(tx, ada, bo, "Asked about a refund");

      const user = await getUser(tx, ada, editionId);
      expect(user).toMatchObject({
        firstName: "Ada",
        tickets: [{ year: 2099, status: "comp" }],
        permissions: [{ permission: "full", grantedBy: "Bo" }],
        notes: [{ body: "Asked about a refund", author: "Bo" }],
      });
      const noteId = user!.notes[0]!.id;
      expect(await deleteUserNote(tx, noteId, ada)).toBe(false);
      expect(await deleteUserNote(tx, noteId, bo)).toBe(true);
    });
  });

  test("a deactivated admin loses the Members area and the console", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await newAccount(tx, "Ada");
      await setUserRoles(tx, ada, ["full"], ada);
      expect(await getMembership(tx, ada)).toMatchObject({ status: "member", isAdmin: true });
      await setDeactivated(tx, ada, true);
      expect(await getMembership(tx, ada)).toMatchObject({ status: "deactivated", isAdmin: false });
      await setDeactivated(tx, ada, false);
      expect((await getMembership(tx, ada)).status).toBe("member");
    });
  });
});

test("member links save in the order given, replacing the old ones", async () => {
  await inRolledBackTransaction(async (tx) => {
    const editionId = await newEdition(tx);
    await saveMemberLinks(tx, editionId, [{ label: "Miro", url: "https://miro.com/" }]);
    await saveMemberLinks(tx, editionId, [
      { label: "Castalia", url: "https://castalia.app/" },
      { label: "Miro", url: "https://miro.com/board" },
    ]);
    expect(await listMemberLinks(tx, editionId)).toEqual([
      { label: "Castalia", url: "https://castalia.app/" },
      { label: "Miro", url: "https://miro.com/board" },
    ]);
  });
});

test("the public FAQ shows only published entries, in the order admins set", async () => {
  await inRolledBackTransaction(async (tx) => {
    await tx`delete from public.faq_entries`;
    const by = await newAccount(tx, "Ada");
    await addFaq(tx, { question: "First?", answer: "Yes.", published: true }, by);
    await addFaq(tx, { question: "Draft?", answer: "Not yet.", published: false }, by);
    await addFaq(tx, { question: "Third?", answer: "Yes.", published: true }, by);

    expect((await listPublishedFaq(tx)).map((e) => e.question)).toEqual(["First?", "Third?"]);
    const third = (await listAllFaq(tx)).find((e) => e.question === "Third?")!;
    await moveFaq(tx, third.id, -1);
    await moveFaq(tx, third.id, -1);
    await moveFaq(tx, third.id, -1); // already first: no change
    expect((await listAllFaq(tx)).map((e) => e.question)).toEqual(["Third?", "First?", "Draft?"]);
    expect((await listAllFaq(tx))[0]!.updatedBy).toBe("Ada");
  });
});
