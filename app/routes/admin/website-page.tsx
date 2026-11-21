import { data, Link } from "react-router";

import { PageEditor } from "~/components/page-editor";
import { servicesContext } from "~/context";
import { getEventDetails } from "~/lib/event.server";
import { savePageAction } from "~/lib/page-route.server";
import { newSection, pagePath, type PageMeta } from "~/lib/site-pages";
import { getPage } from "~/lib/site-pages.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/website-page";

/** Needs the `website` privilege (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("website")];

/** The editor shows the page as the public site lays it out, edge to edge (admin layout). */
export const handle = { fullWidth: true };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.meta.title || "New page"} · Website · Admin · Limicon` }];
}

/** A page in the editor inside the console; `new` starts a blank page with one text section. */
export async function loader({ context, params }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const { edition } = await services.membership();
  const db = services.db();
  const event = edition ? await getEventDetails(db, edition.id) : null;
  if (params.slug === "new") {
    const meta: PageMeta = { title: "", slug: "", menuLabel: "", inMenu: true, published: false };
    return { isNew: true, meta, sections: [newSection("text", "intro")], updatedAt: "new", event };
  }
  const page = await getPage(db, params.slug);
  if (!page) throw data("Page not found", { status: 404 });
  return { isNew: false, meta: page as PageMeta, sections: page.sections, updatedAt: String(page.updatedAt), event };
}

export async function action({ context, request, params }: Route.ActionArgs) {
  return savePageAction(request, context.get(servicesContext), params.slug === "new" ? null : params.slug, (slug) => `/admin/website?saved=${slug}`);
}

export default function AdminWebsitePage({ loaderData, actionData }: Route.ComponentProps) {
  const { isNew, meta, sections, event } = loaderData;
  return (
    <div className="-mx-4 -my-8 md:-mx-10 md:-my-10">
      <p className="px-4 pt-4 md:px-10">
        <Link to="/admin/website" className="underline">Back to Website</Link>
        {!isNew && (
          <>
            {" · "}
            <a href={pagePath(meta.slug)} className="underline">View the page</a>
          </>
        )}
      </p>
      <div className="mt-2 bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <PageEditor
          key={loaderData.updatedAt}
          meta={meta}
          sections={sections}
          isHome={meta.slug === "home"}
          isNew={isNew}
          event={event}
          errors={actionData?.errors}
          cancelHref="/admin/website"
        />
      </div>
    </div>
  );
}
