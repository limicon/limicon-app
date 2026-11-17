import { servicesContext } from "~/context";
import type { Route } from "./+types/tickets";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Tickets · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { editionYear } = await context.get(servicesContext).membership();
  return { editionYear };
}

/** Stands in for registration (Phase 1A) until ticket sales open. */
export default function Tickets({ loaderData }: Route.ComponentProps) {
  const name = loaderData.editionYear ? `Limicon ${loaderData.editionYear}` : "Limicon";
  return (
    <main className="mx-auto max-w-md p-4 pt-16">
      <h1 className="text-2xl font-semibold">Tickets for {name}</h1>
      <p className="mt-4">
        Ticket sales aren't open yet. Once they are, this is where you'll choose a ticket and
        register.
      </p>
    </main>
  );
}
