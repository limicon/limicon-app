import type { Db } from "~/lib/db.server";
import {
  blankRegistration,
  DEFAULT_FIELDS,
  isAnswered,
  type RegistrationField,
  type RegistrationInput,
  type RegistrationValues,
} from "~/lib/registration-form";

/** Whether admins have opened registration for an edition (REG-10). */
export async function isRegistrationOpen(sql: Db, editionId: number): Promise<boolean> {
  const [row] = await sql<{ open: boolean }[]>`
    select registration_open as open from public.editions where id = ${editionId}
  `;
  return row?.open ?? false;
}

/** Whether the signed-in member already holds a ticket for an edition. */
export async function hasTicket(sql: Db, userId: string, editionId: number): Promise<boolean> {
  const [row] = await sql<{ found: boolean }[]>`
    select exists (
      select 1 from public.tickets
      where profile_id = ${userId} and edition_id = ${editionId} and status in ('paid', 'comp')
    ) as found
  `;
  return row?.found ?? false;
}

/** The registration form's fields for an edition, in order; the default form if it has none yet. */
export async function getRegistrationFields(sql: Db, editionId: number): Promise<RegistrationField[]> {
  const rows = await sql<RegistrationField[]>`
    select key, kind, label, help, required, link_url as "linkUrl", link_text as "linkText"
    from public.registration_fields where edition_id = ${editionId}
    order by sort_order, id
  `;
  return rows.length ? [...rows] : DEFAULT_FIELDS;
}

/**
 * Replaces an edition's fields with `fields`, in order. A field keeps its key, so answers already
 * given to it stay with it; answers to a removed field stay stored but no longer show.
 */
export async function saveRegistrationFields(sql: Db, editionId: number, fields: RegistrationField[]) {
  await sql.begin(async (tx) => {
    await tx`delete from public.registration_fields where edition_id = ${editionId}`;
    for (const [i, f] of fields.entries()) {
      await tx`
        insert into public.registration_fields (edition_id, key, kind, label, help, required, link_url, link_text, sort_order)
        values (${editionId}, ${f.key}, ${f.kind}, ${f.label}, ${f.help}, ${f.required}, ${f.linkUrl}, ${f.linkText}, ${i})
      `;
    }
  });
}

/**
 * What a person has already entered for an edition, ready to fill the form again. Callers pass
 * the signed-in member's id, never one from the request.
 */
export async function getRegistration(
  sql: Db,
  userId: string,
  editionId: number,
  fields: RegistrationField[],
): Promise<{ input: RegistrationInput; submitted: boolean }> {
  const input = blankRegistration(fields);
  const [profile] = await sql<{ firstName: string | null; lastName: string | null }[]>`
    select first_name as "firstName", last_name as "lastName" from public.profiles where id = ${userId}
  `;
  input.firstName = profile?.firstName ?? "";
  input.lastName = profile?.lastName ?? "";

  const rows = await sql<{ question: string; answer: string }[]>`
    select question, answer from public.registration_answers
    where profile_id = ${userId} and edition_id = ${editionId}
  `;
  const byKey = new Map(rows.map((row) => [row.question, row.answer]));
  for (const f of fields) {
    if (f.kind === "checkbox") input.answers[f.key] = byKey.has(f.key);
    else if (isAnswered(f.kind)) input.answers[f.key] = byKey.get(f.key) ?? "";
  }
  // Answers are only stored once the whole form has passed its checks, so any stored answer means
  // the form was submitted; a required checkbox added since then asks again.
  const required = fields.filter((f) => f.kind === "checkbox" && f.required);
  const submitted = rows.length > 0 && required.every((f) => byKey.has(f.key));
  return { input, submitted };
}

/**
 * Saves checked answers for the signed-in member: names on the profile, the rest as answers.
 * An answer keeps the time it was first given, so a ticked box records when the person agreed.
 * Answers to this form's fields that were cleared are removed; answers to fields admins have
 * since removed from the form stay.
 */
export async function saveRegistration(
  sql: Db,
  userId: string,
  editionId: number,
  values: RegistrationValues,
  fields: RegistrationField[],
) {
  const rows = [
    ...Object.entries(values.answers).map(([question, answer]) => ({ question, answer })),
    ...values.checked.map((question) => ({ question, answer: "yes" })),
  ];
  const kept = rows.map((row) => row.question);
  const onForm = fields.filter((f) => isAnswered(f.kind)).map((f) => f.key);

  await sql.begin(async (tx) => {
    await tx`
      update public.profiles
      set first_name = ${values.firstName}, last_name = ${values.lastName}, updated_at = now()
      where id = ${userId}
    `;
    await tx`
      delete from public.registration_answers
      where profile_id = ${userId} and edition_id = ${editionId}
        and question = any(${onForm}) and question <> all(${kept})
    `;
    for (const row of rows) {
      await tx`
        insert into public.registration_answers (profile_id, edition_id, question, answer)
        values (${userId}, ${editionId}, ${row.question}, ${row.answer})
        on conflict (profile_id, edition_id, question) do update
        set answer = excluded.answer,
            updated_at = case when registration_answers.answer = excluded.answer
                              then registration_answers.updated_at else now() end
      `;
    }
  });
}
