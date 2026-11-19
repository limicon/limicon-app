/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import type { Db } from "./db.server";
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
      // A transaction runs the same tagged-template queries as the client getMembership expects.
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

async function newAccount(tx: Db) {
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${`member-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  return user!.id;
}

async function currentEditionId(tx: Db) {
  const [edition] = await tx<{ id: number }[]>`select id from public.editions order by year desc limit 1`;
  return edition!.id;
}

describe("getMembership", () => {
  test("a visitor is signed out, and learns the current edition's year", async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx`insert into public.editions (year, starts_on, ends_on) values (2098, '2098-03-08', '2098-04-04')`;
      expect(await getMembership(tx, null)).toEqual({
        status: "signed-out",
        isAdmin: false,
        edition: { id: expect.any(Number), year: 2098, firstDay: "2098-03-08", lastDay: "2098-04-04" },
      });
    });
  });

  test("a new account needs a ticket", async () => {
    await inRolledBackTransaction(async (tx) => {
      const userId = await newAccount(tx);
      expect((await getMembership(tx, userId)).status).toBe("needs-ticket");
    });
  });

  test("a paid or comp ticket for the current edition opens the Members area", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await currentEditionId(tx);
      for (const status of ["paid", "comp"]) {
        const userId = await newAccount(tx);
        await tx`insert into public.tickets (profile_id, edition_id, status) values (${userId}, ${editionId}, ${status})`;
        expect((await getMembership(tx, userId)).status).toBe("member");
      }
    });
  });

  test("a refunded ticket, or one for an earlier edition, doesn't", async () => {
    await inRolledBackTransaction(async (tx) => {
      const refunded = await newAccount(tx);
      await tx`insert into public.tickets (profile_id, edition_id, status) values (${refunded}, ${await currentEditionId(tx)}, 'refunded')`;

      const alumnus = await newAccount(tx);
      const [past] = await tx<{ id: number }[]>`insert into public.editions (year) values (1999) returning id`;
      await tx`insert into public.tickets (profile_id, edition_id, status) values (${alumnus}, ${past!.id}, 'paid')`;

      expect((await getMembership(tx, refunded)).status).toBe("needs-ticket");
      expect((await getMembership(tx, alumnus)).status).toBe("needs-ticket");
    });
  });

  test("an admin is a member without a ticket", async () => {
    await inRolledBackTransaction(async (tx) => {
      const userId = await newAccount(tx);
      await tx`insert into public.admin_permissions (profile_id, permission) values (${userId}, 'full')`;
      expect(await getMembership(tx, userId)).toMatchObject({ status: "member", isAdmin: true });
    });
  });
});
