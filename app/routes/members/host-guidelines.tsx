import { Link } from "react-router";

import { HostGuidelines } from "~/content/host-guidelines";
import { servicesContext } from "~/context";
import type { Route } from "./+types/host-guidelines";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Host guidelines · Members · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { edition } = await context.get(servicesContext).membership();
  return { year: edition?.year ?? null };
}

export default function HostGuidelinesPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <p>
        <Link to="/members/host" className="underline">
          Back to Host a session
        </Link>
      </p>
      <h1 className="mt-4 mb-6 text-3xl font-semibold">Host guidelines</h1>
      <HostGuidelines year={loaderData.year} />
    </>
  );
}
