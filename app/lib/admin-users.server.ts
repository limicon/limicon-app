/**
 * The admin console's Users page: every account, its ticket for the current edition, its roles,
 * and what admins can change about it. Routes under /admin pass `requireAdmin` first; changing
 * roles needs `full`, which callers check.
 */
import { USERS_PER_PAGE, type UserFilters } from "~/lib/admin-users";
import type { Db } from "~/lib/db.server";

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  joinedAt: Date;
  lastSignInAt: Date | null;
  deactivatedAt: Date | null;
  ticketStatus: "paid" | "comp" | "refunded" | null;
  tier: string | null;
  permissions: string[];
  hostedSessions: number;
};

/**
 * Accounts matching the filters, a page at a time, with the total that match. Pass
 * `perPage: null` for every match, as the CSV export does.
 */
export async function listUsers(
  sql: Db,
  editionId: number,
  f: UserFilters,
  perPage: number | null = USERS_PER_PAGE,
): Promise<{ users: UserRow[]; total: number }> {
  const pattern = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const order =
    f.sort === "oldest"
      ? sql`p.created_at asc`
      : f.sort === "name"
        ? sql`lower(coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email)) asc`
        : sql`p.created_at desc`;
  const rows = await sql<(UserRow & { total: number })[]>`
    with base as (
      select p.id, nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as name, u.email,
             p.created_at as "joinedAt", u.last_sign_in_at as "lastSignInAt", p.deactivated_at as "deactivatedAt",
             t.status as "ticketStatus", tt.name as tier,
             coalesce(array(select a.permission from public.admin_permissions a where a.profile_id = p.id order by a.permission), '{}') as permissions,
             (select count(*) from public.session_hosts h join public.sessions s on s.id = h.session_id
               where h.profile_id = p.id and s.edition_id = ${editionId})::int as "hostedSessions",
             p.created_at, p.first_name, p.last_name
      from public.profiles p
      left join auth.users u on u.id = p.id
      left join lateral (
        select status, tier_id from public.tickets
        where profile_id = p.id and edition_id = ${editionId}
        order by status = 'refunded', created_at desc
        limit 1
      ) t on true
      left join public.ticket_tiers tt on tt.id = t.tier_id
      where (${f.q === ""} or u.email ilike ${pattern} or concat_ws(' ', p.first_name, p.last_name) ilike ${pattern})
        and (${f.account === "all"} or (${f.account === "deactivated"} = (p.deactivated_at is not null)))
    )
    select p.id, p.name, p.email, p."joinedAt", p."lastSignInAt", p."deactivatedAt", p."ticketStatus", p.tier,
           p.permissions, p."hostedSessions", count(*) over ()::int as total
    from base p
    left join auth.users u on u.id = p.id
    where case ${f.ticket}::text
            when 'holder' then p."ticketStatus" in ('paid', 'comp')
            when 'none' then p."ticketStatus" is null
            when 'any' then true
            else p."ticketStatus" = ${f.ticket}::text
          end
      and case ${f.role}::text
            when 'admin' then cardinality(p.permissions) > 0
            when 'host' then p."hostedSessions" > 0
            when 'member' then cardinality(p.permissions) = 0 and p."hostedSessions" = 0
            when 'any' then true
            else ${f.role.startsWith("r:") ? f.role.slice(2) : ""}::text = any(p.permissions)
          end
    order by ${order}, p.id
    ${perPage === null ? sql`` : sql`limit ${perPage} offset ${(f.page - 1) * perPage}`}
  `;
  return {
    total: rows[0]?.total ?? (f.page > 1 ? (await listUsers(sql, editionId, { ...f, page: 1 }, 1)).total : 0),
    users: rows.map(({ total: _total, ...user }) => user),
  };
}

export type UserDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  joinedAt: Date;
  lastSignInAt: Date | null;
  deactivatedAt: Date | null;
  timeZone: string | null;
  tickets: { id: number; year: number; status: "paid" | "comp" | "refunded"; tier: string | null; amountPaidCents: number; createdAt: Date }[];
  permissions: { permission: string; grantedBy: string | null; grantedAt: Date }[];
  sessions: { id: string; title: string; published: boolean; role: "host" | "co-host" }[];
  rsvps: number;
  answers: { question: string; answer: string; answeredAt: Date }[];
  notes: { id: number; body: string; author: string | null; authorId: string | null; createdAt: Date }[];
};

const displayName = (alias: string, users: string) =>
  `coalesce(nullif(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), ''), ${users}.email)`;

/** Everything the console shows about one account, or null when there's no such account. */
export async function getUser(sql: Db, profileId: string, editionId: number): Promise<UserDetail | null> {
  const [profile] = await sql<Omit<UserDetail, "tickets" | "permissions" | "sessions" | "rsvps" | "answers" | "notes">[]>`
    select p.id, p.first_name as "firstName", p.last_name as "lastName", u.email, p.created_at as "joinedAt",
           u.last_sign_in_at as "lastSignInAt", p.deactivated_at as "deactivatedAt", p.time_zone as "timeZone"
    from public.profiles p left join auth.users u on u.id = p.id
    where p.id = ${profileId}
  `;
  if (!profile) return null;
  const [tickets, permissions, sessions, [rsvps], answers, notes] = await Promise.all([
    sql<(Omit<UserDetail["tickets"][number], "id"> & { id: string })[]>`
      select t.id, e.year, t.status, tt.name as tier, t.amount_paid_cents as "amountPaidCents", t.created_at as "createdAt"
      from public.tickets t join public.editions e on e.id = t.edition_id
      left join public.ticket_tiers tt on tt.id = t.tier_id
      where t.profile_id = ${profileId}
      order by e.year desc, t.created_at desc
    `,
    sql<UserDetail["permissions"]>`
      select a.permission, ${sql.unsafe(displayName("g", "gu"))} as "grantedBy", a.granted_at as "grantedAt"
      from public.admin_permissions a
      left join public.profiles g on g.id = a.granted_by left join auth.users gu on gu.id = g.id
      where a.profile_id = ${profileId}
      order by a.permission
    `,
    sql<UserDetail["sessions"]>`
      select s.id, s.title, s.published, h.role
      from public.session_hosts h join public.sessions s on s.id = h.session_id
      where h.profile_id = ${profileId} and s.edition_id = ${editionId}
      order by s.starts_at nulls last, s.created_at
    `,
    sql<{ count: number }[]>`
      select count(*)::int as count from public.session_rsvps r join public.sessions s on s.id = r.session_id
      where r.profile_id = ${profileId} and s.edition_id = ${editionId}
    `,
    sql<UserDetail["answers"]>`
      select question, answer, answered_at as "answeredAt" from public.registration_answers
      where profile_id = ${profileId} and edition_id = ${editionId}
    `,
    sql<(Omit<UserDetail["notes"][number], "id"> & { id: string })[]>`
      select n.id, n.body, ${sql.unsafe(displayName("a", "au"))} as author, n.author_id as "authorId", n.created_at as "createdAt"
      from public.admin_user_notes n
      left join public.profiles a on a.id = n.author_id left join auth.users au on au.id = a.id
      where n.profile_id = ${profileId}
      order by n.created_at desc
    `,
  ]);
  return {
    ...profile,
    tickets: tickets.map((t) => ({ ...t, id: Number(t.id) })),
    permissions: [...permissions],
    sessions: [...sessions],
    rsvps: rsvps!.count,
    answers: [...answers],
    notes: notes.map((n) => ({ ...n, id: Number(n.id) })),
  };
}

export async function updateUserName(sql: Db, profileId: string, firstName: string | null, lastName: string | null) {
  await sql`
    update public.profiles set first_name = ${firstName}, last_name = ${lastName}, updated_at = now()
    where id = ${profileId}
  `;
}

/** Deactivates or reactivates an account (MSG-4). Callers stop admins deactivating themselves. */
export async function setDeactivated(sql: Db, profileId: string, deactivated: boolean) {
  await sql`
    update public.profiles set deactivated_at = ${deactivated ? sql`now()` : null}, updated_at = now()
    where id = ${profileId}
  `;
}

export async function addUserNote(sql: Db, profileId: string, authorId: string, body: string) {
  await sql`insert into public.admin_user_notes (profile_id, author_id, body) values (${profileId}, ${authorId}, ${body})`;
}

/** Deletes a note, only when `authorId` wrote it. */
export async function deleteUserNote(sql: Db, noteId: number, authorId: string) {
  const rows = await sql`delete from public.admin_user_notes where id = ${noteId} and author_id = ${authorId} returning id`;
  return rows.length > 0;
}
