/**
 * Orders and guests for the admin console. Routes under /admin pass `requireAdmin` first.
 */
import type { GuestFilters, OrderFilters } from "~/lib/admin-tables";
import type { Db } from "~/lib/db.server";

export type OrderRow = {
  id: number;
  profileId: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  tier: string | null;
  status: "pending" | "paid" | "comp" | "refunded";
  amountCents: number;
};

export type OrderSummary = { orders: number; ticketsPurchased: number; revenueCents: number; incomplete: number };

function like(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** An edition's orders matching the filters, sorted as asked. Pass `filtered: false` for all. */
export async function listOrders(sql: Db, editionId: number, f: OrderFilters, filtered = true): Promise<OrderRow[]> {
  const dir = f.dir === "asc" ? sql`asc` : sql`desc`;
  const name = sql`lower(coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email))`;
  const by = {
    name: sql`${name} ${dir} nulls last`,
    email: sql`lower(u.email) ${dir} nulls last`,
    date: sql`o.created_at ${dir}`,
    ticket: sql`tt.name ${dir} nulls last`,
    status: sql`o.status ${dir}`,
    price: sql`o.amount_cents ${dir}`,
  }[f.sort];
  const rows = await sql<(Omit<OrderRow, "id"> & { id: string })[]>`
    select o.id, p.id as "profileId", nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as name, u.email,
           o.created_at as "createdAt", tt.name as tier, o.status, o.amount_cents as "amountCents"
    from public.orders o
    join public.profiles p on p.id = o.buyer_id
    left join auth.users u on u.id = p.id
    left join public.ticket_tiers tt on tt.id = o.tier_id
    where o.edition_id = ${editionId}
      ${filtered && f.q ? sql`and (u.email ilike ${like(f.q)} or concat_ws(' ', p.first_name, p.last_name) ilike ${like(f.q)})` : sql``}
      ${filtered && f.status !== "all" ? sql`and o.status = ${f.status}` : sql``}
      ${filtered && f.tier ? sql`and o.tier_id = ${f.tier}` : sql``}
    order by ${by}, o.id desc
  `;
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/**
 * The Orders page's headline numbers: completed orders, tickets bought and revenue. Each order
 * is one ticket, so tickets bought are the paid orders.
 */
export async function getOrderSummary(sql: Db, editionId: number): Promise<OrderSummary> {
  const [row] = await sql<OrderSummary[]>`
    select
      count(*) filter (where status in ('paid', 'comp'))::int as orders,
      count(*) filter (where status = 'paid')::int as "ticketsPurchased",
      coalesce(sum(amount_cents) filter (where status = 'paid'), 0)::int as "revenueCents",
      count(*) filter (where status = 'pending')::int as incomplete
    from public.orders where edition_id = ${editionId}
  `;
  return row!;
}

export type GuestRow = {
  profileId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  address: string | null;
};

/** Everyone holding a paid or comp ticket for the edition, in name order. */
export async function listGuests(sql: Db, editionId: number, f: GuestFilters, filtered = true): Promise<GuestRow[]> {
  const dir = f.dir === "asc" ? sql`asc` : sql`desc`;
  const first = sql`lower(coalesce(nullif(trim(p.first_name), ''), u.email)) ${dir} nulls last`;
  const last = sql`lower(coalesce(nullif(trim(p.last_name), ''), u.email)) ${dir} nulls last`;
  return sql<GuestRow[]>`
    select p.id as "profileId", p.first_name as "firstName", p.last_name as "lastName", u.email,
           (select a.answer from public.registration_answers a
             where a.profile_id = p.id and a.edition_id = ${editionId} and a.question = 'address') as address
    from public.profiles p
    left join auth.users u on u.id = p.id
    where exists (
      select 1 from public.tickets t where t.profile_id = p.id and t.edition_id = ${editionId} and t.status in ('paid', 'comp')
    )
      ${filtered && f.q ? sql`and (u.email ilike ${like(f.q)} or concat_ws(' ', p.first_name, p.last_name) ilike ${like(f.q)})` : sql``}
    order by ${f.sort === "last" ? sql`${last}, ${first}` : sql`${first}, ${last}`}, p.id
  `;
}

export async function countGuests(sql: Db, editionId: number): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(distinct profile_id)::int as count from public.tickets
    where edition_id = ${editionId} and status in ('paid', 'comp')
  `;
  return row!.count;
}
