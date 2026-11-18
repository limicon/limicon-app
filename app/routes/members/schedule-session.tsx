import { data, Link } from "react-router";

import { useBrowserZone, useScheduleRefresh } from "~/components/schedule-refresh";
import { ThemeLabel } from "~/components/theme-label";
import { servicesContext } from "~/context";
import { fullTimeRange, zoneName } from "~/lib/format-time";
import { getSessionDetails, scheduleVersion } from "~/lib/schedule.server";
import { EXPERIENCE, RECORDING_AUDIENCES, SESSION_TYPES } from "~/lib/session-form";
import { themeColor } from "~/lib/themes";
import { getViewerZone } from "~/lib/viewer-zone.server";
import type { Route } from "./+types/schedule-session";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.session.title ?? "Session"} · Schedule · Limicon` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition, isAdmin } = await services.membership();
  if (!edition) throw data("Session not found", { status: 404 });
  const db = services.db();
  const userId = services.viewer!.userId;
  const [session, version, viewerZone] = await Promise.all([
    getSessionDetails(db, params.sessionId, edition.id, userId),
    scheduleVersion(db, edition.id),
    getViewerZone(db, userId, request.headers.get("Cookie")),
  ]);
  if (!session) throw data("Session not found", { status: 404 });
  return { session, version, viewerZone, canEdit: session.viewerHosts || isAdmin, year: edition.year };
}

const label = <T extends { value: string; label: string }>(options: readonly T[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export default function ScheduleSession({ loaderData }: Route.ComponentProps) {
  const { session, version, viewerZone, canEdit, year } = loaderData;
  useScheduleRefresh(version);
  useBrowserZone(viewerZone.source, viewerZone.zone);

  const inPerson = session.sessionTypes.includes("in_person");
  const hostZoneDiffers = session.timeZone !== viewerZone.zone;
  const recording =
    session.privacy === "private"
      ? "Not recorded"
      : `Recorded, shared with ${
          session.privacy === "members" ? (year ? `Limicon ${year} members` : "Limicon members") : label(RECORDING_AUDIENCES, session.privacy).toLowerCase()
        }`;

  return (
    <article className="max-w-3xl">
      <p>
        <Link to="/members/schedule" className="underline">Back to the schedule</Link>
      </p>
      <div className="mt-4 flex gap-4">
        <span aria-hidden="true" className="w-1.5 shrink-0 rounded-full" style={{ background: themeColor(session.theme) }} />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">{session.title}</h1>
          <p className="mt-2 text-lg">{fullTimeRange(session.startsAt, session.endsAt, viewerZone.zone)}</p>
          {hostZoneDiffers && (
            <p className="text-sm">
              Host's time: {fullTimeRange(session.startsAt, session.endsAt, session.timeZone)} ({zoneName(session.timeZone)})
            </p>
          )}
          {session.hosts.length > 0 && <p className="mt-2">With {session.hosts.join(", ")}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <ThemeLabel theme={session.theme} />
            <span>{session.sessionTypes.map((type) => label(SESSION_TYPES, type)).join(", ")}</span>
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]" aria-labelledby="where">
        <h2 id="where" className="font-semibold">{inPerson ? "Where" : "How to join"}</h2>
        {inPerson ? (
          <p className="mt-1">{[session.city, session.venueNote].filter(Boolean).join(" · ") || "Location coming soon."}</p>
        ) : session.meetingLink ? (
          <p className="mt-1 break-all">
            <a href={session.meetingLink} className="font-semibold underline" target="_blank" rel="noreferrer">
              {session.meetingLink}
            </a>
          </p>
        ) : (
          <p className="mt-1">Link coming soon.</p>
        )}
        {session.maxParticipants !== null && <p className="mt-2 text-sm">Up to {session.maxParticipants} participants.</p>}
      </section>

      {session.description && (
        <section className="mt-6" aria-labelledby="about">
          <h2 id="about" className="text-xl font-semibold">About this session</h2>
          <p className="mt-2 whitespace-pre-line">{session.description}</p>
        </section>
      )}
      {session.intention && (
        <section className="mt-6" aria-labelledby="intention">
          <h2 id="intention" className="text-xl font-semibold">Intention</h2>
          <p className="mt-2 whitespace-pre-line">{session.intention}</p>
        </section>
      )}

      <section className="mt-6" aria-labelledby="good-to-know">
        <h2 id="good-to-know" className="text-xl font-semibold">Good to know</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{recording}</li>
          {session.experience.map((flag) => (
            <li key={flag}>{label(EXPERIENCE, flag)}</li>
          ))}
        </ul>
      </section>

      {canEdit && (
        <p className="mt-8">
          <Link to={`/members/host/${session.id}`} className="rounded border border-[#15383F] px-4 py-2 font-semibold dark:border-[#8CC7D3]">
            Edit this session
          </Link>
        </p>
      )}
    </article>
  );
}
