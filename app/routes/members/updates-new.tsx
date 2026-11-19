import { data, Link, redirect } from "react-router";

import { UpdatePostForm } from "~/components/update-post-form";
import { servicesContext } from "~/context";
import { checkPostForm } from "~/lib/updates";
import { createPost } from "~/lib/updates.server";
import type { Route } from "./+types/updates-new";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New post · Updates · Limicon" }];
}

/** Only people whose role has the `updates` privilege post. */
async function requirePoster(context: Route.LoaderArgs["context"]) {
  const services = context.get(servicesContext);
  if (!(await services.privileges()).has("updates")) throw data("Your role can't post updates.", { status: 403 });
  return services;
}

export async function loader({ context }: Route.LoaderArgs) {
  await requirePoster(context);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const services = await requirePoster(context);
  const checked = checkPostForm(await request.formData());
  if (!checked.ok) return data(checked, { status: 400 });
  await createPost(services.db(), { authorId: services.viewer!.userId, title: checked.title, body: checked.body, template: checked.template });
  throw redirect("/members/updates");
}

export default function NewUpdate({ actionData }: Route.ComponentProps) {
  return (
    <section>
      <p>
        <Link to="/members/updates" className="underline">Back to Updates</Link>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">New post</h1>
      <p className="mt-2 mb-6 max-w-[68ch]">Write a post from scratch, or start from a template. Every member sees it on Updates once you post it.</p>
      <UpdatePostForm initial={{ title: "", body: null }} errors={actionData?.errors} submitLabel="Post" chooseTemplate />
    </section>
  );
}
