/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";

import type { Db } from "./db.server";
import { inviteEventId, publicEventId } from "./google-calendar";
import { runCalendarSync, type GoogleCalendarConfig } from "./google-calendar.server";
import { cancelRsvp, rsvp } from "./rsvps.server";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54372/postgres",
  { max: 1, fetch_types: false, onnotice: () => {} },
);

afterAll(() => sql.end());
afterEach(() => vi.unstubAllGlobals());

const config: GoogleCalendarConfig = {
  clientId: "id",
  clientSecret: "secret",
  refreshToken: "refresh",
  scheduleCalendarId: "schedule@group.calendar.google.com",
  invitesCalendarId: "invites@group.calendar.google.com",
  appUrl: "https://app.example.org",
};

async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      // Only this test's sessions are queued.
      await tx`delete from public.calendar_sync_queue`;
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

async function account(tx: Db) {
  const email = `c-${crypto.randomUUID()}@example.org`;
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role) values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated')
    returning id
  `;
  return { id: user!.id, email };
}

async function session(tx: Db) {
  const [edition] = await tx<{ id: number }[]>`
    insert into public.editions (year) values (2098)
    on conflict (year) do update set year = excluded.year
    returning id
  `;
  const [row] = await tx<{ id: string }[]>`
    insert into public.sessions (edition_id, title, theme, session_types, starts_at, ends_at, time_zone, published, meeting_link)
    values (${edition!.id}, 'Calendar test', 'Consciousness Exploration', '{dialog}', '2099-03-17T12:00:00Z',
            '2099-03-17T13:00:00Z', 'UTC', true, 'https://zoom.example/j/1')
    returning id
  `;
  return row!.id;
}

/** Stands in for Google: records each call, and answers like the Calendar API. */
function fakeGoogle() {
  const calls: { method: string; url: string; body: { attendees?: { email: string }[]; summary?: string } | null }[] = [];
  const events = new Set<string>();
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, body });
    const path = new URL(url).pathname;
    const id = method === "POST" ? `${path}/${body.id}` : path;
    if (method === "POST") {
      if (events.has(id)) return Response.json({ error: { message: "exists" } }, { status: 409 });
      events.add(id);
      return Response.json(body);
    }
    if (method === "PUT") return events.has(id) ? Response.json(body) : Response.json({ error: {} }, { status: 404 });
    if (method === "DELETE") return events.delete(id) ? new Response(null, { status: 204 }) : new Response(null, { status: 410 });
    return new Response(null, { status: 400 });
  });
  return calls;
}

describe("runCalendarSync", () => {
  test("puts a published session on the schedule calendar, and invites a member who RSVPs", async () => {
    await inRolledBackTransaction(async (tx) => {
      const calls = fakeGoogle();
      const sessionId = await session(tx);
      await runCalendarSync(tx, config);
      expect(calls.map((c) => [c.method, c.url])).toEqual([
        ["POST", `https://www.googleapis.com/calendar/v3/calendars/schedule%40group.calendar.google.com/events?sendUpdates=none`],
      ]);
      expect(calls[0]!.body).toMatchObject({ id: publicEventId(sessionId), summary: "Calendar test" });

      const member = await account(tx);
      await rsvp(tx, { sessionId, userId: member.id });
      await runCalendarSync(tx, config);
      expect(calls[1]).toMatchObject({
        method: "POST",
        url: `https://www.googleapis.com/calendar/v3/calendars/invites%40group.calendar.google.com/events?sendUpdates=all`,
        body: { attendees: [{ email: member.email }] },
      });

      // Nothing has changed, so nothing is sent.
      await tx`select public.queue_calendar_sync(${sessionId})`;
      await runCalendarSync(tx, config);
      expect(calls).toHaveLength(2);
      const [queued] = await tx`select count(*)::int as n from public.calendar_sync_queue`;
      expect(queued!.n).toBe(0);

      // Cancelling the RSVP cancels the invite, and emails the member.
      await cancelRsvp(tx, { sessionId, userId: member.id });
      await runCalendarSync(tx, config);
      expect(calls[2]).toMatchObject({
        method: "DELETE",
        url: `https://www.googleapis.com/calendar/v3/calendars/invites%40group.calendar.google.com/events/${inviteEventId(sessionId, member.id)}?sendUpdates=all`,
      });
    });
  });

  test("updates every event when a session moves, and removes them when it's deleted", async () => {
    await inRolledBackTransaction(async (tx) => {
      const calls = fakeGoogle();
      const sessionId = await session(tx);
      const member = await account(tx);
      await rsvp(tx, { sessionId, userId: member.id });
      await runCalendarSync(tx, config);
      expect(calls).toHaveLength(2);

      await tx`update public.sessions set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = ${sessionId}`;
      await runCalendarSync(tx, config);
      expect(calls.slice(2).map((c) => c.method)).toEqual(["PUT", "PUT"]);

      await tx`delete from public.sessions where id = ${sessionId}`;
      await runCalendarSync(tx, config);
      expect(calls.slice(4).map((c) => c.method)).toEqual(["DELETE", "DELETE"]);
      const [left] = await tx`select count(*)::int as n from public.calendar_events where session_id = ${sessionId}`;
      expect(left!.n).toBe(0);
    });
  });

  test("keeps a session queued, with the error, when Google fails", async () => {
    await inRolledBackTransaction(async (tx) => {
      vi.stubGlobal("fetch", async (input: string) =>
        String(input).includes("oauth2")
          ? Response.json({ access_token: "token", expires_in: 3600 })
          : Response.json({ error: { message: "Backend Error" } }, { status: 503 }),
      );
      const sessionId = await session(tx);
      await runCalendarSync(tx, config);
      const [row] = await tx<{ lastError: string; retryLater: boolean }[]>`
        select last_error as "lastError", claimed_until > now() as "retryLater" from public.calendar_sync_queue where session_id = ${sessionId}
      `;
      expect(row).toMatchObject({ retryLater: true });
      expect(row!.lastError).toContain("Backend Error");
    });
  });

  test("does nothing until it's configured", async () => {
    await inRolledBackTransaction(async (tx) => {
      const calls = fakeGoogle();
      await session(tx);
      await runCalendarSync(tx, null);
      expect(calls).toEqual([]);
    });
  });
});
