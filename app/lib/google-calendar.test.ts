import { describe, expect, test } from "vitest";

import {
  contentHash,
  inviteEvent,
  inviteEventId,
  planChanges,
  publicEvent,
  publicEventId,
  subscribeLinks,
  type CalendarSession,
} from "./google-calendar";

const APP = "https://app.example.org";
const SESSION_ID = "0f8e2a3c-1b2d-4e5f-8a9b-0c1d2e3f4a5b";
const MEMBER = "11111111-2222-4333-8444-555555555555";

const session = (overrides: Partial<CalendarSession> = {}): CalendarSession => ({
  id: SESSION_ID,
  title: "Soil, seeds; and ☀️, together",
  published: true,
  startsAt: new Date("2027-03-14T17:00:00Z"),
  endsAt: new Date("2027-03-14T18:00:00Z"),
  timeZone: "America/New_York",
  sessionTypes: ["dialog"],
  meetingLink: "https://zoom.example/j/1",
  city: null,
  venueNote: null,
  hosts: ["Ada Host", "Co Host"],
  ...overrides,
});

const guest = { profileId: MEMBER, email: "m@example.org", hosting: false };
const before = new Date("2027-01-01T00:00:00Z");

describe("event ids", () => {
  test("use only the characters Google allows, and never change", () => {
    expect(publicEventId(SESSION_ID)).toBe("0f8e2a3c1b2d4e5f8a9b0c1d2e3f4a5b");
    expect(inviteEventId(SESSION_ID, MEMBER)).toMatch(/^[0-9a-v]{64}$/);
  });
});

describe("publicEvent", () => {
  test("shows the title, time and hosts, and keeps the meeting link for members", () => {
    const event = publicEvent(session(), APP);
    expect(event.summary).toBe("Soil, seeds; and ☀️, together");
    expect(event.start).toEqual({ dateTime: "2027-03-14T17:00:00.000Z", timeZone: "America/New_York" });
    expect(event.description).toContain("Hosted by Ada Host, Co Host.");
    expect(event.description).toContain(`${APP}/members/schedule/${SESSION_ID}`);
    expect(JSON.stringify(event)).not.toContain("zoom.example");
    expect(event.location).toBe("Online");
    expect(event.attendees).toBeUndefined();
  });

  test("gives the city for in-person sessions", () => {
    expect(publicEvent(session({ sessionTypes: ["in_person"], city: "Boulder" }), APP).location).toBe("Boulder");
  });
});

describe("inviteEvent", () => {
  test("invites one member, with the meeting link, hiding guests", () => {
    const event = inviteEvent(session(), APP, guest);
    expect(event.attendees).toEqual([{ email: "m@example.org", responseStatus: "accepted" }]);
    expect(event.location).toBe("https://zoom.example/j/1");
    expect(event.description).toContain("Join: https://zoom.example/j/1");
    expect(event.description).toContain("cancel your RSVP");
    expect(event.guestsCanSeeOtherGuests).toBe(false);
  });

  test("says when the link isn't up yet", () => {
    const event = inviteEvent(session({ meetingLink: null }), APP, guest);
    expect(event.location).toBeUndefined();
    expect(event.description).toContain("meeting link isn't up yet");
  });
});

describe("planChanges", () => {
  const plan = (args: Partial<Parameters<typeof planChanges>[0]>) =>
    planChanges({ sessionId: SESSION_ID, session: session(), guests: [], sent: [], appUrl: APP, now: before, ...args });

  test("adds a new session's event and its members' invites", async () => {
    const changes = await plan({ guests: [guest] });
    expect(changes.map((c) => [c.kind, c.profileId])).toEqual([["upsert", null], ["upsert", MEMBER]]);
  });

  test("changes nothing when what was sent still matches", async () => {
    const sent = [
      { profileId: null, email: null, contentHash: await contentHash(publicEvent(session(), APP)) },
      { profileId: MEMBER, email: guest.email, contentHash: await contentHash(inviteEvent(session(), APP, guest)) },
    ];
    expect(await plan({ guests: [guest], sent })).toEqual([]);
  });

  test("updates events when the session moves", async () => {
    const sent = [
      { profileId: null, email: null, contentHash: await contentHash(publicEvent(session(), APP)) },
      { profileId: MEMBER, email: guest.email, contentHash: await contentHash(inviteEvent(session(), APP, guest)) },
    ];
    const moved = session({ startsAt: new Date("2027-03-14T19:00:00Z"), endsAt: new Date("2027-03-14T20:00:00Z") });
    const changes = await plan({ session: moved, guests: [guest], sent });
    expect(changes.map((c) => [c.kind, c.profileId, c.kind === "upsert" && c.existed])).toEqual([
      ["upsert", null, true],
      ["upsert", MEMBER, true],
    ]);
  });

  test("cancels the invite of a member who is no longer going", async () => {
    const sent = [
      { profileId: null, email: null, contentHash: await contentHash(publicEvent(session(), APP)) },
      { profileId: MEMBER, email: guest.email, contentHash: "old" },
    ];
    expect(await plan({ sent })).toEqual([{ kind: "remove", profileId: MEMBER, eventId: inviteEventId(SESSION_ID, MEMBER) }]);
  });

  test("removes everything when a session is unpublished or deleted", async () => {
    const sent = [
      { profileId: null, email: null, contentHash: "a" },
      { profileId: MEMBER, email: guest.email, contentHash: "b" },
    ];
    for (const gone of [session({ published: false }), null]) {
      const changes = await plan({ session: gone, guests: [guest], sent });
      expect(changes.map((c) => [c.kind, c.profileId])).toEqual([["remove", null], ["remove", MEMBER]]);
    }
  });

  test("leaves the invites of a session that has ended alone", async () => {
    const sent = [{ profileId: MEMBER, email: guest.email, contentHash: "old" }];
    const changes = await plan({ sent, now: new Date("2027-04-01T00:00:00Z") });
    expect(changes.map((c) => [c.kind, c.profileId])).toEqual([["upsert", null]]);
  });
});

test("subscribeLinks", () => {
  const links = subscribeLinks("abc123@group.calendar.google.com");
  expect(links.google).toBe("https://calendar.google.com/calendar/u/0/r?cid=abc123%40group.calendar.google.com");
  expect(links.webcal).toBe("webcal://calendar.google.com/calendar/ical/abc123%40group.calendar.google.com/public/basic.ics");
});
