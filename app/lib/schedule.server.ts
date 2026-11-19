import type { Db } from "~/lib/db.server";
import type { RichDoc } from "~/lib/rich-text";

/** A published session as members see it on the calendar. */
export type ScheduledSession = {
  id: string;
  title: string;
  theme: string | null;
  sessionTypes: string[];
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  city: string | null;
  /** Host and co-host names, host first. */
  hosts: string[];
  /** The viewer's RSVP, if they have one. */
  myRsvp: "registered" | "waitlisted" | null;
};

/** Everything a session's page shows to members (CAL-10). */
export type SessionDetails = ScheduledSession & {
  description: string | null;
  descriptionDoc: RichDoc | null;
  intention: string | null;
  experience: string[];
  meetingLink: string | null;
  venueNote: string | null;
  maxParticipants: number | null;
  privacy: "private" | "participants" | "members" | "public";
  /** Whether the viewer hosts it, so the page can offer to edit. */
  viewerHosts: boolean;
};

export type ScheduleFilters = {
  /** The member looking, whose RSVPs show on each session. */
  viewerId: string;
  /** My Schedule: only sessions the viewer has RSVPed to (CAL-7). */
  mineOnly: boolean;
  /** Hosting: only sessions the viewer hosts or co-hosts. */
  hostingOnly?: boolean;
  /** Only sessions ending after this instant, or starting before it when `past` is set. */
  now: Date;
  past: boolean;
  theme: string | null;
  sessionType: string | null;
  keyword: string | null;
};

/**
 * The edition's published sessions, filtered. The keyword matches titles, descriptions and host
 * names, ignoring case. Upcoming sessions come soonest first; with `past`,
 * finished ones come most recent first. Members see only published sessions on the calendar.
 */
export async function listScheduledSessions(
  sql: Db,
  editionId: number,
  filters: ScheduleFilters,
): Promise<ScheduledSession[]> {
  const pattern = filters.keyword ? `%${filters.keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return sql<ScheduledSession[]>`
    select s.id, s.title, s.theme, s.session_types as "sessionTypes",
           s.starts_at as "startsAt", s.ends_at as "endsAt", s.time_zone as "timeZone", s.city,
           coalesce((
             select array_agg(
               coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'A Limicon member')
               order by h.role = 'co-host', p.first_name, p.last_name
             )
             from public.session_hosts h join public.profiles p on p.id = h.profile_id
             where h.session_id = s.id
           ), '{}') as hosts,
           mine.status as "myRsvp"
    from public.sessions s
    left join public.session_rsvps mine on mine.session_id = s.id and mine.profile_id = ${filters.viewerId}
    where s.edition_id = ${editionId}
      and s.published
      and (not ${filters.mineOnly} or mine.status is not null)
      and (
        not ${filters.hostingOnly ?? false}
        or exists (select 1 from public.session_hosts h where h.session_id = s.id and h.profile_id = ${filters.viewerId})
      )
      and ${filters.past ? sql`s.ends_at <= ${filters.now}` : sql`s.ends_at > ${filters.now}`}
      and (${filters.theme}::text is null or s.theme = ${filters.theme})
      and (${filters.sessionType}::text is null or ${filters.sessionType} = any (s.session_types))
      and (
        ${pattern}::text is null
        or s.title ilike ${pattern}
        or s.description ilike ${pattern}
        or exists (
          select 1 from public.session_hosts h join public.profiles p on p.id = h.profile_id
          where h.session_id = s.id and concat_ws(' ', p.first_name, p.last_name) ilike ${pattern}
        )
      )
    order by ${filters.past ? sql`s.starts_at desc` : sql`s.starts_at asc`}, s.title
  `;
}

/** A published session in the edition, for its page; null if there's no such session. */
export async function getSessionDetails(
  sql: Db,
  sessionId: string,
  editionId: number,
  viewerId: string,
): Promise<SessionDetails | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const [row] = await sql<SessionDetails[]>`
    select s.id, s.title, s.theme, s.session_types as "sessionTypes",
           s.starts_at as "startsAt", s.ends_at as "endsAt", s.time_zone as "timeZone", s.city,
           coalesce((
             select array_agg(
               coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'A Limicon member')
               order by h.role = 'co-host', p.first_name, p.last_name
             )
             from public.session_hosts h join public.profiles p on p.id = h.profile_id
             where h.session_id = s.id
           ), '{}') as hosts,
           s.description, s.description_doc as "descriptionDoc", s.intention, s.experience, s.meeting_link as "meetingLink",
           s.venue_note as "venueNote", s.max_participants as "maxParticipants", s.privacy,
           exists (
             select 1 from public.session_hosts h where h.session_id = s.id and h.profile_id = ${viewerId}
           ) as "viewerHosts",
           mine.status as "myRsvp"
    from public.sessions s
    left join public.session_rsvps mine on mine.session_id = s.id and mine.profile_id = ${viewerId}
    where s.id = ${sessionId} and s.edition_id = ${editionId} and s.published
  `;
  return row ?? null;
}

/**
 * A marker that changes whenever the edition's calendar does: a session published, edited,
 * unpublished or deleted. Open calendar pages compare it to notice changes (CAL-4).
 */
export async function scheduleVersion(sql: Db, editionId: number): Promise<string> {
  const [row] = await sql<{ version: string }[]>`
    select concat_ws(':', count(*) filter (where published), max(updated_at)::text, count(*)) as version
    from public.sessions
    where edition_id = ${editionId}
  `;
  return row?.version ?? "";
}
