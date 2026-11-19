import { data, Form, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, formatWhen, inputClass, Notice, PageHeading, primaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { checkEmailField } from "~/lib/admin-forms";
import { cancelInvitation, inviteAdmin, isUuid, listTeam } from "~/lib/admin.server";
import { ADMIN_ROLE } from "~/lib/admin-roles";
import { getUserRoles, listRoles, setUserRoles } from "~/lib/admin-roles.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/team";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Team · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const [team, roles] = await Promise.all([listTeam(db), listRoles(db)]);
  return {
    ...team,
    userId,
    roles: roles.map(({ key, name }) => ({ key, name })),
    canManage: true,
    done: new URL(request.url).searchParams.get("done"),
  };
}

/** Inviting admins and taking roles away (AUTH-5); the middleware checks the `roles` privilege. */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const form = await request.formData();
  const intent = form.get("intent");
  const permission = form.get("permission");

  if (intent === "invite") {
    const email = checkEmailField(form);
    if (!email.ok) return data({ input: email.input, error: email.error }, { status: 400 });
    if (typeof permission !== "string" || !(await listRoles(db)).some((r) => r.key === permission)) {
      return data({ input: email.email, error: "Choose a role." }, { status: 400 });
    }
    const outcome = await inviteAdmin(db, { email: email.email, permission, invitedBy: userId });
    throw redirect(`/admin/team?done=${outcome}`);
  }

  if (intent === "revoke") {
    const profileId = form.get("profileId");
    if (!isUuid(profileId) || typeof permission !== "string") throw data("Not found", { status: 404 });
    const current = await getUserRoles(db, profileId);
    const result = await setUserRoles(db, profileId, current.filter((r) => r !== permission), userId);
    if (!result.ok) return data({ input: "", error: result.problem }, { status: 409 });
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
  granted: "They have an account already, so they have that role now.",
  invited: "Invited. They get the role the first time they sign in with that address.",
  already: "They already have a role, or an invitation. Change an admin's role on the Users page.",
  revoked: "Role removed.",
  cancelled: "Invitation cancelled.",
};

export default function AdminTeam({ loaderData, actionData }: Route.ComponentProps) {
  const { members, invitations, userId, canManage, roles, done } = loaderData;
  const permissionLabel = (value: string) => roles.find((r) => r.key === value)?.name ?? value;
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
              <label htmlFor="permission" className="block text-sm font-medium">Role</label>
              <select id="permission" name="permission" className={`${inputClass} mt-1`}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" name="intent" value="invite" disabled={busy} className={primaryButton}>Add admin</button>
          </div>
          <FieldError id="email-error" message={actionData?.input ? actionData.error : undefined} />
          <p className="text-sm opacity-80">
            Admins can make anyone an admin, but can only remove admin status from themselves. No email is sent. If they don't have an account yet, they become an admin the first time they sign in with this address.
          </p>
        </Form>
      ) : (
        <p className="mb-8 max-w-3xl">Only admins can add admins.</p>
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
                  {canManage && (p.permission !== ADMIN_ROLE || member.profileId === userId) && (
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
