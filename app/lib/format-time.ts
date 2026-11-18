/**
 * Formats session times for one viewer's time zone. Every formatter names its zone and locale,
 * so the server and the browser render the same text and hydration matches.
 */
import { instantToZoned } from "~/lib/zoned-time";

const LOCALE = "en-US";

/** The viewer's calendar day for an instant, such as "2027-03-17", for grouping. */
export function dayKey(instant: Date, zone: string): string {
  return instantToZoned(new Date(instant), zone).date;
}

/** A day heading, such as "Wednesday, March 17". */
export function dayHeading(key: string): string {
  // Noon UTC on that date is the same calendar day everywhere, so format it in UTC.
  return new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${key}T12:00:00Z`));
}

/** A start and end time, such as "12:00 – 1:30 PM", with the day when it ends on a later one. */
export function timeRange(start: Date, end: Date, zone: string): string {
  const sameDay = dayKey(start, zone) === dayKey(end, zone);
  const format = new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    ...(sameDay ? {} : { weekday: "short" }),
  });
  return format.formatRange(new Date(start), new Date(end));
}

/** A full date and time range, such as "Wednesday, March 17, 12:00 – 1:30 PM EDT". */
export function fullTimeRange(start: Date, end: Date, zone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatRange(new Date(start), new Date(end));
}

/** A zone's short name at an instant, such as "EDT", or "GMT+5:30" where it has none. */
export function zoneAbbreviation(zone: string, at: Date): string {
  return (
    new Intl.DateTimeFormat(LOCALE, { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date(at))
      .find((part) => part.type === "timeZoneName")?.value ?? zone
  );
}

/** A zone's name as people read it, such as "America/New York". */
export function zoneName(zone: string): string {
  return zone.replaceAll("_", " ");
}
