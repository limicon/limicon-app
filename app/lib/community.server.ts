/**
 * Data access for the Community page (docs/feature-community.md), a group feed every member posts
 * to. Functions that change a member's own posts, likes and comments take that member's id and
 * touch only their rows, unless the caller says they moderate.
 */
import { FEED_PAGE } from "~/lib/community";
import type { Db } from "~/lib/db.server";
import { EVERYONE, mentionsEveryone, mentionsIn, type Mention } from "~/lib/mentions";
import { isCurrentMember } from "~/lib/profiles.server";

export type CommunityComment = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorAvatarKey: string | null;
  /** Holds the Admin role, so the comment says "(admin)" beside the name. */
  authorIsAdmin: boolean;
  body: string;
  mentions: Mention[];
  createdAt: Date;
  editedAt: Date | null;
};

/** A top-level comment with its replies, oldest first. */
export type CommentThread = CommunityComment & { replies: CommunityComment[] };

export type CommunityPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarKey: string | null;
  body: string;
  mentions: Mention[];
  imageKey: string | null;
  createdAt: Date;
  editedAt: Date | null;
  likes: number;
  likedByViewer: boolean;
  /** Every comment and reply. */
  commentCount: number;
  comments: CommentThread[];
};

const personName = (alias: string) =>
  `coalesce(nullif(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), ''), 'A member')`;

export type RawComment = Omit<CommunityComment, "createdAt" | "editedAt"> & { createdAt: string; editedAt: string | null };

export function threads(raw: RawComment[]): CommentThread[] {
  const comments = raw.map((c) => ({ ...c, createdAt: new Date(c.createdAt), editedAt: c.editedAt ? new Date(c.editedAt) : null }));
  const top = comments.filter((c) => !c.parentId).map((c) => ({ ...c, replies: [] as CommunityComment[] }));
  const byId = new Map(top.map((c) => [c.id, c]));
  for (const reply of comments.filter((c) => c.parentId)) byId.get(reply.parentId!)?.replies.push(reply);
  return top;
}

/**
 * Posts newest first, with likes, comments and replies. `query` keeps posts whose text, comments
 * or author's name contain it; `before` pages to older posts; `postId` picks one post.
 */
export async function listCommunityPosts(
  sql: Db,
  viewerId: string,
  options: { query?: string | null; before?: Date | null; postId?: string | null; limit?: number } = {},
): Promise<CommunityPost[]> {
  const postId = options.postId ?? null;
  const like = options.query?.trim() ? `%${options.query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const before = options.before ?? null;
  const rows = await sql<(Omit<CommunityPost, "comments" | "commentCount"> & { comments: RawComment[] })[]>`
    select p.id, p.author_id as "authorId", ${sql.unsafe(personName("a"))} as "authorName", a.avatar_key as "authorAvatarKey",
           p.body, p.mentions, p.image_key as "imageKey", p.created_at as "createdAt", p.edited_at as "editedAt",
           (select count(*) from public.community_post_likes l where l.post_id = p.id)::int as likes,
           exists (select 1 from public.community_post_likes l where l.post_id = p.id and l.profile_id = ${viewerId}) as "likedByViewer",
           coalesce((
             select json_agg(json_build_object(
               'id', c.id, 'parentId', c.parent_id, 'authorId', c.author_id, 'authorName', ${sql.unsafe(personName("ca"))},
               'authorAvatarKey', ca.avatar_key, 'authorIsAdmin', ${sql.unsafe(holdsAdminRole("ca"))}, 'body', c.body, 'mentions', c.mentions,
               'createdAt', c.created_at, 'editedAt', c.edited_at
             ) order by c.created_at)
             from public.community_comments c join public.profiles ca on ca.id = c.author_id
             where c.post_id = p.id
           ), '[]') as comments
    from public.community_posts p
    join public.profiles a on a.id = p.author_id
    where (${before}::timestamptz is null or p.created_at < ${before})
      and (${postId}::uuid is null or p.id = ${postId})
      and (${like}::text is null
           or p.body ilike ${like}
           or ${sql.unsafe(personName("a"))} ilike ${like}
           or exists (select 1 from public.community_comments c where c.post_id = p.id and c.body ilike ${like}))
    order by p.created_at desc
    limit ${options.limit ?? FEED_PAGE}
  `;
  return rows.map(({ comments, ...row }) => ({ ...row, commentCount: comments.length, comments: threads(comments) }));
}

/** Members whose name matches what's typed after "@", for the mention suggestions. Names only. */
export async function findMentionable(sql: Db, query: string, limit = 6): Promise<(Mention & { avatarKey: string | null })[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];
  const startsWord = `(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  return sql<(Mention & { avatarKey: string | null })[]>`
    select p.id, trim(concat_ws(' ', p.first_name, p.last_name)) as name, p.avatar_key as "avatarKey"
    from public.profiles p
    where ${sql.unsafe(isCurrentMember("p"))}
      and nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') is not null
      and trim(concat_ws(' ', p.first_name, p.last_name)) ~* ${startsWord}
    order by lower(p.first_name), lower(p.last_name)
    limit ${limit}
  `;
}

/**
 * The mentions to store with `body`: the members `ids` names, as the database spells them, whose
 * "@Name" is in the text, plus everyone when `allowEveryone` and the text says "@everyone".
 */
export async function resolveMentions(sql: Db, body: string, ids: string[], allowEveryone: boolean): Promise<Mention[]> {
  const wanted = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/.test(id)))].slice(0, 50);
  const people = wanted.length
    ? await sql<Mention[]>`
        select p.id, trim(concat_ws(' ', p.first_name, p.last_name)) as name
        from public.profiles p
        where p.id in ${sql(wanted)} and ${sql.unsafe(isCurrentMember("p"))}
      `
    : [];
  const found = mentionsIn(body, people);
  return allowEveryone && mentionsEveryone(body) ? [{ id: EVERYONE, name: EVERYONE }, ...found] : found;
}

/** The text's mentions, or why it can't be saved: only admins may write @everyone. */
export async function checkMentions(sql: Db, body: string, ids: string[], isAdmin: boolean): Promise<Mention[] | string> {
  if (!isAdmin && mentionsEveryone(body)) return "Only admins can tag @everyone. Remove it, or mention people by name.";
  return resolveMentions(sql, body, ids, isAdmin);
}

/** Whether the person in `alias` holds the Admin role, so their comments say "(admin)". */
export const holdsAdminRole = (alias: string) =>
  `exists (select 1 from public.admin_permissions ap where ap.profile_id = ${alias}.id and ap.permission = 'full')`;

type Kind = "mention" | "everyone" | "comment" | "reply";
const RANK: Record<Kind, number> = { mention: 4, reply: 3, comment: 2, everyone: 1 };

/**
 * Tells each person once about a post or comment, with the most specific reason: named them,
 * replied to them, commented on their post, then @everyone. Never tells the actor. `place` says
 * whether the post is in Community or on Updates.
 */
export async function notify(
  sql: Db,
  event: {
    actorId: string;
    place?: "community" | "updates";
    postId: string;
    commentId: string | null;
    mentions: Mention[];
    also?: { recipientId: string | null; kind: Kind }[];
  },
) {
  const updates = event.place === "updates";
  const target = {
    post_id: updates ? null : event.postId,
    comment_id: updates ? null : event.commentId,
    update_post_id: updates ? event.postId : null,
    update_comment_id: updates ? event.commentId : null,
  };
  const kinds = new Map<string, Kind>();
  const offer = (recipientId: string | null, kind: Kind) => {
    if (!recipientId || recipientId === event.actorId) return;
    const current = kinds.get(recipientId);
    if (!current || RANK[kind] > RANK[current]) kinds.set(recipientId, kind);
  };
  for (const m of event.mentions) if (m.id !== EVERYONE) offer(m.id, "mention");
  for (const a of event.also ?? []) offer(a.recipientId, a.kind);

  if (kinds.size) {
    await sql`
      insert into public.notifications ${sql(
        [...kinds].map(([recipient_id, kind]) => ({ recipient_id, actor_id: event.actorId, kind, ...target })),
      )}
    `;
  }
  if (event.mentions.some((m) => m.id === EVERYONE)) {
    const told = [...kinds.keys(), event.actorId];
    await sql`
      insert into public.notifications (recipient_id, actor_id, kind, post_id, comment_id, update_post_id, update_comment_id)
      select p.id, ${event.actorId}, 'everyone', ${target.post_id}, ${target.comment_id}, ${target.update_post_id}, ${target.update_comment_id}
      from public.profiles p
      where ${sql.unsafe(isCurrentMember("p"))} and p.id not in ${sql(told)}
    `;
  }
}

export async function createCommunityPost(
  sql: Db,
  args: { authorId: string; body: string; imageKey: string | null; mentions?: Mention[] },
): Promise<string> {
  const mentions = args.mentions ?? [];
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.community_posts (author_id, body, image_key, mentions)
      values (${args.authorId}, ${args.body}, ${args.imageKey}, ${tx.json(mentions)})
      returning id
    `;
    await notify(tx as unknown as Db, { actorId: args.authorId, postId: row!.id, commentId: null, mentions });
    return row!.id;
  }) as Promise<string>;
}

/** Mentions in `next` that weren't in `previous`, so an edit tells only the newly named. */
const added = (previous: Mention[], next: Mention[]) => next.filter((m) => !previous.some((p) => p.id === m.id));

/** Changes the member's own post. Returns false for a post that isn't theirs. */
export async function editCommunityPost(sql: Db, args: { postId: string; userId: string; body: string; mentions?: Mention[] }): Promise<boolean> {
  const mentions = args.mentions ?? [];
  return sql.begin(async (tx) => {
    const [current] = await tx<{ body: string; mentions: Mention[] }[]>`
      select body, mentions from public.community_posts where id = ${args.postId} and author_id = ${args.userId} for update
    `;
    if (!current) return false;
    if (current.body === args.body) return true;
    await tx`update public.community_posts set body = ${args.body}, mentions = ${tx.json(mentions)}, edited_at = now() where id = ${args.postId}`;
    await notify(tx as unknown as Db, { actorId: args.userId, postId: args.postId, commentId: null, mentions: added(current.mentions, mentions) });
    return true;
  }) as Promise<boolean>;
}

/** Deletes a post: the member's own, or anyone's when `moderator`. */
export async function deleteCommunityPost(sql: Db, args: { postId: string; userId: string; moderator: boolean }): Promise<boolean> {
  const rows = await sql`
    delete from public.community_posts where id = ${args.postId} and (${args.moderator} or author_id = ${args.userId}) returning id
  `;
  return rows.length > 0;
}

export async function setCommunityLike(sql: Db, args: { postId: string; userId: string; liked: boolean }) {
  if (args.liked) {
    await sql`
      insert into public.community_post_likes (post_id, profile_id)
      select id, ${args.userId} from public.community_posts where id = ${args.postId}
      on conflict do nothing
    `;
  } else {
    await sql`delete from public.community_post_likes where post_id = ${args.postId} and profile_id = ${args.userId}`;
  }
}

/**
 * Adds the member's comment, or with `parentId` a reply. A reply to a reply joins the same
 * thread, one level deep. A comment tells the post's author, a reply only the member answered, and both anyone named.
 * Returns the new comment's id, or null when the post or comment isn't there.
 */
export async function addCommunityComment(
  sql: Db,
  args: { postId: string; userId: string; body: string; parentId?: string | null; mentions?: Mention[] },
): Promise<string | null> {
  const mentions = args.mentions ?? [];
  return sql.begin(async (tx) => {
    const [post] = await tx<{ authorId: string }[]>`select author_id as "authorId" from public.community_posts where id = ${args.postId}`;
    if (!post) return null;
    let parent: { id: string; authorId: string } | undefined;
    if (args.parentId) {
      [parent] = await tx<{ id: string; authorId: string }[]>`
        select coalesce(parent_id, id) as id, author_id as "authorId"
        from public.community_comments where id = ${args.parentId} and post_id = ${args.postId}
      `;
      if (!parent) return null;
    }
    const [row] = await tx<{ id: string }[]>`
      insert into public.community_comments (post_id, author_id, body, parent_id, mentions)
      values (${args.postId}, ${args.userId}, ${args.body}, ${parent?.id ?? null}, ${tx.json(mentions)})
      returning id
    `;
    await notify(tx as unknown as Db, {
      actorId: args.userId,
      postId: args.postId,
      commentId: row!.id,
      mentions,
      // As on Facebook: a comment tells the post's author; a reply tells only the person answered.
      also: [parent ? { recipientId: parent.authorId, kind: "reply" } : { recipientId: post.authorId, kind: "comment" }],
    });
    return row!.id;
  }) as Promise<string | null>;
}

export async function editCommunityComment(sql: Db, args: { commentId: string; userId: string; body: string; mentions?: Mention[] }): Promise<boolean> {
  const mentions = args.mentions ?? [];
  return sql.begin(async (tx) => {
    const [current] = await tx<{ body: string; mentions: Mention[]; postId: string }[]>`
      select body, mentions, post_id as "postId" from public.community_comments
      where id = ${args.commentId} and author_id = ${args.userId} for update
    `;
    if (!current) return false;
    if (current.body === args.body) return true;
    await tx`update public.community_comments set body = ${args.body}, mentions = ${tx.json(mentions)}, edited_at = now() where id = ${args.commentId}`;
    await notify(tx as unknown as Db, { actorId: args.userId, postId: current.postId, commentId: args.commentId, mentions: added(current.mentions, mentions) });
    return true;
  }) as Promise<boolean>;
}

/** Deletes a comment and its replies: the member's own, or anyone's when `moderator`. */
export async function deleteCommunityComment(sql: Db, args: { commentId: string; userId: string; moderator: boolean }): Promise<boolean> {
  const rows = await sql`
    delete from public.community_comments where id = ${args.commentId} and (${args.moderator} or author_id = ${args.userId}) returning id
  `;
  return rows.length > 0;
}

export type Notification = {
  id: number;
  kind: Kind;
  /** Community, the members' group, or Updates, the Organizing Team's news. */
  place: "community" | "updates";
  actorId: string | null;
  actorName: string;
  actorAvatarKey: string | null;
  postId: string | null;
  commentId: string | null;
  /** The start of the comment, or of the post when there's no comment. */
  excerpt: string;
  createdAt: Date;
  read: boolean;
};

/** The member's latest notifications, newest first. */
export async function listNotifications(sql: Db, userId: string, limit = 50): Promise<Notification[]> {
  return sql<Notification[]>`
    select n.id::int as id, n.kind,
           case when n.update_post_id is not null then 'updates' else 'community' end as place,
           n.actor_id as "actorId", ${sql.unsafe(personName("a"))} as "actorName", a.avatar_key as "actorAvatarKey",
           coalesce(n.post_id, n.update_post_id) as "postId", coalesce(n.comment_id, n.update_comment_id) as "commentId",
           left(coalesce(c.body, uc.body, p.body, up.title, ''), 140) as excerpt, n.created_at as "createdAt", n.read_at is not null as read
    from public.notifications n
    left join public.profiles a on a.id = n.actor_id
    left join public.community_posts p on p.id = n.post_id
    left join public.community_comments c on c.id = n.comment_id
    left join public.update_posts up on up.id = n.update_post_id
    left join public.update_comments uc on uc.id = n.update_comment_id
    where n.recipient_id = ${userId}
    order by n.created_at desc
    limit ${limit}
  `;
}

export async function countUnreadNotifications(sql: Db, userId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.notifications where recipient_id = ${userId} and read_at is null
  `;
  return row!.count;
}

export async function markNotificationsRead(sql: Db, userId: string): Promise<void> {
  await sql`update public.notifications set read_at = now() where recipient_id = ${userId} and read_at is null`;
}
