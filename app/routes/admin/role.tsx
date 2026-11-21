import { data, Form, Link, redirect, useNavigation } from "react-router";

import { dangerButton, FieldError, inputClass, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { checkRoleForm, ADMIN_ROLE, PRIVILEGES, ROLE_NAME_MAX } from "~/lib/admin-roles";
import { createRole, deleteRole, getRole, updateRole } from "~/lib/admin-roles.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/role";

/** Admins only (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("admin")];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.name || "New role"} · Team · Admin · Limicon` }];
}

/** A role to edit, or `new` for a blank one. Admin is built in and can't be edited. */
export async function loader({ context, params }: Route.LoaderArgs) {
  if (params.key === "new") return { isNew: true, name: "", privileges: [] as string[], holders: 0 };
  if (params.key === ADMIN_ROLE) throw redirect("/admin/team");
  const role = await getRole(context.get(servicesContext).db(), params.key);
  if (!role) throw data("Role not found", { status: 404 });
  return { isNew: false, name: role.name, privileges: role.privileges as string[], holders: role.holders };
}

type ActionData = { input: { name: string; privileges: string[] }; errors: { name?: string; privileges?: string; form?: string } };

export async function action({ context, params, request }: Route.ActionArgs) {
  const db = context.get(servicesContext).db();
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    if (!(await deleteRole(db, params.key))) {
      return data<ActionData>({ input: { name: "", privileges: [] }, errors: { form: "People hold or are invited to this role. Give them another role first." } }, { status: 409 });
    }
    throw redirect("/admin/team?done=deleted");
  }
  const result = checkRoleForm(form);
  if (!result.ok) return data<ActionData>({ input: result.input, errors: result.errors }, { status: 400 });
  const outcome = params.key === "new" ? await createRole(db, result.name, result.privileges) : await updateRole(db, params.key, result.name, result.privileges);
  if (outcome === "duplicate") {
    return data<ActionData>({ input: { name: result.name, privileges: result.privileges }, errors: { name: "Another role already has this name." } }, { status: 400 });
  }
  if (outcome === "built-in") throw redirect("/admin/team");
  throw redirect(`/admin/team?done=${params.key === "new" ? "created" : "saved"}`);
}

/** A role's name and a checkbox for each thing it may do. */
export default function AdminRole({ loaderData, actionData }: Route.ComponentProps) {
  const { isNew, holders } = loaderData;
  const input = actionData?.input.name || actionData?.input.privileges.length ? actionData.input : loaderData;
  const errors = actionData?.errors ?? {};
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <p>
        <Link to="/admin/team" className="underline">Back to Team</Link>
      </p>
      <div className="mt-4">
        <PageHeading title={isNew ? "Add a role" : `Edit “${loaderData.name}”`}>
          <p>
            Name the role and tick what it may do. A person can hold several roles, and what they allow adds up. Admins can do everything already.
            {!isNew && ` ${holders} ${holders === 1 ? "person holds" : "people hold"} this role; changes apply to them straight away.`}
          </p>
        </PageHeading>
      </div>
      {errors.form && <Notice tone="problem">{errors.form}</Notice>}

      <Form method="post" className="grid gap-6" key={JSON.stringify(input)}>
        <div>
          <label htmlFor="name" className="block font-medium">Name of the role</label>
          <input
            id="name"
            name="name"
            maxLength={ROLE_NAME_MAX}
            defaultValue={input.name}
            placeholder="Such as Registration team or Site editor"
            className={`${inputClass} mt-1`}
            {...(errors.name ? { "aria-invalid": true, "aria-describedby": "name-error" } : {})}
          />
          <FieldError id="name-error" message={errors.name} />
        </div>
        <fieldset {...(errors.privileges ? { "aria-describedby": "privileges-error" } : {})}>
          <legend className="font-medium">What this role can do</legend>
          <FieldError id="privileges-error" message={errors.privileges} />
          <div className="mt-2 grid gap-3">
            {PRIVILEGES.map((p) => (
              <label key={p.key} className="flex gap-3 rounded border border-[#C9DADC] bg-white p-3 dark:border-[#24363B] dark:bg-[#12201F]">
                <input type="checkbox" name="privilege" value={p.key} defaultChecked={input.privileges.includes(p.key)} className="mt-1 size-4 shrink-0" />
                <span>
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block text-sm opacity-80">{p.help}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm opacity-80">Every role can see the Overview's counts and open the Members area.</p>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>{isNew ? "Add role" : "Save role"}</button>
          <Link to="/admin/team" className={secondaryButton}>Cancel</Link>
          {!isNew && (
            <button
              type="submit"
              name="intent"
              value="delete"
              disabled={busy}
              onClick={(event) => {
                if (!window.confirm(`Delete the role “${loaderData.name}”?`)) event.preventDefault();
              }}
              className={`${dangerButton} ml-auto`}
            >
              Delete role
            </button>
          )}
        </div>
      </Form>
    </>
  );
}
