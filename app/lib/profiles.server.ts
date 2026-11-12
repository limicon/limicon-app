import type { Db } from "~/lib/db.server";

export type Profile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  timeZone: string | null;
};

/** A member's own profile. Callers pass the signed-in member's id, never one from the request. */
export async function getOwnProfile(sql: Db, userId: string): Promise<Profile | null> {
  const [row] = await sql<Profile[]>`
    select id, first_name as "firstName", last_name as "lastName", time_zone as "timeZone"
    from public.profiles
    where id = ${userId}
  `;
  return row ?? null;
}
