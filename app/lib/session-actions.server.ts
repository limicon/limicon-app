import { data, redirect } from "react-router";

import type { RequestServices } from "~/context";
import { checkSessionForm, readSessionForm, sessionToFormInput } from "~/lib/session-form";
import { createSession, deleteSession, getEditableSession, ineligibleCoHosts, isCocreationMeeting, updateSession } from "~/lib/sessions.server";

/**
 * Puts a draft on the calendar as it was saved, for a member who may edit it. It passes the same
 * checks as publishing from the form; otherwise nothing changes and `problems` says what to add.
 */
export async function publishDraft(
  services: RequestServices,
  sessionId: string,
): Promise<{ ok: true; title: string } | { ok: false; problems: string[] }> {
  const { edition, isAdmin } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  const db = services.db();
  const session = await getEditableSession(db, sessionId, { userId: services.viewer!.userId, isAdmin });
  if (!session) throw data("Session not found", { status: 404 });
  const result = checkSessionForm(sessionToFormInput(session), {
    publish: true,
    eventWindow: { first: edition.firstDay, last: edition.lastDay },
  });
  if (!result.ok) return { ok: false, problems: [...new Set(Object.values(result.errors).filter((e): e is string => Boolean(e)))] };
  if ((await ineligibleCoHosts(db, edition.id, result.values.coHostIds)).length) {
    return { ok: false, problems: ["A co-host isn't registered for this Limicon. Open Edit to change the co-hosts."] };
  }
  await updateSession(db, sessionId, result.values, true);
  return { ok: true, title: session.title };
}

/** Where the editor's pages live: the Members area's for hosts, the admin console's for admins. */
export type SessionPaths = { list: string; session: (id: string) => string };

const HOST_PATHS: SessionPaths = { list: "/members/host", session: (id) => `/members/host/${id}` };

/**
 * Handles a post from the Host a Session form, for a new session (`sessionId` null) or one the
 * caller has already checked the member may edit. Saves and goes to the session's page, or
 * returns what was entered with the errors to fix.
 */
export async function saveSessionForm(
  request: Request,
  services: RequestServices,
  sessionId: string | null,
  paths: SessionPaths = HOST_PATHS,
) {
  const form = await request.formData();
  const intent = form.get("intent");
  const { edition, isAdmin } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });

  if (intent === "delete" && sessionId) {
    const result = await deleteSession(services.db(), sessionId);
    throw redirect(result === "deleted" ? `${paths.list}?deleted=1` : `${paths.session(sessionId)}?saved=kept`);
  }

  const publish = intent === "publish";
  const input = readSessionForm(form);
  // Only admins mark co-creation meetings; anyone else keeps what the session already has.
  if (!isAdmin) input.cocreation = sessionId ? await isCocreationMeeting(services.db(), sessionId) : false;
  const result = checkSessionForm(input, {
    publish,
    eventWindow: { first: edition.firstDay, last: edition.lastDay },
  });
  if (!result.ok) return data({ input, errors: result.errors }, { status: 400 });

  const db = services.db();
  // Co-hosts must be registered for this edition (SES-5).
  const ineligible = await ineligibleCoHosts(db, edition.id, result.values.coHostIds);
  if (ineligible.length) {
    const names = input.coHosts.filter((person) => ineligible.includes(person.id)).map((person) => person.name || "Someone");
    const coHosts = input.coHosts.filter((person) => !ineligible.includes(person.id));
    const errors = { coHosts: `${names.join(", ")} ${names.length === 1 ? "isn't" : "aren't"} registered for Limicon ${edition.year}, so we took them out. Co-hosts need a ticket.` };
    return data({ input: { ...input, coHosts }, errors }, { status: 400 });
  }

  const id =
    sessionId ??
    (await createSession(db, { userId: services.viewer!.userId, editionId: edition.id, values: result.values, publish }));
  if (sessionId) await updateSession(db, sessionId, result.values, publish);

  const params = new URLSearchParams({ saved: publish ? "published" : "draft" });
  if (!sessionId && result.values.repeats.length) params.set("repeats", String(result.values.repeats.length));
  if (result.warnings.length) params.set("warning", result.warnings[0]!);
  throw redirect(`${paths.session(id)}?${params}`);
}
