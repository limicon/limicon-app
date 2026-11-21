import { Link } from "react-router";

import { card, formatWhen, Notice, PageHeading, primaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { listSiteDocuments } from "~/lib/site-documents.server";
import { requirePrivilege } from "~/middleware/services.server";
import type { Route } from "./+types/policies";

/** Needs the `website` privilege (app/lib/admin-roles.ts). */
export const middleware: Route.MiddlewareFunction[] = [requirePrivilege("website")];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Policies · Admin · Limicon" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const documents = await listSiteDocuments(context.get(servicesContext).db());
  return {
    documents: documents.map(({ slug, title, body, updatedAt, updatedBy }) => ({ slug, title, edited: body !== null, updatedAt, updatedBy })),
    saved: new URL(request.url).searchParams.get("saved"),
  };
}

/** The policies registrants agree to, each with an Edit button. */
export default function AdminPolicies({ loaderData }: Route.ComponentProps) {
  const { documents, saved } = loaderData;
  const savedTitle = documents.find((d) => d.slug === saved)?.title;
  return (
    <>
      <PageHeading title="Policies">
        <p>
          The policies on the public site. Registrants agree to both, so a change applies to everyone who registers
          after it. Edit them here like a document: no code needed.
        </p>
      </PageHeading>
      {savedTitle && <Notice>{savedTitle} saved. The public page shows it now.</Notice>}
      <ul className="grid gap-3">
        {documents.map((d) => (
          <li key={d.slug} className={`${card} flex flex-wrap items-center gap-4`}>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">
                <a href={`/${d.slug}`} className="hover:underline">{d.title}</a>
              </h2>
              <p className="text-sm opacity-80">
                {d.edited
                  ? `Last edited ${formatWhen(d.updatedAt)}${d.updatedBy ? ` by ${d.updatedBy}` : ""}`
                  : "Not edited here yet: the page shows the original text."}
              </p>
            </div>
            <Link to={`/admin/policies/${d.slug}`} className={primaryButton}>Edit</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
