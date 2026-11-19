/**
 * The public website's pages in the database. Saving checks nothing about who is saving: callers
 * check the viewer is an admin first.
 */
import type { Db } from "~/lib/db.server";
import { cleanStoredSections, type PageMeta, type Section } from "~/lib/site-pages";

export type SitePage = PageMeta & { id: number; sections: Section[]; updatedAt: Date; updatedBy: string | null; sortOrder: number };
export type MenuPage = { slug: string; label: string };

type Row = Omit<SitePage, "id" | "sections"> & { id: string; sections: unknown };

const columns = (sql: Db) => sql`
  p.id, p.slug, p.title, coalesce(p.menu_label, '') as "menuLabel", p.in_menu as "inMenu", p.published,
  p.sort_order as "sortOrder", p.sections, p.updated_at as "updatedAt",
  coalesce(nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''), u.email) as "updatedBy"
`;

function toPage(row: Row): SitePage {
  return { ...row, id: Number(row.id), sections: cleanStoredSections(row.sections) };
}

export async function getPage(sql: Db, slug: string): Promise<SitePage | null> {
  const [row] = await sql<Row[]>`
    select ${columns(sql)}
    from public.site_pages p
    left join public.profiles pr on pr.id = p.updated_by left join auth.users u on u.id = pr.id
    where p.slug = ${slug}
  `;
  return row ? toPage(row) : null;
}

/** Every page, home first, then in menu order. */
export async function listPages(sql: Db): Promise<SitePage[]> {
  const rows = await sql<Row[]>`
    select ${columns(sql)}
    from public.site_pages p
    left join public.profiles pr on pr.id = p.updated_by left join auth.users u on u.id = pr.id
    order by p.slug <> 'home', p.sort_order, p.id
  `;
  return rows.map(toPage);
}

/** The published pages admins put in the site menu, in order. */
export async function listMenuPages(sql: Db): Promise<MenuPage[]> {
  return sql<MenuPage[]>`
    select slug, coalesce(nullif(menu_label, ''), title) as label
    from public.site_pages
    where in_menu and published and slug <> 'home'
    order by sort_order, id
  `;
}

/**
 * Saves a page's settings and sections. `currentSlug` is the page being edited, or null for a
 * new page. Returns "taken" when another page already has the address.
 */
export async function savePage(
  sql: Db,
  currentSlug: string | null,
  meta: PageMeta,
  sections: Section[],
  by: string,
): Promise<"saved" | "taken"> {
  const clash = await sql`select 1 from public.site_pages where slug = ${meta.slug} and slug is distinct from ${currentSlug}`;
  if (clash.length) return "taken";
  const body = sql.json(sections as never);
  if (currentSlug === null) {
    await sql`
      insert into public.site_pages (slug, title, menu_label, in_menu, published, sort_order, sections, updated_by)
      values (${meta.slug}, ${meta.title}, ${meta.menuLabel || null}, ${meta.inMenu}, ${meta.published},
              (select coalesce(max(sort_order), 0) + 1 from public.site_pages), ${body}, ${by})
    `;
  } else {
    await sql`
      update public.site_pages set slug = ${meta.slug}, title = ${meta.title}, menu_label = ${meta.menuLabel || null},
        in_menu = ${meta.inMenu}, published = ${meta.published}, sections = ${body}, updated_by = ${by}, updated_at = now()
      where slug = ${currentSlug}
    `;
  }
  return "saved";
}

/** Shows or hides a page, or puts it in or out of the menu. The front page stays published. */
export async function setPageFlags(sql: Db, slug: string, flags: { published?: boolean; inMenu?: boolean }) {
  if (slug === "home") return;
  if (flags.published !== undefined) await sql`update public.site_pages set published = ${flags.published}, updated_at = now() where slug = ${slug}`;
  if (flags.inMenu !== undefined) await sql`update public.site_pages set in_menu = ${flags.inMenu}, updated_at = now() where slug = ${slug}`;
}

/** Moves a page up or down the menu order. */
export async function movePage(sql: Db, slug: string, by: -1 | 1) {
  await sql.begin(async (tx) => {
    const rows = await tx<{ slug: string }[]>`
      select slug from public.site_pages where slug <> 'home' order by sort_order, id for update
    `;
    const slugs = rows.map((r) => r.slug);
    const from = slugs.indexOf(slug);
    const to = from + by;
    if (from < 0 || to < 0 || to >= slugs.length) return;
    [slugs[from], slugs[to]] = [slugs[to]!, slugs[from]!];
    for (const [i, s] of slugs.entries()) await tx`update public.site_pages set sort_order = ${i + 1} where slug = ${s}`;
  });
}

export async function deletePage(sql: Db, slug: string) {
  if (slug === "home") return;
  await sql`delete from public.site_pages where slug = ${slug}`;
}
