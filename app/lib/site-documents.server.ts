/**
 * Site documents admins edit without code (PUB-2): the Privacy Policy and Code of Conduct. A
 * document nobody has edited yet has no body, and its page shows the text that ships with the app.
 */
import type { Db } from "~/lib/db.server";
import { cleanRichText, type RichDoc } from "~/lib/rich-text";

export const POLICY_SLUGS = ["privacy", "conduct"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

export type SiteDocument = {
  slug: PolicySlug;
  title: string;
  body: RichDoc | null;
  updatedAt: Date;
  updatedBy: string | null;
};

export async function listSiteDocuments(sql: Db): Promise<SiteDocument[]> {
  const rows = await sql<(Omit<SiteDocument, "body"> & { body: unknown })[]>`
    select d.slug, d.title, d.body, d.updated_at as "updatedAt",
           coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email) as "updatedBy"
    from public.site_documents d
    left join public.profiles p on p.id = d.updated_by
    left join auth.users u on u.id = p.id
    where d.slug = any(${[...POLICY_SLUGS]})
    order by array_position(${[...POLICY_SLUGS]}::text[], d.slug)
  `;
  return rows.map((row) => ({ ...row, body: cleanRichText(row.body) }));
}

export async function getSiteDocument(sql: Db, slug: PolicySlug): Promise<SiteDocument | null> {
  return (await listSiteDocuments(sql)).find((d) => d.slug === slug) ?? null;
}

export async function saveSiteDocument(sql: Db, slug: PolicySlug, body: RichDoc, by: string) {
  await sql`
    update public.site_documents set body = ${sql.json(body as never)}, updated_by = ${by}, updated_at = now()
    where slug = ${slug}
  `;
}
