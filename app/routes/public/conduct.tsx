import { RichText } from "~/components/rich-text";
import { CodeOfConduct } from "~/content/policies";
import { servicesContext } from "~/context";
import { getSiteDocument } from "~/lib/site-documents.server";
import type { Route } from "./+types/conduct";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Code of Conduct · Limicon" },
    { name: "description", content: "What Limicon expects of participants, and how to get help." },
  ];
}

/** The policy as admins last edited it, or the text that ships with the app until they do. */
export async function loader({ context }: Route.LoaderArgs) {
  const doc = await getSiteDocument(context.get(servicesContext).db(), "conduct");
  return { body: doc?.body ?? null };
}

export default function Conduct({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold">Code of Conduct</h1>
      {loaderData.body ? <RichText doc={loaderData.body} className="max-w-[68ch]" /> : <CodeOfConduct />}
    </main>
  );
}
