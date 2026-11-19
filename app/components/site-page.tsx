import { Link } from "react-router";

import { PageEditor } from "~/components/page-editor";
import { SiteSections } from "~/components/site-sections";
import type { EventDetails } from "~/lib/event.server";
import { pagePath, type PageErrors } from "~/lib/site-pages";
import type { SitePage as Page } from "~/lib/site-pages.server";

/**
 * A public page as visitors see it, or, for an admin with `?edit=1`, as the page editor. Admins
 * also get an "Edit this page" button and a note on drafts.
 */
export function SitePage({
  page,
  event,
  isAdmin,
  editing,
  saved,
  signedIn,
  errors,
}: {
  page: Page;
  event: EventDetails | null;
  isAdmin: boolean;
  editing: boolean;
  saved: boolean;
  signedIn: boolean;
  errors?: PageErrors;
}) {
  const path = pagePath(page.slug);
  if (editing) {
    return (
      <PageEditor
        key={page.updatedAt.toString()}
        meta={page}
        sections={page.sections}
        isHome={page.slug === "home"}
        event={event}
        errors={errors}
        cancelHref={path}
      />
    );
  }
  return (
    <>
      {isAdmin && (saved || !page.published) && (
        <div role="status" className="border-b border-[#C9A227] bg-[#FFF8E1] px-4 py-2 text-sm text-[#3A3214]">
          <div className="mx-auto max-w-5xl">
            {saved ? "Saved. This is what visitors see now." : "Draft: only admins can see this page. Publish it in its page settings."}
          </div>
        </div>
      )}
      <main>
        {page.sections.length ? (
          <SiteSections sections={page.sections} event={event} signedIn={signedIn} />
        ) : (
          <p className="mx-auto max-w-5xl px-4 py-16 opacity-80">{isAdmin ? "This page has no sections yet." : ""}</p>
        )}
      </main>
      {isAdmin && (
        <Link
          to={`${path}?edit=1`}
          className="fixed right-4 bottom-4 z-30 rounded-full bg-[#2A1E14] px-5 py-3 font-semibold text-[#F3E6D7] shadow-lg hover:bg-[#3D2C1E]"
        >
          ✎ Edit this page
        </Link>
      )}
    </>
  );
}
