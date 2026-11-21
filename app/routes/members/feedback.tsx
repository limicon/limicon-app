import { data, Form, Link, redirect } from "react-router";

import { card, inputClass, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { FEEDBACK_KINDS, isFeedbackKind } from "~/lib/feedback";
import { listFeedback, listOtherHarvestSessions } from "~/lib/feedback.server";
import { fullTimeRange } from "~/lib/format-time";
import { getViewerZone } from "~/lib/viewer-zone.server";
import type { Route } from "./+types/feedback";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData ? FEEDBACK_KINDS[loaderData.kind].title : "Feedback"} · Members · Limicon` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  if (!isFeedbackKind(params.kind)) throw data("Not found", { status: 404 });
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const db = services.db();
  const userId = services.viewer!.userId;
  const url = new URL(request.url);
  // The "Harvest another session" picker, which works without JavaScript; the form page checks the session.
  const picked = url.searchParams.get("session");
  if (params.kind === "harvest" && picked) throw redirect(`/members/feedback/harvest/${encodeURIComponent(picked)}`);
  const [sessions, others, { zone }] = await Promise.all([
    edition ? listFeedback(db, params.kind, userId, edition.id) : Promise.resolve([]),
    edition && params.kind === "harvest" ? listOtherHarvestSessions(db, userId, edition.id) : Promise.resolve([]),
    getViewerZone(db, userId, request.headers.get("Cookie")),
  ]);
  return {
    kind: params.kind,
    sessions,
    // Only the picker needs these, as short labels.
    others: others.map((s) => ({ sessionId: s.sessionId, label: `${s.title} · ${fullTimeRange(s.startsAt, s.endsAt, zone)}` })),
    zone,
    sent: url.searchParams.has("sent"),
  };
}

/** A member's forms of one kind: the ones to fill in, and the ones they sent, which they can edit. */
export default function FeedbackList({ loaderData }: Route.ComponentProps) {
  const { kind, sessions, others, zone } = loaderData;
  const info = FEEDBACK_KINDS[kind];
  return (
    <div>
      <h1 className="text-3xl font-semibold">{info.title}</h1>
      <p className="mt-2 max-w-[68ch]">{info.intro}</p>
      {loaderData.sent && (
        <p role="status" className="mt-4 rounded bg-[#E3EEF0] px-4 py-3 font-medium dark:bg-[#24363B]">
          Thank you. Your answers are saved, and you can edit them here any time.
        </p>
      )}
      {sessions.length === 0 ? (
        <p className="mt-6">{info.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {sessions.map((session) => (
            <li key={session.sessionId} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <span>
                <span className="block font-semibold">{session.title}</span>
                <span className="block text-sm opacity-80">{fullTimeRange(session.startsAt, session.endsAt, zone)}</span>
              </span>
              {session.submittedAt ? (
                <span className="flex items-center gap-3">
                  <span className="text-sm">✓ Sent</span>
                  <Link to={`/members/feedback/${kind}/${session.sessionId}`} className="font-semibold underline">
                    Edit
                  </Link>
                </span>
              ) : (
                <Link
                  to={`/members/feedback/${kind}/${session.sessionId}`}
                  className="rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]"
                >
                  Fill in the form
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <Form method="get" className={`${card} mt-6 grid gap-3`}>
          <label htmlFor="other-session" className="font-semibold">Harvest another session</label>
          <span className="-mt-2 text-sm opacity-80">Joined a session without RSVPing? Choose it here.</span>
          <div className="flex flex-wrap gap-3">
            <select id="other-session" name="session" required defaultValue="" className={`${inputClass} max-w-xl flex-1`}>
              <option value="" disabled>Choose a session</option>
              {others.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>{s.label}</option>
              ))}
            </select>
            <button type="submit" className={secondaryButton}>Open the form</button>
          </div>
        </Form>
      )}
    </div>
  );
}
