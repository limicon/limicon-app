import { data, Link } from "react-router";

import { RichText } from "~/components/rich-text";
import { useBrowserZone, useScheduleRefresh } from "~/components/schedule-refresh";
import { ThemeLabel } from "~/components/theme-label";
import { servicesContext } from "~/context";
import { fullTimeRange, zoneName } from "~/lib/format-time";
import { RsvpButton } from "~/components/rsvp-button";
import { SessionPhoto } from "~/components/session-photo";
import { SeriesBadge } from "~/components/series-badge";
import { cancelRsvp, getRsvpSummary, rsvp } from "~/lib/rsvps.server";
import { getSessionDetails, scheduleVersion } from "~/lib/schedule.server";
import { listOtherDates } from "~/lib/sessions.server";
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
  const [session, version, viewerZone, rsvps, otherDates] = await Promise.all([
    getSessionDetails(db, params.sessionId, edition.id, userId),
    scheduleVersion(db, edition.id),
    getViewerZone(db, userId, request.headers.get("Cookie")),
    getRsvpSummary(db, params.sessionId, userId),
    listOtherDates(db, params.sessionId, true),
  ]);
  if (!session) throw data("Session not found", { status: 404 });
  return { session, version, viewerZone, rsvps, otherDates, canEdit: session.viewerHosts || isAdmin, year: edition.year };
}

/** RSVPs or cancels, for the signed-in member (CAL-5). */
export async function action({ request, context, params }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const form = await request.formData();
  const userId = services.viewer!.userId;
  const sessionId = params.sessionId;
  if (form.get("intent") === "cancel") {
    await cancelRsvp(services.db(), { sessionId, userId });
    return { outcome: "cancelled" };
  }
  const outcome = await rsvp(services.db(), { sessionId, userId });
  if (outcome === "not-found") throw data("Session not found", { status: 404 });
  return { outcome };
}

const label = <T extends { value: string; label: string }>(options: readonly T[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export default function ScheduleSession({ loaderData }: Route.ComponentProps) {
  const { session, version, viewerZone, rsvps, otherDates, canEdit, year } = loaderData;
  const full = rsvps.capacity !== null && rsvps.registered >= rsvps.capacity;
  const finished = new Date(session.endsAt).getTime() <= Date.now();
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
    <article>
      <p>
        <Link to="/members/schedule" className="underline">Back to the schedule</Link>
      </p>
      <div className="mt-4 flex gap-4">
        <span aria-hidden="true" className="w-1.5 shrink-0 rounded-full" style={{ background: themeColor(session.theme) }} />
        <SessionPhoto session={session} className="size-24 sm:size-40" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words sm:text-3xl">{session.title}</h1>
          <p className="mt-2 text-lg">{fullTimeRange(session.startsAt, session.endsAt, viewerZone.zone)}</p>
          {hostZoneDiffers && (
            <p className="text-sm">
              Host's time: {fullTimeRange(session.startsAt, session.endsAt, session.timeZone)} ({zoneName(session.timeZone)})
            </p>
          )}
          {session.hosts.length > 0 && <p className="mt-2">With {session.hosts.join(", ")}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 items-center">
            <ThemeLabel theme={session.theme} />
            <SeriesBadge recurring={session.recurring} />
            <span>{session.sessionTypes.map((type) => label(SESSION_TYPES, type)).join(", ")}</span>
          </p>
        </div>
      </div>

      <section className="mt-6 grid gap-3 rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]" aria-labelledby="rsvp">
        <h2 id="rsvp" className="font-semibold">Going</h2>
        <p>
          {rsvps.capacity === null
            ? `${rsvps.registered} going`
            : `${rsvps.registered} of ${rsvps.capacity} places taken`}
          {/* Hosts are going without RSVPs, and don't take places. */}
          {session.hosts.length > 0 && `, plus ${session.hosts.length === 1 ? "the host" : `${session.hosts.length} hosts`}`}
          {rsvps.waitlisted > 0 && ` · ${rsvps.waitlisted} on the waitlist`}
        </p>
        {finished ? (
          <p className="text-sm">This session has finished.</p>
        ) : (
          <RsvpButton
            sessionId={session.id}
            status={rsvps.mine}
            title={session.title}
            full={full}
            waitlistEnabled={rsvps.waitlistEnabled}
          />
        )}
        {rsvps.mine === "waitlisted" && !finished && (
          <p className="text-sm">If a place opens, you'll move up automatically.</p>
        )}
      </section>

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
      </section>

      {(session.descriptionDoc || session.description) && (
        <section className="mt-6" aria-labelledby="about">
          <h2 id="about" className="text-xl font-semibold">About this session</h2>
          {session.descriptionDoc ? (
            <RichText doc={session.descriptionDoc} className="mt-2" />
          ) : (
            <p className="mt-2 whitespace-pre-line">{session.description}</p>
          )}
        </section>
      )}
      {session.intention && (
        <section className="mt-6" aria-labelledby="intention">
          <h2 id="intention" className="text-xl font-semibold">Intention</h2>
          <p className="mt-2 whitespace-pre-line">{session.intention}</p>
        </section>
      )}

      {otherDates.length > 0 && (
        <section className="mt-6" aria-labelledby="also-on">
          <h2 id="also-on" className="text-xl font-semibold">Also on</h2>
          <p className="text-sm">This session repeats. Each date has its own RSVPs.</p>
          <ul className="mt-2 grid gap-1">
            {otherDates.map((date) => (
              <li key={date.id}>
                <Link to={`/members/schedule/${date.id}`} className="underline">
                  {fullTimeRange(date.startsAt!, date.endsAt!, viewerZone.zone)}
                </Link>
              </li>
            ))}
          </ul>
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
