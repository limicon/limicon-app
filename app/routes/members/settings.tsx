import { data, Form, Link, useNavigation } from "react-router";

import { card, primaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { getOwnSettings, saveOwnSettings } from "~/lib/profiles.server";
import type { Route } from "./+types/settings";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings · Members · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const settings = await getOwnSettings(services.db(), services.viewer!.userId);
  if (!settings) throw data("Profile not found", { status: 404 });
  return { settings, email: services.viewer!.email };
}

/** Saves the signed-in member's own settings, and only theirs. */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const form = await request.formData();
  await saveOwnSettings(services.db(), services.viewer!.userId, {
    showEmail: form.get("showEmail") === "on",
    allowMessages: form.get("allowMessages") === "on",
    showInDirectory: form.get("showInDirectory") === "on",
  });
  return { saved: true };
}

const label = "font-medium";
const help = "block text-sm opacity-80";

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, email } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <section aria-labelledby="account-heading" className={`${card} mt-6`}>
        <h2 id="account-heading" className="text-xl font-semibold">Your account</h2>
        <p className="mt-2">You sign in as <span className="font-medium">{email}</span>.</p>
        <p className="mt-2 text-sm opacity-80">
          Your name, picture and the rest of your profile are on <Link to="/members/profile" className="underline">Edit profile</Link>.
        </p>
      </section>

      <Form method="post" className={`${card} mt-6 grid gap-4`} aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-xl font-semibold">Privacy</h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="showEmail" defaultChecked={settings.showEmail} className="mt-1 size-4" />
          <span>
            <span className={label}>Show my email address on my profile</span>
            <span className={help}>Members will see {email ?? "your email"} and an Email button.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="allowMessages" defaultChecked={settings.allowMessages} className="mt-1 size-4" />
          <span>
            <span className={label}>Let members send me private messages</span>
            <span className={help}>Messages stay within the Limicon site. When this is off, your profile has no Message button.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="showInDirectory" defaultChecked={settings.showInDirectory} className="mt-1 size-4" />
          <span>
            <span className={label}>List me under All members</span>
            <span className={help}>When this is off, members can still open your profile from your name, such as beside a post.</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save settings"}</button>
          {actionData?.saved && !busy && <p role="status">Saved.</p>}
        </div>
      </Form>

      <Form method="post" action="/sign-out" className="mt-6">
        <button type="submit" className="underline">Sign out</button>
      </Form>
    </div>
  );
}
