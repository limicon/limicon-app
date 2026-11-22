/**
 * Keeps Google Calendar in step with sessions (docs/feature-calendaring.md → Google Calendar).
 * Triggers in the database queue a session whenever its events may need to change; a sync run
 * claims queued sessions, works out each one's changes and makes them through the Calendar API,
 * acting as team@limicon.org with a refresh token from `scripts/connect-google-calendar.mjs`.
 * Runs after each form post (`waitUntil`) and every minute from the Cron Trigger, which retries
 * anything that failed.
 */
import type { Db } from "~/lib/db.server";
import { planChanges, type CalendarChange, type CalendarGuest, type CalendarSession, type GoogleEvent, type SentEvent } from "~/lib/google-calendar";

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The public Limicon Schedule calendar, which members subscribe to. */
  scheduleCalendarId: string;
  /** The calendar holding members' invites, one event per member per session. */
  invitesCalendarId: string;
  /** The app's address, for links to session pages. */
  appUrl: string;
};

/** The sync's settings from the Worker's environment, or null until every one is set. */
export function googleCalendarConfig(env: Record<string, unknown>): GoogleCalendarConfig | null {
  const read = (name: string) => (typeof env[name] === "string" ? (env[name] as string).trim() : "");
  const config = {
    clientId: read("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: read("GOOGLE_CALENDAR_CLIENT_SECRET"),
    refreshToken: read("GOOGLE_CALENDAR_REFRESH_TOKEN"),
    scheduleCalendarId: read("GOOGLE_CALENDAR_ID"),
    invitesCalendarId: read("GOOGLE_INVITES_CALENDAR_ID"),
    appUrl: read("APP_URL"),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

class GoogleError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(config: GoogleCalendarConfig, refresh = false): Promise<string> {
  if (!refresh && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !body.access_token) {
    // Google's error code only: the response never holds the token, but keep secrets out of logs anyway.
    throw new GoogleError(401, `Google sign-in for the calendar failed: ${body.error ?? response.status}`);
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/** One Calendar API call. Calls Google again once with a fresh token if the cached one was refused. */
async function google(config: GoogleCalendarConfig, method: string, path: string, body?: unknown): Promise<unknown> {
  for (const refresh of [false, true]) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken(config, refresh)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 && !refresh) continue;
    if (response.ok) return response.status === 204 ? null : response.json();
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleError(response.status, `Google Calendar ${method} failed (${response.status}): ${error.error?.message ?? "no details"}`);
  }
  throw new GoogleError(401, "Google Calendar refused the app's access");
}

const eventsPath = (calendarId: string, eventId?: string, sendUpdates?: "all" | "none") =>
  `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${eventId}` : ""}${sendUpdates ? `?sendUpdates=${sendUpdates}` : ""}`;

/**
 * Creates or replaces an event. A deleted event keeps its id on Google, so creating it again is
 * refused, and replacing it with `status: confirmed` brings it back instead.
 */
async function upsertEvent(config: GoogleCalendarConfig, calendarId: string, event: GoogleEvent, existed: boolean, sendUpdates: "all" | "none") {
  const body = { ...event, status: "confirmed" };
  const replace = () => google(config, "PUT", eventsPath(calendarId, event.id, sendUpdates), body);
  const create = () => google(config, "POST", eventsPath(calendarId, undefined, sendUpdates), body);
  try {
    await (existed ? replace() : create());
  } catch (error) {
    if (!(error instanceof GoogleError)) throw error;
    if (existed && error.status === 404) await create();
    else if (!existed && error.status === 409) await replace();
    else throw error;
  }
}

async function removeEvent(config: GoogleCalendarConfig, calendarId: string, eventId: string, sendUpdates: "all" | "none") {
  try {
    await google(config, "DELETE", eventsPath(calendarId, eventId, sendUpdates));
  } catch (error) {
    // Already gone, or deleted by hand on Google.
    if (!(error instanceof GoogleError && (error.status === 404 || error.status === 410))) throw error;
  }
}

async function loadSession(sql: Db, sessionId: string) {
  const [session] = await sql<CalendarSession[]>`
    select s.id, s.title, s.published, s.starts_at as "startsAt", s.ends_at as "endsAt", s.time_zone as "timeZone",
           s.session_types as "sessionTypes", s.meeting_link as "meetingLink", s.city, s.venue_note as "venueNote",
           coalesce((
             select array_agg(
               coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'A Limicon member')
               order by h.role = 'co-host', p.first_name, p.last_name
             )
             from public.session_hosts h join public.profiles p on p.id = h.profile_id
             where h.session_id = s.id
           ), '{}') as hosts
    from public.sessions s
    where s.id = ${sessionId}
  `;
  // Registered members and hosts, at their sign-in email; waitlisted members wait for a place.
  const guests = await sql<CalendarGuest[]>`
    select g.profile_id as "profileId", u.email, bool_or(g.hosting) as hosting
    from (
      select profile_id, false as hosting from public.session_rsvps where session_id = ${sessionId} and status = 'registered'
      union all
      select profile_id, true from public.session_hosts where session_id = ${sessionId}
    ) g
    join public.profiles p on p.id = g.profile_id and p.deactivated_at is null
    join auth.users u on u.id = g.profile_id and u.email is not null
    group by g.profile_id, u.email
  `;
  const sent = await sql<SentEvent[]>`
    select profile_id as "profileId", email, content_hash as "contentHash"
    from public.calendar_events where session_id = ${sessionId}
  `;
  return { session: session ?? null, guests, sent };
}

async function apply(sql: Db, config: GoogleCalendarConfig, sessionId: string, change: CalendarChange) {
  const isInvite = change.profileId !== null;
  const calendarId = isInvite ? config.invitesCalendarId : config.scheduleCalendarId;
  // Invites email their member about each change; the shared calendar's events email no one.
  const sendUpdates = isInvite ? "all" : "none";
  const profileKey = change.profileId ?? "00000000-0000-0000-0000-000000000000";
  if (change.kind === "upsert") {
    await upsertEvent(config, calendarId, change.event, change.existed, sendUpdates);
    await sql`
      insert into public.calendar_events (session_id, profile_id, email, content_hash)
      values (${sessionId}, ${change.profileId}, ${change.email}, ${change.hash})
      on conflict (session_id, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set email = excluded.email, content_hash = excluded.content_hash, synced_at = now()
    `;
  } else {
    await removeEvent(config, calendarId, change.eventId, sendUpdates);
    await sql`
      delete from public.calendar_events
      where session_id = ${sessionId}
        and coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid) = ${profileKey}
    `;
  }
}

/** Calls to Google one run may make, under Workers' limit on outgoing requests per invocation. */
const CALL_BUDGET = 40;

/**
 * Syncs queued sessions until the queue is empty or the run's budget of Google calls is spent.
 * A session that fails stays queued and is tried again after a growing wait, up to an hour.
 * Does nothing until the sync is configured.
 */
export async function runCalendarSync(sql: Db, config: GoogleCalendarConfig | null, options: { maxSessions?: number } = {}) {
  if (!config) return;
  let budget = CALL_BUDGET;
  let sessions = 0;
  while (budget > 0 && sessions < (options.maxSessions ?? 50)) {
    // queued_at as text, since a JavaScript Date would drop its microseconds.
    const [claimed] = await sql<{ sessionId: string; queuedAt: string }[]>`
      update public.calendar_sync_queue q
      set claimed_until = now() + interval '5 minutes', attempts = q.attempts + 1
      where q.session_id = (
        select session_id from public.calendar_sync_queue
        where claimed_until is null or claimed_until < now()
        order by queued_at
        limit 1
        for update skip locked
      )
      returning q.session_id as "sessionId", q.queued_at::text as "queuedAt"
    `;
    if (!claimed) return;
    sessions++;
    const { sessionId, queuedAt } = claimed;
    try {
      const { session, guests, sent } = await loadSession(sql, sessionId);
      const changes = await planChanges({ sessionId, session, guests, sent, appUrl: config.appUrl, now: new Date() });
      let done = true;
      for (const change of changes) {
        if (budget <= 0) {
          done = false;
          break;
        }
        // Two calls at most when an event was deleted on Google, or was never recorded.
        budget -= 2;
        await apply(sql, config, sessionId, change);
      }
      if (done) {
        // Kept if it was queued again while this run worked on it.
        await sql`delete from public.calendar_sync_queue where session_id = ${sessionId} and queued_at = ${queuedAt}::timestamptz`;
      }
      await sql`update public.calendar_sync_queue set claimed_until = null, attempts = 0 where session_id = ${sessionId}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Calendar sync failed for session ${sessionId}: ${message}`);
      await sql`
        update public.calendar_sync_queue
        set claimed_until = now() + least(interval '1 hour', interval '1 minute' * power(2, attempts - 1)),
            last_error = ${message.slice(0, 1000)}
        where session_id = ${sessionId}
      `;
      // Google refusing the app's access fails every session alike; stop and leave them queued.
      if (error instanceof GoogleError && (error.status === 401 || error.status === 403)) return;
    }
  }
}
