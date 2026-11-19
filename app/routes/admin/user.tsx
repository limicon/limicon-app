import { data, Form, Link, redirect, useNavigation } from "react-router";

import { Badge, card, dangerButton, FieldError, formatWhen, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { RoleBadges, RolePicker } from "~/components/role-picker";
import { servicesContext } from "~/context";
import { formatDollars, NOTE_MAX } from "~/lib/admin-forms";
import { ADMIN_ROLE } from "~/lib/admin-roles";
import { isUuid, removeCompTicket } from "~/lib/admin.server";
import { listRoles, setUserRoles } from "~/lib/admin-roles.server";
import { addUserNote, deleteUserNote, getUser, setDeactivated, updateUserName } from "~/lib/admin-users.server";
import { NAME_MAX } from "~/lib/registration-form";
import { getRegistrationFields } from "~/lib/registration.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/user";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.displayName ?? "User"} · Admin · Limicon` }];
}

async function load(context: Route.LoaderArgs["context"], userId: string) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition || !isUuid(userId)) throw data("User not found", { status: 404 });
  const db = services.db();
  const [user, privileges, roles] = await Promise.all([getUser(db, userId, edition.id), services.privileges(), listRoles(db)]);
  if (!user) throw data("User not found", { status: 404 });
  return {
    services,
    db,
    edition,
    user,
    roles: roles.map(({ key, name }) => ({ key, name })),
    canManageRoles: privileges.has("admin"),
    canComp: privileges.has("settings"),
    viewerId: services.viewer!.userId,
  };
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const { db, edition, user, roles, canManageRoles, canComp, viewerId } = await load(context, params.userId);
  const fields = (await getRegistrationFields(db, edition.id)).map(({ key, kind, label }) => ({ key, kind, label }));
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return {
    user,
    year: edition.year,
    displayName: name || user.email || "Unknown",
    roles,
    canManageRoles,
    canComp,
    isSelf: user.id === viewerId,
    viewerId,
    fields,
    done: new URL(request.url).searchParams.get("done"),
  };
}

type ActionData = { form: "name"; error: string } | { form: "note"; error: string; body: string } | { form: "problem"; error: string };

export async function action({ context, params, request }: Route.ActionArgs) {
  const { db, edition, user, roles, canManageRoles, canComp, viewerId } = await load(context, params.userId);
  const form = await request.formData();
  const intent = form.get("intent");
  const back = (done: string) => redirect(`/admin/users/${user.id}?done=${done}`);
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };

  if (intent === "name") {
    const first = text("firstName");
    const last = text("lastName");
    if ([...first].length > NAME_MAX || [...last].length > NAME_MAX) {
      return data<ActionData>({ form: "name", error: `Keep each name to ${NAME_MAX} characters.` }, { status: 400 });
    }
    await updateUserName(db, user.id, first || null, last || null);
    throw back("name");
  }

  if (intent === "set-roles") {
    if (!canManageRoles) throw data("Only admins can change roles.", { status: 403 });
    const chosen = form.getAll("role").filter((r): r is string => typeof r === "string" && roles.some((role) => role.key === r));
    const result = await setUserRoles(db, user.id, chosen, viewerId);
    if (!result.ok) return data<ActionData>({ form: "problem", error: result.problem }, { status: 409 });
    throw back("role");
  }

  if (intent === "remove-comp") {
    if (!canComp) throw data("Your admin role can't change tickets.", { status: 403 });
    await removeCompTicket(db, edition.id, Number(form.get("ticketId")));
    throw back("comp-removed");
  }

  if (intent === "deactivate" || intent === "reactivate") {
    if (user.id === viewerId) return data<ActionData>({ form: "problem", error: "You can't deactivate your own account." }, { status: 409 });
    if (user.permissions.some((p) => p.permission === ADMIN_ROLE)) {
      return data<ActionData>({ form: "problem", error: "Admins can't deactivate another admin." }, { status: 403 });
    }
    await setDeactivated(db, user.id, intent === "deactivate");
    throw back(intent === "deactivate" ? "deactivated" : "reactivated");
  }

  if (intent === "add-note") {
    const body = text("body");
    if (!body || body.length > NOTE_MAX) {
      return data<ActionData>({ form: "note", body, error: body ? `Keep the note to ${NOTE_MAX} characters.` : "Write a note first." }, { status: 400 });
    }
    await addUserNote(db, user.id, viewerId, body);
    throw back("note");
  }

  if (intent === "delete-note") {
    await deleteUserNote(db, Number(form.get("noteId")), viewerId);
    throw back("note-deleted");
  }

  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  name: "Name saved.",
  role: "Roles saved.",
  "comp-removed": "Comp ticket removed.",
  deactivated: "Account deactivated. They can't open the Members area or this console until it's reactivated.",
  reactivated: "Account reactivated.",
  note: "Note added.",
  "note-deleted": "Note deleted.",
};

const ticketBadge = {
  paid: { tone: "green", label: "Paid" },
  comp: { tone: "blue", label: "Comp" },
  refunded: { tone: "gray", label: "Refunded" },
} as const;

/** One person: their account, tickets, roles, sessions and registration answers, and admins' notes. */
export default function AdminUser({ loaderData, actionData }: Route.ComponentProps) {
  const { user, year, displayName, roles, canManageRoles, canComp, isSelf, viewerId, fields, done } = loaderData;
  const questionLabel = new Map(fields.map((f) => [f.key, f.label]));
  const questionOrder = fields.map((f) => f.key);
  const busy = useNavigation().state !== "idle";
  const held = user.permissions.map((p) => p.permission);
  // Answers to fields since removed from the form come last, under their key.
  const position = (key: string) => (questionOrder.includes(key) ? questionOrder.indexOf(key) : questionOrder.length);
  const answers = [...user.answers].sort((a, b) => position(a.question) - position(b.question));
  const agreementKeys = new Set(fields.filter((f) => f.kind === "checkbox").map((f) => f.key));

  return (
    <>
      <p>
        <Link to="/admin/users" className="underline">Back to all users</Link>
      </p>
      <div className="mt-4">
        <PageHeading title={displayName}>
          <p className="flex flex-wrap items-center gap-2">
            <RoleBadges current={held} roles={roles} />
            {displayName !== user.email && <span className="break-all">{user.email}</span>}
            {user.deactivatedAt && <Badge tone="gray">Deactivated {formatWhen(user.deactivatedAt)}</Badge>}
            {isSelf && <span className="text-sm opacity-80">(you)</span>}
          </p>
        </PageHeading>
      </div>
      {done && doneMessages[done] && !actionData && <Notice>{doneMessages[done]}</Notice>}
      {actionData?.form === "problem" && <Notice tone="problem">{actionData.error}</Notice>}

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <section aria-labelledby="account-heading" className={card}>
          <h2 id="account-heading" className="text-lg font-semibold">Account</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="opacity-80">Joined</dt>
            <dd>{formatWhen(user.joinedAt)}</dd>
            <dt className="opacity-80">Last sign-in</dt>
            <dd>{user.lastSignInAt ? formatWhen(user.lastSignInAt, { dateStyle: "medium", timeStyle: "short" }) + " UTC" : "Never"}</dd>
            <dt className="opacity-80">Time zone</dt>
            <dd>{user.timeZone ?? "Not set"}</dd>
          </dl>
          <Form method="post" className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" key={`${user.firstName}|${user.lastName}`}>
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium">First name</label>
              <input id="firstName" name="firstName" maxLength={NAME_MAX} defaultValue={user.firstName ?? ""} className={`${inputClass} mt-1`} />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium">Last name</label>
              <input id="lastName" name="lastName" maxLength={NAME_MAX} defaultValue={user.lastName ?? ""} className={`${inputClass} mt-1`} />
            </div>
            <button type="submit" name="intent" value="name" disabled={busy} className={secondaryButton}>Save name</button>
          </Form>
          <FieldError id="name-error" message={actionData?.form === "name" ? actionData.error : undefined} />
          {!isSelf && (
            <Form method="post" className="mt-5 border-t border-[#E2E8E9] pt-4 dark:border-[#24363B]">
              {user.deactivatedAt ? (
                <button type="submit" name="intent" value="reactivate" disabled={busy} className={secondaryButton}>Reactivate account</button>
              ) : (
                <>
                  <p className="text-sm">Deactivating keeps their data but closes the Members area and this console to them (MSG-4).</p>
                  <button type="submit" name="intent" value="deactivate" disabled={busy} className={`${dangerButton} mt-2 border border-current`}>Deactivate account</button>
                </>
              )}
            </Form>
          )}
        </section>

        <section aria-labelledby="roles-heading" className={card}>
          <h2 id="roles-heading" className="text-lg font-semibold">Roles</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            <li>
              <span className="font-medium">Member</span>
              <span className="opacity-80"> · {user.tickets.some((t) => t.year === year && t.status !== "refunded") ? `holds a ${year} ticket` : `no ${year} ticket`}</span>
            </li>
            {user.sessions.length > 0 && (
              <li>
                <span className="font-medium">Host</span>
                <span className="opacity-80"> · {user.sessions.length} {user.sessions.length === 1 ? "session" : "sessions"} in {year}</span>
              </li>
            )}
          </ul>
          <div className="mt-4 border-t border-[#E2E8E9] pt-4 text-sm dark:border-[#24363B]">
            <p className="mb-2 font-medium">Roles <span className="font-normal opacity-80">· a person can hold several, and what each allows adds up</span></p>
            {canManageRoles ? (
              <RolePicker profileId={user.id} current={held} roles={roles} isSelf={isSelf} />
            ) : (
              <RoleBadges current={held} roles={roles} />
            )}
            <ul className="mt-2 grid gap-0.5 opacity-80">
              {user.permissions.map((p) => (
                <li key={p.permission}>
                  {roles.find((r) => r.key === p.permission)?.name ?? p.permission} since {formatWhen(p.grantedAt)}
                  {p.grantedBy ? `, given by ${p.grantedBy}` : ""}
                </li>
              ))}
            </ul>
            {canManageRoles && <Link to="/admin/team" className="mt-2 inline-block underline">What each role can do</Link>}
          </div>
        </section>

        <section aria-labelledby="tickets-heading" className={card}>
          <h2 id="tickets-heading" className="text-lg font-semibold">Tickets</h2>
          {user.tickets.length === 0 ? (
            <p className="mt-2 text-sm">
              No tickets.{canComp && <> <Link to="/admin/settings#tickets" className="underline">Issue a comp ticket</Link></>}
            </p>
          ) : (
            <ul className="mt-2 grid gap-1 text-sm">
              {user.tickets.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.year}</span>
                  <Badge tone={ticketBadge[t.status].tone}>{ticketBadge[t.status].label}</Badge>
                  <span className="opacity-80">
                    {t.tier ?? "No tier"} · {formatDollars(t.amountPaidCents)} · {formatWhen(t.createdAt)}
                  </span>
                  {canComp && t.status === "comp" && t.year === year && (
                    <Form method="post">
                      <input type="hidden" name="ticketId" value={t.id} />
                      <button type="submit" name="intent" value="remove-comp" disabled={busy} className={dangerButton}>Remove comp</button>
                    </Form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="sessions-heading" className={card}>
          <h2 id="sessions-heading" className="text-lg font-semibold">Sessions in {year}</h2>
          <p className="mt-2 text-sm">RSVPed to {user.rsvps} {user.rsvps === 1 ? "session" : "sessions"}.</p>
          {user.sessions.length > 0 && (
            <ul className="mt-2 grid gap-1 text-sm">
              {user.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/sessions/${s.id}`} className="underline">{s.title}</Link>
                  <Badge tone={s.published ? "green" : "amber"}>{s.published ? "On the calendar" : "Draft"}</Badge>
                  {s.role === "co-host" && <span className="opacity-80">co-host</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="answers-heading" className={`${card} mt-4 max-w-5xl`}>
        <h2 id="answers-heading" className="text-lg font-semibold">Registration answers for {year}</h2>
        {answers.length === 0 ? (
          <p className="mt-2 text-sm">They haven't answered the registration questions.</p>
        ) : (
          <dl className="mt-3 grid gap-3 text-sm">
            {answers.map((a) => (
              <div key={a.question}>
                <dt className="font-medium">{questionLabel.get(a.question) ?? a.question}</dt>
                <dd className="whitespace-pre-line opacity-90">
                  {agreementKeys.has(a.question) ? `Yes, ${formatWhen(a.answeredAt)}` : a.answer}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-labelledby="notes-heading" className={`${card} mt-4 max-w-5xl`}>
        <h2 id="notes-heading" className="text-lg font-semibold">Admin notes</h2>
        <p className="mt-1 text-sm opacity-80">Only admins see these. You can delete notes you wrote.</p>
        <Form method="post" className="mt-3 grid gap-2" key={user.notes.length}>
          <label htmlFor="body" className="sr-only">New note</label>
          <textarea
            id="body"
            name="body"
            rows={3}
            maxLength={NOTE_MAX}
            defaultValue={actionData?.form === "note" ? actionData.body : ""}
            className={inputClass}
            {...(actionData?.form === "note" ? { "aria-invalid": true, "aria-describedby": "body-error" } : {})}
          />
          <FieldError id="body-error" message={actionData?.form === "note" ? actionData.error : undefined} />
          <div>
            <button type="submit" name="intent" value="add-note" disabled={busy} className={secondaryButton}>Add note</button>
          </div>
        </Form>
        {user.notes.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {user.notes.map((note) => (
              <li key={note.id} className="rounded border border-[#E2E8E9] p-3 text-sm dark:border-[#24363B]">
                <p className="whitespace-pre-line">{note.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 opacity-80">
                  <span>{note.author ?? "A former admin"} · {formatWhen(note.createdAt, { dateStyle: "medium", timeStyle: "short" })} UTC</span>
                  {note.authorId === viewerId && (
                    <Form method="post">
                      <input type="hidden" name="noteId" value={note.id} />
                      <button type="submit" name="intent" value="delete-note" disabled={busy} className={dangerButton}>Delete</button>
                    </Form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
