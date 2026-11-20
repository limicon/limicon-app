import { useEffect, useRef, useState } from "react";
import { Form, Link, useSearchParams, useSubmit } from "react-router";

import { RichText } from "~/components/rich-text";
import { RsvpButton } from "~/components/rsvp-button";
import { SessionPhoto } from "~/components/session-photo";
import { SeriesBadge } from "~/components/series-badge";
import { useBrowserZone, useScheduleRefresh } from "~/components/schedule-refresh";
import { ThemeLabel } from "~/components/theme-label";
import { MonthView, ThreeDayView } from "~/components/schedule-calendar";
import { servicesContext } from "~/context";
import { LAYOUTS, defaultDate, monthStart, parseDate, parseLayout, viewDays, viewRange, type ScheduleLayout } from "~/lib/calendar";
import { dayHeading, dayKey, timeRange, zoneAbbreviation, zoneName } from "~/lib/format-time";
import { listScheduledSessions, scheduleVersion, type ScheduledSession } from "~/lib/schedule.server";
import { SESSION_TYPES, THEMES } from "~/lib/session-form";
import { themeColor } from "~/lib/themes";
import { getViewerZone, setOwnTimeZone } from "~/lib/viewer-zone.server";
import { isValidTimeZone, timeZoneNames } from "~/lib/zoned-time";
import type { Route } from "./+types/schedule";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Schedule · Members · Limicon" }];
}

type ScheduleView = "all" | "mine" | "hosting";

const VIEWS: { value: ScheduleView; label: string }[] = [
  { value: "all", label: "Limicon Schedule" },
  { value: "mine", label: "My Schedule" },
  { value: "hosting", label: "Hosting" },
];

/** What the schedule shows, rather than how it's searched and filtered: clearing filters keeps these. */
const KEPT_PARAMS = ["view", "layout", "date"];

function clearHref(params: URLSearchParams) {
  const kept = new URLSearchParams([...params].filter(([key]) => KEPT_PARAMS.includes(key)));
  const query = kept.toString();
  return `/members/schedule${query ? `?${query}` : ""}`;
}

const primaryButton = "rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]";

const typeLabel = (value: string) => SESSION_TYPES.find((type) => type.value === value)?.label ?? value;

export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const db = services.db();
  const viewerZone = await getViewerZone(db, services.viewer!.userId, request.headers.get("Cookie"));

  const params = new URL(request.url).searchParams;
  const theme = params.get("theme");
  const sessionType = params.get("type");
  const view: ScheduleView = params.get("view") === "mine" ? "mine" : params.get("view") === "hosting" ? "hosting" : "all";
  const now = new Date();
  // The 3 Day and Monthly views (CAL-1) show the days around `date` instead of upcoming or past sessions.
  const layout = parseLayout(params.get("layout"));
  const today = dayKey(now, viewerZone.zone);
  const picked = parseDate(params.get("date")) ?? defaultDate(today, edition?.firstDay ?? null);
  const date = layout === "month" ? monthStart(picked) : picked;
  const filters = {
    layout,
    date,
    today,
    range: layout === "list" ? null : viewRange(viewDays(layout, date), viewerZone.zone),
    viewerId: services.viewer!.userId,
    view,
    mineOnly: view === "mine",
    hostingOnly: view === "hosting",
    now,
    past: layout === "list" && params.get("when") === "past",
    theme: theme && (THEMES as readonly string[]).includes(theme) ? theme : null,
    sessionType: sessionType && SESSION_TYPES.some((t) => t.value === sessionType) ? sessionType : null,
    keyword: params.get("q")?.trim().slice(0, 100) || null,
  };

  const [sessions, version] = edition
    ? await Promise.all([listScheduledSessions(db, edition.id, filters), scheduleVersion(db, edition.id)])
    : [[], ""];
  return { sessions, version, viewerZone, filters, timeZones: timeZoneNames(), now: filters.now };
}

/** Saves the time zone the member picked. */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const zone = String((await request.formData()).get("timeZone") ?? "");
  if (isValidTimeZone(zone)) await setOwnTimeZone(services.db(), services.viewer!.userId, zone);
  return null;
}

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { sessions, version, viewerZone, filters, timeZones, now } = loaderData;
  const zone = viewerZone.zone;
  useScheduleRefresh(version);
  useBrowserZone(viewerZone.source, zone);

  const days = groupByDay(sessions, zone);
  const filtered = Boolean(filters.theme || filters.sessionType || filters.keyword);

  return (
    <>
      <div className="flex max-w-4xl flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{VIEWS.find((v) => v.value === filters.view)!.label}</h1>
        {filters.view === "hosting" && (
          <Link to="/members/host/new" className={`${primaryButton} px-5 py-2.5`}>
            <span aria-hidden="true">+ </span>Host a Session
          </Link>
        )}
      </div>
      <div className="mt-4 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <ScheduleToggle view={filters.view} />
        <LayoutTabs layout={filters.layout} />
      </div>
      <TimeZoneLine zone={zone} now={now} timeZones={timeZones} />
      <Filters filters={filters} />
      <Legend />

      {filters.layout === "3day" ? (
        <ThreeDayView sessions={sessions} zone={zone} date={filters.date} today={filters.today} />
      ) : filters.layout === "month" ? (
        <MonthView sessions={sessions} zone={zone} date={filters.date} today={filters.today} />
      ) : days.length === 0 ? (
        <p className="mt-8">
          {filtered
            ? "No sessions match. Try another search, or clear the filters."
            : filters.view === "hosting"
              ? filters.past
                ? "None of the sessions you host have finished yet."
                : "You aren't hosting any sessions on the calendar yet. Host one with the button above; drafts stay under Host a session until you publish them."
              : filters.mineOnly
              ? filters.past
                ? "You didn't RSVP to any sessions that have finished."
                : "You haven't RSVPed to any upcoming sessions yet. RSVP on the Limicon Schedule, and they'll appear here."
              : filters.past
                ? "No sessions have finished yet."
                : "No sessions are on the calendar yet. Hosts can add theirs under Host a session."}
        </p>
      ) : (
        <div className="mt-8 grid max-w-4xl gap-8">
          {days.map(([key, daySessions]) => (
            <section key={key} aria-labelledby={`day-${key}`}>
              <h2 id={`day-${key}`} className="sticky top-0 z-10 bg-[#F4F7F7] py-2 text-lg font-semibold dark:bg-[#0B1417]">
                {dayHeading(key)}
              </h2>
              <ul className="mt-2 grid gap-3">
                {daySessions.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} zone={zone} canRsvp={!filters.past} hosting={filters.view === "hosting"} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function groupByDay(sessions: ScheduledSession[], zone: string): [string, ScheduledSession[]][] {
  const days = new Map<string, ScheduledSession[]>();
  for (const session of sessions) {
    const key = dayKey(session.startsAt, zone);
    days.set(key, [...(days.get(key) ?? []), session]);
  }
  return [...days];
}

function SessionCard({ session, zone, canRsvp, hosting }: { session: ScheduledSession; zone: string; canRsvp: boolean; hosting: boolean }) {
  return (
    // The title's link stretches over the whole card, so a click anywhere opens the session; the
    // RSVP and Edit controls sit above it and keep their own clicks.
    <article
      aria-labelledby={`session-${session.id}`}
      className="group relative flex overflow-hidden rounded-lg border border-[#C9DADC] bg-white transition-colors hover:border-[#15383F] hover:bg-[#F7FAFA] has-[a[data-card]:focus-visible]:outline-2 has-[a[data-card]:focus-visible]:outline-[#15383F] dark:border-[#24363B] dark:bg-[#12201F] dark:hover:border-[#8CC7D3] dark:hover:bg-[#162826] dark:has-[a[data-card]:focus-visible]:outline-[#8CC7D3]"
    >
      <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: themeColor(session.theme) }} />
      <SessionPhoto session={session} className="mt-4 ml-3 size-16 sm:ml-4 sm:size-20" />
      <div className="grid min-w-0 flex-1 gap-1 p-4 pl-3 sm:grid-cols-[9rem_1fr_auto] sm:items-start sm:gap-4 sm:pl-4">
        <span className="font-semibold tabular-nums">{timeRange(session.startsAt, session.endsAt, zone)}</span>
        <div className="grid min-w-0 gap-1">
          <h3 id={`session-${session.id}`} className="text-lg font-semibold">
            <Link
              to={`/members/schedule/${session.id}`}
              data-card
              className="group-hover:underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {session.title}
            </Link>
          </h3>
          <p className="flex flex-wrap gap-x-4 gap-y-1 items-center text-sm">
            <ThemeLabel theme={session.theme} />
            <SeriesBadge recurring={session.recurring} />
            <span>{session.sessionTypes.map(typeLabel).join(", ")}</span>
            {session.city && <span>In person, {session.city}</span>}
          </p>
          {session.hosts.length > 0 && <p className="text-sm">With {session.hosts.join(", ")}</p>}
          {session.description && <About session={session} />}
        </div>
        {hosting ? (
          <div className="relative z-10 mt-2 justify-self-start sm:mt-0">
            <Link
              to={`/members/host/${session.id}`}
              className="inline-block rounded border border-[#15383F] px-4 py-2 font-semibold dark:border-[#8CC7D3]"
              aria-label={`Edit ${session.title}`}
            >
              Edit
            </Link>
          </div>
        ) : canRsvp && (
          <div className="relative z-10 mt-2 justify-self-start sm:mt-0">
            <RsvpButton sessionId={session.id} status={session.myRsvp} title={session.title} />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * About this session on the card: two lines, and a Read more button that opens the full text in
 * place, so members can read it without leaving the schedule. The button and the opened text sit
 * above the card's link, so clicking them, or links in the text, doesn't open the session's page.
 */
function About({ session }: { session: ScheduledSession }) {
  const [open, setOpen] = useState(false);
  const id = `about-${session.id}`;
  const preview = useRef<HTMLParagraphElement>(null);
  // A guess for the server's render; the browser then checks whether the two lines cut anything off.
  const [long, setLong] = useState(session.description!.length > 140);
  useEffect(() => {
    const measure = () => {
      const p = preview.current;
      if (p) setLong(p.scrollHeight > p.clientHeight + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [session.description]);
  return (
    <div className="mt-1 text-sm">
      {open ? (
        // Sessions written before formatting was added have only plain text.
        <div id={id} className="relative z-10 cursor-auto rounded-md bg-[#F4F7F7] p-3 dark:bg-[#0F1C1E]">
          {session.descriptionDoc ? (
            <RichText doc={session.descriptionDoc} />
          ) : (
            <p className="whitespace-pre-line leading-relaxed">{session.description}</p>
          )}
        </div>
      ) : (
        <p id={id} ref={preview} className="line-clamp-2">{session.description}</p>
      )}
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="relative z-10 mt-1 font-semibold underline"
        >
          {open ? "Show less" : "Read more"}
          <span className="sr-only"> about {session.title}</span>
        </button>
      )}
    </div>
  );
}

/** Switches between every session, the viewer's RSVPs (CAL-7) and the sessions they host, keeping search and filters. */
function ScheduleToggle({ view }: { view: ScheduleView }) {
  const [params] = useSearchParams();
  const href = (target: ScheduleView) => {
    const next = new URLSearchParams(params);
    if (target === "all") next.delete("view");
    else next.set("view", target);
    const query = next.toString();
    return `/members/schedule${query ? `?${query}` : ""}`;
  };
  const tab = (active: boolean) =>
    `flex items-center justify-center rounded-md px-2 py-2 text-center text-sm font-semibold sm:px-4 sm:text-base ${active ? "bg-[#15383F] text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]" : "hover:bg-black/5 dark:hover:bg-white/10"}`;
  return (
    <nav aria-label="Which schedule" className="grid w-full grid-cols-3 sm:w-auto gap-1 rounded-lg sm:inline-grid border border-[#C9DADC] bg-white p-1 dark:border-[#24363B] dark:bg-[#12201F]">
      {VIEWS.map(({ value, label }) => (
        <Link key={value} to={href(value)} className={tab(view === value)} aria-current={view === value ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Switches between the list, 3 Day and Monthly layouts (CAL-1), keeping the schedule, search and filters. */
function LayoutTabs({ layout }: { layout: ScheduleLayout }) {
  const [params] = useSearchParams();
  const href = (target: ScheduleLayout) => {
    const next = new URLSearchParams(params);
    if (target === "list") {
      next.delete("layout");
      next.delete("date");
    } else next.set("layout", target);
    const query = next.toString();
    return `/members/schedule${query ? `?${query}` : ""}`;
  };
  const tab = (active: boolean) =>
    `flex items-center justify-center rounded-md px-3 py-1.5 text-center text-sm font-semibold sm:px-4 ${active ? "bg-[#15383F] text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]" : "hover:bg-black/5 dark:hover:bg-white/10"}`;
  return (
    <nav aria-label="Layout" className="grid w-full grid-cols-3 gap-1 rounded-lg border border-[#C9DADC] bg-white p-1 sm:inline-grid sm:w-auto dark:border-[#24363B] dark:bg-[#12201F]">
      {LAYOUTS.map(({ value, label }) => (
        <Link key={value} to={href(value)} className={tab(layout === value)} aria-current={layout === value ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function TimeZoneLine({ zone, now, timeZones }: { zone: string; now: Date; timeZones: string[] }) {
  return (
    <details className="mt-3 max-w-4xl">
      <summary className="cursor-pointer">
        Times are shown in <strong>{zoneName(zone)}</strong> ({zoneAbbreviation(zone, now)}).{" "}
        <span className="underline">Change</span>
      </summary>
      <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="timeZone" className="block text-sm font-medium">Show times in</label>
          <select id="timeZone" name="timeZone" defaultValue={zone} className="mt-1 rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E]">
            {timeZones.map((name) => <option key={name} value={name}>{zoneName(name)}</option>)}
          </select>
        </div>
        <button type="submit" className={primaryButton}>
          Save
        </button>
      </Form>
    </details>
  );
}

function Filters({ filters }: { filters: Route.ComponentProps["loaderData"]["filters"] }) {
  const submit = useSubmit();
  const [params] = useSearchParams();
  const field = "w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E]";
  const label = "mb-1 block text-sm font-medium";
  return (
    <Form
      method="get"
      role="search"
      className="mt-6 grid max-w-4xl gap-4 rounded-lg border border-[#C9DADC] bg-white p-4 dark:border-[#24363B] dark:bg-[#12201F]"
      // Dropdowns apply as soon as they change; the search waits for Enter or the button.
      onChange={(event) => {
        if ((event.target as HTMLElement).tagName === "SELECT") submit(event.currentTarget);
      }}
    >
      {filters.view !== "all" && <input type="hidden" name="view" value={filters.view} />}
      {filters.layout !== "list" && (
        <>
          <input type="hidden" name="layout" value={filters.layout} />
          <input type="hidden" name="date" value={filters.date} />
        </>
      )}
      <div>
        <label htmlFor="q" className={label}>Search</label>
        <div className="flex gap-2">
          <input id="q" name="q" type="search" defaultValue={filters.keyword ?? ""} placeholder="Title, host or description" className={`${field} min-w-0 flex-1`} />
          <button type="submit" className={`${primaryButton} shrink-0`}>Search</button>
        </div>
      </div>
      <div className={`grid gap-4 ${filters.layout === "list" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div>
          <label htmlFor="theme" className={label}>Theme</label>
          <select id="theme" name="theme" defaultValue={filters.theme ?? ""} className={field}>
            <option value="">All themes</option>
            {THEMES.map((theme) => <option key={theme}>{theme}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="type" className={label}>Session type</label>
          <select id="type" name="type" defaultValue={filters.sessionType ?? ""} className={field}>
            <option value="">All types</option>
            {SESSION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        {/* The calendar layouts pick their days with their own Previous and Next. */}
        {filters.layout === "list" && (
          <div>
            <label htmlFor="when" className={label}>When</label>
            <select id="when" name="when" defaultValue={filters.past ? "past" : ""} className={field}>
              <option value="">Upcoming</option>
              <option value="past">Past</option>
            </select>
          </div>
        )}
      </div>
      {[...params.keys()].some((key) => !KEPT_PARAMS.includes(key)) && (
        <Link to={clearHref(params)} className="justify-self-start text-sm underline">
          Clear search and filters
        </Link>
      )}
    </Form>
  );
}

function Legend() {
  return (
    <details className="mt-4 max-w-4xl" open>
      <summary className="cursor-pointer text-sm font-medium">Theme colors</summary>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map((theme) => (
          <li key={theme}><ThemeLabel theme={theme} /></li>
        ))}
      </ul>
    </details>
  );
}
