import { useEffect, useState } from "react";
import { data, Form, Link, useFetcher } from "react-router";

import { inputClass, primaryButton, secondaryButton } from "~/components/admin-ui";
import { ImageUploadField } from "~/components/image-upload-field";
import { MentionText, MentionTextarea } from "~/components/mention-textarea";
import { Avatar } from "~/components/profile-ui";
import { servicesContext } from "~/context";
import { isUuid } from "~/lib/admin.server";
import { COMMUNITY_POST_MAX, FEED_PAGE } from "~/lib/community";
import {
  addCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  editCommunityComment,
  editCommunityPost,
  listCommunityPosts,
  resolveMentions,
  setCommunityLike,
  type CommentThread,
  type CommunityComment,
  type CommunityPost,
} from "~/lib/community.server";
import { IMAGE_KEY, mediaUrl } from "~/lib/media";
import { mentionsEveryone, type Mention } from "~/lib/mentions";
import { LOGO_SRC } from "~/lib/photos";
import { getOwnProfile } from "~/lib/profiles.server";
import { checkComment } from "~/lib/updates";
import { getViewerZone } from "~/lib/viewer-zone.server";
import type { Route } from "./+types/community";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Community · Members · Limicon" }];
}

/** The members' group: everyone's posts, newest first, searchable, 30 at a time. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 100) || null;
  const postParam = url.searchParams.get("post");
  const postId = isUuid(postParam) ? postParam : null;
  const beforeParam = new Date(url.searchParams.get("before") ?? "");
  const before = Number.isNaN(beforeParam.getTime()) ? null : beforeParam;
  const [posts, me, viewerZone, privileges] = await Promise.all([
    listCommunityPosts(db, userId, { query, before, postId }),
    getOwnProfile(db, userId),
    getViewerZone(db, userId, request.headers.get("Cookie")),
    services.privileges(),
  ]);
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || "You";
  return {
    posts,
    query,
    postId,
    paged: before !== null,
    hasMore: !postId && posts.length === FEED_PAGE,
    zone: viewerZone.zone,
    userId,
    me: { name, avatarKey: me?.avatarKey ?? null },
    isAdmin: privileges.has("admin"),
  };
}

type Outcome = { ok: true; intent: string } | { ok: false; intent: string; problem: string };

const EVERYONE_PROBLEM = "Only admins can tag @everyone. Remove it, or mention people by name.";

/**
 * Members post, comment and reply, mentioning each other, and change or delete their own; admins
 * may delete anything and tag @everyone.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<Outcome> {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const isAdmin = async () => (await services.privileges()).has("admin");
  const mentionIds = form.getAll("mention").map(String);

  /** The text's mentions, or a problem when a member who isn't an admin wrote @everyone. */
  async function mentionsFor(body: string): Promise<Mention[] | string> {
    const admin = await isAdmin();
    if (!admin && mentionsEveryone(body)) return EVERYONE_PROBLEM;
    return resolveMentions(db, body, mentionIds, admin);
  }

  const postBody = () => {
    const body = String(form.get("body") ?? "").trim();
    if (!body) return { problem: intent === "post" ? "Write something to post." : "A post needs some words. To remove it, delete it instead." };
    if ([...body].length > COMMUNITY_POST_MAX) return { problem: `Keep posts to ${COMMUNITY_POST_MAX} characters.` };
    return { body };
  };

  if (intent === "post") {
    const checked = postBody();
    if (!checked.body) return { ok: false, intent, problem: checked.problem! };
    const image = String(form.get("imageKey") ?? "").trim();
    if (image && !IMAGE_KEY.test(image)) return { ok: false, intent, problem: "Upload the photo again." };
    const mentions = await mentionsFor(checked.body);
    if (typeof mentions === "string") return { ok: false, intent, problem: mentions };
    await createCommunityPost(db, { authorId: userId, body: checked.body, imageKey: image || null, mentions });
    return { ok: true, intent };
  }

  const id = form.get("id");
  if (!isUuid(id)) throw data("Not found", { status: 404 });

  switch (intent) {
    case "like":
    case "unlike":
      await setCommunityLike(db, { postId: id, userId, liked: intent === "like" });
      return { ok: true, intent };
    case "edit-post": {
      const checked = postBody();
      if (!checked.body) return { ok: false, intent, problem: checked.problem! };
      const mentions = await mentionsFor(checked.body);
      if (typeof mentions === "string") return { ok: false, intent, problem: mentions };
      await editCommunityPost(db, { postId: id, userId, body: checked.body, mentions });
      return { ok: true, intent };
    }
    case "delete-post":
      await deleteCommunityPost(db, { postId: id, userId, moderator: await isAdmin() });
      return { ok: true, intent };
    case "comment": {
      const checked = checkComment(form.get("body"));
      if (!checked.ok) return { ok: false, intent, problem: checked.problem };
      const mentions = await mentionsFor(checked.body);
      if (typeof mentions === "string") return { ok: false, intent, problem: mentions };
      const parent = form.get("parentId");
      const parentId = isUuid(parent) ? parent : null;
      if (!(await addCommunityComment(db, { postId: id, userId, body: checked.body, parentId, mentions }))) throw data("Not found", { status: 404 });
      return { ok: true, intent };
    }
    case "edit-comment": {
      const checked = checkComment(form.get("body"));
      if (!checked.ok) return { ok: false, intent, problem: checked.problem };
      const mentions = await mentionsFor(checked.body);
      if (typeof mentions === "string") return { ok: false, intent, problem: mentions };
      await editCommunityComment(db, { commentId: id, userId, body: checked.body, mentions });
      return { ok: true, intent };
    }
    case "delete-comment":
      await deleteCommunityComment(db, { commentId: id, userId, moderator: await isAdmin() });
      return { ok: true, intent };
    default:
      throw data("Unknown action", { status: 400 });
  }
}

const card = "rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]";
const small = "rounded px-2 py-1 text-sm font-semibold underline-offset-2 hover:underline disabled:opacity-60";
const problemText = "text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]";

type Me = { name: string; avatarKey: string | null };
type Viewer = { userId: string; me: Me; isAdmin: boolean; zone: string };

function when(value: Date | string, zone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function Community({ loaderData }: Route.ComponentProps) {
  const { posts, query, postId, paged, hasMore, zone, userId, me, isAdmin } = loaderData;
  const viewer: Viewer = { userId, me, isAdmin, zone };
  const oldest = posts.at(-1);

  return (
    <div className="max-w-3xl">
      <header className={`${card} flex flex-wrap items-center gap-4`}>
        <img src={LOGO_SRC} alt="" width={80} height={80} className="size-20 rounded-lg bg-[#0B1417] object-contain" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold">Limicon</h1>
          <p className="mt-1">The Limicon community. Share news, ask questions and meet each other.</p>
        </div>
        <Link to="/members/people" className={primaryButton}>View all members</Link>
      </header>

      <Form method="get" role="search" className="mt-6 flex flex-wrap gap-2">
        <label htmlFor="community-search" className="sr-only">Search posts</label>
        <input id="community-search" name="q" type="search" defaultValue={query ?? ""} placeholder="Search posts and comments"
          className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" className={primaryButton}>Search</button>
      </Form>

      {!query && !postId && !paged && <Composer viewer={viewer} />}

      {(query || postId || paged) && (
        <p className="mt-6" aria-live="polite">
          {query && <>{posts.length === 0 ? "No posts mention" : posts.length === 1 ? "1 post mentions" : posts.length === FEED_PAGE ? `The latest ${FEED_PAGE} posts that mention` : `${posts.length} posts mention`} “{query}”. </>}
          <Link to="/members/community" className="underline">See all posts</Link>
        </p>
      )}

      {posts.length === 0 ? (
        !query && <p className="mt-8">{postId ? "That post isn't here any more." : "No posts yet. Start the conversation!"}</p>
      ) : (
        <div className="mt-6 grid gap-6">
          {posts.map((post) => <Post key={post.id} post={post} viewer={viewer} startOpen={Boolean(postId || query)} />)}
        </div>
      )}

      {hasMore && oldest && (
        <Link to={`?${new URLSearchParams({ ...(query ? { q: query } : {}), before: new Date(oldest.createdAt).toISOString() })}`}
          className={`${secondaryButton} mt-6 inline-block`}>
          Older posts
        </Link>
      )}
    </div>
  );
}

/** Remounts its form after each successful send, so the text box starts empty again. */
function useFreshForm() {
  const fetcher = useFetcher<Outcome>();
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setRound((r) => r + 1);
  }, [fetcher.state, fetcher.data]);
  const problem = fetcher.data && !fetcher.data.ok && fetcher.state === "idle" ? fetcher.data.problem : null;
  return { fetcher, round, problem, busy: fetcher.state !== "idle" };
}

function Composer({ viewer }: { viewer: Viewer }) {
  const { fetcher, round, problem, busy } = useFreshForm();
  return (
    <fetcher.Form key={round} method="post" className={`${card} mt-6 grid gap-3`} aria-label="Write a post">
      <input type="hidden" name="intent" value="post" />
      <div className="flex gap-3">
        <Avatar name={viewer.me.name} avatarKey={viewer.me.avatarKey} className="size-10 text-sm" />
        <MentionTextarea name="body" id="new-post" label="Your post" rows={3} maxLength={COMMUNITY_POST_MAX}
          canMentionEveryone={viewer.isAdmin} className={inputClass}
          placeholder={viewer.isAdmin ? "Share something… Type @ to mention someone, or @everyone" : "Share something… Type @ to mention someone"} />
      </div>
      <details className="pl-13">
        <summary className="cursor-pointer text-sm font-semibold">Add a photo</summary>
        <div className="mt-2">
          <ImageUploadField name="imageKey" initialKey={null} label="Your post's photo" endpoint="/upload/photo"
            uploadLabel="Upload a photo" help="PNG, JPEG, GIF or WebP, up to 5 MB." previewClassName="max-h-64 w-full max-w-md" />
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {problem && <p role="alert" className={problemText}>{problem}</p>}
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Posting…" : "Post"}</button>
      </div>
    </fetcher.Form>
  );
}

function Post({ post, viewer, startOpen }: { post: CommunityPost; viewer: Viewer; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [editing, setEditing] = useState(false);
  const like = useFetcher<Outcome>();
  const remove = useFetcher<Outcome>();
  const edit = useFetcher<Outcome>();
  const mine = post.authorId === viewer.userId;
  const count = post.commentCount;
  const listId = `comments-${post.id}`;
  // Show the like straight away, before the server answers.
  const pendingLike = like.formData?.get("intent");
  const liked = pendingLike ? pendingLike === "like" : post.likedByViewer;
  const likes = post.likes + (liked === post.likedByViewer ? 0 : liked ? 1 : -1);

  useEffect(() => {
    if (edit.state === "idle" && edit.data?.ok) setEditing(false);
  }, [edit.state, edit.data]);

  if (remove.state !== "idle") return null;
  const editProblem = edit.data && !edit.data.ok ? edit.data.problem : null;

  return (
    <article id={`post-${post.id}`} className={card} aria-labelledby={`post-${post.id}-by`}>
      <header className="flex items-start gap-3">
        <Avatar name={post.authorName} avatarKey={post.authorAvatarKey} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <Link id={`post-${post.id}-by`} to={`/members/people/${post.authorId}`} className="font-semibold hover:underline">{post.authorName}</Link>
          <p className="text-sm opacity-75">
            <Link to={`/members/community?post=${post.id}`} className="hover:underline">{when(post.createdAt, viewer.zone)}</Link>
            {post.editedAt && " · edited"}
          </p>
        </div>
        {(mine || viewer.isAdmin) && (
          <div className="flex gap-1">
            {mine && !editing && <button type="button" className={small} onClick={() => setEditing(true)}>Edit</button>}
            <remove.Form method="post" onSubmit={(event) => {
              if (!confirm(mine ? "Delete your post?" : `Delete ${post.authorName}'s post?`)) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="delete-post" />
              <input type="hidden" name="id" value={post.id} />
              <button type="submit" className={`${small} text-[#B3261E] dark:text-[#F2B8B5]`}>Delete</button>
            </remove.Form>
          </div>
        )}
      </header>

      {editing ? (
        <edit.Form method="post" className="mt-3 grid gap-2">
          <input type="hidden" name="intent" value="edit-post" />
          <input type="hidden" name="id" value={post.id} />
          <MentionTextarea name="body" id={`edit-${post.id}`} label="Your post" defaultValue={post.body} initialMentions={post.mentions}
            rows={4} maxLength={COMMUNITY_POST_MAX} canMentionEveryone={viewer.isAdmin} className={inputClass} autoFocus />
          {editProblem && <p role="alert" className={problemText}>{editProblem}</p>}
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={edit.state !== "idle"}>Save</button>
            <button type="button" className={secondaryButton} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </edit.Form>
      ) : (
        <MentionText body={post.body} mentions={post.mentions} className="mt-3 whitespace-pre-line break-words" />
      )}
      {post.imageKey && (
        <img src={mediaUrl(post.imageKey)} alt="" loading="lazy" className="mt-3 max-h-[28rem] w-full rounded border border-[#C9DADC] object-contain dark:border-[#24363B]" />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#C9DADC] pt-3 dark:border-[#24363B]">
        <like.Form method="post">
          <input type="hidden" name="intent" value={liked ? "unlike" : "like"} />
          <input type="hidden" name="id" value={post.id} />
          <button type="submit" aria-pressed={liked} className={`${small} ${liked ? "text-[#1F6F86] dark:text-[#8CC7D3]" : ""}`}>
            {liked ? "♥ Liked" : "♡ Like"}{likes > 0 && ` · ${likes}`}
          </button>
        </like.Form>
        <button type="button" className={small} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
          {count === 0 ? "Comment" : open ? `Hide comments (${count})` : `View comments (${count})`}
        </button>
      </div>

      {open && (
        <div id={listId} className="mt-3">
          {post.comments.length > 0 && (
            <ul className="grid gap-3">
              {post.comments.map((thread) => <Thread key={thread.id} postId={post.id} thread={thread} viewer={viewer} />)}
            </ul>
          )}
          <CommentBox postId={post.id} viewer={viewer} />
        </div>
      )}
    </article>
  );
}

/** A top-level comment, its replies, and a reply box once someone presses Reply. */
function Thread({ postId, thread, viewer }: { postId: string; thread: CommentThread; viewer: Viewer }) {
  const [replyTo, setReplyTo] = useState<{ to: CommunityComment; round: number } | null>(null);
  const reply = (to: CommunityComment) => setReplyTo((current) => ({ to, round: (current?.round ?? 0) + 1 }));

  return (
    <li>
      <Comment comment={thread} viewer={viewer} onReply={() => reply(thread)} />
      {(thread.replies.length > 0 || replyTo) && (
        <ul className="mt-2 ml-10 grid gap-2" aria-label={`Replies to ${thread.authorName}`}>
          {thread.replies.map((r) => (
            <li key={r.id}><Comment comment={r} viewer={viewer} onReply={() => reply(r)} /></li>
          ))}
          {replyTo && (
            <li>
              <CommentBox
                key={replyTo.round}
                postId={postId}
                viewer={viewer}
                parent={{ id: thread.id, author: replyTo.to }}
                onSent={() => setReplyTo(null)}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/**
 * Writes a comment, or with `parent` a reply that starts by mentioning the person replied to, as
 * Facebook does.
 */
function CommentBox({ postId, viewer, parent, onSent }: {
  postId: string;
  viewer: Viewer;
  parent?: { id: string; author: CommunityComment };
  onSent?: () => void;
}) {
  const { fetcher, round, problem, busy } = useFreshForm();
  useEffect(() => {
    if (round > 0) onSent?.();
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const tagged = parent && parent.author.authorId !== viewer.userId ? { id: parent.author.authorId, name: parent.author.authorName } : null;
  const id = parent ? `reply-${parent.author.id}` : `comment-${postId}`;
  return (
    <fetcher.Form key={round} method="post" className="mt-3 flex items-start gap-2">
      <input type="hidden" name="intent" value="comment" />
      <input type="hidden" name="id" value={postId} />
      {parent && <input type="hidden" name="parentId" value={parent.id} />}
      <Avatar name={viewer.me.name} avatarKey={viewer.me.avatarKey} className="size-8 text-xs" />
      <div className="min-w-0 flex-1">
        <MentionTextarea
          name="body"
          id={id}
          label={parent ? `Reply to ${parent.author.authorName}` : "Write a comment"}
          rows={1}
          submitOnEnter
          defaultValue={tagged ? `@${tagged.name} ` : ""}
          initialMentions={tagged ? [tagged] : []}
          autoFocus={Boolean(parent)}
          canMentionEveryone={viewer.isAdmin}
          placeholder={parent ? "Write a reply…" : "Write a comment…"}
          className={`${inputClass} resize-none`}
        />
        {problem && <p role="alert" className={`mt-1 ${problemText}`}>{problem}</p>}
      </div>
      <button type="submit" className={secondaryButton} disabled={busy}>{parent ? "Reply" : "Comment"}</button>
    </fetcher.Form>
  );
}

function Comment({ comment, viewer, onReply }: { comment: CommunityComment; viewer: Viewer; onReply: () => void }) {
  const [editing, setEditing] = useState(false);
  const edit = useFetcher<Outcome>();
  const remove = useFetcher<Outcome>();
  const mine = comment.authorId === viewer.userId;
  useEffect(() => {
    if (edit.state === "idle" && edit.data?.ok) setEditing(false);
  }, [edit.state, edit.data]);
  if (remove.state !== "idle") return null;
  const problem = edit.data && !edit.data.ok ? edit.data.problem : null;

  return (
    <div id={`comment-${comment.id}`} className="flex gap-2">
      <Avatar name={comment.authorName} avatarKey={comment.authorAvatarKey} className="size-8 text-xs" />
      <div className="min-w-0 flex-1">
        <div className="rounded bg-[#F4F7F7] px-3 py-2 dark:bg-[#0F1C1E]">
          <p className="text-sm">
            <Link to={`/members/people/${comment.authorId}`} className="font-semibold hover:underline">{comment.authorName}</Link>
            <span className="opacity-75"> · {when(comment.createdAt, viewer.zone)}{comment.editedAt && " · edited"}</span>
          </p>
          {editing ? (
            <edit.Form method="post" className="mt-2 grid gap-2">
              <input type="hidden" name="intent" value="edit-comment" />
              <input type="hidden" name="id" value={comment.id} />
              <MentionTextarea name="body" id={`edit-comment-${comment.id}`} label="Your comment" defaultValue={comment.body}
                initialMentions={comment.mentions} rows={2} canMentionEveryone={viewer.isAdmin} className={inputClass} autoFocus />
              {problem && <p role="alert" className={problemText}>{problem}</p>}
              <div className="flex gap-2">
                <button type="submit" className={small}>Save</button>
                <button type="button" className={small} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </edit.Form>
          ) : (
            <MentionText body={comment.body} mentions={comment.mentions} className="whitespace-pre-line break-words" />
          )}
        </div>
        {!editing && (
          <div className="mt-0.5 flex gap-1">
            <button type="button" className={small} onClick={onReply}>Reply</button>
            {mine && <button type="button" className={small} onClick={() => setEditing(true)}>Edit</button>}
            {(mine || viewer.isAdmin) && (
              <remove.Form method="post" onSubmit={(event) => {
                if (!confirm(mine ? "Delete your comment?" : `Delete ${comment.authorName}'s comment?`)) event.preventDefault();
              }}>
                <input type="hidden" name="intent" value="delete-comment" />
                <input type="hidden" name="id" value={comment.id} />
                <button type="submit" className={`${small} text-[#B3261E] dark:text-[#F2B8B5]`}>Delete</button>
              </remove.Form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
