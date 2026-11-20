import { data, Form, useNavigation } from "react-router";

import { ImageUploadField } from "~/components/image-upload-field";
import { servicesContext } from "~/context";
import { requireViewer } from "~/middleware/services.server";
import { getOwnProfile, setOwnAvatar } from "~/lib/profiles.server";
import type { Route } from "./+types/account";

export const middleware: Route.MiddlewareFunction[] = [requireViewer];

export function meta({}: Route.MetaArgs) {
  return [{ title: "Your account · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  // requireViewer has already sent visitors to the sign-in page.
  const [profile, { status }] = await Promise.all([getOwnProfile(services.db(), services.viewer!.userId), services.membership()]);
  if (!profile) throw data("Profile not found", { status: 404 });
  return { email: services.viewer!.email, profile, isMember: status === "member" };
}

/**
 * Saves the member's profile picture, which their sessions show on the schedule when they have no
 * photo of their own. Only members upload photos, so only they set one.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const { status } = await services.membership();
  if (status !== "member") return data({ saved: false, error: "Only Limicon members can add a picture." }, { status: 403 });
  const value = String((await request.formData()).get("avatarKey") ?? "").trim();
  const ok = await setOwnAvatar(services.db(), services.viewer!.userId, value || null);
  if (!ok) return data({ saved: false, error: "Upload the picture again." }, { status: 400 });
  return { saved: true, error: null };
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { email, profile, isMember } = loaderData;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const busy = useNavigation().state !== "idle";

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
      {isMember && (
        <Form method="post" className="mt-8 grid gap-3" aria-labelledby="picture-heading">
          <h2 id="picture-heading" className="text-lg font-semibold">Profile picture</h2>
          <p id="picture-help" className="text-sm">
            Sessions you host show it on the schedule when they don't have a photo of their own.
          </p>
          <ImageUploadField
            name="avatarKey"
            initialKey={profile.avatarKey}
            label={name ? `${name}'s profile picture` : "Your profile picture"}
            endpoint="/upload/photo"
            uploadLabel="Upload a picture"
            help="Any photo your phone or computer can open. Next, you'll zoom and place it in the circle members see."
            previewClassName="size-32"
            crop="circle"
            describedBy="picture-help"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] disabled:opacity-60 dark:bg-[#F3E6D7] dark:text-[#15383F]"
            >
              Save picture
            </button>
            {actionData?.saved && !busy && <p role="status">Saved.</p>}
            {actionData?.error && (
              <p role="alert" className="font-medium text-[#B3261E] dark:text-[#F2B8B5]">{actionData.error}</p>
            )}
          </div>
        </Form>
      )}
      <Form method="post" action="/sign-out" className="mt-8">
        <button type="submit" className="rounded border border-gray-400 px-3 py-2">
          Sign out
        </button>
      </Form>
    </main>
  );
}
