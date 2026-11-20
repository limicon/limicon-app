import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router";

import { ThemeLabel } from "~/components/theme-label";
import {
  addDays,
  addMonths,
  clockMinutes,
  hourRange,
  layoutDay,
  layoutDayCapped,
  monthGrid,
  monthStart,
  threeDays,
  type DayOverflow,
} from "~/lib/calendar";
import { dayHeading, dayKey, timeRange } from "~/lib/format-time";
import type { ScheduledSession } from "~/lib/schedule.server";
import { themeColor } from "~/lib/themes";
import { instantToZoned } from "~/lib/zoned-time";

type Props = { sessions: ScheduledSession[]; zone: string; date: string; today: string };

const LOCALE = "en-US";
// Calendar days are formatted at noon UTC, which is the same date everywhere.
const formatDay = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", ...options }).format(new Date(`${key}T12:00:00Z`));

const sessionHref = (session: ScheduledSession) => `/members/schedule/${session.id}`;
const sessionCount = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;

/** The schedule's URL with `date` changed, keeping the view, layout, search and filters. */
function useDateHref() {
  const [params] = useSearchParams();
  return (date: string) => {
    const next = new URLSearchParams(params);
    next.set("date", date);
    return `/members/schedule?${next}`;
  };
}

function groupByDay(sessions: ScheduledSession[], zone: string) {
  const days = new Map<string, ScheduledSession[]>();
  for (const session of sessions) {
    const key = dayKey(session.startsAt, zone);
    days.set(key, [...(days.get(key) ?? []), session]);
  }
  return days;
}

function PeriodNav({ previous, next, title }: { previous: { href: string; label: string }; next: { href: string; label: string }; title: string }) {
  const button =
    "inline-flex items-center gap-1 rounded-md border border-[#C9DADC] bg-white px-3 py-2 text-sm font-semibold hover:border-[#15383F] dark:border-[#24363B] dark:bg-[#12201F] dark:hover:border-[#8CC7D3]";
  return (
    <div className="flex items-center justify-between gap-2">
      <Link to={previous.href} className={button} aria-label={previous.label}>
        <span aria-hidden="true">‹</span>
        <span className="hidden sm:inline">{previous.label}</span>
      </Link>
      <h2 className="text-center text-lg font-semibold sm:text-xl">{title}</h2>
      <Link to={next.href} className={button} aria-label={next.label}>
        <span className="hidden sm:inline">{next.label}</span>
        <span aria-hidden="true">›</span>
      </Link>
    </div>
  );
}

const HOUR_REM = 3.5;
/** How many overlapping sessions are drawn side by side before the rest go behind "+N more". */
const LANES = [
  { max: 2, className: "sm:hidden" },
  { max: 3, className: "hidden sm:block" },
];

const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;

/**
 * Three days side by side, with each session placed by its start and end time in the viewer's zone
 * (CAL-1). Sessions that overlap share the column's width. A session running past midnight is drawn
 * to the end of its first day.
 */
export function ThreeDayView({ sessions, zone, date, today }: Props) {
  const dateHref = useDateHref();
  const days = threeDays(date);
  const byDay = groupByDay(sessions, zone);
  const times = new Map(
    days.map((day) => [
      day,
      (byDay.get(day) ?? []).map((session) => {
        const start = clockMinutes(instantToZoned(new Date(session.startsAt), zone).time);
        const ends = instantToZoned(new Date(session.endsAt), zone);
        return { item: session, start, end: ends.date > day ? 24 * 60 : Math.max(clockMinutes(ends.time), start) };
      }),
    ]),
  );
  const hours = hourRange(layoutDay([...times.values()].flat()));
  const position = (block: { start: number; end: number; lane: number; lanes: number }) => ({
    top: `${((block.start - hours.first * 60) / 60) * HOUR_REM}rem`,
    height: `${((block.end - block.start) / 60) * HOUR_REM}rem`,
    left: `${(block.lane / block.lanes) * 100}%`,
    width: `${100 / block.lanes}%`,
  });
  const span = hours.last - hours.first;
  const title = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).formatRange(
    new Date(`${days[0]}T12:00:00Z`),
    new Date(`${days[2]}T12:00:00Z`),
  );

  return (
    <div className="mt-8 grid max-w-6xl gap-4">
      <PeriodNav
        previous={{ href: dateHref(addDays(date, -3)), label: "Previous 3 days" }}
        next={{ href: dateHref(addDays(date, 3)), label: "Next 3 days" }}
        title={title}
      />
      {sessions.length === 0 && <p>No sessions on these days.</p>}
      <div className="grid grid-cols-[2.75rem_repeat(3,minmax(0,1fr))] rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
        <div aria-hidden="true" className="border-b border-[#C9DADC] dark:border-[#24363B]" />
        {days.map((day, i) => (
          <h3
            key={day}
            id={`day-${day}`}
            className={`border-b border-l border-[#C9DADC] px-1 py-2 text-center text-sm font-semibold sm:text-base dark:border-[#24363B] ${day === today ? "bg-[#E4EEEF] dark:bg-[#1B3034]" : ""} ${i === 2 ? "rounded-tr-lg" : ""}`}
          >
            <span className="sm:hidden">{formatDay(day, { weekday: "short", day: "numeric" })}</span>
            <span className="hidden sm:inline">{formatDay(day, { weekday: "long", month: "short", day: "numeric" })}</span>
            {day === today && <span className="sr-only"> (today)</span>}
          </h3>
        ))}
        <div aria-hidden="true" className="relative" style={{ height: `${span * HOUR_REM}rem` }}>
          {Array.from({ length: span }, (_, i) => (
            <span key={i} className="absolute right-1 -translate-y-1/2 text-[0.7rem] text-[#4A6166] dark:text-[#9FB6BA]" style={{ top: `${i * HOUR_REM}rem` }}>
              {i === 0 ? "" : hourLabel(hours.first + i)}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className="relative border-l border-[#C9DADC] [--hour-line:#E1EAEB] dark:border-[#24363B] dark:[--hour-line:#1F3237]"
            style={{
              height: `${span * HOUR_REM}rem`,
              backgroundImage: "linear-gradient(to bottom, var(--hour-line) 1px, transparent 1px)",
              backgroundSize: `100% ${HOUR_REM}rem`,
            }}
          >
            {/* Phones fit fewer sessions side by side, so each width has its own layout. */}
            {LANES.map(({ max, className }) => {
              const { blocks, overflows } = layoutDayCapped(times.get(day)!, max);
              return (
                <ul key={max} aria-labelledby={`day-${day}`} className={`absolute inset-0 ${className}`}>
                  {blocks.map((block) => (
                    <li key={block.item.id} className="absolute p-0.5" style={position(block)}>
                      <Link
                        to={sessionHref(block.item)}
                        title={block.item.title}
                        className="flex h-full flex-col overflow-hidden rounded border border-l-4 border-[#C9DADC] bg-[#F7FAFA] px-1.5 py-1 text-xs leading-tight hover:border-[#15383F] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#15383F] sm:text-sm dark:border-[#2C4248] dark:bg-[#0F1C1E] dark:hover:border-[#8CC7D3] dark:hover:bg-[#162826] dark:focus-visible:outline-[#8CC7D3]"
                        style={{ borderLeftColor: themeColor(block.item.theme) }}
                      >
                        <span className="font-semibold break-words">{block.item.title}</span>
                        <span className="tabular-nums">{timeRange(block.item.startsAt, block.item.endsAt, zone)}</span>
                      </Link>
                    </li>
                  ))}
                  {overflows.map((overflow) => (
                    <MoreSessions key={overflow.start} day={day} overflow={overflow} zone={zone} style={position(overflow)} />
                  ))}
                </ul>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The 3 Day view's "+N more" for overlapping sessions beyond the lanes that fit, opening a list of them. */
function MoreSessions({ day, overflow, zone, style }: { day: string; overflow: DayOverflow<ScheduledSession>; zone: string; style: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const id = `more-${day}-${overflow.start}`;
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <li
      className={`absolute p-0.5 ${open ? "z-30" : ""}`}
      style={style}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className="flex h-full w-full items-start justify-center rounded border border-dashed border-[#9DB5B9] bg-white px-1 py-1 text-xs font-semibold hover:border-[#15383F] sm:text-sm dark:border-[#3A5359] dark:bg-[#12201F] dark:hover:border-[#8CC7D3]"
      >
        +{overflow.items.length}
        <span className="sr-only"> more {overflow.items.length === 1 ? "session" : "sessions"}</span>
        <span aria-hidden="true" className="hidden sm:inline">&nbsp;more</span>
      </button>
      {open && (
        <SessionsPopup
          id={id}
          heading={`More on ${dayHeading(day)}`}
          sessions={overflow.items}
          zone={zone}
          position="sm:top-full sm:right-0"
          onClose={close}
          onDismiss={() => setOpen(false)}
        />
      )}
    </li>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A month as a calendar grid (CAL-1). Each date's box shows its sessions on wider screens and how
 * many there are on phones. Hovering a box, focusing it, or tapping or pressing Enter on it opens a
 * pop-up listing that date's sessions with links to their pages; Escape, the X, leaving with the
 * mouse or tapping outside closes it.
 */
export function MonthView({ sessions, zone, date, today }: Props) {
  const dateHref = useDateHref();
  const first = monthStart(date);
  const byDay = groupByDay(sessions, zone);
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const monthName = (key: string) => formatDay(key, { month: "long" });
  const inMonth = sessions.filter((session) => dayKey(session.startsAt, zone).startsWith(first.slice(0, 7)));

  return (
    <div className="mt-8 grid max-w-6xl gap-4">
      <PeriodNav
        previous={{ href: dateHref(addMonths(first, -1)), label: monthName(addMonths(first, -1)) }}
        next={{ href: dateHref(addMonths(first, 1)), label: monthName(addMonths(first, 1)) }}
        title={formatDay(first, { month: "long", year: "numeric" })}
      />
      {inMonth.length === 0 && <p>No sessions this month.</p>}
      <div className="rounded-lg border border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]">
        <div aria-hidden="true" className="grid grid-cols-7 border-b border-[#C9DADC] dark:border-[#24363B]">
          {WEEKDAYS.map((name) => (
            <div key={name} className="py-2 text-center text-xs font-semibold sm:text-sm">
              {name.slice(0, 3)}
            </div>
          ))}
        </div>
        {monthGrid(first).map((week) => (
          <div key={week[0]!.date} className="grid grid-cols-7 border-b border-[#C9DADC] last:border-b-0 dark:border-[#24363B]">
            {week.map(({ date: day, inMonth }, column) => (
              <DateBox
                key={day}
                day={day}
                inMonth={inMonth}
                isToday={day === today}
                sessions={byDay.get(day) ?? []}
                zone={zone}
                alignRight={column >= 4}
                open={open === day}
                onOpen={() => {
                  window.clearTimeout(closeTimer.current);
                  setOpen(day);
                }}
                onClose={(delayed) => {
                  window.clearTimeout(closeTimer.current);
                  if (delayed) closeTimer.current = window.setTimeout(() => setOpen((current) => (current === day ? null : current)), 150);
                  else setOpen((current) => (current === day ? null : current));
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DateBox({
  day,
  inMonth,
  isToday,
  sessions,
  zone,
  alignRight,
  open,
  onOpen,
  onClose,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  sessions: ScheduledSession[];
  zone: string;
  alignRight: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: (delayed: boolean) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  // Focus that returns to the date after closing shouldn't open the pop-up again.
  const refocusing = useRef(false);
  const cell = `relative min-h-16 border-l border-[#C9DADC] p-1 first:border-l-0 sm:min-h-28 sm:p-1.5 dark:border-[#24363B] ${inMonth ? "" : "bg-[#F4F7F7] text-[#5B7176] dark:bg-[#0B1417] dark:text-[#8A9FA3]"}`;
  const number = (
    <span
      className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold sm:text-sm ${isToday ? "bg-[#15383F] text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]" : ""}`}
    >
      {Number(day.slice(8))}
    </span>
  );
  const heading = dayHeading(day);
  const count = sessionCount(sessions.length);

  if (sessions.length === 0) {
    return (
      <div className={cell}>
        <span aria-hidden="true">{number}</span>
      </div>
    );
  }

  const close = () => {
    onClose(false);
    refocusing.current = true;
    button.current?.focus();
    refocusing.current = false;
  };
  const popupId = `date-${day}`;
  const MORE_AFTER = 3;

  return (
    <div
      className={cell}
      onPointerEnter={(event) => event.pointerType === "mouse" && onOpen()}
      onPointerLeave={(event) => event.pointerType === "mouse" && onClose(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        aria-label={`${heading}, ${count}`}
        onFocus={() => !refocusing.current && onOpen()}
        onClick={onOpen}
        className="flex h-full w-full flex-col items-start gap-1 rounded text-left focus-visible:outline-2 focus-visible:outline-[#15383F] dark:focus-visible:outline-[#8CC7D3]"
      >
        {number}
        {/* Phones show how many; wider screens show the first few titles. */}
        <span className="flex flex-wrap items-center gap-0.5 sm:hidden">
          {sessions.slice(0, 3).map((session) => (
            <span key={session.id} className="inline-block size-2 rounded-full" style={{ background: themeColor(session.theme) }} />
          ))}
          <span className="text-xs font-semibold">{sessions.length}</span>
        </span>
        <span className="hidden w-full gap-0.5 sm:grid">
          {sessions.slice(0, MORE_AFTER).map((session) => (
            <span
              key={session.id}
              className="truncate rounded border-l-4 bg-[#F4F7F7] px-1 text-xs dark:bg-[#0F1C1E]"
              style={{ borderLeftColor: themeColor(session.theme) }}
            >
              {session.title}
            </span>
          ))}
          {sessions.length > MORE_AFTER && <span className="text-xs font-semibold">+{sessions.length - MORE_AFTER} more</span>}
        </span>
      </button>
      {open && (
        <SessionsPopup
          id={popupId}
          heading={heading}
          sessions={sessions}
          zone={zone}
          position={`sm:top-full ${alignRight ? "sm:right-0" : "sm:left-0"}`}
          onClose={close}
          onDismiss={() => onClose(false)}
        />
      )}
    </div>
  );
}

/**
 * A pop-up listing sessions with their times and links to their pages. On phones it sits over a
 * dimmed page, and tapping outside it dismisses it; on wider screens it hangs from its trigger at
 * `position`. Its X calls `onClose`, which should return focus to the trigger.
 */
function SessionsPopup({
  id,
  heading,
  sessions,
  zone,
  position,
  onClose,
  onDismiss,
}: {
  id: string;
  heading: string;
  sessions: ScheduledSession[];
  zone: string;
  position: string;
  onClose: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={onDismiss} />
      <div
        id={id}
        role="dialog"
        aria-labelledby={`${id}-heading`}
        className={`fixed inset-x-4 top-24 z-50 max-h-[70vh] overflow-auto rounded-lg border border-[#C9DADC] bg-white p-4 text-left shadow-xl sm:absolute sm:inset-x-auto sm:w-80 sm:max-h-96 dark:border-[#3A5359] dark:bg-[#12201F] ${position}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 id={`${id}-heading`} className="font-semibold">{heading}</h3>
            <p className="text-sm">{sessionCount(sessions.length)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded text-xl hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul className="mt-3 grid gap-3">
          {sessions.map((session) => (
            <li key={session.id} className="border-l-4 pl-2" style={{ borderLeftColor: themeColor(session.theme) }}>
              <span className="block text-sm font-semibold tabular-nums">{timeRange(session.startsAt, session.endsAt, zone)}</span>
              <Link to={sessionHref(session)} className="font-semibold underline">
                {session.title}
              </Link>
              <span className="block text-xs">
                <ThemeLabel theme={session.theme} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
