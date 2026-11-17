import type { Db } from "~/lib/db.server";
import { membershipStatus, type Membership } from "~/lib/membership";

/**
 * Looks up whether `userId` may open the current edition's Members area. The current edition is
 * the one with the latest year. Pass the signed-in member's id, or null for a visitor.
 */
export async function getMembership(sql: Db, userId: string | null): Promise<Membership> {
  const [row] = await sql<{ year: number; hasTicket: boolean; isAdmin: boolean }[]>`
    select
      e.year,
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
  return {
    editionYear: row?.year ?? null,
    status: membershipStatus({
      signedIn: userId !== null,
      hasTicket: row?.hasTicket ?? false,
      isAdmin: row?.isAdmin ?? false,
    }),
  };
}
