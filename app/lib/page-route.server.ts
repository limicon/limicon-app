/**
 * What the public site's pages share: loading a page for a visitor or for an admin editing it,
 * and saving it from the page editor. Used by the front page, every other page and the console.
 */
import { data, redirect } from "react-router";

import type { RequestServices } from "~/context";
import { getEventDetails } from "~/lib/event.server";
import { pagePath, readPageForm } from "~/lib/site-pages";
import { getPage, savePage } from "~/lib/site-pages.server";

/**
 * A page for the viewer: published pages for everyone, drafts for admins only. `?edit=1` opens
 * the editor for admins. Throws not-found otherwise.
 */
export async function loadSitePage(services: RequestServices, request: Request, slug: string) {
  const db = services.db();
  const [page, membership] = await Promise.all([getPage(db, slug), services.membership()]);
  const isAdmin = membership.isAdmin;
  if (!page || (!page.published && !isAdmin)) throw data("Page not found", { status: 404 });
  const query = new URL(request.url).searchParams;
  const needsEvent = query.has("edit") || page.sections.some((s) => s.type === "event");
  const event = needsEvent && membership.edition ? await getEventDetails(db, membership.edition.id) : null;
  return {
    page,
    event,
    isAdmin,
    editing: isAdmin && query.get("edit") === "1",
    saved: query.has("saved"),
    signedIn: services.viewer !== null,
  };
}

/**
 * Saves a page posted from the page editor, for admins only. `slug` is the page being edited, or
 * null for a new one. On success, goes to `after(slug)`; otherwise returns the problems.
 */
export async function savePageAction(
  request: Request,
  services: RequestServices,
  slug: string | null,
  after: (savedSlug: string) => string = (s) => `${pagePath(s)}?saved=1`,
) {
  const { isAdmin } = await services.membership();
  if (!isAdmin) throw data("Not found", { status: 404 });
  const result = readPageForm(await request.formData(), slug === "home");
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  const outcome = await savePage(services.db(), slug, result.meta, result.sections, services.viewer!.userId);
  if (outcome === "taken") return data({ errors: { slug: "Another page already uses that address. Choose another." } }, { status: 409 });
  throw redirect(after(result.meta.slug));
}
