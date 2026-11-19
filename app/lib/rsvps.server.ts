import type { Db } from "~/lib/db.server";

export type RsvpStatus = "registered" | "waitlisted";

/** A member's place at a session: an RSVP, or hosting it, which counts as going without one. */
export type Attendance = RsvpStatus | "hosting";

/** What happened when a member asked to RSVP. */
export type RsvpOutcome = Attendance | "full" | "not-found";

/** A session's RSVPs as one member sees them. */
export type RsvpSummary = {
  registered: number;
  waitlisted: number;
  capacity: number | null;
  waitlistEnabled: boolean;
  mine: Attendance | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RSVPs a member to a published session that hasn't finished (CAL-5). The capacity check and the
 * insert happen in one transaction that locks the session's row, so two members can't take the
 * last place at once. A full session puts the member on its waitlist when the host keeps one, and
 * refuses otherwise. RSVPing again changes nothing. Hosts and co-hosts are already going, so they
 * get "hosting" and no RSVP, which keeps their places free for others.
 */
export async function rsvp(sql: Db, args: { sessionId: string; userId: string }): Promise<RsvpOutcome> {
  const { sessionId, userId } = args;
  if (!UUID.test(sessionId)) return "not-found";
  return (await sql.begin(async (tx) => {
    const [session] = await tx<{ capacity: number | null; waitlistEnabled: boolean }[]>`
      select max_participants as capacity, waitlist_enabled as "waitlistEnabled"
      from public.sessions
      where id = ${sessionId} and published and ends_at > now()
      for update
    `;
    if (!session) return "not-found";

    const [host] = await tx`
      select 1 from public.session_hosts where session_id = ${sessionId} and profile_id = ${userId}
    `;
    if (host) return "hosting";

    const [existing] = await tx<{ status: RsvpStatus }[]>`
      select status from public.session_rsvps where session_id = ${sessionId} and profile_id = ${userId}
    `;
    if (existing) return existing.status;

    const [count] = await tx<{ registered: number }[]>`
      select count(*)::int as registered from public.session_rsvps
      where session_id = ${sessionId} and status = 'registered'
    `;
    const hasPlace = session.capacity === null || (count?.registered ?? 0) < session.capacity;
    if (!hasPlace && !session.waitlistEnabled) return "full";

    const status: RsvpStatus = hasPlace ? "registered" : "waitlisted";
    await tx`
      insert into public.session_rsvps (session_id, profile_id, status)
      values (${sessionId}, ${userId}, ${status})
    `;
    return status;
  })) as RsvpOutcome;
}

/**
 * Cancels a member's RSVP. When that frees a place, the earliest waitlisted RSVP becomes
 * registered, in the same locked transaction.
 */
export async function cancelRsvp(sql: Db, args: { sessionId: string; userId: string }) {
  const { sessionId, userId } = args;
  if (!UUID.test(sessionId)) return;
  await sql.begin(async (tx) => {
    const [session] = await tx<{ capacity: number | null }[]>`
      select max_participants as capacity from public.sessions where id = ${sessionId} for update
    `;
    const [removed] = await tx<{ status: RsvpStatus }[]>`
      delete from public.session_rsvps where session_id = ${sessionId} and profile_id = ${userId}
      returning status
    `;
    if (!session || removed?.status !== "registered") return;
    await tx`
      update public.session_rsvps set status = 'registered'
      where (session_id, profile_id) = (
        select session_id, profile_id from public.session_rsvps
        where session_id = ${sessionId} and status = 'waitlisted'
          and (
            ${session.capacity}::int is null
            or (select count(*) from public.session_rsvps where session_id = ${sessionId} and status = 'registered') < ${session.capacity}
          )
        order by created_at
        limit 1
      )
    `;
  });
}

/** Counts a session's RSVPs, and finds the member's own. */
export async function getRsvpSummary(sql: Db, sessionId: string, userId: string): Promise<RsvpSummary> {
  if (!UUID.test(sessionId)) return { registered: 0, waitlisted: 0, capacity: null, waitlistEnabled: false, mine: null };
  const [row] = await sql<
    { registered: number; waitlisted: number; capacity: number | null; waitlistEnabled: boolean; mine: Attendance | null }[]
  >`
    select
      (select count(*)::int from public.session_rsvps r where r.session_id = s.id and r.status = 'registered') as registered,
      (select count(*)::int from public.session_rsvps r where r.session_id = s.id and r.status = 'waitlisted') as waitlisted,
      s.max_participants as capacity,
      s.waitlist_enabled as "waitlistEnabled",
      case
        when exists (select 1 from public.session_hosts h where h.session_id = s.id and h.profile_id = ${userId}) then 'hosting'
        else (select r.status from public.session_rsvps r where r.session_id = s.id and r.profile_id = ${userId})
      end as mine
    from public.sessions s
    where s.id = ${sessionId}
  `;
  return {
    registered: row?.registered ?? 0,
    waitlisted: row?.waitlisted ?? 0,
    capacity: row?.capacity ?? null,
    waitlistEnabled: row?.waitlistEnabled ?? false,
    mine: row?.mine ?? null,
  };
}
