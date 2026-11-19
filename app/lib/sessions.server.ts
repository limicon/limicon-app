import type { Db } from "~/lib/db.server";
import type { SessionValues } from "~/lib/session-form";

/** A session as its hosts see it in the editor. */
export type EditableSession = SessionValues & { id: string; published: boolean };

/** A session in the host's own list. */
export type HostedSession = {
  id: string;
  title: string;
  published: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  timeZone: string;
  role: "host" | "co-host";
};

/** The description document as a jsonb parameter, or null. */
const descriptionJson = (sql: Db, v: SessionValues) => (v.descriptionDoc ? sql.json(v.descriptionDoc as never) : null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function hasAcceptedGuidelines(sql: Db, userId: string, editionId: number) {
  const rows = await sql`
    select 1 from public.host_guideline_acceptances
    where profile_id = ${userId} and edition_id = ${editionId}
  `;
  return rows.length > 0;
}

/** Records that the member accepted this edition's host guidelines (SES-2). Accepting twice is harmless. */
export async function acceptGuidelines(sql: Db, userId: string, editionId: number) {
  await sql`
    insert into public.host_guideline_acceptances (profile_id, edition_id)
    values (${userId}, ${editionId})
    on conflict do nothing
  `;
}

/** The sessions this member hosts or co-hosts in an edition, soonest first, undated drafts last. */
export async function listHostedSessions(sql: Db, userId: string, editionId: number): Promise<HostedSession[]> {
  return sql<HostedSession[]>`
    select s.id, s.title, s.published, s.starts_at as "startsAt", s.ends_at as "endsAt",
           s.time_zone as "timeZone", h.role
    from public.sessions s
    join public.session_hosts h on h.session_id = s.id and h.profile_id = ${userId}
    where s.edition_id = ${editionId}
    order by s.starts_at asc nulls last, s.created_at asc
  `;
}

/**
 * A session the viewer may edit: one they host or co-host, or any session for an admin.
 * Returns null otherwise, including for ids that don't exist.
 */
export async function getEditableSession(
  sql: Db,
  sessionId: string,
  viewer: { userId: string; isAdmin: boolean },
): Promise<EditableSession | null> {
  if (!UUID.test(sessionId)) return null;
  const [row] = await sql<EditableSession[]>`
    select s.id, s.published, s.title, s.description, s.description_doc as "descriptionDoc", s.intention, s.theme,
           s.session_types as "sessionTypes", s.experience,
           s.starts_at as "startsAt", s.ends_at as "endsAt", s.time_zone as "timeZone",
           s.meeting_link as "meetingLink", s.city, s.venue_note as "venueNote",
           s.max_participants as "maxParticipants", s.waitlist_enabled as "waitlistEnabled",
           s.privacy, s.ai_assistant_allowed as "aiAssistantAllowed", s.ai_permissions as "aiPermissions"
    from public.sessions s
    where s.id = ${sessionId}
      and (
        ${viewer.isAdmin}
        or exists (select 1 from public.session_hosts h where h.session_id = s.id and h.profile_id = ${viewer.userId})
      )
  `;
  return row ?? null;
}

/** Creates a session with the member as its host, and returns its id. */
export async function createSession(
  sql: Db,
  args: { userId: string; editionId: number; values: SessionValues; publish: boolean },
): Promise<string> {
  const { userId, editionId, values: v, publish } = args;
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.sessions (
        edition_id, created_by, published, title, description, description_doc, intention, theme, session_types,
        experience, starts_at, ends_at, time_zone, meeting_link, city, venue_note,
        max_participants, waitlist_enabled, privacy, ai_assistant_allowed, ai_permissions
      ) values (
        ${editionId}, ${userId}, ${publish}, ${v.title}, ${v.description}, ${descriptionJson(sql, v)}, ${v.intention}, ${v.theme},
        ${v.sessionTypes}::text[], ${v.experience}::text[], ${v.startsAt}, ${v.endsAt},
        ${v.timeZone}, ${v.meetingLink}, ${v.city}, ${v.venueNote}, ${v.maxParticipants},
        ${v.waitlistEnabled}, ${v.privacy}, ${v.aiAssistantAllowed}, ${v.aiPermissions}::text[]
      )
      returning id
    `;
    await tx`insert into public.session_hosts (session_id, profile_id, role) values (${row!.id}, ${userId}, 'host')`;
    return row!.id;
  }) as Promise<string>;
}

/** Saves a session's fields and whether it's published. Callers check permission first. */
export async function updateSession(sql: Db, sessionId: string, values: SessionValues, publish: boolean) {
  const v = values;
  await sql`
    update public.sessions set
      published = ${publish}, title = ${v.title}, description = ${v.description},
      description_doc = ${descriptionJson(sql, v)},
      intention = ${v.intention}, theme = ${v.theme},
      session_types = ${v.sessionTypes}::text[], experience = ${v.experience}::text[],
      starts_at = ${v.startsAt}, ends_at = ${v.endsAt}, time_zone = ${v.timeZone},
      meeting_link = ${v.meetingLink}, city = ${v.city}, venue_note = ${v.venueNote},
      max_participants = ${v.maxParticipants}, waitlist_enabled = ${v.waitlistEnabled},
      privacy = ${v.privacy}, ai_assistant_allowed = ${v.aiAssistantAllowed},
      ai_permissions = ${v.aiPermissions}::text[], updated_at = now()
    where id = ${sessionId}
  `;
}

/**
 * Deletes a session, or, when members have RSVPed, unpublishes it instead, so the RSVPs stay as a
 * record of who was told (docs/feature-sessions.md → Lifecycle). Returns which happened. Callers
 * check permission first.
 */
export async function deleteSession(sql: Db, sessionId: string): Promise<"deleted" | "unpublished"> {
  const [unpublished] = await sql`
    update public.sessions set published = false, updated_at = now()
    where id = ${sessionId}
      and exists (select 1 from public.session_rsvps r where r.session_id = ${sessionId})
    returning id
  `;
  if (unpublished) return "unpublished";
  await sql`delete from public.sessions where id = ${sessionId}`;
  return "deleted";
}
