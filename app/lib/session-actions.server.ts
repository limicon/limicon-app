import { data, redirect } from "react-router";

import type { RequestServices } from "~/context";
import { checkSessionForm, readSessionForm } from "~/lib/session-form";
import { createSession, deleteSession, updateSession } from "~/lib/sessions.server";

/**
 * Handles a post from the Host a Session form, for a new session (`sessionId` null) or one the
 * caller has already checked the member may edit. Saves and goes to the session's page, or
 * returns what was entered with the errors to fix.
 */
export async function saveSessionForm(
  request: Request,
  services: RequestServices,
  sessionId: string | null,
) {
  const form = await request.formData();
  const intent = form.get("intent");
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });

  if (intent === "delete" && sessionId) {
    await deleteSession(services.db(), sessionId);
    throw redirect("/members/host?deleted=1");
  }

  const publish = intent === "publish";
  const input = readSessionForm(form);
  const result = checkSessionForm(input, {
    publish,
    eventWindow: { first: edition.firstDay, last: edition.lastDay },
  });
  if (!result.ok) return data({ input, errors: result.errors }, { status: 400 });

  const db = services.db();
  const id =
    sessionId ??
    (await createSession(db, { userId: services.viewer!.userId, editionId: edition.id, values: result.values, publish }));
  if (sessionId) await updateSession(db, sessionId, result.values, publish);

  const params = new URLSearchParams({ saved: publish ? "published" : "draft" });
  if (result.warnings.length) params.set("warning", result.warnings[0]!);
  throw redirect(`/members/host/${id}?${params}`);
}
