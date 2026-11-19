import { data, Form, Link, redirect, useNavigation } from "react-router";

import { Badge, card, dangerButton, formatWhen, Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { pagePath } from "~/lib/site-pages";
import { deletePage, listPages, movePage, setPageFlags } from "~/lib/site-pages.server";
import type { Route } from "./+types/website";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Website · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const pages = await listPages(context.get(servicesContext).db());
  const query = new URL(request.url).searchParams;
  return {
    pages: pages.map(({ slug, title, menuLabel, inMenu, published, sections, updatedAt, updatedBy }) => ({
      slug,
      title,
      menuLabel,
      inMenu,
      published,
      sectionCount: sections.length,
      updatedAt,
      updatedBy,
    })),
    saved: query.get("saved"),
    done: query.get("done"),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  const db = context.get(servicesContext).db();
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  switch (form.get("intent")) {
    case "up":
    case "down":
      await movePage(db, slug, form.get("intent") === "up" ? -1 : 1);
      throw redirect("/admin/website");
    case "publish":
    case "unpublish":
      await setPageFlags(db, slug, { published: form.get("intent") === "publish" });
      throw redirect(`/admin/website?done=${form.get("intent")}`);
    case "show":
    case "hide":
      await setPageFlags(db, slug, { inMenu: form.get("intent") === "show" });
      throw redirect("/admin/website");
    case "delete":
      await deletePage(db, slug);
      throw redirect("/admin/website?done=deleted");
  }
  throw data("Unknown action", { status: 400 });
}

const doneMessages: Record<string, string> = {
  publish: "Published: anyone can see the page now.",
  unpublish: "Unpublished: only admins can see the page now.",
  deleted: "Page deleted.",
};

/**
 * The public website's pages: open one to edit it on the site itself or here, add pages, order
 * the menu, publish or hide them.
 */
export default function AdminWebsite({ loaderData }: Route.ComponentProps) {
  const { pages, saved, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const others = pages.filter((p) => p.slug !== "home");
  const savedPage = pages.find((p) => p.slug === saved);

  return (
    <>
      <PageHeading title="Website">
        <p>
          The public website's pages. Edit a page on the website itself, where you see it as visitors do, or here in the
          console. Pages are built from sections: text, images, image beside text, columns and buttons. Pages in the menu
          appear in this order, before FAQ and Members.
        </p>
      </PageHeading>
      {savedPage && <Notice>“{savedPage.title}” saved.</Notice>}
      {done && doneMessages[done] && <Notice>{doneMessages[done]}</Notice>}

      <div className="mb-6 flex flex-wrap gap-3">
        <Link to="/admin/website/new" className={primaryButton}>+ Add a page</Link>
        <a href="/?edit=1" className={secondaryButton}>Edit the website, starting at the home page</a>
      </div>

      <ul className="grid max-w-4xl gap-3">
        {pages.map((p) => {
          const index = others.findIndex((o) => o.slug === p.slug);
          return (
            <li key={p.slug} className={`${card} grid gap-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-lg font-semibold">
                  {p.title} <span className="text-sm font-normal opacity-70">{pagePath(p.slug)}</span>
                </h2>
                {p.slug === "home" ? <Badge tone="blue">Front page</Badge> : (
                  <>
                    <Badge tone={p.published ? "green" : "amber"}>{p.published ? "Published" : "Draft"}</Badge>
                    <Badge tone={p.inMenu ? "blue" : "gray"}>{p.inMenu ? `In menu as “${p.menuLabel || p.title}”` : "Not in menu"}</Badge>
                  </>
                )}
              </div>
              <p className="text-sm opacity-80">
                {p.sectionCount} {p.sectionCount === 1 ? "section" : "sections"} · updated {formatWhen(p.updatedAt)}
                {p.updatedBy ? ` by ${p.updatedBy}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a href={`${pagePath(p.slug)}?edit=1`} className={primaryButton}>Edit on the website</a>
                <Link to={`/admin/website/${p.slug}`} className={secondaryButton}>Edit here</Link>
                <a href={pagePath(p.slug)} className="px-2 text-sm underline">View</a>
                {p.slug !== "home" && (
                  <Form method="post" className="ml-auto flex flex-wrap gap-1">
                    <input type="hidden" name="slug" value={p.slug} />
                    <button type="submit" name="intent" value="up" disabled={busy || index === 0} aria-label={`Move ${p.title} up the menu`} className={`${secondaryButton} disabled:opacity-40`}>↑</button>
                    <button type="submit" name="intent" value="down" disabled={busy || index === others.length - 1} aria-label={`Move ${p.title} down the menu`} className={`${secondaryButton} disabled:opacity-40`}>↓</button>
                    <button type="submit" name="intent" value={p.inMenu ? "hide" : "show"} disabled={busy} className={secondaryButton}>
                      {p.inMenu ? "Take out of menu" : "Put in menu"}
                    </button>
                    <button type="submit" name="intent" value={p.published ? "unpublish" : "publish"} disabled={busy} className={secondaryButton}>
                      {p.published ? "Unpublish" : "Publish"}
                    </button>
                    <DeleteButton title={p.title} busy={busy} />
                  </Form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Delete, after a browser confirmation, since a deleted page can't be brought back. */
function DeleteButton({ title, busy }: { title: string; busy: boolean }) {
  return (
    <button
      type="submit"
      name="intent"
      value="delete"
      disabled={busy}
      onClick={(event) => {
        if (!window.confirm(`Delete “${title}” for good? This can't be undone.`)) event.preventDefault();
      }}
      className={dangerButton}
    >
      Delete
    </button>
  );
}
