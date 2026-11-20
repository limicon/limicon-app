/**
 * Date arithmetic and layout for the schedule's 3 Day and Monthly views (CAL-1). Dates are calendar
 * days as "YYYY-MM-DD" strings in the viewer's zone; only `viewRange` turns them into instants.
 */
import { zonedToInstant } from "~/lib/zoned-time";

export type ScheduleLayout = "list" | "3day" | "month";

export const LAYOUTS: { value: ScheduleLayout; label: string }[] = [
  { value: "list", label: "List" },
  { value: "3day", label: "3 Day" },
  { value: "month", label: "Monthly" },
];

export function parseLayout(value: string | null): ScheduleLayout {
  return value === "3day" || value === "month" ? value : "list";
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `value` if it's a real calendar date such as "2027-03-17", otherwise null. */
export function parseDate(value: string | null): string | null {
  const match = value ? DATE.exec(value) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return toKey(date) === value ? value : null;
}

// Calendar days are handled as UTC midnights, where every day is 24 hours long.
const fromKey = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(key: string, days: number): string {
  const date = fromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** The first day of the month `months` away from `key`'s month. */
export function addMonths(key: string, months: number): string {
  const date = fromKey(key);
  return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

/** "2027-03-01" for any day in March 2027. */
export const monthStart = (key: string) => `${key.slice(0, 7)}-01`;

/**
 * The day a calendar view opens on when the URL names none: today, or the event's first day while
 * the event is still ahead, so the calendar opens where the sessions are.
 */
export function defaultDate(today: string, firstDay: string | null): string {
  return firstDay && today < firstDay ? firstDay : today;
}

/** The three days of the 3 Day view starting at `start`. */
export const threeDays = (start: string) => [start, addDays(start, 1), addDays(start, 2)];

/**
 * The Monthly view's grid for the month holding `key`: whole weeks, Sunday first, from the week of
 * the 1st to the week of the last day, so it has 4 to 6 rows. Days from the months either side fill
 * the first and last weeks.
 */
export function monthGrid(key: string): { date: string; inMonth: boolean }[][] {
  const first = monthStart(key);
  const next = addMonths(key, 1);
  let day = addDays(first, -fromKey(first).getUTCDay());
  const weeks: { date: string; inMonth: boolean }[][] = [];
  while (day < next) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: day, inMonth: day >= first && day < next });
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** The days a view covers, first and last inclusive: the days it shows, for fetching its sessions. */
export function viewDays(layout: Exclude<ScheduleLayout, "list">, date: string): { first: string; last: string } {
  if (layout === "3day") return { first: date, last: addDays(date, 2) };
  const weeks = monthGrid(date);
  return { first: weeks[0]![0]!.date, last: weeks.at(-1)![6]!.date };
}

/**
 * The instants a view's days run between in `zone`: from the first day's start to the start of the
 * day after the last. A day starts at midnight, or at 1 AM where clocks skip midnight that day.
 */
export function viewRange(days: { first: string; last: string }, zone: string): { from: Date; to: Date } {
  const dayStart = (date: string) => {
    const midnight = zonedToInstant(date, "00:00", zone);
    return midnight === "nonexistent" ? (zonedToInstant(date, "01:00", zone) as Date) : midnight;
  };
  return { from: dayStart(days.first), to: dayStart(addDays(days.last, 1)) };
}

/** Minutes after midnight for a clock time such as "13:30". */
export function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

export type DayBlock<T> = {
  item: T;
  /** Minutes after the day's midnight. A block ending on a later day ends at midnight (1440). */
  start: number;
  end: number;
  /** Which of `lanes` side-by-side columns the block takes, so overlapping blocks don't cover each other. */
  lane: number;
  lanes: number;
};

/** A group of overlapping sessions that needs more lanes than fit: its last lane becomes "+N more". */
export type DayOverflow<T> = { start: number; end: number; lane: number; lanes: number; items: T[] };

/**
 * Places one day's sessions in side-by-side lanes, at most `maxLanes` wide. Sessions that overlap,
 * directly or through a chain of others, form a group sharing one lane count; each takes the first
 * lane free when it starts. In a group needing more lanes, the sessions from the last lane on are
 * gathered into one overflow, drawn across the group's time. Short sessions are drawn at least
 * `minLength` minutes tall, and count as that long here.
 */
export function layoutDayCapped<T>(
  items: { item: T; start: number; end: number }[],
  maxLanes: number,
  minLength = 30,
): { blocks: DayBlock<T>[]; overflows: DayOverflow<T>[] } {
  const groups = new Map<number, DayBlock<T>[]>();
  let group = -1;
  let groupEnd = -1;
  for (const block of layoutDay(items, minLength)) {
    if (block.start >= groupEnd) group++;
    groupEnd = Math.max(groupEnd, block.end);
    groups.set(group, [...(groups.get(group) ?? []), block]);
  }
  const blocks: DayBlock<T>[] = [];
  const overflows: DayOverflow<T>[] = [];
  for (const members of groups.values()) {
    if (members[0]!.lanes <= maxLanes) {
      blocks.push(...members);
      continue;
    }
    const last = maxLanes - 1;
    const hidden = members.filter((block) => block.lane >= last);
    blocks.push(...members.filter((block) => block.lane < last).map((block) => ({ ...block, lanes: maxLanes })));
    overflows.push({
      start: Math.min(...hidden.map((block) => block.start)),
      end: Math.max(...hidden.map((block) => block.end)),
      lane: last,
      lanes: maxLanes,
      items: hidden.map((block) => block.item),
    });
  }
  return { blocks, overflows };
}

/**
 * Places one day's sessions in side-by-side lanes. Sessions that overlap, directly or through a
 * chain of others, form a group sharing one lane count; each takes the first lane free when it
 * starts. Short sessions are drawn at least `minLength` minutes tall, and count as that long here.
 */
export function layoutDay<T>(items: { item: T; start: number; end: number }[], minLength = 30): DayBlock<T>[] {
  const sorted = [...items]
    .map((entry) => ({ ...entry, end: Math.max(entry.end, entry.start + minLength) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: DayBlock<T>[] = [];
  let group: DayBlock<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    for (const block of group) block.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const entry of sorted) {
    if (entry.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= entry.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.end;
    const block = { ...entry, lane, lanes: 1 };
    group.push(block);
    placed.push(block);
    groupEnd = Math.max(groupEnd, entry.end);
  }
  closeGroup();
  return placed;
}

/**
 * The hours the 3 Day view draws: from the earliest start to the latest end among its sessions,
 * in whole hours, and at least 9 AM to 5 PM so a quiet stretch still looks like a day.
 */
export function hourRange(blocks: { start: number; end: number }[]): { first: number; last: number } {
  let first = 9;
  let last = 17;
  for (const block of blocks) {
    first = Math.min(first, Math.floor(block.start / 60));
    last = Math.max(last, Math.ceil(block.end / 60));
  }
  return { first, last: Math.min(last, 24) };
}
