/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import type { Db } from "./db.server";
import { checkSessionForm, type SessionFormInput, type SessionValues } from "./session-form";
import {
  acceptGuidelines,
  createSession,
  deleteSession,
  findMembers,
  getEditableSession,
  hasAcceptedGuidelines,
  ineligibleCoHosts,
  listOtherDates,
  listHostedSessions,
  updateSession,
} from "./sessions.server";

// Runs against the local Supabase database, with the app's own connection options.
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

async function setUp(tx: Db) {
  const account = async (name?: [string, string]) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, aud, role, raw_user_meta_data)
      values (gen_random_uuid(), ${`host-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated',
              ${tx.json(name ? { given_name: name[0], family_name: name[1] } : {})})
      returning id
    `;
    return user!.id;
  };
  const [edition] = await tx<{ id: number }[]>`insert into public.editions (year) values (2098) returning id`;
  const editionId = Number(edition!.id);
  const ticket = async (profileId: string) => {
    await tx`insert into public.tickets (profile_id, edition_id, status) values (${profileId}, ${editionId}, 'comp')`;
    return profileId;
  };
  return {
    host: await account(),
    other: await account(),
    editionId,
    // Registered members who can co-host, and someone without a ticket.
    ada: await ticket(await account(["Ada", "Lovelace"])),
    grace: await ticket(await account(["Grace", "Hopper"])),
    stranger: await account(["Adam", "Stranger"]),
  };
}

const form: SessionFormInput = {
  cocreation: false, title: "Thresholds and transitions", description: "", intention: "", imageKey: "3f2a1b4c-0000-4000-8000-000000000001.webp", theme: "Personal Growth and Inner Work",
  sessionTypes: ["dialog", "fun"], experience: ["kid_friendly"], date: "2027-03-17", start: "12:00",
  lengthMinutes: "60", timeZone: "America/Toronto", meetingLink: "https://zoom.us/j/1", city: "", venueNote: "",
  maxParticipants: "", waitlist: false, recorded: "no", recordingAudience: "", aiAllowed: "yes",
  aiPermissions: ["transcription"], coHosts: [], repeat: "", repeatUntil: "", extraDates: [], extraStarts: [], sameDetails: true, repeatTitles: [], repeatDescriptions: [],
};

function values(input: Partial<SessionFormInput> = {}): SessionValues {
  const result = checkSessionForm({ ...form, ...input }, { publish: true });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.values;
}

describe("host guidelines", () => {
  test("are accepted once per edition", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, editionId } = await setUp(tx);
      expect(await hasAcceptedGuidelines(tx, host, editionId)).toBe(false);
      await acceptGuidelines(tx, host, editionId);
      await acceptGuidelines(tx, host, editionId);
      expect(await hasAcceptedGuidelines(tx, host, editionId)).toBe(true);
    });
  });
});

describe("sessions", () => {
  test("a created session is listed for its host and comes back as saved", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, editionId } = await setUp(tx);
      const id = await createSession(tx, { userId: host, editionId, values: values(), publish: true });

      expect(await listHostedSessions(tx, host, editionId)).toEqual([
        expect.objectContaining({ id, title: form.title, published: true, role: "host" }),
      ]);
      const saved = await getEditableSession(tx, id, { userId: host, isAdmin: false });
      const { repeats: _, ...saveable } = values();
      expect(saved).toEqual({ id, published: true, hostId: host, coHosts: [], ...saveable });
    });
  });

  test("only its hosts and admins can open a session for editing", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, other, editionId } = await setUp(tx);
      const id = await createSession(tx, { userId: host, editionId, values: values(), publish: false });

      expect(await getEditableSession(tx, id, { userId: other, isAdmin: false })).toBeNull();
      expect(await getEditableSession(tx, id, { userId: other, isAdmin: true })).not.toBeNull();
      expect(await getEditableSession(tx, "not-a-session", { userId: host, isAdmin: true })).toBeNull();
    });
  });

  test("updates and deletes", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, editionId } = await setUp(tx);
      const id = await createSession(tx, { userId: host, editionId, values: values(), publish: false });

      await updateSession(tx, id, values({ title: "Renamed", experience: [] }), true);
      expect(await getEditableSession(tx, id, { userId: host, isAdmin: false })).toMatchObject({
        title: "Renamed",
        experience: [],
        published: true,
      });

      expect(await deleteSession(tx, id)).toBe("deleted");
      expect(await listHostedSessions(tx, host, editionId)).toEqual([]);
    });
  });

  test("deleting a session members RSVPed to unpublishes it and keeps the RSVPs", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, other, editionId } = await setUp(tx);
      const id = await createSession(tx, { userId: host, editionId, values: values(), publish: true });
      await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${id}, ${other}, 'registered')`;

      expect(await deleteSession(tx, id)).toBe("unpublished");
      expect(await getEditableSession(tx, id, { userId: host, isAdmin: false })).toMatchObject({ published: false });
      expect(await tx`select 1 from public.session_rsvps where session_id = ${id}`).toHaveLength(1);
    });
  });

  test("co-hosts are saved and changed with the session, and their RSVPs give way to the waitlist", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, other, ada, grace, editionId } = await setUp(tx);
      const id = await createSession(tx, { userId: host, editionId, values: values({ maxParticipants: "1", waitlist: true }), publish: true });
      await tx`insert into public.session_rsvps (session_id, profile_id, status, created_at) values (${id}, ${ada}, 'registered', now() - interval '1 minute')`;
      await tx`insert into public.session_rsvps (session_id, profile_id, status) values (${id}, ${other}, 'waitlisted')`;

      const coHosts = (ids: string[]) => ids.map((personId) => ({ id: personId, name: "" }));
      await updateSession(tx, id, values({ maxParticipants: "1", waitlist: true, coHosts: coHosts([ada, grace, host]) }), true);
      const saved = await getEditableSession(tx, id, { userId: grace, isAdmin: false });
      expect(saved?.hostId).toBe(host);
      expect(saved?.coHosts).toEqual([
        { id: ada, name: "Ada Lovelace" },
        { id: grace, name: "Grace Hopper" },
      ]);
      const rsvps = await tx<{ profile_id: string; status: string }[]>`select profile_id, status from public.session_rsvps where session_id = ${id}`;
      expect(rsvps).toEqual([{ profile_id: other, status: "registered" }]);

      await updateSession(tx, id, values({ coHosts: coHosts([grace]) }), true);
      expect((await getEditableSession(tx, id, { userId: host, isAdmin: false }))?.coHosts.map((p) => p.name)).toEqual(["Grace Hopper"]);
      expect(await listHostedSessions(tx, host, editionId)).toHaveLength(1);
    });
  });

  test("a repeating session is saved as one linked session per date", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, other, editionId } = await setUp(tx);
      const weekly = checkSessionForm({ ...form, repeat: "weekly", repeatUntil: "2027-03-31" }, { publish: true });
      if (!weekly.ok) throw new Error(JSON.stringify(weekly.errors));
      const id = await createSession(tx, { userId: host, editionId, values: weekly.values, publish: true });

      const hosted = await listHostedSessions(tx, host, editionId);
      expect(hosted.map((s) => s.startsAt?.toISOString())).toEqual([
        "2027-03-17T16:00:00.000Z",
        "2027-03-24T16:00:00.000Z",
        "2027-03-31T16:00:00.000Z",
      ]);
      expect(hosted.every((s) => s.published && s.role === "host")).toBe(true);

      const others = await listOtherDates(tx, id, false);
      expect(others.map((d) => d.startsAt?.toISOString())).toEqual(["2027-03-24T16:00:00.000Z", "2027-03-31T16:00:00.000Z"]);
      // Each date is its own session: unpublishing one hides it from members only.
      await tx`update public.sessions set published = false where id = ${others[1]!.id}`;
      expect(await listOtherDates(tx, id, true)).toHaveLength(1);
      // A session that doesn't repeat has no other dates.
      const single = await createSession(tx, { userId: other, editionId, values: values(), publish: true });
      expect(await listOtherDates(tx, single, false)).toEqual([]);
    });
  });

  test("a series in parts saves each date's own title and description", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { host, editionId } = await setUp(tx);
      const parts = checkSessionForm(
        { ...form, repeat: "weekly", repeatUntil: "2027-03-31", sameDetails: false, repeatTitles: ["Part 2", ""], repeatDescriptions: ["", "The last part"] },
        { publish: true },
      );
      if (!parts.ok) throw new Error(JSON.stringify(parts.errors));
      await createSession(tx, { userId: host, editionId, values: parts.values, publish: true });
      const rows = await tx<{ title: string; description: string | null; doc: unknown }[]>`
        select s.title, s.description, s.description_doc as doc from public.sessions s
        join public.session_hosts h on h.session_id = s.id and h.profile_id = ${host}
        order by s.starts_at
      `;
      expect(rows.map((r) => [r.title, r.description])).toEqual([
        [form.title, null],
        ["Part 2", null],
        [form.title, "The last part"],
      ]);
      expect(rows[2]!.doc).toMatchObject({ type: "doc" });
    });
  });

  test("only registered members can be found and added as co-hosts", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ada, grace, stranger, editionId } = await setUp(tx);
      const found = await findMembers(tx, editionId, "@ad");
      expect(found.map((person) => person.name)).toEqual(["Ada Lovelace"]);
      expect(found[0]!.hint).toMatch(/^h•••@example\.org$/);
      expect(await findMembers(tx, editionId, "")).toEqual([]);
      expect(await findMembers(tx, editionId, "%")).toEqual([]);
      expect(await ineligibleCoHosts(tx, editionId, [ada, grace, stranger])).toEqual([stranger]);
    });
  });

  test("the database refuses to publish an incomplete session", async () => {
    // The failed insert aborts this transaction, which then rolls back everything it made.
    await expect(
      sql.begin(async (raw) => {
        const tx = raw as unknown as Db;
        const { host, editionId } = await setUp(tx);
        await createSession(tx, { userId: host, editionId, values: { ...values(), theme: null }, publish: true });
      }),
    ).rejects.toThrow(/sessions_published_complete/);
  });
});
