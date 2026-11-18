import type { Db } from "~/lib/db.server";
import {
  AGREEMENTS,
  blankRegistration,
  TEXT_QUESTIONS,
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

/**
 * What a person has already entered for an edition, ready to fill the form again. Callers pass
 * the signed-in member's id, never one from the request.
 */
export async function getRegistration(
  sql: Db,
  userId: string,
  editionId: number,
): Promise<{ input: RegistrationInput; submitted: boolean }> {
  const input = blankRegistration();
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
  for (const q of TEXT_QUESTIONS) input[q.key] = byKey.get(q.key) ?? "";
  for (const a of AGREEMENTS) input[a.key] = byKey.has(a.key);
  // Agreements are only stored once the whole form has passed its checks.
  return { input, submitted: AGREEMENTS.every((a) => byKey.has(a.key)) };
}

/**
 * Saves checked answers for the signed-in member: names on the profile, the rest as answers.
 * An answer keeps the time it was first given, so an agreement records when the person agreed.
 * Optional questions left blank are removed.
 */
export async function saveRegistration(sql: Db, userId: string, editionId: number, values: RegistrationValues) {
  const rows = [
    ...Object.entries(values.answers)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([question, answer]) => ({ question, answer })),
    ...values.agreements.map((question) => ({ question, answer: "yes" })),
  ];
  const keys = rows.map((row) => row.question);

  await sql.begin(async (tx) => {
    await tx`
      update public.profiles
      set first_name = ${values.firstName}, last_name = ${values.lastName}, updated_at = now()
      where id = ${userId}
    `;
    await tx`
      delete from public.registration_answers
      where profile_id = ${userId} and edition_id = ${editionId} and question <> all(${keys})
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
