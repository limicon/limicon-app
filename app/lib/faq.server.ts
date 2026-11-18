/**
 * The FAQ (PUB-1): published entries for the public page, and the console's editing. Callers of
 * the editing functions are behind `requireAdmin`.
 */
import type { Db } from "~/lib/db.server";

export type FaqEntry = { id: number; question: string; answer: string };
export type AdminFaqEntry = FaqEntry & { published: boolean; updatedAt: Date; updatedBy: string | null };
export type FaqValues = { question: string; answer: string; published: boolean };

/** Published entries, in the order admins set. */
export async function listPublishedFaq(sql: Db): Promise<FaqEntry[]> {
  const rows = await sql<(Omit<FaqEntry, "id"> & { id: string })[]>`
    select id, question, answer from public.faq_entries where published order by sort_order, id
  `;
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/** Every entry, drafts included, for the console. */
export async function listAllFaq(sql: Db): Promise<AdminFaqEntry[]> {
  const rows = await sql<(Omit<AdminFaqEntry, "id"> & { id: string })[]>`
    select f.id, f.question, f.answer, f.published, f.updated_at as "updatedAt",
           coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email) as "updatedBy"
    from public.faq_entries f
    left join public.profiles p on p.id = f.updated_by
    left join auth.users u on u.id = p.id
    order by f.sort_order, f.id
  `;
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/** Adds an entry at the end of the list. */
export async function addFaq(sql: Db, v: FaqValues, by: string) {
  await sql`
    insert into public.faq_entries (question, answer, published, sort_order, updated_by)
    values (${v.question}, ${v.answer}, ${v.published},
            (select coalesce(max(sort_order), -1) + 1 from public.faq_entries), ${by})
  `;
}

export async function updateFaq(sql: Db, id: number, v: FaqValues, by: string) {
  await sql`
    update public.faq_entries set question = ${v.question}, answer = ${v.answer}, published = ${v.published},
      updated_by = ${by}, updated_at = now()
    where id = ${id}
  `;
}

export async function deleteFaq(sql: Db, id: number) {
  await sql`delete from public.faq_entries where id = ${id}`;
}

/** Swaps an entry with its neighbour above or below, renumbering so the order stays clean. */
export async function moveFaq(sql: Db, id: number, by: -1 | 1) {
  await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`select id from public.faq_entries order by sort_order, id for update`;
    const ids = rows.map((row) => Number(row.id));
    const from = ids.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    for (const [i, entryId] of ids.entries()) {
      await tx`update public.faq_entries set sort_order = ${i} where id = ${entryId}`;
    }
  });
}
