/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import type { Db } from "./db.server";
import type { HostFeedback } from "./feedback";
import { countFeedback, getHarvest, getHostFeedback, listFeedback, listOtherHarvestSessions, saveHarvest, saveHostFeedback } from "./feedback.server";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54372/postgres",
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
    values (gen_random_uuid(), ${`f-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  return user!.id;
}

async function edition(tx: Db) {
  const [row] = await tx<{ id: number }[]>`
    insert into public.editions (year) values (2097)
    on conflict (year) do update set year = excluded.year
    returning id
  `;
  return row!.id;
}

async function session(tx: Db, editionId: number, opts: { ended?: boolean; published?: boolean } = {}) {
  const startsAt = opts.ended === false ? "2099-03-17T12:00:00Z" : "2001-01-01T12:00:00Z";
  const [row] = await tx<{ id: string }[]>`
    insert into public.sessions (edition_id, title, theme, session_types, starts_at, ends_at, time_zone, published)
    values (${editionId}, 'Feedback test', 'Consciousness Exploration', '{dialog}', ${startsAt},
            ${startsAt}::timestamptz + interval '1 hour', 'UTC', ${opts.published ?? true})
    returning id
  `;
  return row!.id;
}

const answers: HostFeedback = {
  participantCount: 8,
  experience: ["fun"],
  experienceOther: null,
  howItWent: "Well",
  organizerFeedback: null,
  hadTensions: false,
  tensions: [],
  tensionsOther: null,
  tensionsDescription: null,
  wantsSupport: null,
};

describe("session feedback", () => {
  test("hosts owe host feedback and registered members owe a harvest, once a session ends", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await edition(tx);
      const [host, guest, waitlisted] = [await account(tx), await account(tx), await account(tx)];
      const [ended, upcoming, draft] = [
        await session(tx, editionId),
        await session(tx, editionId, { ended: false }),
        await session(tx, editionId, { published: false }),
      ];
      for (const id of [ended, upcoming, draft]) {
        await tx`insert into public.session_hosts (session_id, profile_id, role) values (${id}, ${host}, 'host')`;
        await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${id}, ${guest}, 'registered')`;
        await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${id}, ${waitlisted}, 'waitlisted')`;
      }

      expect(await countFeedback(tx, host, editionId)).toEqual({ host: { sessions: 1, pending: 1 }, harvest: { sessions: 0, pending: 0 } });
      expect(await countFeedback(tx, guest, editionId)).toEqual({ host: { sessions: 0, pending: 0 }, harvest: { sessions: 1, pending: 1 } });
      // Members who didn't RSVP may still harvest the session, without a badge.
      expect(await countFeedback(tx, waitlisted, editionId)).toEqual({ host: { sessions: 0, pending: 0 }, harvest: { sessions: 1, pending: 0 } });
      expect((await listFeedback(tx, "host", host, editionId)).map((s) => s.sessionId)).toEqual([ended]);
      expect((await listFeedback(tx, "harvest", guest, editionId)).map((s) => s.sessionId)).toEqual([ended]);
      expect(await listOtherHarvestSessions(tx, guest, editionId)).toEqual([]);
      expect(await listFeedback(tx, "harvest", waitlisted, editionId)).toEqual([]);
      expect((await listOtherHarvestSessions(tx, waitlisted, editionId)).map((s) => s.sessionId)).toEqual([ended]);
      expect(await listOtherHarvestSessions(tx, host, editionId)).toEqual([]);
    });
  });

  test("saving clears the count, keeps the record, and replaces earlier answers", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await edition(tx);
      const [host, guest] = [await account(tx), await account(tx)];
      const id = await session(tx, editionId);
      await tx`insert into public.session_hosts (session_id, profile_id, role) values (${id}, ${host}, 'host')`;
      await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${id}, ${guest}, 'registered')`;

      expect(await saveHostFeedback(tx, host, editionId, id, answers)).toBe(true);
      expect(await saveHostFeedback(tx, host, editionId, id, { ...answers, howItWent: "Even better" })).toBe(true);
      expect(await getHostFeedback(tx, host, id)).toMatchObject({ howItWent: "Even better", participantCount: 8 });
      expect(await countFeedback(tx, host, editionId)).toMatchObject({ host: { sessions: 1, pending: 0 } });

      const harvest = { takeaway: "A lot", feedBack: null, attractedRepelled: null, oneWord: "Alive", voiceNoteKey: "voice/3f2a0000-0000-4000-8000-000000000000.webm" };
      expect(await saveHarvest(tx, guest, editionId, id, harvest)).toBe(true);
      expect(await getHarvest(tx, guest, id)).toMatchObject(harvest);
      expect(await countFeedback(tx, guest, editionId)).toMatchObject({ harvest: { sessions: 1, pending: 0 } });
    });
  });

  test("a member who didn't RSVP can harvest a session, and then finds it on their list", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await edition(tx);
      const member = await account(tx);
      const id = await session(tx, editionId);
      expect(await saveHarvest(tx, member, editionId, id, { takeaway: "x", feedBack: null, attractedRepelled: null, oneWord: null, voiceNoteKey: null })).toBe(true);
      expect((await listFeedback(tx, "harvest", member, editionId)).map((s) => s.sessionId)).toEqual([id]);
      expect(await listOtherHarvestSessions(tx, member, editionId)).toEqual([]);
    });
  });

  test("refuses answers from anyone who may not send the form", async () => {
    await inRolledBackTransaction(async (tx) => {
      const editionId = await edition(tx);
      const [host, stranger] = [await account(tx), await account(tx)];
      const [ended, upcoming] = [await session(tx, editionId), await session(tx, editionId, { ended: false })];
      await tx`insert into public.session_hosts (session_id, profile_id, role) values (${upcoming}, ${host}, 'host')`;

      expect(await saveHostFeedback(tx, stranger, editionId, ended, answers)).toBe(false);
      expect(await saveHostFeedback(tx, host, editionId, upcoming, answers)).toBe(false);
      expect(await saveHarvest(tx, stranger, editionId, upcoming, { takeaway: "x", feedBack: null, attractedRepelled: null, oneWord: null, voiceNoteKey: null })).toBe(false);
      // Hosts give host feedback on their own sessions, not a harvest.
      await tx`insert into public.session_hosts (session_id, profile_id, role) values (${ended}, ${host}, 'host')`;
      expect(await saveHarvest(tx, host, editionId, ended, { takeaway: "x", feedBack: null, attractedRepelled: null, oneWord: null, voiceNoteKey: null })).toBe(false);
      expect(await saveHostFeedback(tx, host, editionId, "not-a-uuid", answers)).toBe(false);
    });
  });
});
