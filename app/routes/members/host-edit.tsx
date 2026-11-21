import { data, Form, Link } from "react-router";

import { SessionEditor } from "~/components/session-editor";
import { servicesContext } from "~/context";
import { saveSessionForm } from "~/lib/session-actions.server";
import { sessionToFormInput } from "~/lib/session-form";
import { fullTimeRange } from "~/lib/format-time";
import { getEditableSession, listOtherDates } from "~/lib/sessions.server";
import { timeZoneNames } from "~/lib/zoned-time";
import type { Route } from "./+types/host-edit";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? "Session"} · Members · Limicon` }];
}

/** The session, if the member hosts or co-hosts it or is an admin; otherwise not found. */
async function editableSession(context: Route.LoaderArgs["context"], sessionId: string) {
  const services = context.get(servicesContext);
  const { isAdmin, edition } = await services.membership();
  const session = await getEditableSession(services.db(), sessionId, { userId: services.viewer!.userId, isAdmin });
  if (!session) throw data("Session not found", { status: 404 });
  return { services, session, edition };
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const { session, edition, services } = await editableSession(context, params.sessionId);
  const query = new URL(request.url).searchParams;
  return {
    id: session.id,
    title: session.title,
    published: session.published,
    hostId: session.hostId,
    input: sessionToFormInput(session),
    year: edition?.year ?? null,
    timeZones: timeZoneNames(),
    otherDates: await listOtherDates(services.db(), session.id, false),
    repeats: Number(query.get("repeats")) || 0,
    saved: query.get("saved"),
    warning: query.get("warning"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { services } = await editableSession(context, params.sessionId);
  return saveSessionForm(request, services, params.sessionId);
}

export default function HostEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { published, saved, warning, otherDates, repeats } = loaderData;
  return (
    <>
      <p>
        <Link to="/members/host" className="underline">Back to your sessions</Link>
      </p>
      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">{loaderData.title}</h1>
        <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${published ? "bg-[#CDEBE3] text-[#0F4A3C]" : "bg-[#F9DCBD] text-[#5A3612]"}`}>
          {published ? "On the calendar" : "Draft"}
        </span>
      </div>
      {saved && !actionData && (
        <div role="status" className="mb-6 rounded-lg border border-[#8CC7D3] bg-[#E6F5F6] p-4 text-[#15383F]">
          <p className="font-semibold">
            {saved === "published"
              ? "Saved, and on the calendar."
              : saved === "kept"
                ? "Members had RSVPed, so the session is off the calendar but kept as a draft, with its RSVPs. Only you can see it."
                : "Saved as a draft. Only you can see it."}
            {repeats > 0 && ` We also made ${repeats === 1 ? "a session" : `${repeats} sessions`} for the other ${repeats === 1 ? "date" : "dates"}, listed below.`}
          </p>
          {warning && <p className="mt-1">{warning}</p>}
        </div>
      )}
      {otherDates.length > 0 && (
        <section aria-labelledby="other-dates" className="mb-6 rounded-lg border border-[#C9DADC] bg-white p-4 dark:border-[#24363B] dark:bg-[#12201F]">
          <h2 id="other-dates" className="font-semibold">Other dates of this session</h2>
          <p className="text-sm">Each date is its own session. Changes here apply to this date only.</p>
          <ul className="mt-2 grid gap-1">
            {otherDates.map((date) => (
              <li key={date.id} className="flex flex-wrap gap-x-2">
                <Link to={`/members/host/${date.id}`} className="underline">
                  {date.startsAt ? fullTimeRange(date.startsAt, date.endsAt!, date.timeZone) : "No date yet"}
                </Link>
                <span className="text-sm">{date.published ? "On the calendar" : "Draft"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SessionEditor
        key={loaderData.id + String(published)}
        initial={actionData?.input ?? loaderData.input}
        errors={actionData?.errors}
        status={published ? "published" : "draft"}
        year={loaderData.year}
        timeZones={loaderData.timeZones}
        hostId={loaderData.hostId}
      />
      <details className="mt-10 rounded-lg border border-[#E8B4B0] p-4">
        <summary className="cursor-pointer font-semibold">Delete this session</summary>
        <p className="mt-3">
          This removes the session for good, and it can't be undone. If members have RSVPed, it's
          taken off the calendar and kept as a draft instead, so there's a record of who was going.
        </p>
        <Form method="post" className="mt-3">
          <button type="submit" name="intent" value="delete" className="rounded bg-[#B3261E] px-4 py-2 font-semibold text-white">
            Delete for good
          </button>
        </Form>
      </details>
    </>
  );
}
