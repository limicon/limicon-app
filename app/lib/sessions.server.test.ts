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
  getEditableSession,
  hasAcceptedGuidelines,
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
  const account = async () => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, aud, role)
      values (gen_random_uuid(), ${`host-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
      returning id
    `;
    return user!.id;
  };
  const [edition] = await tx<{ id: number }[]>`insert into public.editions (year) values (2098) returning id`;
  return { host: await account(), other: await account(), editionId: Number(edition!.id) };
}

const form: SessionFormInput = {
  title: "Thresholds and transitions", description: "", intention: "", theme: "Personal Growth and Inner Work",
  sessionTypes: ["dialog", "fun"], experience: ["kid_friendly"], date: "2027-03-17", start: "12:00",
  lengthMinutes: "60", timeZone: "America/Toronto", meetingLink: "https://zoom.us/j/1", city: "", venueNote: "",
  maxParticipants: "", waitlist: false, recorded: "no", recordingAudience: "", aiAllowed: "yes",
  aiPermissions: ["transcription"],
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
      expect(saved).toEqual({ id, published: true, ...values() });
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
