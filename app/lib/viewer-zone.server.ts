import type { Db } from "~/lib/db.server";
import { ZONE_COOKIE } from "~/lib/viewer-zone";
import { isValidTimeZone } from "~/lib/zoned-time";

/** Where Limicon's Organizing Team works, for a viewer whose zone isn't known yet. */
export const FALLBACK_ZONE = "America/Toronto";

export type ViewerZone = { zone: string; source: "profile" | "browser" | "fallback" };

/**
 * The time zone to show a member's times in (CAL-3): the one they picked, saved on their profile;
 * else their browser's, from the cookie; else Toronto's.
 */
export async function getViewerZone(sql: Db, userId: string, cookieHeader: string | null): Promise<ViewerZone> {
  const [profile] = await sql<{ timeZone: string | null }[]>`
    select time_zone as "timeZone" from public.profiles where id = ${userId}
  `;
  if (profile?.timeZone && isValidTimeZone(profile.timeZone)) return { zone: profile.timeZone, source: "profile" };

  const fromCookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === ZONE_COOKIE)?.[1];
  const zone = fromCookie ? decodeURIComponent(fromCookie) : null;
  if (zone && isValidTimeZone(zone)) return { zone, source: "browser" };

  return { zone: FALLBACK_ZONE, source: "fallback" };
}

/** Saves the zone a member picked, so their times follow them to every device. */
export async function setOwnTimeZone(sql: Db, userId: string, zone: string) {
  await sql`update public.profiles set time_zone = ${zone}, updated_at = now() where id = ${userId}`;
}
