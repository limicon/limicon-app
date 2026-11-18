/**
 * Converts between instants and the date and clock time someone sees in an IANA time zone, using
 * only `Intl`. Hosts enter a date and clock times in a zone; the app stores instants
 * (docs/feature-sessions.md → Times and time zones).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** Every IANA zone the runtime knows, for the time zone picker. */
export function timeZoneNames(): string[] {
  const names = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return names.length ? [...names, "UTC"] : ["America/Toronto", "UTC"];
}

export function isValidTimeZone(zone: string): boolean {
  try {
    wallClock(zone);
    return true;
  } catch {
    return false;
  }
}

/** The date ("2027-03-14") and clock time ("12:30") that `instant` shows in `zone`. */
export function instantToZoned(instant: Date, zone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    wallClock(zone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** How far `zone`'s clocks are ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, zone: string): number {
  const { date, time } = instantToZoned(new Date(instant), zone);
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/**
 * The instant at which `zone`'s clocks show `date` ("YYYY-MM-DD") and `time` ("HH:MM").
 * Returns "nonexistent" for a clock time skipped when clocks go forward. A clock time that
 * happens twice, when clocks go back, gives the earlier instant.
 */
export function zonedToInstant(date: string, time: string, zone: string): Date | "nonexistent" {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) throw new RangeError(`Not a date and time: ${date} ${time}`);
  // The offsets a day either side cover both sides of any clock change near this time.
  const offsets = new Set([offsetAt(naive - 86_400_000, zone), offsetAt(naive + 86_400_000, zone)]);
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => {
      const shown = instantToZoned(new Date(instant), zone);
      return shown.date === date && shown.time === time;
    })
    .sort((a, b) => a - b);
  return matches.length ? new Date(matches[0]!) : "nonexistent";
}
