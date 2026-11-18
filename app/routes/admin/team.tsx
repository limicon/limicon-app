import { data, Form, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, formatWhen, inputClass, Notice, PageHeading, primaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { ADMIN_PERMISSIONS, checkEmailField, isAdminPermission } from "~/lib/admin-forms";
import { cancelInvitation, getAdminPermissions, inviteAdmin, isUuid, listTeam, revokeAdminPermission } from "~/lib/admin.server";
import type { Route } from "./+types/team";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Team · Admin · Limicon" }];
}

const permissionLabel = (value: string) => ADMIN_PERMISSIONS.find((p) => p.value === value)?.label ?? value;

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const [team, mine] = await Promise.all([listTeam(db), getAdminPermissions(db, userId)]);
  return { ...team, userId, canManage: mine.includes("full"), done: new URL(request.url).searchParams.get("done") };
}

/** Granting and revoking admin access (AUTH-5) needs the `full` permission. */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  if (!(await getAdminPermissions(db, userId)).includes("full")) {
    throw data("Only admins with full access can change the team.", { status: 403 });
  }
  const form = await request.formData();
  const intent = form.get("intent");
  const permission = form.get("permission");

  if (intent === "invite") {
    const email = checkEmailField(form);
    if (!email.ok) return data({ input: email.input, error: email.error }, { status: 400 });
    if (!isAdminPermission(permission)) return data({ input: email.email, error: "Choose a permission." }, { status: 400 });
    const outcome = await inviteAdmin(db, { email: email.email, permission, invitedBy: userId });
    throw redirect(`/admin/team?done=${outcome}`);
  }

  if (intent === "revoke") {
    const profileId = form.get("profileId");
    if (!isUuid(profileId) || typeof permission !== "string") throw data("Not found", { status: 404 });
    if (profileId === userId) return data({ input: "", error: "You can't remove your own access. Ask another admin." }, { status: 409 });
    await revokeAdminPermission(db, profileId, permission);
    throw redirect("/admin/team?done=revoked");
  }

  if (intent === "cancel") {
    const email = form.get("email");
    if (typeof email !== "string" || typeof permission !== "string") throw data("Not found", { status: 404 });
    await cancelInvitation(db, email, permission);
    throw redirect("/admin/team?done=cancelled");
  }

  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  granted: "They have an account already, so they're an admin now.",
  invited: "Invited. They become an admin the first time they sign in with that address.",
  already: "They already have that access, or an invitation for it.",
  revoked: "Access removed.",
  cancelled: "Invitation cancelled.",
};

export default function AdminTeam({ loaderData, actionData }: Route.ComponentProps) {
  const { members, invitations, userId, canManage, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <PageHeading title="Team">
        <p>Who can open this console. Admins see and change everything here, and can open the Members area without a ticket.</p>
      </PageHeading>
      {done && doneMessages[done] && !actionData && <Notice>{doneMessages[done]}</Notice>}
      {actionData?.error && !actionData.input && <Notice tone="problem">{actionData.error}</Notice>}

      {canManage ? (
        <Form method="post" className={`${card} mb-8 grid max-w-3xl gap-3`}>
          <h2 className="text-lg font-semibold">Add an admin</h2>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">Their email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="off"
                defaultValue={actionData?.input ?? ""}
                className={`${inputClass} mt-1`}
                {...(actionData?.error && actionData.input ? { "aria-invalid": true, "aria-describedby": "email-error" } : {})}
              />
            </div>
            <div>
              <label htmlFor="permission" className="block text-sm font-medium">Access</label>
              <select id="permission" name="permission" className={`${inputClass} mt-1`}>
                {ADMIN_PERMISSIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" name="intent" value="invite" disabled={busy} className={primaryButton}>Add admin</button>
          </div>
          <FieldError id="email-error" message={actionData?.input ? actionData.error : undefined} />
          <p className="text-sm opacity-80">
            No email is sent. If they don't have an account yet, they become an admin the first time they sign in with this address.
          </p>
        </Form>
      ) : (
        <p className="mb-8 max-w-3xl">Only admins with full access can add or remove admins.</p>
      )}

      <h2 className="text-xl font-semibold">Admins</h2>
      <ul className="mt-3 grid max-w-3xl gap-3">
        {members.map((member) => (
          <li key={member.profileId} className={`${card} p-4`}>
            <p className="font-semibold">
              {member.name ?? member.email}
              {member.profileId === userId && <span className="ml-2 text-sm font-normal opacity-80">(you)</span>}
            </p>
            {member.name && <p className="text-sm break-all">{member.email}</p>}
            <ul className="mt-2 grid gap-1 text-sm">
              {member.permissions.map((p) => (
                <li key={p.permission} className="flex flex-wrap items-center gap-x-3">
                  <span>
                    <span className="font-medium">{permissionLabel(p.permission)}</span>
                    <span className="opacity-80"> · since {formatWhen(p.grantedAt)}{p.grantedBy ? `, added by ${p.grantedBy}` : ""}</span>
                  </span>
                  {canManage && member.profileId !== userId && (
                    <Form method="post">
                      <input type="hidden" name="profileId" value={member.profileId} />
                      <input type="hidden" name="permission" value={p.permission} />
                      <button type="submit" name="intent" value="revoke" disabled={busy} className={dangerButton}>Remove</button>
                    </Form>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Waiting for first sign-in</h2>
      {invitations.length === 0 ? (
        <p className="mt-3">No invitations waiting.</p>
      ) : (
        <ul className="mt-3 grid max-w-3xl gap-2">
          {invitations.map((invite) => (
            <li key={`${invite.email}-${invite.permission}`} className={`${card} flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm`}>
              <span className="min-w-0 flex-1">
                <span className="font-semibold break-all">{invite.email}</span>
                <span className="opacity-80">
                  {" "}· {permissionLabel(invite.permission)} · invited {formatWhen(invite.invitedAt)}
                  {invite.invitedBy ? ` by ${invite.invitedBy}` : ""}
                </span>
              </span>
              {canManage && (
                <Form method="post">
                  <input type="hidden" name="email" value={invite.email} />
                  <input type="hidden" name="permission" value={invite.permission} />
                  <button type="submit" name="intent" value="cancel" disabled={busy} className={dangerButton}>Cancel</button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
