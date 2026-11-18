import { data, Form, Link } from "react-router";

import { SessionEditor } from "~/components/session-editor";
import { servicesContext } from "~/context";
import { saveSessionForm } from "~/lib/session-actions.server";
import { sessionToFormInput } from "~/lib/session-form";
import { getEditableSession } from "~/lib/sessions.server";
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
  const { session, edition } = await editableSession(context, params.sessionId);
  const query = new URL(request.url).searchParams;
  return {
    title: session.title,
    published: session.published,
    input: sessionToFormInput(session),
    year: edition?.year ?? null,
    timeZones: timeZoneNames(),
    saved: query.get("saved"),
    warning: query.get("warning"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { services } = await editableSession(context, params.sessionId);
  return saveSessionForm(request, services, params.sessionId);
}

export default function HostEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { published, saved, warning } = loaderData;
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
        <div role="status" className="mb-6 max-w-3xl rounded-lg border border-[#8CC7D3] bg-[#E6F5F6] p-4 text-[#15383F]">
          <p className="font-semibold">
            {saved === "published"
              ? "Saved, and on the calendar."
              : saved === "kept"
                ? "Members had RSVPed, so the session is off the calendar but kept as a draft, with its RSVPs. Only you can see it."
                : "Saved as a draft. Only you can see it."}
          </p>
          {warning && <p className="mt-1">{warning}</p>}
        </div>
      )}
      <SessionEditor
        key={loaderData.title + String(published)}
        initial={actionData?.input ?? loaderData.input}
        errors={actionData?.errors}
        status={published ? "published" : "draft"}
        year={loaderData.year}
        timeZones={loaderData.timeZones}
      />
      <details className="mt-10 max-w-3xl rounded-lg border border-[#E8B4B0] p-4">
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
