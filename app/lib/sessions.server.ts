import type { Db } from "~/lib/db.server";
import type { Person, SessionValues } from "~/lib/session-form";

/** A session as its hosts see it in the editor. */
export type EditableSession = SessionValues & {
  id: string;
  published: boolean;
  /** The member who created it, who can't be added again as a co-host. */
  hostId: string | null;
  coHosts: Person[];
};

/** A member found by the co-host search, with a masked email to tell apart people of the same name. */
export type MemberMatch = Person & { hint: string };

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

/** A profile's name as members see it. */
const DISPLAY_NAME = "coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'A Limicon member')";

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
           s.privacy, s.ai_assistant_allowed as "aiAssistantAllowed", s.ai_permissions as "aiPermissions",
           (select h.profile_id from public.session_hosts h where h.session_id = s.id and h.role = 'host' limit 1) as "hostId",
           array(
             select h.profile_id::text from public.session_hosts h join public.profiles p on p.id = h.profile_id
             where h.session_id = s.id and h.role = 'co-host' order by p.first_name, p.last_name
           ) as "coHostIds",
           coalesce((
             select json_agg(json_build_object('id', p.id, 'name', ${sql.unsafe(DISPLAY_NAME)}) order by p.first_name, p.last_name)
             from public.session_hosts h join public.profiles p on p.id = h.profile_id
             where h.session_id = s.id and h.role = 'co-host'
           ), '[]') as "coHosts"
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
    await saveCoHosts(tx as unknown as Db, row!.id, v.coHostIds);
    return row!.id;
  }) as Promise<string>;
}

/** Saves a session's fields and whether it's published. Callers check permission first. */
export async function updateSession(sql: Db, sessionId: string, values: SessionValues, publish: boolean) {
  const v = values;
  await sql.begin(async (tx) => {
    await updateColumns(tx as unknown as Db, sessionId, v, publish);
    await saveCoHosts(tx as unknown as Db, sessionId, v.coHostIds);
  });
}

async function updateColumns(sql: Db, sessionId: string, v: SessionValues, publish: boolean) {
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

/**
 * Sets a session's co-hosts to `ids`, leaving its host alone. Hosting counts as going, so a new
 * co-host's RSVP is removed, and anyone waitlisted moves up into the freed places.
 */
async function saveCoHosts(sql: Db, sessionId: string, ids: string[]) {
  await sql`
    delete from public.session_hosts
    where session_id = ${sessionId} and role = 'co-host' and not (profile_id = any (${ids}::uuid[]))
  `;
  await sql`
    insert into public.session_hosts (session_id, profile_id, role)
    select ${sessionId}, id, 'co-host' from unnest(${ids}::uuid[]) as id
    on conflict do nothing
  `;
  const removed = await sql`
    delete from public.session_rsvps r
    using public.session_hosts h
    where r.session_id = ${sessionId} and h.session_id = r.session_id and h.profile_id = r.profile_id
    returning r.status
  `;
  if (removed.length === 0) return;
  await sql`
    update public.session_rsvps set status = 'registered'
    where (session_id, profile_id) in (
      select w.session_id, w.profile_id from public.session_rsvps w
      where w.session_id = ${sessionId} and w.status = 'waitlisted'
      order by w.created_at
      limit (
        select case when s.max_participants is null then null
               else greatest(0, s.max_participants - (
                 select count(*) from public.session_rsvps r where r.session_id = s.id and r.status = 'registered'
               )) end
        from public.sessions s where s.id = ${sessionId}
      )
    )
  `;
}

/**
 * Members who can co-host in the edition: ticket holders and admins, not deactivated. Matches
 * names, ignoring case, or a whole email address. At most `limit` results.
 */
export async function findMembers(sql: Db, editionId: number, query: string, limit = 8): Promise<MemberMatch[]> {
  const q = query.replace(/^@/, "").trim().slice(0, 100);
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql<(Person & { email: string | null })[]>`
    select p.id, ${sql.unsafe(DISPLAY_NAME)} as name, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.deactivated_at is null
      and (
        exists (select 1 from public.tickets t where t.profile_id = p.id and t.edition_id = ${editionId} and t.status in ('paid', 'comp'))
        or exists (select 1 from public.admin_permissions a where a.profile_id = p.id)
      )
      and (concat_ws(' ', p.first_name, p.last_name) ilike ${pattern} or lower(u.email) = lower(${q}))
    order by p.first_name, p.last_name
    limit ${limit}
  `;
  return rows.map(({ email, ...person }) => ({ ...person, hint: maskEmail(email) }));
}

/** The ids in `ids` that aren't members who can co-host in the edition. */
export async function ineligibleCoHosts(sql: Db, editionId: number, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    select c.id::text as id from unnest(${ids}::uuid[]) as c(id)
    where not exists (
      select 1 from public.profiles p
      where p.id = c.id and p.deactivated_at is null
        and (
          exists (select 1 from public.tickets t where t.profile_id = p.id and t.edition_id = ${editionId} and t.status in ('paid', 'comp'))
          or exists (select 1 from public.admin_permissions a where a.profile_id = p.id)
        )
    )
  `;
  return rows.map((row) => row.id);
}

/** "a•••@example.org": enough to tell two people of the same name apart. */
function maskEmail(email: string | null): string {
  if (!email) return "";
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}
