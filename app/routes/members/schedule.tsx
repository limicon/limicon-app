import { Form, Link, useSearchParams, useSubmit } from "react-router";

import { useBrowserZone, useScheduleRefresh } from "~/components/schedule-refresh";
import { ThemeLabel } from "~/components/theme-label";
import { servicesContext } from "~/context";
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

const typeLabel = (value: string) => SESSION_TYPES.find((type) => type.value === value)?.label ?? value;

export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const db = services.db();
  const viewerZone = await getViewerZone(db, services.viewer!.userId, request.headers.get("Cookie"));

  const params = new URL(request.url).searchParams;
  const theme = params.get("theme");
  const sessionType = params.get("type");
  const filters = {
    now: new Date(),
    past: params.get("when") === "past",
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
      <h1 className="text-3xl font-semibold">Schedule</h1>
      <TimeZoneLine zone={zone} now={now} timeZones={timeZones} />
      <Filters filters={filters} />
      <Legend />

      {days.length === 0 ? (
        <p className="mt-8">
          {filtered
            ? "No sessions match. Try another search, or clear the filters."
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
                    <SessionCard session={session} zone={zone} />
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

function SessionCard({ session, zone }: { session: ScheduledSession; zone: string }) {
  return (
    <Link
      to={`/members/schedule/${session.id}`}
      className="flex overflow-hidden rounded-lg border border-[#C9DADC] bg-white hover:border-[#15383F] dark:border-[#24363B] dark:bg-[#12201F] dark:hover:border-[#8CC7D3]"
    >
      <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: themeColor(session.theme) }} />
      <span className="grid min-w-0 flex-1 gap-1 p-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
        <span className="font-semibold tabular-nums">{timeRange(session.startsAt, session.endsAt, zone)}</span>
        <span className="grid min-w-0 gap-1">
          <span className="text-lg font-semibold">{session.title}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <ThemeLabel theme={session.theme} />
            <span>{session.sessionTypes.map(typeLabel).join(", ")}</span>
            {session.city && <span>In person, {session.city}</span>}
          </span>
          {session.hosts.length > 0 && <span className="text-sm">With {session.hosts.join(", ")}</span>}
        </span>
      </span>
    </Link>
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
        <button type="submit" className="rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]">
          Save
        </button>
      </Form>
    </details>
  );
}

function Filters({ filters }: { filters: Route.ComponentProps["loaderData"]["filters"] }) {
  const submit = useSubmit();
  const [params] = useSearchParams();
  const field = "mt-1 w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E]";
  return (
    <Form
      method="get"
      role="search"
      className="mt-6 grid max-w-4xl gap-3 rounded-lg border border-[#C9DADC] bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_auto] dark:border-[#24363B] dark:bg-[#12201F]"
      // Dropdowns apply as soon as they change; the search waits for Enter or the button.
      onChange={(event) => {
        if ((event.target as HTMLElement).tagName === "SELECT") submit(event.currentTarget);
      }}
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="q" className="block text-sm font-medium">Search</label>
        <input id="q" name="q" type="search" defaultValue={filters.keyword ?? ""} placeholder="Title, host or description" className={field} />
      </div>
      <div>
        <label htmlFor="theme" className="block text-sm font-medium">Theme</label>
        <select id="theme" name="theme" defaultValue={filters.theme ?? ""} className={field}>
          <option value="">All themes</option>
          {THEMES.map((theme) => <option key={theme}>{theme}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="type" className="block text-sm font-medium">Session type</label>
        <select id="type" name="type" defaultValue={filters.sessionType ?? ""} className={field}>
          <option value="">All types</option>
          {SESSION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <select name="when" aria-label="Upcoming or past sessions" defaultValue={filters.past ? "past" : ""} className={field}>
          <option value="">Upcoming</option>
          <option value="past">Past</option>
        </select>
        <button type="submit" className="rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]">
          Search
        </button>
      </div>
      {params.size > 0 && (
        <Link to="/members/schedule" className="text-sm underline sm:col-span-2 lg:col-span-4">
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
