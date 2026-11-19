import { RichText } from "~/components/rich-text";
import { PrivacyPolicy } from "~/content/policies";
import { servicesContext } from "~/context";
import { getSiteDocument } from "~/lib/site-documents.server";
import type { Route } from "./+types/privacy";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy Policy · Limicon" },
    { name: "description", content: "How Limicon sessions, recordings and participant information are kept private." },
  ];
}

/** The policy as admins last edited it, or the text that ships with the app until they do. */
export async function loader({ context }: Route.LoaderArgs) {
  const doc = await getSiteDocument(context.get(servicesContext).db(), "privacy");
  return { body: doc?.body ?? null };
}

export default function Privacy({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold">Privacy Policy</h1>
      {loaderData.body ? <RichText doc={loaderData.body} className="max-w-[68ch]" /> : <PrivacyPolicy />}
    </main>
  );
}
