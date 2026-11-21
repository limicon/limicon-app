import { data, Link } from "react-router";

import { formatWhen, primaryButton, secondaryButton } from "~/components/admin-ui";
import { Avatar, Icon, KeywordChip } from "~/components/profile-ui";
import { servicesContext } from "~/context";
import { linkUrl, platformById } from "~/lib/profile-links";
import { getProfileView, listRecentActivity } from "~/lib/profiles.server";
import type { Route } from "./+types/profile";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.profile.name ?? "Profile"} · Members · Limicon` }];
}

/** Any member may open a current member's profile. Profiles are never public. */
export async function loader({ params, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const profile = await getProfileView(db, params.profileId);
  if (!profile) throw data("Profile not found", { status: 404 });
  const activity = await listRecentActivity(db, profile.id);
  return { profile, activity, isOwn: profile.id === services.viewer!.userId };
}

const sectionHeading = "text-xl font-semibold";

export default function ProfilePage({ loaderData }: Route.ComponentProps) {
  const { profile, activity, isOwn } = loaderData;
  const links = profile.links
    .map((link) => ({ ...link, url: linkUrl(link.platform, link.value), platform: platformById(link.platform) }))
    .filter((link) => link.url && link.platform);
  const website = links.find((link) => link.platform!.id === "website");
  const projectKeywords = (keywords: string) => keywords.split(",").map((k) => k.trim()).filter(Boolean);

  return (
    <article>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={profile.name} avatarKey={profile.avatarKey} className="size-32 text-4xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold">{profile.name}</h1>
          {profile.headline && <p className="mt-1 text-lg">{profile.headline}</p>}
          {(profile.titles.length > 0 || profile.businessName) && (
            <p className="mt-2 flex items-start gap-2 opacity-90">
              <Icon name="business" className="mt-1 size-4 shrink-0 opacity-70" />
              <span>
                {profile.titles.join(" · ")}
                {profile.titles.length > 0 && profile.businessName && <span className="opacity-70"> at </span>}
                {profile.businessName && <span className="font-medium">{profile.businessName}</span>}
              </span>
            </p>
          )}
          {profile.location && (
            <p className="mt-1 flex items-start gap-2 opacity-90">
              <Icon name="location" className="mt-1 size-4 shrink-0 opacity-70" />
              {profile.location}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isOwn ? (
              <Link to="/members/profile" className={primaryButton}>Edit your profile</Link>
            ) : (
              profile.allowMessages && (
                <button type="button" disabled className={`${primaryButton} inline-flex items-center gap-2`} aria-describedby="messages-soon">
                  <Icon name="message" className="size-4" /> Message
                </button>
              )
            )}
            {profile.email && (
              <a href={`mailto:${profile.email}`} className={`${secondaryButton} inline-flex items-center gap-2`}>
                <Icon name="email" className="size-4" /> Email
              </a>
            )}
            {website && (
              <a href={website.url!} target="_blank" rel="noopener noreferrer nofollow" className={`${secondaryButton} inline-flex items-center gap-2`}>
                <Icon name="website" className="size-4" /> Visit website
              </a>
            )}
          </div>
          {!isOwn && profile.allowMessages && (
            <p id="messages-soon" className="mt-2 text-sm opacity-75">Private messages between members are coming soon.</p>
          )}

          {links.length > 0 && (
            <ul aria-label="Links" className="mt-4 flex flex-wrap gap-1">
              {links.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.url!}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={link.platform!.id === "website" ? new URL(link.url!).hostname : link.platform!.label}
                    className="grid size-10 place-items-center rounded-full hover:bg-[#15383F]/10 dark:hover:bg-white/10"
                  >
                    <Icon name={link.platform!.icon} className="size-6" />
                    <span className="sr-only">
                      {link.platform!.id === "website" ? `Website: ${new URL(link.url!).hostname}` : link.platform!.label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {profile.bio && (
        <section aria-labelledby="bio-heading" className="mt-10 border-t border-[#C9DADC] pt-6 dark:border-[#24363B]">
          <h2 id="bio-heading" className={sectionHeading}>Bio</h2>
          <div className="mt-3 grid max-w-[68ch] gap-4">
            {profile.bio.split(/\n{2,}/).map((paragraph, i) => <p key={i} className="whitespace-pre-line">{paragraph}</p>)}
          </div>
        </section>
      )}

      {(profile.skills.length > 0 || profile.interests.length > 0) && (
        <section aria-labelledby="skills-heading" className="mt-10 border-t border-[#C9DADC] pt-6 dark:border-[#24363B]">
          <h2 id="skills-heading" className={sectionHeading}>Skills and interests</h2>
          <p className="mt-1 text-sm opacity-75">Choose one to see who else shares it.</p>
          {profile.skills.length > 0 && (
            <>
              <h3 className="mt-4 font-semibold">Skills</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.skills.map((k) => <li key={k.key}><KeywordChip keyword={k.keyword} /></li>)}
              </ul>
            </>
          )}
          {profile.interests.length > 0 && (
            <>
              <h3 className="mt-4 font-semibold">Interests</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.interests.map((k) => <li key={k.key}><KeywordChip keyword={k.keyword} /></li>)}
              </ul>
            </>
          )}
        </section>
      )}

      {profile.projects.length > 0 && (
        <section aria-labelledby="projects-heading" className="mt-10 border-t border-[#C9DADC] pt-6 dark:border-[#24363B]">
          <h2 id="projects-heading" className={sectionHeading}>Projects</h2>
          <ul className="mt-4 grid gap-6">
            {profile.projects.map((project, i) => (
              <li key={i}>
                <ul aria-label="Project keywords" className="flex flex-wrap gap-2">
                  {projectKeywords(project.keywords).map((k) => <li key={k}><KeywordChip keyword={k} /></li>)}
                </ul>
                {project.description && <p className="mt-2 max-w-[68ch] whitespace-pre-line">{project.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="activity-heading" className="mt-10 border-t border-[#C9DADC] pt-6 dark:border-[#24363B]">
        <h2 id="activity-heading" className={sectionHeading}>Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 opacity-80">{isOwn ? "You haven't" : `${profile.name} hasn't`} posted or commented in Community yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {activity.map((item, i) => (
              <li key={i}>
                <p>
                  {item.place === "community" ? (
                    <>
                      {item.kind === "post" ? "Posted in " : "Commented on a post in "}
                      <Link to={`/members/community?post=${item.postId}`} className="font-medium underline">Community</Link>
                      {item.kind === "post" && <>: “{item.postTitle.length >= 120 ? `${item.postTitle}…` : item.postTitle}”</>}
                    </>
                  ) : (
                    <>
                      {item.kind === "post" ? "Posted " : "Commented on "}
                      <Link to={`/members/updates#post-${item.postId}`} className="font-medium underline">{item.postTitle}</Link>
                      {" on Updates"}
                    </>
                  )}
                  <span className="text-sm opacity-70"> · {formatWhen(item.at)}</span>
                </p>
                {item.excerpt && (
                  <blockquote className="mt-1 line-clamp-3 border-l-2 border-[#9DB5B9] pl-3 opacity-90">{item.excerpt}</blockquote>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
