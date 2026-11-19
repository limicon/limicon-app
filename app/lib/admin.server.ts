/**
 * Data access for the admin console. Routes under /admin pass `requireAdmin` first; functions
 * that need a particular permission say so, and their callers check it.
 */
import type { Db } from "~/lib/db.server";
import type { AdminPermission, EditionSettings, MemberLink, TierValues } from "~/lib/admin-forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The admin permissions a person holds. */
export async function getAdminPermissions(sql: Db, userId: string): Promise<string[]> {
  const rows = await sql<{ permission: string }[]>`
    select permission from public.admin_permissions where profile_id = ${userId} order by permission
  `;
  return rows.map((row) => row.permission);
}

// --- Overview -------------------------------------------------------------------------------

/** The four headline numbers, for the whole edition or for the last 7 days. */
export type OverviewTotals = {
  ticketHolders: number;
  paid: number;
  comp: number;
  revenueCents: number;
  accounts: number;
  admins: number;
};

export type RecentBuyer = {
  orderId: number;
  profileId: string;
  name: string | null;
  email: string | null;
  tier: string | null;
  quantity: number;
  status: "paid" | "comp";
  amountCents: number;
  at: Date;
};

export type Overview = {
  totals: OverviewTotals;
  thisWeek: OverviewTotals;
  /** Everyone whose order completed in the last 7 days, most recent first. */
  recentBuyers: RecentBuyer[];
  /** Registrations (paid and comp) per week, oldest first, for the last 12 weeks. */
  weekly: { weekOf: string; tickets: number }[];
  sessions: { allTime: number; published: number; drafts: number; hosts: number };
  pendingInvitations: number;
};

/** The numbers for the console's front page, for one edition. */
export async function getOverview(sql: Db, editionId: number): Promise<Overview> {
  const totals = async (since: string | null) => {
    const after = since === null ? sql`true` : sql`created_at > now() - ${since}::interval`;
    const [row] = await sql<OverviewTotals[]>`
      select
        (select count(*) from public.tickets where edition_id = ${editionId} and status in ('paid', 'comp') and ${after})::int as "ticketHolders",
        (select count(*) from public.tickets where edition_id = ${editionId} and status = 'paid' and ${after})::int as paid,
        (select count(*) from public.tickets where edition_id = ${editionId} and status = 'comp' and ${after})::int as comp,
        (select coalesce(sum(amount_cents), 0) from public.orders
          where edition_id = ${editionId} and status = 'paid'
            and ${since === null ? sql`true` : sql`coalesce(completed_at, created_at) > now() - ${since}::interval`})::int as "revenueCents",
        (select count(*) from public.profiles where ${after})::int as accounts,
        (select count(distinct profile_id) from public.admin_permissions
          where ${since === null ? sql`true` : sql`granted_at > now() - ${since}::interval`})::int as admins
    `;
    return row!;
  };
  const [all, week, recentBuyers, weekly, [other]] = await Promise.all([
    totals(null),
    totals("7 days"),
    sql<(Omit<RecentBuyer, "orderId"> & { orderId: string })[]>`
      select o.id as "orderId", p.id as "profileId", nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as name,
             u.email, tt.name as tier, o.quantity, o.status, o.amount_cents as "amountCents",
             coalesce(o.completed_at, o.created_at) as at
      from public.orders o
      join public.profiles p on p.id = o.buyer_id
      left join auth.users u on u.id = p.id
      left join public.ticket_tiers tt on tt.id = o.tier_id
      where o.edition_id = ${editionId} and o.status in ('paid', 'comp')
        and coalesce(o.completed_at, o.created_at) > now() - interval '7 days'
      order by at desc
    `,
    sql<Overview["weekly"]>`
      select to_char(week, 'YYYY-MM-DD') as "weekOf", count(t.id)::int as tickets
      from generate_series(
        date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week'
      ) as week
      left join public.tickets t
        on t.edition_id = ${editionId} and t.status in ('paid', 'comp')
        and date_trunc('week', t.created_at) = week
      group by week
      order by week
    `,
    sql<{ allTime: number; published: number; drafts: number; hosts: number; pendingInvitations: number }[]>`
      select
        (select count(*) from public.sessions where published)::int as "allTime",
        (select count(*) from public.sessions where edition_id = ${editionId} and published)::int as published,
        (select count(*) from public.sessions where edition_id = ${editionId} and not published)::int as drafts,
        (select count(distinct h.profile_id) from public.session_hosts h
          join public.sessions s on s.id = h.session_id where s.edition_id = ${editionId})::int as hosts,
        (select count(distinct email) from public.admin_invitations)::int as "pendingInvitations"
    `,
  ]);
  const { pendingInvitations, ...sessions } = other!;
  return {
    totals: all,
    thisWeek: week,
    recentBuyers: recentBuyers.map((b) => ({ ...b, orderId: Number(b.orderId) })),
    weekly: [...weekly],
    sessions,
    pendingInvitations,
  };
}

/** Ticket holders and revenue by tier, for the Orders page's details. */
export async function getTierBreakdown(sql: Db, editionId: number) {
  return sql<{ name: string; tickets: number; revenueCents: number }[]>`
    select coalesce(tt.name, 'No tier') as name, count(*)::int as tickets,
           coalesce(sum(t.amount_paid_cents) filter (where t.status = 'paid'), 0)::int as "revenueCents"
    from public.tickets t
    left join public.ticket_tiers tt on tt.id = t.tier_id
    where t.edition_id = ${editionId} and t.status in ('paid', 'comp')
    group by tt.name, tt.sort_order
    order by tt.sort_order nulls last, tt.name
  `;
}

// --- Edition settings -----------------------------------------------------------------------

export async function getEditionSettings(sql: Db, editionId: number): Promise<EditionSettings> {
  const [row] = await sql<EditionSettings[]>`
    select registration_open as "registrationOpen", calendar_open as "calendarOpen"
    from public.editions where id = ${editionId}
  `;
  return row!;
}

export async function updateEditionSettings(sql: Db, editionId: number, v: EditionSettings) {
  await sql`
    update public.editions set registration_open = ${v.registrationOpen}, calendar_open = ${v.calendarOpen}
    where id = ${editionId}
  `;
}

/** The links members see for an edition (MEM-2), in order. */
export async function listMemberLinks(sql: Db, editionId: number): Promise<MemberLink[]> {
  return sql<MemberLink[]>`
    select label, url from public.edition_links where edition_id = ${editionId} order by sort_order, id
  `;
}

/** Replaces an edition's member links with `links`, in the order given. */
export async function saveMemberLinks(sql: Db, editionId: number, links: MemberLink[]) {
  await sql.begin(async (tx) => {
    await tx`delete from public.edition_links where edition_id = ${editionId}`;
    for (const [i, link] of links.entries()) {
      await tx`
        insert into public.edition_links (edition_id, label, url, sort_order)
        values (${editionId}, ${link.label}, ${link.url}, ${i})
      `;
    }
  });
}

export type Tier = TierValues & { id: number; tickets: number };

export async function listTiers(sql: Db, editionId: number): Promise<Tier[]> {
  const rows = await sql<(Omit<Tier, "id"> & { id: string })[]>`
    select tt.id, tt.name, tt.price_cents as "priceCents", tt.sort_order as "sortOrder",
           (select count(*) from public.tickets t where t.tier_id = tt.id)::int as tickets
    from public.ticket_tiers tt
    where tt.edition_id = ${editionId}
    order by tt.sort_order, tt.price_cents, tt.name
  `;
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/** Adds a tier, or returns "duplicate" when the edition already has one by that name. */
export async function addTier(sql: Db, editionId: number, v: TierValues): Promise<"added" | "duplicate"> {
  const rows = await sql`
    insert into public.ticket_tiers (edition_id, name, price_cents, sort_order)
    values (${editionId}, ${v.name}, ${v.priceCents}, ${v.sortOrder})
    on conflict (edition_id, name) do nothing
    returning id
  `;
  return rows.length ? "added" : "duplicate";
}

/** Changes a tier of this edition. Tickets already sold keep the amount they paid. */
export async function updateTier(sql: Db, editionId: number, tierId: number, v: TierValues): Promise<"saved" | "duplicate"> {
  try {
    await sql`
      update public.ticket_tiers set name = ${v.name}, price_cents = ${v.priceCents}, sort_order = ${v.sortOrder}
      where id = ${tierId} and edition_id = ${editionId}
    `;
    return "saved";
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return "duplicate";
    throw error;
  }
}

/** Removes a tier nobody holds a ticket in. Returns false when tickets use it. */
export async function deleteTier(sql: Db, editionId: number, tierId: number): Promise<boolean> {
  const rows = await sql`
    delete from public.ticket_tiers tt
    where tt.id = ${tierId} and tt.edition_id = ${editionId}
      and not exists (select 1 from public.tickets t where t.tier_id = tt.id)
    returning id
  `;
  return rows.length > 0;
}

// --- Sessions -------------------------------------------------------------------------------

export type AdminSession = {
  id: string;
  title: string;
  published: boolean;
  isCocreationMeeting: boolean;
  theme: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timeZone: string;
  hosts: string[];
  updatedAt: Date;
};

/** Every session in an edition, drafts included, soonest first and undated drafts last. */
export async function listAllSessions(sql: Db, editionId: number): Promise<AdminSession[]> {
  return sql<AdminSession[]>`
    select s.id, s.title, s.published, s.is_cocreation_meeting as "isCocreationMeeting", s.theme,
           s.starts_at as "startsAt", s.ends_at as "endsAt", s.time_zone as "timeZone",
           s.updated_at as "updatedAt",
           coalesce(array(
             select coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email, 'Unknown')
             from public.session_hosts h
             join public.profiles p on p.id = h.profile_id
             left join auth.users u on u.id = p.id
             where h.session_id = s.id
             order by h.role = 'host' desc, p.first_name
           ), '{}') as hosts
    from public.sessions s
    where s.edition_id = ${editionId}
    order by s.starts_at asc nulls last, s.created_at asc
  `;
}

export type AdminSessionMeta = {
  isCocreationMeeting: boolean;
  hosts: { id: string; name: string; role: "host" | "co-host" }[];
  rsvps: { registered: number; waitlisted: number };
  createdAt: Date;
  updatedAt: Date;
};

/** What the console shows beside a session's editor: hosts, RSVPs and the admin-only flag. */
export async function getAdminSessionMeta(sql: Db, editionId: number, sessionId: string): Promise<AdminSessionMeta | null> {
  const [row] = await sql<(Omit<AdminSessionMeta, "rsvps"> & { registered: number; waitlisted: number })[]>`
    select s.is_cocreation_meeting as "isCocreationMeeting", s.created_at as "createdAt", s.updated_at as "updatedAt",
           coalesce((
             select json_agg(json_build_object(
               'id', p.id,
               'name', coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email, 'Unknown'),
               'role', h.role
             ) order by h.role = 'host' desc, p.first_name)
             from public.session_hosts h join public.profiles p on p.id = h.profile_id
             left join auth.users u on u.id = p.id
             where h.session_id = s.id
           ), '[]') as hosts,
           (select count(*) from public.session_rsvps r where r.session_id = s.id and r.status = 'registered')::int as registered,
           (select count(*) from public.session_rsvps r where r.session_id = s.id and r.status = 'waitlisted')::int as waitlisted
    from public.sessions s
    where s.id = ${sessionId} and s.edition_id = ${editionId}
  `;
  if (!row) return null;
  const { registered, waitlisted, ...meta } = row;
  return { ...meta, rsvps: { registered, waitlisted } };
}

/** Takes a session off the calendar (SES-4). Its hosts keep it as a draft. */
export async function unpublishSession(sql: Db, editionId: number, sessionId: string) {
  await sql`
    update public.sessions set published = false, updated_at = now()
    where id = ${sessionId} and edition_id = ${editionId}
  `;
}

/** Marks or unmarks a session as an Organizing Team co-creation meeting (SES-9). */
export async function setCocreationMeeting(sql: Db, editionId: number, sessionId: string, value: boolean) {
  await sql`
    update public.sessions set is_cocreation_meeting = ${value}, updated_at = now()
    where id = ${sessionId} and edition_id = ${editionId}
  `;
}

// --- Tickets --------------------------------------------------------------------------------

export type AdminTicket = {
  id: number;
  name: string | null;
  email: string | null;
  tier: string | null;
  status: "paid" | "comp" | "refunded";
  amountPaidCents: number;
  imported: boolean;
  createdAt: Date;
};

/** An edition's registrations, newest first, optionally narrowed by name or email. */
export async function listTickets(sql: Db, editionId: number, search = ""): Promise<AdminTicket[]> {
  const pattern = `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql<(Omit<AdminTicket, "id"> & { id: string })[]>`
    select t.id, nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as name, u.email,
           tt.name as tier, t.status, t.amount_paid_cents as "amountPaidCents", t.imported,
           t.created_at as "createdAt"
    from public.tickets t
    join public.profiles p on p.id = t.profile_id
    left join auth.users u on u.id = p.id
    left join public.ticket_tiers tt on tt.id = t.tier_id
    where t.edition_id = ${editionId}
      and (${search.trim() === ""} or u.email ilike ${pattern} or concat_ws(' ', p.first_name, p.last_name) ilike ${pattern})
    order by t.created_at desc
  `;
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

export type CompResult = "issued" | "no-account" | "has-ticket" | "bad-tier";

/**
 * Gives the account with this email a comp ticket for the edition (REG-9). The person needs an
 * account first: anyone can make one by signing in once.
 */
export async function issueCompTicket(
  sql: Db,
  args: { editionId: number; email: string; tierId: number | null },
): Promise<CompResult> {
  const [user] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${args.email}`;
  if (!user) return "no-account";
  if (args.tierId !== null) {
    const tiers = await sql`select 1 from public.ticket_tiers where id = ${args.tierId} and edition_id = ${args.editionId}`;
    if (!tiers.length) return "bad-tier";
  }
  // A comp is an order of one, so it shows on the Orders page beside purchases.
  return sql.begin(async (tx) => {
    const held = await tx`
      select 1 from public.tickets where profile_id = ${user.id} and edition_id = ${args.editionId} and status <> 'refunded'
    `;
    if (held.length) return "has-ticket" as const;
    const [order] = await tx<{ id: string }[]>`
      insert into public.orders (edition_id, buyer_id, tier_id, quantity, status, completed_at)
      values (${args.editionId}, ${user.id}, ${args.tierId}, 1, 'comp', now())
      returning id
    `;
    await tx`
      insert into public.tickets (profile_id, edition_id, tier_id, status, order_id)
      values (${user.id}, ${args.editionId}, ${args.tierId}, 'comp', ${order!.id})
    `;
    return "issued" as const;
  }) as Promise<CompResult>;
}

/** Takes back a comp ticket. Paid tickets are refunded through Stripe instead (REG-8). */
export async function removeCompTicket(sql: Db, editionId: number, ticketId: number) {
  const rows = await sql<{ orderId: string | null }[]>`
    delete from public.tickets where id = ${ticketId} and edition_id = ${editionId} and status = 'comp'
    returning order_id as "orderId"
  `;
  // Its order goes too, once no ticket is left on it.
  const orderId = rows[0]?.orderId;
  if (orderId) {
    await sql`
      delete from public.orders o where o.id = ${orderId} and o.status = 'comp'
        and not exists (select 1 from public.tickets t where t.order_id = o.id)
    `;
  }
  return rows.length > 0;
}

// --- Team -----------------------------------------------------------------------------------

export type TeamMember = {
  profileId: string;
  name: string | null;
  email: string | null;
  permissions: { permission: string; grantedBy: string | null; grantedAt: Date }[];
};

export type Invitation = { email: string; permission: string; invitedBy: string | null; invitedAt: Date };

/** Everyone holding an admin permission, and invitations waiting for someone's first sign-in. */
export async function listTeam(sql: Db): Promise<{ members: TeamMember[]; invitations: Invitation[] }> {
  const members = await sql<TeamMember[]>`
    select p.id as "profileId", nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as name, u.email,
           json_agg(json_build_object(
             'permission', a.permission,
             'grantedBy', coalesce(nullif(trim(concat_ws(' ', g.first_name, g.last_name)), ''), gu.email),
             'grantedAt', a.granted_at
           ) order by a.permission) as permissions
    from public.admin_permissions a
    join public.profiles p on p.id = a.profile_id
    left join auth.users u on u.id = p.id
    left join public.profiles g on g.id = a.granted_by
    left join auth.users gu on gu.id = g.id
    group by p.id, u.email
    order by p.first_name nulls last, u.email
  `;
  const invitations = await sql<Invitation[]>`
    select i.email, i.permission,
           coalesce(nullif(trim(concat_ws(' ', g.first_name, g.last_name)), ''), gu.email) as "invitedBy",
           i.invited_at as "invitedAt"
    from public.admin_invitations i
    left join public.profiles g on g.id = i.invited_by
    left join auth.users gu on gu.id = g.id
    order by i.invited_at desc
  `;
  return {
    members: members.map((m) => ({
      ...m,
      permissions: m.permissions.map((p) => ({ ...p, grantedAt: new Date(p.grantedAt) })),
    })),
    invitations: [...invitations],
  };
}

/**
 * Grants an admin permission by email (AUTH-5): straight away when the address has an account,
 * otherwise as an invitation that the first sign-in with that address turns into the permission.
 * Callers check the inviter holds `full`.
 */
export async function inviteAdmin(
  sql: Db,
  args: { email: string; permission: AdminPermission; invitedBy: string },
): Promise<"granted" | "invited" | "already"> {
  const [user] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${args.email}`;
  if (user) {
    const rows = await sql`
      insert into public.admin_permissions (profile_id, permission, granted_by)
      values (${user.id}, ${args.permission}, ${args.invitedBy})
      on conflict do nothing
      returning profile_id
    `;
    return rows.length ? "granted" : "already";
  }
  const rows = await sql`
    insert into public.admin_invitations (email, permission, invited_by)
    values (${args.email}, ${args.permission}, ${args.invitedBy})
    on conflict do nothing
    returning email
  `;
  return rows.length ? "invited" : "already";
}

/** Takes an admin permission away. Callers check the remover holds `full` and isn't removing their own. */
export async function revokeAdminPermission(sql: Db, profileId: string, permission: string) {
  await sql`delete from public.admin_permissions where profile_id = ${profileId} and permission = ${permission}`;
}

export async function cancelInvitation(sql: Db, email: string, permission: string) {
  await sql`delete from public.admin_invitations where email = ${email} and permission = ${permission}`;
}
