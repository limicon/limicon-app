/**
 * The event's public details (PUB-2): name, teaser, start and end, image and About. Admins edit
 * them on the console's Edit page; the home page shows them.
 */
import type { Db } from "~/lib/db.server";
import { cleanRichText, type RichDoc } from "~/lib/rich-text";
import { instantToZoned } from "~/lib/zoned-time";

export type EventDetails = {
  name: string | null;
  teaser: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  startTimeZone: string | null;
  endTimeZone: string | null;
  imageKey: string | null;
  about: RichDoc | null;
};

export async function getEventDetails(sql: Db, editionId: number): Promise<EventDetails> {
  const [row] = await sql<(Omit<EventDetails, "about"> & { about: unknown })[]>`
    select name, teaser, starts_at as "startsAt", ends_at as "endsAt", start_time_zone as "startTimeZone",
           end_time_zone as "endTimeZone", image_key as "imageKey", about
    from public.editions where id = ${editionId}
  `;
  return { ...row!, about: cleanRichText(row!.about) };
}

/**
 * Saves the event's details. The calendar days hosts may publish on follow the start and end, in
 * the zones they were entered in. Returns the image key it replaced, for the caller to delete.
 */
export async function saveEventDetails(sql: Db, editionId: number, v: EventDetails): Promise<string | null> {
  const firstDay = v.startsAt && v.startTimeZone ? instantToZoned(v.startsAt, v.startTimeZone).date : null;
  const lastDay = v.endsAt && v.endTimeZone ? instantToZoned(v.endsAt, v.endTimeZone).date : null;
  const [old] = await sql<{ imageKey: string | null }[]>`select image_key as "imageKey" from public.editions where id = ${editionId}`;
  await sql`
    update public.editions set
      name = ${v.name}, teaser = ${v.teaser},
      starts_at = ${v.startsAt}, ends_at = ${v.endsAt},
      start_time_zone = ${v.startTimeZone}, end_time_zone = ${v.endTimeZone},
      starts_on = ${firstDay}, ends_on = ${lastDay},
      image_key = ${v.imageKey}, about = ${v.about ? sql.json(v.about as never) : null}
    where id = ${editionId}
  `;
  return old?.imageKey && old.imageKey !== v.imageKey ? old.imageKey : null;
}
