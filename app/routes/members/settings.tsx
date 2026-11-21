import { useState } from "react";
import { data, Form, Link, useNavigation } from "react-router";

import { card, primaryButton } from "~/components/admin-ui";
import { servicesContext } from "~/context";
import { EMAIL_CHOICES, readEmailChoices } from "~/lib/email-choices";
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
  const db = services.db();
  const userId = services.viewer!.userId;
  const form = await request.formData();
  const emailNotifications = form.get("emailNotifications") === "on";
  // With email turned off the choices are greyed out and don't post, so keep the ones saved before.
  const emailNotify = emailNotifications ? readEmailChoices(form.getAll("emailNotify")) : ((await getOwnSettings(db, userId))?.emailNotify ?? []);
  await saveOwnSettings(db, userId, {
    showEmail: form.get("showEmail") === "on",
    allowMessages: form.get("allowMessages") === "on",
    showInDirectory: form.get("showInDirectory") === "on",
    emailNotifications,
    emailNotify,
  });
  return { saved: true };
}

const label = "font-medium";
const help = "block text-sm opacity-80";

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, email } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [wantsEmail, setWantsEmail] = useState(settings.emailNotifications);

  return (
    <div>
      <h1 className="text-3xl font-semibold">Settings</h1>

      <section aria-labelledby="account-heading" className={`${card} mt-6`}>
        <h2 id="account-heading" className="text-xl font-semibold">Your account</h2>
        <p className="mt-2">You sign in as <span className="font-medium">{email}</span>.</p>
        <p className="mt-2 text-sm opacity-80">
          Your name, picture and the rest of your profile are on <Link to="/members/profile" className="underline">Edit profile</Link>.
        </p>
      </section>

      <Form method="post" className="mt-6 grid gap-6">
      <section className={`${card} grid gap-4`} aria-labelledby="privacy-heading">
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
      </section>

      <section className={`${card} grid gap-4`} aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-xl font-semibold">Email notifications</h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="emailNotifications" checked={wantsEmail} onChange={(event) => setWantsEmail(event.target.checked)} className="mt-1 size-4" />
          <span>
            <span className={label}>Email me notifications</span>
            <span className={help}>Sent to {email ?? "your email address"}. The bell on every Members page shows them all either way.</span>
          </span>
        </label>
        <fieldset disabled={!wantsEmail} className="ml-7 grid gap-3 disabled:opacity-50">
          <legend className="mb-2 font-medium">Email me when:</legend>
          {EMAIL_CHOICES.map((choice) => (
            <label key={choice.key} className="flex items-start gap-3">
              <input type="checkbox" name="emailNotify" value={choice.key} defaultChecked={settings.emailNotify.includes(choice.key)} className="mt-1 size-4" />
              <span>
                <span className={label}>{choice.label}</span>
                {choice.help && <span className={help}>{choice.help}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      </section>

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
