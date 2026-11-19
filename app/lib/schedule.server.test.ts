/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import type { Db } from "./db.server";
import { getSessionDetails, listScheduledSessions, scheduleVersion, type ScheduleFilters } from "./schedule.server";

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

const now = new Date("2027-03-17T12:00:00Z");
// A viewer with no RSVPs, unless a test sets one.
const upcoming: ScheduleFilters = {
  viewerId: "00000000-0000-0000-0000-000000000000",
  mineOnly: false,
  now,
  past: false,
  theme: null,
  sessionType: null,
  keyword: null,
};

/** An edition with a host, a co-host and a handful of sessions around `now`. */
async function setUp(tx: Db) {
  const account = async (first: string | null, last: string | null) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, aud, role, raw_user_meta_data)
      values (gen_random_uuid(), ${`m-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated',
              ${tx.json({ given_name: first, family_name: last })})
      returning id
    `;
    return user!.id;
  };
  const host = await account("Ada", "Lovelace");
  const coHost = await account("Grace", "Hopper");
  const [edition] = await tx<{ id: number }[]>`insert into public.editions (year) values (2098) returning id`;
  const editionId = Number(edition!.id);

  const session = async (title: string, startsAt: string, opts: { published?: boolean; theme?: string; types?: string[]; description?: string } = {}) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.sessions (edition_id, title, description, theme, session_types, starts_at, ends_at, time_zone, published)
      values (${editionId}, ${title}, ${opts.description ?? null}, ${opts.theme ?? "Consciousness Exploration"},
              ${opts.types ?? ["dialog"]}::text[], ${startsAt}, ${startsAt}::timestamptz + interval '1 hour',
              'America/Toronto', ${opts.published ?? true})
      returning id
    `;
    await tx`insert into public.session_hosts (session_id, profile_id, role) values (${row!.id}, ${host}, 'host')`;
    return row!.id;
  };

  const later = await session("Later", "2027-03-18T15:00:00Z", { theme: "Play, Games and Experimentation", types: ["fun"] });
  const sooner = await session("Sooner", "2027-03-17T13:00:00Z", { description: "Mycelial networks" });
  const happening = await session("Happening now", "2027-03-17T11:30:00Z");
  const finished = await session("Finished", "2027-03-16T15:00:00Z");
  const draft = await session("Draft", "2027-03-17T14:00:00Z", { published: false });
  await tx`insert into public.session_hosts (session_id, profile_id, role) values (${sooner}, ${coHost}, 'co-host')`;
  return { editionId, host, coHost, ids: { later, sooner, happening, finished, draft } };
}

describe("listScheduledSessions", () => {
  test("lists published sessions not yet over, soonest first, with their hosts", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId } = await setUp(tx);
      const sessions = await listScheduledSessions(tx, editionId, upcoming);
      expect(sessions.map((s) => s.title)).toEqual(["Happening now", "Sooner", "Later"]);
      expect(sessions[1]!.hosts).toEqual(["Ada Lovelace", "Grace Hopper"]);
    });
  });

  test("lists finished sessions most recent first when asked for the past", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId } = await setUp(tx);
      const sessions = await listScheduledSessions(tx, editionId, { ...upcoming, past: true });
      expect(sessions.map((s) => s.title)).toEqual(["Finished"]);
    });
  });

  test("filters by theme, session type and keyword", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId } = await setUp(tx);
      const titles = async (filters: Partial<ScheduleFilters>) =>
        (await listScheduledSessions(tx, editionId, { ...upcoming, ...filters })).map((s) => s.title);

      expect(await titles({ theme: "Play, Games and Experimentation" })).toEqual(["Later"]);
      expect(await titles({ sessionType: "fun" })).toEqual(["Later"]);
      expect(await titles({ keyword: "MYCELIAL" })).toEqual(["Sooner"]);
      expect(await titles({ keyword: "hopper" })).toEqual(["Sooner"]);
      expect(await titles({ keyword: "ada love" })).toEqual(["Happening now", "Sooner", "Later"]);
      expect(await titles({ keyword: "100%" })).toEqual([]);
    });
  });
});

describe("Hosting", () => {
  test("shows only the published sessions the viewer hosts or co-hosts", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId, coHost } = await setUp(tx);
      const hosting = await listScheduledSessions(tx, editionId, { ...upcoming, viewerId: coHost, hostingOnly: true });
      expect(hosting.map((s) => s.title)).toEqual(["Sooner"]);
    });
  });
});

describe("My Schedule", () => {
  test("shows only the sessions the viewer RSVPed to, with their status", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId, coHost, ids } = await setUp(tx);
      await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${ids.later}, ${coHost}, 'waitlisted')`;
      await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${ids.happening}, ${coHost}, 'registered')`;

      const mine = await listScheduledSessions(tx, editionId, { ...upcoming, viewerId: coHost, mineOnly: true });
      expect(mine.map((s) => [s.title, s.myRsvp])).toEqual([
        ["Happening now", "registered"],
        ["Later", "waitlisted"],
      ]);

      const everything = await listScheduledSessions(tx, editionId, { ...upcoming, viewerId: coHost });
      expect(everything.find((s) => s.title === "Sooner")?.myRsvp).toBeNull();
    });
  });
});

describe("getSessionDetails", () => {
  test("shows a published session, and whether the viewer hosts it", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId, host, coHost, ids } = await setUp(tx);
      expect(await getSessionDetails(tx, ids.sooner, editionId, host)).toMatchObject({ title: "Sooner", viewerHosts: true });
      expect(await getSessionDetails(tx, ids.later, editionId, coHost)).toMatchObject({ viewerHosts: false });
    });
  });

  test("hides drafts, other editions' sessions and ids that aren't sessions", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId, host, ids } = await setUp(tx);
      expect(await getSessionDetails(tx, ids.draft, editionId, host)).toBeNull();
      expect(await getSessionDetails(tx, ids.sooner, editionId + 1, host)).toBeNull();
      expect(await getSessionDetails(tx, "not-a-session", editionId, host)).toBeNull();
    });
  });
});

describe("scheduleVersion", () => {
  test("changes when a session is published, edited or deleted", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { editionId, ids } = await setUp(tx);
      const versions = [await scheduleVersion(tx, editionId)];
      await tx`update public.sessions set published = true where id = ${ids.draft}`;
      versions.push(await scheduleVersion(tx, editionId));
      await tx`update public.sessions set title = 'Renamed', updated_at = clock_timestamp() where id = ${ids.later}`;
      versions.push(await scheduleVersion(tx, editionId));
      await tx`delete from public.sessions where id = ${ids.finished}`;
      versions.push(await scheduleVersion(tx, editionId));
      expect(new Set(versions).size).toBe(4);
    });
  });
});
