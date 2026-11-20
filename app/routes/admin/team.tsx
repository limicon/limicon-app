import { useEffect, useState } from "react";
import { data, Form, Link, redirect, useLocation, useNavigation } from "react-router";

import { RemoveRoleDialog } from "~/components/remove-role-dialog";
import { Badge, card, dangerButton, FieldError, formatWhen, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { checkEmailField } from "~/lib/admin-forms";
import { cancelInvitation, inviteAdmin, isUuid, listTeam } from "~/lib/admin.server";
import { ADMIN_ROLE, PRIVILEGES, type Role } from "~/lib/admin-roles";
import { getUserRoles, listRoleRemovals, listRoles, setUserRoles } from "~/lib/admin-roles.server";
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
  const [team, roles, removals] = await Promise.all([listTeam(db), listRoles(db), listRoleRemovals(db, { limit: 20 })]);
  return { ...team, roles, removals, userId: services.viewer!.userId, done: new URL(request.url).searchParams.get("done") };
}

type ActionData = { permission: string; input: string; error: string };

/** Giving roles by email, taking them away, and cancelling invitations (AUTH-5). */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const form = await request.formData();
  const intent = form.get("intent");
  const permission = typeof form.get("permission") === "string" ? (form.get("permission") as string) : "";

  if (intent === "invite") {
    if (!(await listRoles(db)).some((r) => r.key === permission)) throw data("Role not found", { status: 404 });
    const email = checkEmailField(form);
    if (!email.ok) return data<ActionData>({ permission, input: email.input, error: email.error }, { status: 400 });
    const outcome = await inviteAdmin(db, { email: email.email, permission, invitedBy: userId });
    throw redirect(`/admin/team?done=${outcome}`);
  }

  if (intent === "revoke") {
    const profileId = form.get("profileId");
    if (!isUuid(profileId) || !permission) throw data("Not found", { status: 404 });
    const current = await getUserRoles(db, profileId);
    const reason = form.get("reason");
    const result = await setUserRoles(db, profileId, current.filter((r) => r !== permission), userId, typeof reason === "string" ? reason : undefined);
    if (!result.ok) return data<ActionData>({ permission, input: "", error: result.problem }, { status: 409 });
    throw redirect("/admin/team?done=revoked");
  }

  if (intent === "cancel") {
    const email = form.get("email");
    if (typeof email !== "string" || !permission) throw data("Not found", { status: 404 });
    await cancelInvitation(db, email, permission);
    throw redirect("/admin/team?done=cancelled");
  }

  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  granted: "They have an account already, so they have that role now.",
  invited: "Invited. They get the role the first time they sign in with that address.",
  already: "They already have that role, or an invitation to it.",
  revoked: "Role removed.",
  cancelled: "Invitation cancelled.",
  created: "Role added. Add people to it below.",
  saved: "Role saved. Everyone who holds it has the new privileges now.",
  deleted: "Role deleted.",
};

type LoaderData = Route.ComponentProps["loaderData"];

/** Each role in turn, Admin first: what it may do, who holds it, and a way to add someone. */
export default function AdminTeam({ loaderData, actionData }: Route.ComponentProps) {
  const { roles, removals, done } = loaderData;
  return (
    <>
      <PageHeading title="Team">
        <p>
          Who can open this console, by role. A person can hold several roles, and what they allow adds up. Change anyone's roles on the{" "}
          <Link to="/admin/users?role=admin" className="underline">Users</Link> page too.
        </p>
      </PageHeading>
      {done && doneMessages[done] && !actionData && <Notice>{doneMessages[done]}</Notice>}

      <div className="grid max-w-4xl gap-10">
        {roles.map((role) => (
          <RoleSection key={role.key} role={role} loaderData={loaderData} actionData={actionData?.permission === role.key ? actionData : undefined} />
        ))}
      </div>

      <p className="mt-10">
        <Link to="/admin/roles/new" className={primaryButton}>+ Add new role</Link>
      </p>

      <section aria-labelledby="removals-heading" className="mt-10 max-w-4xl">
        <h2 id="removals-heading" className="text-2xl font-semibold">Recent removals</h2>
        <p className="mt-1">Who was removed from a role, by whom and why, newest first. Each person's page shows their whole history.</p>
        <div className={`${card} mt-3 p-0`}>
          {removals.length === 0 ? (
            <p className="p-4 text-sm opacity-80">No one has been removed from a role yet.</p>
          ) : (
            <ul className="divide-y divide-[#E2E8E9] dark:divide-[#24363B]">
              {removals.map((r) => (
                <li key={r.id} className="p-4 text-sm">
                  <Link to={`/admin/users/${r.profileId}`} className="font-semibold underline">{r.person ?? "Unknown"}</Link> removed from {r.roleName}
                  <span className="opacity-80"> · {formatWhen(r.removedAt)}{r.removedBy ? ` by ${r.removedBy}` : ""}</span>
                  <span className="block">“{r.reason}”</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function RoleSection({ role, loaderData, actionData }: { role: Role; loaderData: LoaderData; actionData?: ActionData }) {
  const { members, invitations, userId } = loaderData;
  const busy = useNavigation().state !== "idle";
  // A finished add comes back as a new page, which closes the form; a refused one keeps it open with the problem.
  const pageKey = useLocation().key;
  const [adding, setAdding] = useState(Boolean(actionData?.input));
  useEffect(() => setAdding(false), [pageKey]);
  useEffect(() => {
    if (actionData?.input) setAdding(true);
  }, [actionData]);

  const holders = members
    .map((m) => ({ ...m, role: m.permissions.find((p) => p.permission === role.key) }))
    .filter((m) => m.role);
  const waiting = invitations.filter((i) => i.permission === role.key);
  const isAdmin = role.key === ADMIN_ROLE;
  const headingId = `role-${role.key}`;
  const formId = `add-${role.key}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={headingId} className="mr-auto text-2xl font-semibold">{role.name}</h2>
        <div className="flex flex-wrap gap-2">
          {!role.builtIn && <Link to={`/admin/roles/${role.key}`} className={secondaryButton}>Edit role</Link>}
          <button type="button" aria-expanded={adding} aria-controls={formId} onClick={() => setAdding(!adding)} className={primaryButton}>
            + Add {role.name}
          </button>
        </div>
      </div>
      {isAdmin ? (
        <p className="mt-1 max-w-[68ch]">
          Can do everything in this console, including managing users, sessions and the team, and can open the Members area without a ticket. Admins can make anyone an admin, but can only remove admin status from themselves.
        </p>
      ) : (
        <>
          <p className="mt-1">Can:</p>
          <ul className="mt-1 list-disc pl-5">
            {PRIVILEGES.filter((p) => role.privileges.includes(p.key)).map((p) => (
              <li key={p.key}>{p.label}</li>
            ))}
          </ul>
        </>
      )}

      {adding && (
        <Form method="post" id={formId} className={`${card} mt-3 grid gap-2`}>
          <input type="hidden" name="permission" value={role.key} />
          <label htmlFor={`${formId}-email`} className="block text-sm font-medium">Their email</label>
          <div className="flex flex-wrap items-start gap-2">
            <input
              id={`${formId}-email`}
              name="email"
              type="email"
              autoComplete="off"
              autoFocus
              defaultValue={actionData?.input ?? ""}
              className={`${inputClass} w-80 max-w-full`}
              {...(actionData?.error && actionData.input ? { "aria-invalid": true, "aria-describedby": `${formId}-error` } : {})}
            />
            <button type="submit" name="intent" value="invite" disabled={busy} className={primaryButton}>Add</button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>Cancel</button>
          </div>
          <FieldError id={`${formId}-error`} message={actionData?.input ? actionData.error : undefined} />
          <p className="text-sm opacity-80">
            No email is sent. If they don't have an account yet, they get the role the first time they sign in with this address.
          </p>
        </Form>
      )}
      {actionData?.error && !actionData.input && <Notice tone="problem">{actionData.error}</Notice>}

      <div className={`${card} mt-3 p-0`}>
        {holders.length === 0 && waiting.length === 0 ? (
          <p className="p-4 text-sm opacity-80">No one holds this role yet.</p>
        ) : (
          <ul className="divide-y divide-[#E2E8E9] dark:divide-[#24363B]">
            {holders.map((member) => (
              <li key={member.profileId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <span className="min-w-0 flex-1">
                  <Link to={`/admin/users/${member.profileId}`} className="font-semibold underline">{member.name ?? member.email}</Link>
                  {member.profileId === userId && <span className="ml-2 text-sm opacity-80">(you)</span>}
                  {member.name && <span className="block text-sm break-all">{member.email}</span>}
                  <span className="block text-sm opacity-80">
                    Since {formatWhen(member.role!.grantedAt)}
                    {member.role!.grantedBy ? `, added by ${member.role!.grantedBy}` : ""}
                  </span>
                </span>
                {(!isAdmin || member.profileId === userId) && (
                  <RemoveButton profileId={member.profileId} person={member.name ?? member.email ?? "this person"} role={role} busy={busy} />
                )}
              </li>
            ))}
            {waiting.map((invite) => (
              <li key={invite.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold break-all">{invite.email}</span> <Badge tone="gray">Waiting for first sign-in</Badge>
                  <span className="block text-sm opacity-80">
                    Invited {formatWhen(invite.invitedAt)}
                    {invite.invitedBy ? ` by ${invite.invitedBy}` : ""}
                  </span>
                </span>
                <Form method="post">
                  <input type="hidden" name="email" value={invite.email} />
                  <input type="hidden" name="permission" value={role.key} />
                  <button type="submit" name="intent" value="cancel" disabled={busy} className={dangerButton}>Cancel invitation</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Removes one person from a role, after asking why. */
function RemoveButton({ profileId, person, role, busy }: { profileId: string; person: string; role: Role; busy: boolean }) {
  const [asking, setAsking] = useState(false);
  const pageKey = useLocation().key;
  useEffect(() => setAsking(false), [pageKey]);
  return (
    <Form method="post" onSubmit={() => setAsking(false)}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="permission" value={role.key} />
      <button type="button" onClick={() => setAsking(true)} disabled={busy} className={dangerButton}>Remove</button>
      <RemoveRoleDialog
        open={asking}
        onClose={() => setAsking(false)}
        person={person}
        roleNames={[role.name]}
        busy={busy}
        submitName="intent"
        submitValue="revoke"
      />
    </Form>
  );
}
