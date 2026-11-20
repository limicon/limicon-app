/**
 * Data access for the Updates page (docs/feature-updates.md). Callers check the viewer may post
 * (the `updates` privilege) or moderate (`admin`); functions that act on a member's own likes and
 * comments take that member's id and touch only their rows.
 */
import { holdsAdminRole, notify } from "~/lib/community.server";
import type { Db } from "~/lib/db.server";
import type { Mention } from "~/lib/mentions";
import type { RichDoc } from "~/lib/rich-text";

export type UpdateComment = {
  id: string;
  /** The top-level comment a reply answers, or null for a top-level comment. */
  parentId: string | null;
  authorId: string;
  authorName: string;
  /** Holds the Admin role, so the comment says "(admin)" beside the name. */
  authorIsAdmin: boolean;
  body: string;
  mentions: Mention[];
  createdAt: Date;
  editedAt: Date | null;
};

export type UpdatePost = {
  id: string;
  authorId: string | null;
  authorName: string;
  title: string;
  body: RichDoc;
  createdAt: Date;
  editedAt: Date | null;
  likes: number;
  likedByViewer: boolean;
  comments: UpdateComment[];
};

const personName = (alias: string, fallback: string) =>
  `coalesce(nullif(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), ''), '${fallback}')`;

/** Every post, newest first, with its likes and comments (oldest comment first). */
export async function listPosts(sql: Db, viewerId: string): Promise<UpdatePost[]> {
  const rows = await sql<(Omit<UpdatePost, "comments"> & { comments: (Omit<UpdateComment, "createdAt" | "editedAt"> & { createdAt: string; editedAt: string | null })[] })[]>`
    select p.id, p.author_id as "authorId", ${sql.unsafe(personName("a", "The Organizing Team"))} as "authorName",
           p.title, p.body, p.created_at as "createdAt", p.edited_at as "editedAt",
           (select count(*) from public.update_post_likes l where l.post_id = p.id)::int as likes,
           exists (select 1 from public.update_post_likes l where l.post_id = p.id and l.profile_id = ${viewerId}) as "likedByViewer",
           coalesce((
             select json_agg(json_build_object(
               'id', c.id, 'parentId', c.parent_id, 'authorId', c.author_id, 'authorName', ${sql.unsafe(personName("ca", "A member"))},
               'authorIsAdmin', ${sql.unsafe(holdsAdminRole("ca"))}, 'mentions', c.mentions,
               'body', c.body, 'createdAt', c.created_at, 'editedAt', c.edited_at
             ) order by c.created_at)
             from public.update_comments c left join public.profiles ca on ca.id = c.author_id
             where c.post_id = p.id
           ), '[]') as comments
    from public.update_posts p
    left join public.profiles a on a.id = p.author_id
    order by p.created_at desc
  `;
  return rows.map((row) => ({
    ...row,
    comments: row.comments.map((c) => ({ ...c, createdAt: new Date(c.createdAt), editedAt: c.editedAt ? new Date(c.editedAt) : null })),
  }));
}

export async function getPost(sql: Db, postId: string): Promise<{ id: string; authorId: string | null; title: string; body: RichDoc } | null> {
  const [row] = await sql<{ id: string; authorId: string | null; title: string; body: RichDoc }[]>`
    select id, author_id as "authorId", title, body from public.update_posts where id = ${postId}
  `;
  return row ?? null;
}

export async function createPost(sql: Db, args: { authorId: string; title: string; body: RichDoc; template: string | null }): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.update_posts (author_id, title, body, template)
    values (${args.authorId}, ${args.title}, ${sql.json(args.body as never)}, ${args.template})
    returning id
  `;
  return row!.id;
}

/** Changes a post's title and body. Returns false when there's no such post. */
export async function updatePost(sql: Db, postId: string, args: { title: string; body: RichDoc }): Promise<boolean> {
  const rows = await sql`
    update public.update_posts set title = ${args.title}, body = ${sql.json(args.body as never)}, edited_at = now()
    where id = ${postId}
    returning id
  `;
  return rows.length > 0;
}

export async function deletePost(sql: Db, postId: string): Promise<boolean> {
  return (await sql`delete from public.update_posts where id = ${postId} returning id`).length > 0;
}

/** Likes or unlikes a post for the member. */
export async function setLike(sql: Db, args: { postId: string; userId: string; liked: boolean }) {
  if (args.liked) {
    await sql`
      insert into public.update_post_likes (post_id, profile_id)
      select id, ${args.userId} from public.update_posts where id = ${args.postId}
      on conflict do nothing
    `;
  } else {
    await sql`delete from public.update_post_likes where post_id = ${args.postId} and profile_id = ${args.userId}`;
  }
}

/**
 * Adds the member's comment to a post, or with `parentId` a reply, which joins that comment's
 * thread one level deep. A comment tells the post's author, a reply only the member answered. Returns false when there's
 * no such post or comment.
 */
export async function addComment(
  sql: Db,
  args: { postId: string; userId: string; body: string; parentId?: string | null; mentions?: Mention[] },
): Promise<boolean> {
  const mentions = args.mentions ?? [];
  return sql.begin(async (tx) => {
    const db = tx as unknown as Db;
    let parent: { id: string; authorId: string } | undefined;
    if (args.parentId) {
      [parent] = await tx<{ id: string; authorId: string }[]>`
        select coalesce(parent_id, id) as id, author_id as "authorId"
        from public.update_comments where id = ${args.parentId} and post_id = ${args.postId}
      `;
      if (!parent) return false;
    }
    const [row] = await tx<{ id: string; postAuthorId: string | null }[]>`
      insert into public.update_comments (post_id, author_id, body, parent_id, mentions)
      select id, ${args.userId}, ${args.body}, ${parent?.id ?? null}, ${tx.json(mentions)} from public.update_posts where id = ${args.postId}
      returning id, (select author_id from public.update_posts where id = ${args.postId}) as "postAuthorId"
    `;
    if (!row) return false;
    await notify(db, {
      actorId: args.userId,
      place: "updates",
      postId: args.postId,
      commentId: row.id,
      mentions,
      // As on Facebook: a comment tells the post's author; a reply tells only the person answered.
      also: [parent ? { recipientId: parent.authorId, kind: "reply" } : { recipientId: row.postAuthorId, kind: "comment" }],
    });
    return true;
  }) as Promise<boolean>;
}

/**
 * Changes the member's own comment, recording the text before and after so the team is told.
 * Returns "not-found" for a comment that isn't theirs.
 */
export async function editComment(
  sql: Db,
  args: { commentId: string; userId: string; body: string; mentions?: Mention[] },
): Promise<"saved" | "unchanged" | "not-found"> {
  const mentions = args.mentions ?? [];
  return sql.begin(async (tx) => {
    const [current] = await tx<{ body: string; mentions: Mention[]; postId: string }[]>`
      select body, mentions, post_id as "postId" from public.update_comments
      where id = ${args.commentId} and author_id = ${args.userId} for update
    `;
    if (!current) return "not-found" as const;
    if (current.body === args.body) return "unchanged" as const;
    await tx`update public.update_comments set body = ${args.body}, mentions = ${tx.json(mentions)}, edited_at = now() where id = ${args.commentId}`;
    await tx`
      insert into public.update_comment_edits (comment_id, previous_body, new_body)
      values (${args.commentId}, ${current.body}, ${args.body})
    `;
    // Only people newly named hear about an edit.
    const added = mentions.filter((m) => !current.mentions.some((p) => p.id === m.id));
    await notify(tx as unknown as Db, { actorId: args.userId, place: "updates", postId: current.postId, commentId: args.commentId, mentions: added });
    return "saved" as const;
  }) as Promise<"saved" | "unchanged" | "not-found">;
}

/** Deletes a comment: the member's own, or anyone's when `moderator`. */
export async function deleteComment(sql: Db, args: { commentId: string; userId: string; moderator: boolean }): Promise<boolean> {
  const rows = await sql`
    delete from public.update_comments
    where id = ${args.commentId} and (${args.moderator} or author_id = ${args.userId})
    returning id
  `;
  return rows.length > 0;
}

/**
 * How many posts the member hasn't seen: those others posted since they last opened Updates, or
 * every post by others if they never have.
 */
export async function countUnseenPosts(sql: Db, userId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from public.update_posts p
    where p.author_id is distinct from ${userId}
      and p.created_at > coalesce((select seen_at from public.update_last_seen where profile_id = ${userId}), '-infinity')
  `;
  return row!.count;
}

/** Records that the member has just opened Updates. */
export async function markUpdatesSeen(sql: Db, userId: string) {
  await sql`
    insert into public.update_last_seen (profile_id, seen_at) values (${userId}, now())
    on conflict (profile_id) do update set seen_at = excluded.seen_at
  `;
}

export type CommentEdit = {
  id: number;
  commentId: string;
  postId: string;
  postTitle: string;
  authorName: string;
  previousBody: string;
  newBody: string;
  editedAt: Date;
};

/** Comment edits nobody on the team has marked reviewed yet, oldest first. */
export async function listUnreviewedEdits(sql: Db): Promise<CommentEdit[]> {
  const rows = await sql<(Omit<CommentEdit, "id"> & { id: string })[]>`
    select e.id, e.comment_id as "commentId", p.id as "postId", p.title as "postTitle",
           ${sql.unsafe(personName("a", "A member"))} as "authorName",
           e.previous_body as "previousBody", e.new_body as "newBody", e.edited_at as "editedAt"
    from public.update_comment_edits e
    join public.update_comments c on c.id = e.comment_id
    join public.update_posts p on p.id = c.post_id
    left join public.profiles a on a.id = c.author_id
    where e.reviewed_at is null
    order by e.edited_at
  `;
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/** Marks comment edits reviewed by `by`, so they leave the list. */
export async function markEditsReviewed(sql: Db, ids: number[], by: string) {
  if (!ids.length) return;
  await sql`
    update public.update_comment_edits set reviewed_at = now(), reviewed_by = ${by}
    where id = any(${ids}::bigint[]) and reviewed_at is null
  `;
}
