/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import {
  addTier,
  deleteTier,
  getOverview,
  inviteAdmin,
  issueCompTicket,
  listAllSessions,
  listTeam,
  listTickets,
  listTiers,
  removeCompTicket,
  unpublishSession,
} from "./admin.server";
import type { Db } from "./db.server";

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

async function newAccount(tx: Db, firstName = "Pat") {
  const email = `admin-test-${crypto.randomUUID()}@example.org`;
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated', ${tx.json({ given_name: firstName })})
    returning id
  `;
  return { id: user!.id, email };
}

/** A fresh edition of its own, so counts don't depend on what else is in the database. */
async function newEdition(tx: Db) {
  const [edition] = await tx<{ id: string }[]>`insert into public.editions (year) values (2099) returning id`;
  return Number(edition!.id);
}

describe("comp tickets", () => {
  test("go to an existing account once, and show in the overview and the list", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await newEdition(tx);
      const pat = await newAccount(tx, "Pat");
      expect(await addTier(tx, editionId, { name: "Community", priceCents: 2500, sortOrder: 0 })).toBe("added");
      const [tier] = await listTiers(tx, editionId);

      expect(await issueCompTicket(tx, { editionId, email: pat.email, tierId: tier!.id })).toBe("issued");
      expect(await issueCompTicket(tx, { editionId, email: pat.email, tierId: null })).toBe("has-ticket");
      expect(await issueCompTicket(tx, { editionId, email: "nobody@example.org", tierId: null })).toBe("no-account");

      const overview = await getOverview(tx, editionId);
      expect(overview.tickets).toEqual({ paid: 0, comp: 1, refunded: 0 });
      expect(overview.byTier).toEqual([{ name: "Community", tickets: 1, revenueCents: 0 }]);
      expect(overview.weekly).toHaveLength(12);
      expect(overview.weekly.at(-1)!.tickets).toBe(1);

      const [ticket] = await listTickets(tx, editionId, "pat");
      expect(ticket).toMatchObject({ name: "Pat", email: pat.email, tier: "Community", status: "comp" });
      expect(await listTickets(tx, editionId, "zz-no-match")).toEqual([]);

      // A tier with tickets stays.
      expect(await deleteTier(tx, editionId, tier!.id)).toBe(false);
      expect(await removeCompTicket(tx, editionId, ticket!.id)).toBe(true);
      expect(await deleteTier(tx, editionId, tier!.id)).toBe(true);
    });
  });

  test("a tier from another edition is refused", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await newEdition(tx);
      const [other] = await tx<{ id: string }[]>`insert into public.editions (year) values (2100) returning id`;
      await addTier(tx, Number(other!.id), { name: "Elsewhere", priceCents: 100, sortOrder: 0 });
      const [tier] = await listTiers(tx, Number(other!.id));
      const pat = await newAccount(tx);
      expect(await issueCompTicket(tx, { editionId, email: pat.email, tierId: tier!.id })).toBe("bad-tier");
    });
  });
});

describe("inviteAdmin", () => {
  test("grants straight away to an account, and invites an address without one", async () => {
    await inRolledBackTransaction(async (tx) => {
      const inviter = await newAccount(tx, "Inviter");
      const pat = await newAccount(tx, "Pat");
      const stranger = `stranger-${crypto.randomUUID()}@example.org`;

      expect(await inviteAdmin(tx, { email: pat.email, permission: "full", invitedBy: inviter.id })).toBe("granted");
      expect(await inviteAdmin(tx, { email: pat.email, permission: "full", invitedBy: inviter.id })).toBe("already");
      expect(await inviteAdmin(tx, { email: stranger, permission: "full", invitedBy: inviter.id })).toBe("invited");

      const team = await listTeam(tx);
      expect(team.members.find((m) => m.profileId === pat.id)?.permissions).toEqual([
        { permission: "full", grantedBy: "Inviter", grantedAt: expect.any(Date) },
      ]);
      expect(team.invitations.find((i) => i.email === stranger)).toMatchObject({ permission: "full", invitedBy: "Inviter" });
    });
  });
});

describe("sessions", () => {
  test("lists drafts and published sessions with their hosts, and unpublishes", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await newEdition(tx);
      const host = await newAccount(tx, "Hostie");
      const [session] = await tx<{ id: string }[]>`
        insert into public.sessions (edition_id, title, time_zone, theme, session_types, starts_at, ends_at, published)
        values (${editionId}, 'Morning circle', 'UTC', 'Personal Growth and Inner Work', '{dialog}',
                '2099-03-10T15:00Z', '2099-03-10T16:00Z', true)
        returning id
      `;
      await tx`insert into public.session_hosts (session_id, profile_id, role) values (${session!.id}, ${host.id}, 'host')`;
      await tx`insert into public.sessions (edition_id, title, time_zone) values (${editionId}, 'Unfinished', 'UTC')`;

      const sessions = await listAllSessions(tx, editionId);
      expect(sessions.map((s) => [s.title, s.published, s.hosts])).toEqual([
        ["Morning circle", true, ["Hostie"]],
        ["Unfinished", false, []],
      ]);

      await unpublishSession(tx, editionId, session!.id);
      expect((await getOverview(tx, editionId)).sessions).toMatchObject({ published: 0, drafts: 2, hosts: 1 });
    });
  });
});
