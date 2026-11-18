import { FaqAnswer } from "~/components/faq-answer";
import { servicesContext } from "~/context";
import { listPublishedFaq } from "~/lib/faq.server";
import type { Route } from "./+types/faq";

export function meta({}: Route.MetaArgs) {
  return [{ title: "FAQ · Limicon" }, { name: "description", content: "Answers to common questions about Limicon." }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return { entries: await listPublishedFaq(context.get(servicesContext).db()) };
}

/** The public FAQ (PUB-1). The Organizing Team writes it in the admin console. */
export default function Faq({ loaderData }: Route.ComponentProps) {
  const { entries } = loaderData;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Frequently asked questions</h1>
      {entries.length === 0 ? (
        <p className="mt-4">Questions and answers are on their way.</p>
      ) : (
        <div className="mt-8 divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {entries.map((entry) => (
            <details key={entry.id} id={`q${entry.id}`} className="group py-4">
              <summary className="cursor-pointer text-lg font-medium">{entry.question}</summary>
              <div className="mt-3">
                <FaqAnswer text={entry.answer} />
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="mt-8">
        Still have a question? Email <a href="mailto:team@limicon.org" className="underline">team@limicon.org</a>.
      </p>
    </main>
  );
}
