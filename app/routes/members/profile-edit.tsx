import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { card, dangerButton, FieldError, inputClass, Notice, primaryButton, secondaryButton } from "~/components/admin-ui";
import { ImageUploadField } from "~/components/image-upload-field";
import { KeywordInput } from "~/components/keyword-input";
import { Icon } from "~/components/profile-ui";
import { servicesContext } from "~/context";
import { LIMITS, parseProfileForm, type ProfileErrors } from "~/lib/profile-form";
import { MAX_LINKS, PLATFORMS, platformById } from "~/lib/profile-links";
import { getProfileForEdit, saveProfile } from "~/lib/profiles.server";
import type { Route } from "./+types/profile-edit";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Edit your profile · Members · Limicon" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const profile = await getProfileForEdit(services.db(), services.viewer!.userId);
  if (!profile) throw data("Profile not found", { status: 404 });
  return { profile, email: services.viewer!.email, userId: services.viewer!.userId };
}

/** Saves the signed-in member's own profile, and only theirs. */
export async function action({ request, context }: Route.ActionArgs) {
  const services = context.get(servicesContext);
  const { edit, errors } = parseProfileForm(await request.formData());
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });
  const userId = services.viewer!.userId;
  await saveProfile(services.db(), userId, edit);
  throw redirect(`/members/people/${userId}`);
}

let nextRow = 0;
const withKeys = <T,>(items: T[]) => items.map((item) => ({ ...item, key: nextRow++ }));

const label = "font-medium";
const help = "text-sm opacity-80";
const fieldset = `${card} grid gap-5`;
const legend = "px-1 text-xl font-semibold";

export default function ProfileEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { profile, email, userId } = loaderData;
  const errors: ProfileErrors = actionData?.errors ?? {};
  const busy = useNavigation().state !== "idle";
  const [titles, setTitles] = useState(() => withKeys((profile.titles.length ? profile.titles : [""]).map((value) => ({ value }))));
  const [links, setLinks] = useState(() => withKeys(profile.links));
  const [projects, setProjects] = useState(() => withKeys(profile.projects));
  const describe = (id: string, hint?: string) => [hint, errors[id] && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Edit your profile</h1>
        <p className="mt-2 max-w-[68ch]">Other Limicon members see your profile. It's never shown to the public.</p>
      </header>
      {Object.keys(errors).length > 0 && <Notice tone="problem">Some fields need a change. They're marked below.</Notice>}

      <Form method="post" className="grid gap-8" noValidate>
        <fieldset className={fieldset}>
          <legend className={legend}>About you</legend>
          <div>
            <p className={label}>Profile picture</p>
            <ImageUploadField
              name="avatarKey"
              initialKey={profile.avatarKey}
              label="Your profile picture"
              endpoint="/upload/photo"
              uploadLabel="Upload a picture"
              help="PNG, JPEG, GIF or WebP, up to 5 MB. A square picture looks best."
              previewClassName="size-32 rounded-full"
            />
            <FieldError id="avatarKey-error" message={errors.avatarKey} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className={label}>First name</label>
              <input id="firstName" name="firstName" defaultValue={profile.firstName} required maxLength={LIMITS.name} autoComplete="given-name"
                aria-invalid={errors.firstName ? true : undefined} aria-describedby={describe("firstName")} className={inputClass} />
              <FieldError id="firstName-error" message={errors.firstName} />
            </div>
            <div>
              <label htmlFor="lastName" className={label}>Last name</label>
              <input id="lastName" name="lastName" defaultValue={profile.lastName} maxLength={LIMITS.name} autoComplete="family-name"
                aria-invalid={errors.lastName ? true : undefined} aria-describedby={describe("lastName")} className={inputClass} />
              <FieldError id="lastName-error" message={errors.lastName} />
            </div>
          </div>
          <div>
            <label htmlFor="headline" className={label}>Headline</label>
            <p id="headline-help" className={help}>A line about you, in your own words. Up to {LIMITS.headline} characters.</p>
            <input id="headline" name="headline" defaultValue={profile.headline ?? ""} maxLength={LIMITS.headline}
              aria-invalid={errors.headline ? true : undefined} aria-describedby={describe("headline", "headline-help")} className={inputClass} />
            <FieldError id="headline-error" message={errors.headline} />
          </div>
          <div>
            <label htmlFor="location" className={label}>Location</label>
            <p id="location-help" className={help}>As much or as little as you like, such as a city or region.</p>
            <input id="location" name="location" defaultValue={profile.location ?? ""} maxLength={LIMITS.location}
              aria-invalid={errors.location ? true : undefined} aria-describedby={describe("location", "location-help")} className={inputClass} />
            <FieldError id="location-error" message={errors.location} />
          </div>
          <div>
            <p id="titles-label" className={label}>Professional titles</p>
            <p id="titles-help" className={help}>Up to {LIMITS.titles}, such as "Facilitator" or "Regenerative designer".</p>
            <ul className="mt-2 grid gap-2" aria-labelledby="titles-label">
              {titles.map((title, i) => (
                <li key={title.key} className="flex gap-2">
                  <input name="title" defaultValue={title.value} maxLength={LIMITS.title} aria-label={`Title ${i + 1}`}
                    aria-describedby={describe("titles", "titles-help")} className={inputClass} />
                  {titles.length > 1 && (
                    <button type="button" className={dangerButton} onClick={() => setTitles(titles.filter((t) => t.key !== title.key))}
                      aria-label={`Remove title ${i + 1}`}>Remove</button>
                  )}
                </li>
              ))}
            </ul>
            {titles.length < LIMITS.titles && (
              <button type="button" className={`${secondaryButton} mt-2`} onClick={() => setTitles([...titles, ...withKeys([{ value: "" }])])}>
                Add another title
              </button>
            )}
            <FieldError id="titles-error" message={errors.titles} />
          </div>
          <div>
            <label htmlFor="businessName" className={label}>Business name <span className="font-normal opacity-80">(optional)</span></label>
            <p id="businessName-help" className={help}>Leave it blank and your profile won't mention one.</p>
            <input id="businessName" name="businessName" defaultValue={profile.businessName ?? ""} maxLength={LIMITS.businessName}
              aria-invalid={errors.businessName ? true : undefined} aria-describedby={describe("businessName", "businessName-help")} className={inputClass} />
            <FieldError id="businessName-error" message={errors.businessName} />
          </div>
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Contact and links</legend>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="showEmail" defaultChecked={profile.showEmail} className="mt-1 size-4" />
            <span>
              <span className={label}>Show my email address on my profile</span>
              <span className={`block ${help}`}>Members will see {email ?? "your email"} and an Email button.</span>
            </span>
          </label>
          <p className={help}>
            You can also change this, and who can message you or find you under All members, in <Link to="/members/settings" className="underline">Settings</Link>.
          </p>

          <div>
            <p id="links-label" className={label}>Links</p>
            <p id="links-help" className={help}>
              Up to {MAX_LINKS}: your website and your pages elsewhere. Choose where each goes, then type its address, @handle or
              username. For any other site, choose "Website" and type the full address. Your first website also gets a "Visit
              website" button.
            </p>
            {links.length > 0 && (
              <ul className="mt-3 grid gap-3" aria-labelledby="links-label">
                {links.map((link, i) => {
                  const platform = platformById(link.platform) ?? PLATFORMS[0]!;
                  const error = errors[`link-${i}`];
                  return (
                    <li key={link.key} className="grid gap-2 sm:grid-cols-[15rem_1fr_auto] sm:items-start">
                      <div className="flex items-center gap-2">
                        <Icon name={platform.icon} className="size-5 shrink-0" />
                        <select name="linkPlatform" value={link.platform} aria-label={`Link ${i + 1}: where it goes`} className={inputClass}
                          onChange={(event) => setLinks(links.map((l) => (l.key === link.key ? { ...l, platform: event.target.value } : l)))}>
                          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <input name="linkValue" value={link.value} placeholder={platform.placeholder} maxLength={300}
                          aria-label={`Link ${i + 1}: ${platform.id === "website" ? "address" : "address or username"}`}
                          aria-invalid={error ? true : undefined} aria-describedby={error ? `link-${i}-error` : undefined} className={inputClass}
                          onChange={(event) => setLinks(links.map((l) => (l.key === link.key ? { ...l, value: event.target.value } : l)))} />
                        <FieldError id={`link-${i}-error`} message={error} />
                      </div>
                      <button type="button" className={dangerButton} onClick={() => setLinks(links.filter((l) => l.key !== link.key))}
                        aria-label={`Remove link ${i + 1}`}>Remove</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {links.length < MAX_LINKS ? (
              <button type="button" className={`${secondaryButton} mt-3`} aria-describedby="links-help"
                onClick={() => setLinks([...links, ...withKeys([{ platform: links.length ? "linkedin" : "website", value: "" }])])}>
                Add a link
              </button>
            ) : (
              <p className={`${help} mt-3`}>You've added the most links a profile can have.</p>
            )}
            <FieldError id="links-error" message={errors.links} />
          </div>
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Skills and interests</legend>
          <p className={help}>Each one becomes a keyword. Members can choose a keyword to find everyone who shares it.</p>
          <KeywordInput name="skill" label="Skills" help="What you're good at or could offer others, such as facilitation or grant writing."
            initial={profile.skills} error={errors.skills} />
          <KeywordInput name="interest" label="Interests" help="What you're curious about or care for, such as permaculture or deep listening."
            initial={profile.interests} error={errors.interests} />
        </fieldset>

        <fieldset className={fieldset}>
          <legend className={legend}>Projects</legend>
          <p className={help}>What you're working on now. Up to {LIMITS.projects}.</p>
          {projects.map((project, i) => {
            const error = errors[`project-${i}`];
            return (
              <div key={project.key} className="grid gap-3 border-t border-[#C9DADC] pt-4 first:border-t-0 first:pt-0 dark:border-[#24363B]">
                <div>
                  <label htmlFor={`project-${i}-keywords`} className={label}>Project {i + 1}: a few keywords</label>
                  <p id={`project-${i}-help`} className={help}>Separate them with commas, such as "community garden, food sovereignty".</p>
                  <input id={`project-${i}-keywords`} name="projectKeywords" defaultValue={project.keywords} maxLength={LIMITS.projectKeywords}
                    aria-invalid={error ? true : undefined} aria-describedby={[`project-${i}-help`, error && `project-${i}-error`].filter(Boolean).join(" ")}
                    className={inputClass} />
                </div>
                <div>
                  <label htmlFor={`project-${i}-description`} className={label}>Tell members about it</label>
                  <textarea id={`project-${i}-description`} name="projectDescription" defaultValue={project.description} rows={5}
                    maxLength={LIMITS.projectDescription} className={inputClass} />
                </div>
                <FieldError id={`project-${i}-error`} message={error} />
                <div>
                  <button type="button" className={dangerButton} onClick={() => setProjects(projects.filter((p) => p.key !== project.key))}>
                    Remove project {i + 1}
                  </button>
                </div>
              </div>
            );
          })}
          {projects.length < LIMITS.projects && (
            <div>
              <button type="button" className={secondaryButton} onClick={() => setProjects([...projects, ...withKeys([{ keywords: "", description: "" }])])}>
                Add a project
              </button>
            </div>
          )}
          <FieldError id="projects-error" message={errors.projects} />
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save profile"}</button>
          <Link to={`/members/people/${userId}`} className="underline">Cancel</Link>
        </div>
      </Form>
    </div>
  );
}
