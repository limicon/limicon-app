/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import type { Db } from "./db.server";
import { cancelRsvp, getRsvpSummary, rsvp } from "./rsvps.server";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, fetch_types: false, onnotice: () => {} },
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
    values (gen_random_uuid(), ${`r-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  return user!.id;
}

async function session(tx: Db, opts: { capacity?: number; waitlist?: boolean; published?: boolean; past?: boolean } = {}) {
  // One test edition, shared by every session a test makes.
  const [edition] = await tx<{ id: number }[]>`
    insert into public.editions (year) values (2098)
    on conflict (year) do update set year = excluded.year
    returning id
  `;
  const startsAt = opts.past ? "2001-01-01T12:00:00Z" : "2099-03-17T12:00:00Z";
  const [row] = await tx<{ id: string }[]>`
    insert into public.sessions (edition_id, title, theme, session_types, starts_at, ends_at, time_zone, published, max_participants, waitlist_enabled)
    values (${edition!.id}, 'RSVP test', 'Consciousness Exploration', '{dialog}', ${startsAt},
            ${startsAt}::timestamptz + interval '1 hour', 'UTC', ${opts.published ?? true}, ${opts.capacity ?? null}, ${opts.waitlist ?? false})
    returning id
  `;
  return row!.id;
}

describe("rsvp", () => {
  test("registers a member once, and counts them", async () => {
    await inRolledBackTransaction(async (tx) => {
      const [sessionId, member] = [await session(tx), await account(tx)];
      expect(await rsvp(tx, { sessionId, userId: member })).toBe("registered");
      expect(await rsvp(tx, { sessionId, userId: member })).toBe("registered");
      expect(await getRsvpSummary(tx, sessionId, member)).toMatchObject({ registered: 1, mine: "registered" });
    });
  });

  test("a full session waitlists when the host keeps a waitlist, and refuses otherwise", async () => {
    await inRolledBackTransaction(async (tx) => {
      const withWaitlist = await session(tx, { capacity: 1, waitlist: true });
      const without = await session(tx, { capacity: 1 });
      const [first, second] = [await account(tx), await account(tx)];

      expect(await rsvp(tx, { sessionId: withWaitlist, userId: first })).toBe("registered");
      expect(await rsvp(tx, { sessionId: withWaitlist, userId: second })).toBe("waitlisted");
      expect(await rsvp(tx, { sessionId: without, userId: first })).toBe("registered");
      expect(await rsvp(tx, { sessionId: without, userId: second })).toBe("full");
    });
  });

  test("refuses drafts, finished sessions and ids that aren't sessions", async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await account(tx);
      expect(await rsvp(tx, { sessionId: await session(tx, { published: false }), userId: member })).toBe("not-found");
      expect(await rsvp(tx, { sessionId: await session(tx, { past: true }), userId: member })).toBe("not-found");
      expect(await rsvp(tx, { sessionId: "nope", userId: member })).toBe("not-found");
    });
  });

  test("hosts and co-hosts are going without an RSVP", async () => {
    await inRolledBackTransaction(async (tx) => {
      const [sessionId, host] = [await session(tx, { capacity: 1 }), await account(tx)];
      await tx`insert into public.session_hosts (session_id, profile_id, role) values (${sessionId}, ${host}, 'co-host')`;
      expect(await rsvp(tx, { sessionId, userId: host })).toBe("hosting");
      expect(await getRsvpSummary(tx, sessionId, host)).toMatchObject({ registered: 0, mine: "hosting" });
    });
  });
});

describe("cancelRsvp", () => {
  test("frees the place for the earliest waitlisted member", async () => {
    await inRolledBackTransaction(async (tx) => {
      const sessionId = await session(tx, { capacity: 1, waitlist: true });
      const [first, second, third] = [await account(tx), await account(tx), await account(tx)];
      for (const userId of [first, second, third]) await rsvp(tx, { sessionId, userId });

      await cancelRsvp(tx, { sessionId, userId: first });

      expect((await getRsvpSummary(tx, sessionId, first)).mine).toBeNull();
      expect((await getRsvpSummary(tx, sessionId, second)).mine).toBe("registered");
      expect(await getRsvpSummary(tx, sessionId, third)).toMatchObject({ registered: 1, waitlisted: 1, mine: "waitlisted" });
    });
  });

  test("leaving the waitlist promotes no one", async () => {
    await inRolledBackTransaction(async (tx) => {
      const sessionId = await session(tx, { capacity: 1, waitlist: true });
      const [first, second, third] = [await account(tx), await account(tx), await account(tx)];
      for (const userId of [first, second, third]) await rsvp(tx, { sessionId, userId });

      await cancelRsvp(tx, { sessionId, userId: second });

      expect(await getRsvpSummary(tx, sessionId, third)).toMatchObject({ registered: 1, waitlisted: 1, mine: "waitlisted" });
    });
  });
});
