import { Link } from "react-router";

import { servicesContext } from "~/context";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Limicon" },
    { name: "description", content: "Limicon, an open-space convention around the spring equinox." },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { signedIn: context.get(servicesContext).viewer !== null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl p-4 pt-16">
      <h1 className="text-3xl font-semibold">Limicon</h1>
      <p className="mt-4">An open-space convention around the spring equinox.</p>
      <p className="mt-8">
        {loaderData.signedIn ? (
          <Link className="underline" to="/account">
            Your account
          </Link>
        ) : (
          <Link className="underline" to="/sign-in">
            Sign in or create an account
          </Link>
        )}
      </p>
    </main>
  );
}
