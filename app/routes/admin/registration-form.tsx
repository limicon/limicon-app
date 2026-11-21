import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, inputClass, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import {
  checkFieldsForm,
  FIELD_HELP_MAX,
  FIELD_KINDS,
  FIELD_LABEL_MAX,
  FIELDS_MAX,
  isAnswered,
  keyFromLabel,
  type FieldErrors,
  type FieldInput,
  type FieldKind,
} from "~/lib/registration-form";
import { getRegistrationFields, saveRegistrationFields } from "~/lib/registration.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/registration-form";

/** Needs the `settings` privilege (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("settings")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Edit registration form · Admin · Limicon" }];
}

async function currentEdition(context: Route.LoaderArgs["context"]) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  if (!edition) throw data("No Limicon edition is set up yet.", { status: 409 });
  return { services, edition };
}

export async function loader({ context }: Route.LoaderArgs) {
  const { services, edition } = await currentEdition(context);
  const fields = await getRegistrationFields(services.db(), edition.id);
  return {
    year: edition.year,
    fields: fields.map(
      (f): FieldInput => ({
        key: f.key,
        kind: f.kind,
        label: f.label,
        help: f.help ?? "",
        required: f.required,
        linkUrl: f.linkUrl ?? "",
        linkText: f.linkText ?? "",
      }),
    ),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { services, edition } = await currentEdition(context);
  const result = checkFieldsForm(await request.formData(), (label, taken) => keyFromLabel(label, taken));
  if (!result.ok) return data({ input: result.input, errors: result.errors, message: result.message }, { status: 400 });
  await saveRegistrationFields(services.db(), edition.id, result.fields);
  throw redirect("/admin/settings?saved=form#tickets");
}

type Row = FieldInput & { id: number };

const kindHelp: Record<FieldKind, string> = {
  short: "A one-line answer, such as a city.",
  long: "A few sentences.",
  checkbox: "A box to tick, such as agreeing to a policy. Can link to a page.",
  headline: "Starts a new section of the form.",
  paragraph: "Text that explains something. Nobody answers it.",
};

/**
 * The registration form's fields, which admins reword, reorder, remove and add to. Saving
 * replaces the form; Cancel leaves it as it was. Answers already given stay with their field.
 */
export default function AdminRegistrationForm({ loaderData, actionData }: Route.ComponentProps) {
  const initial = actionData?.input ?? loaderData.fields;
  const errors: FieldErrors = actionData?.errors ?? {};
  const busy = useNavigation().state !== "idle";
  const [rows, setRows] = useState<Row[]>(() => initial.map((f, id) => ({ ...f, id })));
  const [nextId, setNextId] = useState(initial.length);
  const [newKind, setNewKind] = useState<FieldKind>("short");

  const update = (id: number, change: Partial<FieldInput>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const move = (index: number, by: -1 | 1) =>
    setRows((all) => {
      const next = [...all];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });

  return (
    <>
      <p>
        <Link to="/admin/settings#tickets" className="underline">Back to Settings</Link>
      </p>
      <div className="mt-4">
        <PageHeading title="Edit the registration form">
          <p>
            Registrants fill this in before choosing a ticket for Limicon {loaderData.year}. The first and last name and
            the email always come first. Rewording a question keeps the answers people already gave.
          </p>
        </PageHeading>
      </div>
      {actionData?.message && <p role="alert" className="mb-4 font-medium text-[#B3261E]">{actionData.message}</p>}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="mb-4 rounded border border-[#B3261E] p-3 font-medium text-[#B3261E] dark:text-[#F2B8B5]">
          Some fields need fixing. They're marked below.
        </p>
      )}

      <Form method="post" className="grid gap-3">
        <ol className="grid gap-3">
          {rows.map((row, index) => (
            <li key={row.id}>
              <FieldRow
                row={row}
                index={index}
                count={rows.length}
                errors={errors[index] ?? {}}
                onChange={(change) => update(row.id, change)}
                onMove={(by) => move(index, by)}
                onRemove={() => setRows((all) => all.filter((r) => r.id !== row.id))}
              />
            </li>
          ))}
        </ol>

        <div className={`${card} flex flex-wrap items-end gap-3 border-dashed`}>
          <div>
            <label htmlFor="newKind" className="block text-sm font-medium">New field</label>
            <select id="newKind" value={newKind} onChange={(event) => setNewKind(event.target.value as FieldKind)} className={`${inputClass} mt-1`}>
              {FIELD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={rows.length >= FIELDS_MAX}
            onClick={() => {
              setRows((all) => [...all, { id: nextId, key: "", kind: newKind, label: "", help: "", required: false, linkUrl: "", linkText: "" }]);
              setNextId((n) => n + 1);
            }}
            className={secondaryButton}
          >
            + Add new field
          </button>
          <p className="w-full text-sm opacity-80">{kindHelp[newKind]}</p>
        </div>

        <div className="mt-2 flex flex-wrap gap-3 border-t border-[#E2E8E9] pt-4 dark:border-[#24363B]">
          <button type="submit" disabled={busy} className={primaryButton}>Save form</button>
          <Link to="/admin/settings#tickets" className={secondaryButton}>Cancel</Link>
        </div>
      </Form>
    </>
  );
}

function FieldRow({
  row,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  row: Row;
  index: number;
  count: number;
  errors: Partial<Record<keyof FieldInput, string>>;
  onChange: (change: Partial<FieldInput>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const kind = row.kind as FieldKind;
  const answered = isAnswered(kind);
  const id = (name: string) => `${name}-${row.id}`;
  const err = (name: keyof FieldInput) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${id(name)}-error` } : {});
  const textLabel = kind === "headline" ? "Headline" : kind === "paragraph" ? "Text" : "Question";

  return (
    <div className={`${card} grid gap-3 ${kind === "headline" ? "border-l-4 border-l-[#15383F] dark:border-l-[#8CC7D3]" : ""}`}>
      <input type="hidden" name="key" value={row.key} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={id("kind")} className="block text-sm font-medium">Kind</label>
          <select id={id("kind")} name="kind" value={row.kind} onChange={(event) => onChange({ kind: event.target.value })} className={`${inputClass} mt-1`} {...err("kind")}>
            {FIELD_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        {answered && (
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" name="required" value={index} checked={row.required} onChange={(event) => onChange({ required: event.target.checked })} className="size-4" />
            Required
          </label>
        )}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move "${row.label || "field"}" up`} className={`${secondaryButton} disabled:opacity-40`}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move "${row.label || "field"}" down`} className={`${secondaryButton} disabled:opacity-40`}>↓</button>
          <button type="button" onClick={() => confirm(`Remove the field “${row.label || "Untitled"}”?`) && onRemove()} className={dangerButton}>Remove</button>
        </div>
      </div>
      <FieldError id={`${id("kind")}-error`} message={errors.kind ?? errors.key} />
      <div>
        <label htmlFor={id("label")} className="block text-sm font-medium">{textLabel}</label>
        {kind === "paragraph" ? (
          <textarea id={id("label")} name="label" rows={3} maxLength={FIELD_LABEL_MAX} value={row.label} onChange={(event) => onChange({ label: event.target.value })} className={`${inputClass} mt-1`} {...err("label")} />
        ) : (
          <input id={id("label")} name="label" maxLength={FIELD_LABEL_MAX} value={row.label} onChange={(event) => onChange({ label: event.target.value })} className={`${inputClass} mt-1`} {...err("label")} />
        )}
        <FieldError id={`${id("label")}-error`} message={errors.label} />
      </div>
      {answered ? (
        <div>
          <label htmlFor={id("help")} className="block text-sm font-medium">Hint under it <span className="font-normal">(optional)</span></label>
          <input id={id("help")} name="help" maxLength={FIELD_HELP_MAX} value={row.help} onChange={(event) => onChange({ help: event.target.value })} className={`${inputClass} mt-1`} {...err("help")} />
          <FieldError id={`${id("help")}-error`} message={errors.help} />
        </div>
      ) : (
        <input type="hidden" name="help" value="" />
      )}
      {kind === "checkbox" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id("linkUrl")} className="block text-sm font-medium">Link to <span className="font-normal">(optional)</span></label>
            <input id={id("linkUrl")} name="linkUrl" placeholder="/conduct or https://…" value={row.linkUrl} onChange={(event) => onChange({ linkUrl: event.target.value })} className={`${inputClass} mt-1`} {...err("linkUrl")} />
            <FieldError id={`${id("linkUrl")}-error`} message={errors.linkUrl} />
          </div>
          <div>
            <label htmlFor={id("linkText")} className="block text-sm font-medium">Link text</label>
            <input id={id("linkText")} name="linkText" placeholder="Read the Code of Conduct" maxLength={100} value={row.linkText} onChange={(event) => onChange({ linkText: event.target.value })} className={`${inputClass} mt-1`} />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="linkUrl" value="" />
          <input type="hidden" name="linkText" value="" />
        </>
      )}
    </div>
  );
}
