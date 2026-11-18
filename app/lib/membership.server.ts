import type { Db } from "~/lib/db.server";
import { membershipStatus, type Membership } from "~/lib/membership";

/**
 * Looks up whether `userId` may open the current edition's Members area. The current edition is
 * the one with the latest year. Pass the signed-in member's id, or null for a visitor.
 */
export async function getMembership(sql: Db, userId: string | null): Promise<Membership> {
  const [row] = await sql<
    { id: number; year: number; firstDay: string | null; lastDay: string | null; hasTicket: boolean; isAdmin: boolean }[]
  >`
    select
      e.id,
      e.year,
      to_char(e.starts_on, 'YYYY-MM-DD') as "firstDay",
      to_char(e.ends_on, 'YYYY-MM-DD') as "lastDay",
      exists (
        select 1 from public.tickets t
        where t.profile_id = ${userId} and t.edition_id = e.id and t.status in ('paid', 'comp')
      ) as "hasTicket",
      exists (
        select 1 from public.admin_permissions a where a.profile_id = ${userId}
      ) as "isAdmin"
    from public.editions e
    order by e.year desc
    limit 1
  `;
  const isAdmin = row?.isAdmin ?? false;
  return {
    edition: row ? { id: Number(row.id), year: row.year, firstDay: row.firstDay, lastDay: row.lastDay } : null,
    isAdmin,
    status: membershipStatus({ signedIn: userId !== null, hasTicket: row?.hasTicket ?? false, isAdmin }),
  };
}
