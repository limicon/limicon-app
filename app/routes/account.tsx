import { data, Form } from "react-router";

import { servicesContext } from "~/context";
import { requireViewer } from "~/middleware/services.server";
import { getOwnProfile } from "~/lib/profiles.server";
import type { Route } from "./+types/account";

export const middleware: Route.MiddlewareFunction[] = [requireViewer];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Your account · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { viewer, db } = context.get(servicesContext);
  // requireViewer has already sent visitors to the sign-in page.
  const profile = await getOwnProfile(db(), viewer!.userId);
  if (!profile) throw data("Profile not found", { status: 404 });
  return { email: viewer!.email, profile };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { email, profile } = loaderData;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return (
    <main className="mx-auto max-w-md p-4 pt-16">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <dl className="mt-6 space-y-2">
        <div>
          <dt className="font-medium">Email</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt className="font-medium">Name</dt>
          <dd>{name || "Not set yet"}</dd>
        </div>
      </dl>
      <Form method="post" action="/sign-out" className="mt-8">
        <button type="submit" className="rounded border border-gray-400 px-3 py-2">
          Sign out
        </button>
      </Form>
    </main>
  );
}
