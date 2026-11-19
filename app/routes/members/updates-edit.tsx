import { data, Link, redirect } from "react-router";

import { UpdatePostForm } from "~/components/update-post-form";
import { servicesContext } from "~/context";
import { isUuid } from "~/lib/admin.server";
import { checkPostForm } from "~/lib/updates";
import { getPost, updatePost } from "~/lib/updates.server";
import type { Route } from "./+types/updates-edit";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Edit ${loaderData?.post.title ?? "post"} · Updates · Limicon` }];
}

/** A post's author edits it while their role can post updates; admins edit any post. */
async function load(context: Route.LoaderArgs["context"], postId: string) {
  const services = context.get(servicesContext);
  const post = isUuid(postId) ? await getPost(services.db(), postId) : null;
  if (!post) throw data("Post not found", { status: 404 });
  const privileges = await services.privileges();
  const mayEdit = privileges.has("admin") || (privileges.has("updates") && post.authorId === services.viewer!.userId);
  if (!mayEdit) throw data("Only the post's author or an admin can edit it.", { status: 403 });
  return { services, post };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { post } = await load(context, params.postId);
  return { post: { title: post.title, body: post.body } };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { services, post } = await load(context, params.postId);
  const checked = checkPostForm(await request.formData());
  if (!checked.ok) return data(checked, { status: 400 });
  await updatePost(services.db(), post.id, { title: checked.title, body: checked.body });
  throw redirect("/members/updates");
}

export default function EditUpdate({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <section>
      <p>
        <Link to="/members/updates" className="underline">Back to Updates</Link>
      </p>
      <h1 className="mt-4 mb-6 text-3xl font-semibold">Edit post</h1>
      <UpdatePostForm initial={loaderData.post} errors={actionData?.errors} submitLabel="Save" />
    </section>
  );
}
