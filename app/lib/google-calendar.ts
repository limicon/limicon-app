/**
 * Google Calendar events for sessions, and the links that subscribe to the Limicon Schedule
 * calendar (docs/feature-calendaring.md → Google Calendar). Pure functions, shared by the sync
 * and the schedule page.
 */

/** A session as the calendar sync reads it. */
export type CalendarSession = {
  id: string;
  title: string;
  published: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  timeZone: string;
  sessionTypes: string[];
  meetingLink: string | null;
  city: string | null;
  venueNote: string | null;
  /** Host names, the host first. */
  hosts: string[];
};

/** A member going to a session: registered, or hosting it. */
export type CalendarGuest = { profileId: string; email: string; hosting: boolean };

/** The fields of a Google Calendar event resource the app sets. */
export type GoogleEvent = {
  id: string;
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  source: { title: string; url: string };
  attendees?: { email: string; responseStatus: "accepted" }[];
  guestsCanSeeOtherGuests?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  visibility?: "public" | "private";
};

/**
 * Event ids come from the session's uuid, and for invites the member's too, so syncing twice
 * finds the same event rather than making a second. Google allows the characters 0-9 and a-v,
 * which hex digits are.
 */
export const publicEventId = (sessionId: string) => sessionId.replaceAll("-", "").toLowerCase();
export const inviteEventId = (sessionId: string, profileId: string) => publicEventId(sessionId) + publicEventId(profileId);

export const sessionPageUrl = (appUrl: string, sessionId: string) => `${appUrl.replace(/\/$/, "")}/members/schedule/${sessionId}`;

const times = (session: CalendarSession) => ({
  start: { dateTime: session.startsAt!.toISOString(), timeZone: session.timeZone },
  end: { dateTime: session.endsAt!.toISOString(), timeZone: session.timeZone },
});

const inPerson = (session: CalendarSession) => session.sessionTypes.includes("in_person");

/** Whether a session belongs on the calendar at all: published and dated. */
export const isOnCalendar = (session: CalendarSession | null): session is CalendarSession =>
  Boolean(session?.published && session.startsAt && session.endsAt);

/**
 * The session's event on the Limicon Schedule calendar, which anyone with its address can read.
 * It carries what the Public role may see, the title, time and hosts, and links to the session
 * page for the meeting link and RSVPs, which need a member's sign-in.
 */
export function publicEvent(session: CalendarSession, appUrl: string): GoogleEvent {
  const url = sessionPageUrl(appUrl, session.id);
  const lines = [
    session.hosts.length ? `Hosted by ${session.hosts.join(", ")}.` : null,
    `Details, the meeting link and RSVPs, for Limicon members: ${url}`,
  ];
  return {
    id: publicEventId(session.id),
    summary: session.title,
    description: lines.filter(Boolean).join("\n\n"),
    location: inPerson(session) ? (session.city ?? "In person") : "Online",
    ...times(session),
    source: { title: "Limicon", url },
    visibility: "public",
  };
}

/**
 * A member's own invite to a session, with the meeting link. One event per member, so no member
 * sees another's address and adding one member emails no one else.
 */
export function inviteEvent(session: CalendarSession, appUrl: string, guest: CalendarGuest): GoogleEvent {
  const url = sessionPageUrl(appUrl, session.id);
  const where = inPerson(session)
    ? [session.venueNote, session.city].filter(Boolean).join(", ") || null
    : session.meetingLink;
  const lines = [
    inPerson(session)
      ? where ? `Where: ${where}` : "The venue isn't up yet. It will be on the session page."
      : session.meetingLink ? `Join: ${session.meetingLink}` : "The meeting link isn't up yet. It will be on the session page.",
    guest.hosting ? `Session page: ${url}` : `Session page, to see details or cancel your RSVP: ${url}`,
    guest.hosting
      ? "You're hosting this session. This invite updates when the session changes."
      : "You're getting this because you RSVPed in the Limicon app. This invite updates when the session changes, and cancelling your RSVP removes it.",
  ];
  return {
    id: inviteEventId(session.id, guest.profileId),
    summary: session.title,
    description: lines.join("\n\n"),
    ...(where ? { location: where } : {}),
    ...times(session),
    source: { title: "Limicon", url },
    attendees: [{ email: guest.email, responseStatus: "accepted" }],
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    visibility: "private",
  };
}

/** A stable digest of what an event says, to tell whether it changed since it was sent. */
export async function contentHash(event: GoogleEvent): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(event));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What was last sent for one event: `profileId` null for the Limicon Schedule calendar's. */
export type SentEvent = { profileId: string | null; email: string | null; contentHash: string };

/** One change to make on Google. */
export type CalendarChange =
  | { kind: "upsert"; profileId: string | null; email: string | null; event: GoogleEvent; hash: string; existed: boolean }
  | { kind: "remove"; profileId: string | null; eventId: string };

/**
 * The changes that bring a session's events from what was sent to what they should be. A session
 * off the calendar has no events; one that has ended keeps its invites as they are, so editing an
 * old session doesn't email everyone who went.
 */
export async function planChanges(args: {
  sessionId: string;
  session: CalendarSession | null;
  guests: CalendarGuest[];
  sent: SentEvent[];
  appUrl: string;
  now: Date;
}): Promise<CalendarChange[]> {
  const { sessionId, session, guests, sent, appUrl, now } = args;
  const changes: CalendarChange[] = [];
  const sentBy = new Map(sent.map((row) => [row.profileId, row]));
  const live = isOnCalendar(session) ? session : null;

  const want = async (profileId: string | null, email: string | null, event: GoogleEvent) => {
    const hash = await contentHash(event);
    const previous = sentBy.get(profileId);
    if (previous?.contentHash !== hash || previous.email !== email) {
      changes.push({ kind: "upsert", profileId, email, event, hash, existed: Boolean(previous) });
    }
  };

  if (live) await want(null, null, publicEvent(live, appUrl));
  else if (sentBy.has(null)) changes.push({ kind: "remove", profileId: null, eventId: publicEventId(sessionId) });

  if (live && live.endsAt! <= now) return changes;
  const going = live ? guests : [];
  for (const guest of going) await want(guest.profileId, guest.email, inviteEvent(live!, appUrl, guest));
  const goingIds = new Set(going.map((guest) => guest.profileId));
  for (const row of sent) {
    if (row.profileId !== null && !goingIds.has(row.profileId)) {
      changes.push({ kind: "remove", profileId: row.profileId, eventId: inviteEventId(sessionId, row.profileId) });
    }
  }
  return changes;
}

/**
 * The ways to subscribe to the Limicon Schedule calendar, from its Google calendar id. Google
 * Calendar adds it by id and shows changes as they're made; other apps read its public iCal
 * address and pick up changes when they next refresh.
 */
export function subscribeLinks(calendarId: string) {
  const encoded = encodeURIComponent(calendarId);
  const ical = `https://calendar.google.com/calendar/ical/${encoded}/public/basic.ics`;
  return {
    google: `https://calendar.google.com/calendar/u/0/r?cid=${encoded}`,
    webcal: ical.replace(/^https:/, "webcal:"),
    ical,
  };
}
