import { data, Form, Link, redirect } from "react-router";

import { Badge, card, formatWhen, Notice, secondaryButton } from "~/components/admin-ui";
import { SessionEditor } from "~/components/session-editor";
import { servicesContext } from "~/context";
import { getAdminSessionMeta, isUuid, setCocreationMeeting } from "~/lib/admin.server";
import { saveSessionForm, type SessionPaths } from "~/lib/session-actions.server";
import { sessionToFormInput } from "~/lib/session-form";
import { getEditableSession } from "~/lib/sessions.server";
import { timeZoneNames } from "~/lib/zoned-time";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/session-edit";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? "Session"} · Admin · Limicon` }];
}

const ADMIN_PATHS: SessionPaths = { list: "/admin/sessions", session: (id) => `/admin/sessions/${id}` };

/** Any session in the current edition: admins may edit them all (SES-4). */
async function sessionForAdmin(context: Route.LoaderArgs["context"], sessionId: string) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition || !isUuid(sessionId)) throw data("Session not found", { status: 404 });
  const db = services.db();
  const [session, meta] = await Promise.all([
    getEditableSession(db, sessionId, { userId: services.viewer!.userId, isAdmin: true }),
    getAdminSessionMeta(db, edition.id, sessionId),
  ]);
  if (!session || !meta) throw data("Session not found", { status: 404 });
  return { services, edition, session, meta };
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const { session, edition, meta } = await sessionForAdmin(context, params.sessionId);
  const query = new URL(request.url).searchParams;
  return {
    id: session.id,
    title: session.title,
    published: session.published,
    hostId: session.hostId,
    input: sessionToFormInput(session),
    meta,
    year: edition.year,
    timeZones: timeZoneNames(),
    saved: query.get("saved"),
    warning: query.get("warning"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { services, edition } = await sessionForAdmin(context, params.sessionId);
  const intent = (await request.clone().formData()).get("intent");
  if (intent === "cocreation-on" || intent === "cocreation-off") {
    await setCocreationMeeting(services.db(), edition.id, params.sessionId, intent === "cocreation-on");
    throw redirect(`/admin/sessions/${params.sessionId}?saved=${intent}`);
  }
  return saveSessionForm(request, services, params.sessionId, ADMIN_PATHS);
}

const savedMessages: Record<string, string> = {
  published: "Saved, and on the calendar.",
  draft: "Saved as a draft. Only its hosts and admins can see it.",
  kept: "Members had RSVPed, so the session is off the calendar but kept as a draft, with its RSVPs.",
  "cocreation-on": "Marked as an Organizing Team co-creation meeting.",
  "cocreation-off": "No longer marked as a co-creation meeting.",
};

/** The hosts' session editor, inside the console, with what only admins see and set. */
export default function AdminSessionEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { published, saved, warning, meta } = loaderData;
  return (
    <>
      <p>
        <Link to="/admin/sessions" className="underline">Back to all sessions</Link>
      </p>
      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">{loaderData.title}</h1>
        <Badge tone={published ? "green" : "amber"}>{published ? "On the calendar" : "Draft"}</Badge>
        {meta.isCocreationMeeting && <Badge tone="blue">Co-creation meeting</Badge>}
      </div>
      {saved && savedMessages[saved] && !actionData && (
        <Notice>
          <p className="font-semibold">{savedMessages[saved]}</p>
          {warning && <p className="mt-1">{warning}</p>}
        </Notice>
      )}

      <section aria-label="Admin details" className={`${card} mb-8 grid gap-4 sm:grid-cols-2`}>
        <div>
          <h2 className="font-semibold">Hosts</h2>
          {meta.hosts.length === 0 ? (
            <p className="mt-1 text-sm">Nobody hosts this session.</p>
          ) : (
            <ul className="mt-1 text-sm">
              {meta.hosts.map((host) => (
                <li key={host.id}>
                  <Link to={`/admin/users/${host.id}`} className="underline">{host.name}</Link>
                  {host.role === "co-host" ? " (co-host)" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="font-semibold">RSVPs</h2>
          <p className="mt-1 text-sm">
            {meta.rsvps.registered} going{meta.rsvps.waitlisted ? ` · ${meta.rsvps.waitlisted} waitlisted` : ""}
          </p>
          <p className="mt-1 text-sm opacity-80">
            Created {formatWhen(meta.createdAt)} · updated {formatWhen(meta.updatedAt)}
          </p>
        </div>
        <Form method="post" className="sm:col-span-2">
          <p className="text-sm">
            Co-creation meetings are Organizing Team meetings, shown on the same calendar and filterable (SES-9).
          </p>
          <button
            type="submit"
            name="intent"
            value={meta.isCocreationMeeting ? "cocreation-off" : "cocreation-on"}
            className={`${secondaryButton} mt-2`}
          >
            {meta.isCocreationMeeting ? "Unmark as co-creation meeting" : "Mark as co-creation meeting"}
          </button>
        </Form>
      </section>

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
          This removes the session for good, and it can't be undone. If members have RSVPed, it's taken off the
          calendar and kept as a draft instead, so there's a record of who was going.
        </p>
        <Form method="post" className="mt-3">
          <button type="submit" name="intent" value="delete" onClick={(event) => { if (!confirm("Delete this session for good? This can't be undone.")) event.preventDefault(); }} className="rounded bg-[#B3261E] px-4 py-2 font-semibold text-white">
            Delete for good
          </button>
        </Form>
      </details>
    </>
  );
}
