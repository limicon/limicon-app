import type { Db } from "~/lib/db.server";
import { IMAGE_KEY } from "~/lib/media";

export type Profile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  timeZone: string | null;
  /** Their profile picture in the media bucket. */
  avatarKey: string | null;
};

/** A member's own profile. Callers pass the signed-in member's id, never one from the request. */
export async function getOwnProfile(sql: Db, userId: string): Promise<Profile | null> {
  const [row] = await sql<Profile[]>`
    select id, first_name as "firstName", last_name as "lastName", time_zone as "timeZone",
           avatar_key as "avatarKey"
    from public.profiles
    where id = ${userId}
  `;
  return row ?? null;
}

/**
 * Sets or clears the member's own profile picture. Callers pass the signed-in member's id. Returns
 * false, saving nothing, when the key isn't one of our stored images.
 */
export async function setOwnAvatar(sql: Db, userId: string, avatarKey: string | null): Promise<boolean> {
  if (avatarKey !== null && !IMAGE_KEY.test(avatarKey)) return false;
  await sql`update public.profiles set avatar_key = ${avatarKey}, updated_at = now() where id = ${userId}`;
  return true;
}
