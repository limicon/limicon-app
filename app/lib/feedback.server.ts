import type { Db } from "~/lib/db.server";
import type { FeedbackKind, Harvest, HostFeedback } from "~/lib/feedback";

/**
 * Which sessions the forms cover: published sessions of the current edition that have ended, but
 * not Organizing Team co-creation meetings. `s` is the session row.
 */
function ended(sql: Db, editionId: number) {
  return sql`s.edition_id = ${editionId} and s.published and not s.is_cocreation_meeting and s.ends_at <= now()`;
}

function hosts(sql: Db, userId: string) {
  return sql`exists (select 1 from public.session_hosts h where h.session_id = s.id and h.profile_id = ${userId})`;
}

function registered(sql: Db, userId: string) {
  return sql`exists (select 1 from public.session_rsvps r where r.session_id = s.id and r.profile_id = ${userId} and r.status = 'registered')`;
}

/**
 * Who owes which form, which the "New Form" badge counts: a host or co-host owes Session Host
 * Feedback, and a member with a registered RSVP (not a waitlisted one) owes a Session Harvest.
 * Hosts never hold RSVPs to their own sessions, so nobody owes both forms for one session.
 */
function owes(sql: Db, kind: FeedbackKind, userId: string) {
  return kind === "host" ? hosts(sql, userId) : registered(sql, userId);
}

/**
 * Who may fill in which form. Only hosts send Host Feedback, but any member may send a harvest for
 * any session they didn't host, since some join without RSVPing.
 */
function mayAnswer(sql: Db, kind: FeedbackKind, userId: string) {
  return kind === "host" ? hosts(sql, userId) : sql`not ${hosts(sql, userId)}`;
}

function answersTable(sql: Db, kind: FeedbackKind) {
  return kind === "host" ? sql`public.host_feedback` : sql`public.session_harvests`;
}

export type FeedbackCounts = {
  /** Sessions the member hosted, and how many lack their feedback. */
  host: { sessions: number; pending: number };
  /** Sessions the member could harvest, and how many they RSVP'd to and haven't harvested. */
  harvest: { sessions: number; pending: number };
};

/** What the Members home page's feedback boxes show. */
export async function countFeedback(sql: Db, userId: string, editionId: number): Promise<FeedbackCounts> {
  const count = async (kind: FeedbackKind) => {
    const [row] = await sql<{ sessions: number; pending: number }[]>`
      select count(*)::int as sessions,
        count(*) filter (where a.session_id is null and ${owes(sql, kind, userId)})::int as pending
      from public.sessions s
      left join ${answersTable(sql, kind)} a on a.session_id = s.id and a.profile_id = ${userId}
      where ${ended(sql, editionId)} and ${mayAnswer(sql, kind, userId)}
    `;
    return row ?? { sessions: 0, pending: 0 };
  };
  const [host, harvest] = await Promise.all([count("host"), count("harvest")]);
  return { host, harvest };
}

export type FeedbackSession = {
  sessionId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  submittedAt: Date | null;
};

/**
 * A member's forms of one kind: the ones they owe and the ones they've sent, unsent first, then
 * the latest sessions first.
 */
export async function listFeedback(sql: Db, kind: FeedbackKind, userId: string, editionId: number) {
  return await sql<FeedbackSession[]>`
    select s.id as "sessionId", s.title, s.starts_at as "startsAt", s.ends_at as "endsAt", a.submitted_at as "submittedAt"
    from public.sessions s
    left join ${answersTable(sql, kind)} a on a.session_id = s.id and a.profile_id = ${userId}
    where ${ended(sql, editionId)} and ${mayAnswer(sql, kind, userId)}
      and (${owes(sql, kind, userId)} or a.session_id is not null)
    order by a.submitted_at is not null, s.starts_at desc
  `;
}

/** Ended sessions a member may harvest beyond the ones `listFeedback` shows, latest first. */
export async function listOtherHarvestSessions(sql: Db, userId: string, editionId: number) {
  return await sql<{ sessionId: string; title: string; startsAt: Date; endsAt: Date }[]>`
    select s.id as "sessionId", s.title, s.starts_at as "startsAt", s.ends_at as "endsAt"
    from public.sessions s
    where ${ended(sql, editionId)} and ${mayAnswer(sql, "harvest", userId)} and not ${registered(sql, userId)}
      and not exists (select 1 from public.session_harvests a where a.session_id = s.id and a.profile_id = ${userId})
    order by s.starts_at desc
  `;
}

/** One session a member may fill in this form for, or null when they may not. */
export async function getOwedSession(sql: Db, kind: FeedbackKind, userId: string, editionId: number, sessionId: string) {
  if (!UUID.test(sessionId)) return null;
  const [session] = await sql<{ sessionId: string; title: string; startsAt: Date; endsAt: Date }[]>`
    select s.id as "sessionId", s.title, s.starts_at as "startsAt", s.ends_at as "endsAt"
    from public.sessions s
    where s.id = ${sessionId} and ${ended(sql, editionId)} and ${mayAnswer(sql, kind, userId)}
  `;
  return session ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A host's saved answers for a session, or null before they submit. */
export async function getHostFeedback(sql: Db, userId: string, sessionId: string) {
  const [row] = await sql<(HostFeedback & { submittedAt: Date })[]>`
    select participant_count as "participantCount", experience, experience_other as "experienceOther",
      how_it_went as "howItWent", organizer_feedback as "organizerFeedback", had_tensions as "hadTensions",
      tensions, tensions_other as "tensionsOther", tensions_description as "tensionsDescription",
      wants_support as "wantsSupport", submitted_at as "submittedAt"
    from public.host_feedback where session_id = ${sessionId} and profile_id = ${userId}
  `;
  return row ?? null;
}

/** A participant's saved harvest for a session, or null before they submit. */
export async function getHarvest(sql: Db, userId: string, sessionId: string) {
  const [row] = await sql<(Harvest & { submittedAt: Date })[]>`
    select takeaway, feed_back as "feedBack", attracted_repelled as "attractedRepelled", one_word as "oneWord",
      voice_note_key as "voiceNoteKey", submitted_at as "submittedAt"
    from public.session_harvests where session_id = ${sessionId} and profile_id = ${userId}
  `;
  return row ?? null;
}

/**
 * Saves a host's answers, replacing earlier ones. Returns false, saving nothing, unless they host
 * the session and it has ended.
 */
export async function saveHostFeedback(sql: Db, userId: string, editionId: number, sessionId: string, answers: HostFeedback) {
  if (!(await getOwedSession(sql, "host", userId, editionId, sessionId))) return false;
  const a = answers;
  await sql`
    insert into public.host_feedback (session_id, profile_id, participant_count, experience, experience_other,
      how_it_went, organizer_feedback, had_tensions, tensions, tensions_other, tensions_description, wants_support)
    values (${sessionId}, ${userId}, ${a.participantCount}, ${a.experience}, ${a.experienceOther},
      ${a.howItWent}, ${a.organizerFeedback}, ${a.hadTensions}, ${a.tensions}, ${a.tensionsOther},
      ${a.tensionsDescription}, ${a.wantsSupport})
    on conflict (session_id, profile_id) do update set
      participant_count = excluded.participant_count, experience = excluded.experience,
      experience_other = excluded.experience_other, how_it_went = excluded.how_it_went,
      organizer_feedback = excluded.organizer_feedback, had_tensions = excluded.had_tensions,
      tensions = excluded.tensions, tensions_other = excluded.tensions_other,
      tensions_description = excluded.tensions_description, wants_support = excluded.wants_support,
      updated_at = now()
  `;
  return true;
}

/**
 * Saves a member's harvest, replacing an earlier one. Returns false, saving nothing, unless the
 * session has ended and they didn't host it.
 */
export async function saveHarvest(sql: Db, userId: string, editionId: number, sessionId: string, answers: Harvest) {
  if (!(await getOwedSession(sql, "harvest", userId, editionId, sessionId))) return false;
  const a = answers;
  await sql`
    insert into public.session_harvests (session_id, profile_id, takeaway, feed_back, attracted_repelled, one_word, voice_note_key)
    values (${sessionId}, ${userId}, ${a.takeaway}, ${a.feedBack}, ${a.attractedRepelled}, ${a.oneWord}, ${a.voiceNoteKey})
    on conflict (session_id, profile_id) do update set
      takeaway = excluded.takeaway, feed_back = excluded.feed_back,
      attracted_repelled = excluded.attracted_repelled, one_word = excluded.one_word,
      voice_note_key = excluded.voice_note_key, updated_at = now()
  `;
  return true;
}
