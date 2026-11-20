import type { Db } from "~/lib/db.server";
import type { EmailChoice } from "~/lib/email-choices";
import { IMAGE_KEY } from "~/lib/media";
import type { ProfileEdit, ProfileLink, ProfileProject } from "~/lib/profile-form";

export type Profile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  timeZone: string | null;
  /** Their profile picture in the media bucket. */
  avatarKey: string | null;
};

/** A member's own profile. Callers pass the signed-in member's id, never one from the request. */
export async function getOwnProfile(sql: Db, userId: string): Promise<Profile | null> {
  const [row] = await sql<Profile[]>`
    select id, first_name as "firstName", last_name as "lastName", time_zone as "timeZone",
           avatar_key as "avatarKey"
    from public.profiles
    where id = ${userId}
  `;
  return row ?? null;
}

/**
 * Sets or clears the member's own profile picture. Callers pass the signed-in member's id. Returns
 * false, saving nothing, when the key isn't one of our stored images.
 */
export async function setOwnAvatar(sql: Db, userId: string, avatarKey: string | null): Promise<boolean> {
  if (avatarKey !== null && !IMAGE_KEY.test(avatarKey)) return false;
  await sql`update public.profiles set avatar_key = ${avatarKey}, updated_at = now() where id = ${userId}`;
  return true;
}

/**
 * Whether profile `p` belongs to a current member: an admin or a holder of a ticket for the latest
 * edition, not deactivated. Only they appear to other members (PRD PRO-4).
 */
export const isCurrentMember = (alias: string) => `
  ${alias}.deactivated_at is null and (
    exists (select 1 from public.admin_permissions ap where ap.profile_id = ${alias}.id)
    or exists (
      select 1 from public.tickets t
      where t.profile_id = ${alias}.id and t.status in ('paid', 'comp')
        and t.edition_id = (select id from public.editions order by year desc limit 1)
    )
  )`;

export type ProfileKeyword = { keyword: string; key: string };

/** Everything the profile page shows, as other members see it. */
export type ProfileView = {
  id: string;
  name: string;
  avatarKey: string | null;
  headline: string | null;
  location: string | null;
  businessName: string | null;
  titles: string[];
  /** Their sign-in email, only when they chose to show it. */
  email: string | null;
  allowMessages: boolean;
  links: ProfileLink[];
  skills: ProfileKeyword[];
  interests: ProfileKeyword[];
  projects: ProfileProject[];
};

const fullName = (alias: string) => `nullif(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), '')`;

/** A current member's profile, or null for anyone else. Any member may see it. */
export async function getProfileView(sql: Db, profileId: string): Promise<ProfileView | null> {
  if (!/^[0-9a-f-]{36}$/.test(profileId)) return null;
  const [row] = await sql<(Omit<ProfileView, "skills" | "interests"> & { keywords: (ProfileKeyword & { kind: string })[] })[]>`
    select p.id, coalesce(${sql.unsafe(fullName("p"))}, 'A member') as name, p.avatar_key as "avatarKey",
           p.headline, p.location, p.business_name as "businessName", p.titles,
           case when p.show_email then u.email end as email, p.allow_messages as "allowMessages",
           coalesce((select json_agg(json_build_object('platform', l.platform, 'value', l.value) order by l.position)
                     from public.profile_links l where l.profile_id = p.id), '[]') as links,
           coalesce((select json_agg(json_build_object('kind', k.kind, 'keyword', k.keyword, 'key', k.key) order by k.position)
                     from public.profile_keywords k where k.profile_id = p.id), '[]') as keywords,
           coalesce((select json_agg(json_build_object('keywords', pr.keywords, 'description', pr.description) order by pr.position)
                     from public.profile_projects pr where pr.profile_id = p.id), '[]') as projects
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = ${profileId} and ${sql.unsafe(isCurrentMember("p"))}
  `;
  if (!row) return null;
  const { keywords, ...rest } = row;
  const pick = (kind: string) => keywords.filter((k) => k.kind === kind).map(({ keyword, key }) => ({ keyword, key }));
  return { ...rest, skills: pick("skill"), interests: pick("interest") };
}

/** The member's own profile as the editor fills it in. */
export async function getProfileForEdit(sql: Db, userId: string): Promise<ProfileEdit | null> {
  const [row] = await sql<(Omit<ProfileEdit, "skills" | "interests"> & { keywords: { kind: string; keyword: string }[] })[]>`
    select coalesce(p.first_name, '') as "firstName", coalesce(p.last_name, '') as "lastName",
           p.avatar_key as "avatarKey", p.headline, p.location, p.business_name as "businessName", p.titles,
           p.show_email as "showEmail",
           coalesce((select json_agg(json_build_object('platform', l.platform, 'value', l.value) order by l.position)
                     from public.profile_links l where l.profile_id = p.id), '[]') as links,
           coalesce((select json_agg(json_build_object('kind', k.kind, 'keyword', k.keyword) order by k.position)
                     from public.profile_keywords k where k.profile_id = p.id), '[]') as keywords,
           coalesce((select json_agg(json_build_object('keywords', pr.keywords, 'description', pr.description) order by pr.position)
                     from public.profile_projects pr where pr.profile_id = p.id), '[]') as projects
    from public.profiles p
    where p.id = ${userId}
  `;
  if (!row) return null;
  const { keywords, ...rest } = row;
  const pick = (kind: string) => keywords.filter((k) => k.kind === kind).map((k) => k.keyword);
  return { ...rest, skills: pick("skill"), interests: pick("interest") };
}

/** Saves the member's whole profile. Callers pass the signed-in member's id and a checked edit. */
export async function saveProfile(sql: Db, userId: string, edit: ProfileEdit): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update public.profiles set
        first_name = ${edit.firstName}, last_name = ${edit.lastName || null}, avatar_key = ${edit.avatarKey},
        headline = ${edit.headline}, location = ${edit.location}, business_name = ${edit.businessName},
        titles = ${edit.titles}, show_email = ${edit.showEmail}, updated_at = now()
      where id = ${userId}
    `;
    await tx`delete from public.profile_links where profile_id = ${userId}`;
    await tx`delete from public.profile_keywords where profile_id = ${userId}`;
    await tx`delete from public.profile_projects where profile_id = ${userId}`;
    if (edit.links.length) {
      await tx`insert into public.profile_links ${tx(edit.links.map((l, position) => ({ profile_id: userId, platform: l.platform, value: l.value, position })))}`;
    }
    const keywords = [
      ...edit.skills.map((keyword, position) => ({ kind: "skill", keyword, position })),
      ...edit.interests.map((keyword, position) => ({ kind: "interest", keyword, position })),
    ].map((k) => ({ profile_id: userId, ...k, key: k.keyword.toLowerCase() }));
    if (keywords.length) await tx`insert into public.profile_keywords ${tx(keywords)}`;
    if (edit.projects.length) {
      await tx`insert into public.profile_projects ${tx(edit.projects.map((p, position) => ({ profile_id: userId, keywords: p.keywords, description: p.description, position })))}`;
    }
  });
}

/** Privacy choices on the Settings page. Show my email is also in the profile editor. */
export type MemberSettings = {
  showEmail: boolean;
  allowMessages: boolean;
  showInDirectory: boolean;
  /** Whether they want notifications by email at all. */
  emailNotifications: boolean;
  /** Which ones (app/lib/email-choices.ts). */
  emailNotify: EmailChoice[];
};

/** The member's own settings. Callers pass the signed-in member's id. */
export async function getOwnSettings(sql: Db, userId: string): Promise<MemberSettings | null> {
  const [row] = await sql<MemberSettings[]>`
    select show_email as "showEmail", allow_messages as "allowMessages", show_in_directory as "showInDirectory",
           email_notifications as "emailNotifications", email_notify as "emailNotify"
    from public.profiles where id = ${userId}
  `;
  return row ?? null;
}

export async function saveOwnSettings(sql: Db, userId: string, settings: MemberSettings): Promise<void> {
  await sql`
    update public.profiles
    set show_email = ${settings.showEmail}, allow_messages = ${settings.allowMessages}, show_in_directory = ${settings.showInDirectory},
        email_notifications = ${settings.emailNotifications}, email_notify = ${settings.emailNotify}, updated_at = now()
    where id = ${userId}
  `;
}

export type Activity = {
  /** Community, the members' group, or Updates, the Organizing Team's news. */
  place: "community" | "updates";
  kind: "post" | "comment";
  postId: string;
  /** An Updates post's title, or the start of a Community post. */
  postTitle: string;
  /** A comment's text; for a post, null. */
  excerpt: string | null;
  at: Date;
};

/** The member's latest posts and comments in Community and on Updates, newest first. */
export async function listRecentActivity(sql: Db, profileId: string, limit = 10): Promise<Activity[]> {
  return sql<Activity[]>`
    select * from (
      (select 'community' as place, 'post' as kind, p.id as "postId", left(p.body, 120) as "postTitle", null as excerpt, p.created_at as at
       from public.community_posts p where p.author_id = ${profileId}
       order by p.created_at desc limit ${limit})
      union all
      (select 'community', 'comment', c.post_id, left(p.body, 120), left(c.body, 200), c.created_at
       from public.community_comments c join public.community_posts p on p.id = c.post_id
       where c.author_id = ${profileId}
       order by c.created_at desc limit ${limit})
      union all
      (select 'updates', 'post', p.id, p.title, null, p.created_at
       from public.update_posts p where p.author_id = ${profileId}
       order by p.created_at desc limit ${limit})
      union all
      (select 'updates', 'comment', c.post_id, p.title, left(c.body, 200), c.created_at
       from public.update_comments c join public.update_posts p on p.id = c.post_id
       where c.author_id = ${profileId}
       order by c.created_at desc limit ${limit})
    ) activity
    order by at desc
    limit ${limit}
  `;
}

export type DirectoryEntry = {
  id: string;
  name: string;
  avatarKey: string | null;
  headline: string | null;
  location: string | null;
  /** Their keywords that match the filter, or all of them without one. */
  keywords: string[];
};

/**
 * Current members who show in the directory, by name. `keyword` keeps those with that skill,
 * interest or project keyword; `query` matches names, headlines and keywords.
 */
export async function listDirectory(sql: Db, filter: { keyword?: string | null; query?: string | null } = {}): Promise<DirectoryEntry[]> {
  const key = filter.keyword?.trim().toLowerCase() || null;
  const like = filter.query?.trim() ? `%${filter.query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return sql<DirectoryEntry[]>`
    select p.id, coalesce(${sql.unsafe(fullName("p"))}, 'A member') as name, p.avatar_key as "avatarKey",
           p.headline, p.location,
           coalesce((select array_agg(k.keyword order by k.kind desc, k.position) from public.profile_keywords k where k.profile_id = p.id), '{}') as keywords
    from public.profiles p
    where p.show_in_directory and ${sql.unsafe(isCurrentMember("p"))}
      and (${key}::text is null
           or exists (select 1 from public.profile_keywords k where k.profile_id = p.id and k.key = ${key})
           or exists (select 1 from public.profile_projects pr, unnest(string_to_array(pr.keywords, ',')) w
                      where pr.profile_id = p.id and lower(trim(w)) = ${key}))
      and (${like}::text is null
           or ${sql.unsafe(fullName("p"))} ilike ${like}
           or p.headline ilike ${like}
           or exists (select 1 from public.profile_keywords k where k.profile_id = p.id and k.keyword ilike ${like})
           or exists (select 1 from public.profile_projects pr where pr.profile_id = p.id and pr.keywords ilike ${like}))
    -- A to Z by first name, with members who haven't given a name last.
    order by ${sql.unsafe(fullName("p"))} is null, lower(coalesce(p.first_name, '')), lower(coalesce(p.last_name, ''))
  `;
}

/** Skills and interests members share, most used first, with how many members list each. */
export async function listPopularKeywords(sql: Db, limit = 40): Promise<{ keyword: string; key: string; count: number }[]> {
  return sql<{ keyword: string; key: string; count: number }[]>`
    select min(k.keyword) as keyword, k.key, count(distinct k.profile_id)::int as count
    from public.profile_keywords k
    join public.profiles p on p.id = k.profile_id
    where p.show_in_directory and ${sql.unsafe(isCurrentMember("p"))}
    group by k.key
    order by count desc, k.key
    limit ${limit}
  `;
}
