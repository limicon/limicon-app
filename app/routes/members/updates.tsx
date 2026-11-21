import { useEffect, useState } from "react";
import { data, Link, useFetcher, useLocation } from "react-router";

import { MentionText, MentionTextarea } from "~/components/mention-textarea";
import { AdminTag } from "~/components/profile-ui";
import { RichText } from "~/components/rich-text";
import { servicesContext } from "~/context";
import { isUuid } from "~/lib/admin.server";
import { checkMentions } from "~/lib/community.server";
import { checkComment, COMMENT_MAX } from "~/lib/updates";
import {
  addComment,
  deleteComment,
  deletePost,
  editComment,
  listPosts,
  listUnreviewedEdits,
  markEditsReviewed,
  setLike,
  type CommentEdit,
  type UpdateComment,
  type UpdatePost,
} from "~/lib/updates.server";
import { getViewerZone } from "~/lib/viewer-zone.server";
import type { Route } from "./+types/updates";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Updates · Members · Limicon" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const privileges = await services.privileges();
  const canPost = privileges.has("updates");
  const [posts, viewerZone, edits] = await Promise.all([
    listPosts(db, userId),
    getViewerZone(db, userId, request.headers.get("Cookie")),
    canPost ? listUnreviewedEdits(db) : Promise.resolve([] as CommentEdit[]),
  ]);
  return { posts, zone: viewerZone.zone, userId, canPost, isAdmin: privileges.has("admin"), edits };
}

type Outcome = { ok: true; intent: string } | { ok: false; intent: string; problem: string };

/** Likes, comments and their edits for any member; deleting posts and others' comments for admins. */
export async function action({ request, context }: Route.ActionArgs): Promise<Outcome> {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = form.get("id");

  if (intent === "review-edits") {
    if (!(await services.privileges()).has("updates")) throw data("Not allowed", { status: 403 });
    const ids = form.getAll("editId").map(Number).filter(Number.isSafeInteger);
    await markEditsReviewed(db, ids, userId);
    return { ok: true, intent };
  }

  if (!isUuid(id)) throw data("Not found", { status: 404 });

  switch (intent) {
    case "like":
    case "unlike":
      await setLike(db, { postId: id, userId, liked: intent === "like" });
      return { ok: true, intent };
    case "comment": {
      const checked = checkComment(form.get("body"));
      if (!checked.ok) return { ok: false, intent, problem: checked.problem };
      const mentions = await checkMentions(db, checked.body, form.getAll("mention").map(String), (await services.privileges()).has("admin"));
      if (typeof mentions === "string") return { ok: false, intent, problem: mentions };
      const parent = form.get("parentId");
      const parentId = isUuid(parent) ? parent : null;
      if (!(await addComment(db, { postId: id, userId, body: checked.body, parentId, mentions }))) throw data("Not found", { status: 404 });
      return { ok: true, intent };
    }
    case "edit-comment": {
      const checked = checkComment(form.get("body"));
      if (!checked.ok) return { ok: false, intent, problem: checked.problem };
      const mentions = await checkMentions(db, checked.body, form.getAll("mention").map(String), (await services.privileges()).has("admin"));
      if (typeof mentions === "string") return { ok: false, intent, problem: mentions };
      if ((await editComment(db, { commentId: id, userId, body: checked.body, mentions })) === "not-found") throw data("Not found", { status: 404 });
      return { ok: true, intent };
    }
    case "delete-comment": {
      const moderator = (await services.privileges()).has("admin");
      await deleteComment(db, { commentId: id, userId, moderator });
      return { ok: true, intent };
    }
    case "delete-post":
      if (!(await services.privileges()).has("admin")) throw data("Only admins can delete posts.", { status: 403 });
      await deletePost(db, id);
      return { ok: true, intent };
    default:
      throw data("Unknown action", { status: 400 });
  }
}

const card = "rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]";
const primary = "rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] disabled:opacity-60 dark:bg-[#F3E6D7] dark:text-[#15383F]";
const small = "rounded px-2 py-1 text-sm font-semibold underline-offset-2 hover:underline disabled:opacity-60";
const field = "w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E]";

function when(value: Date | string, zone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/** News from the Organizing Team, newest first. Members like and comment; posters add posts. */
export default function Updates({ loaderData }: Route.ComponentProps) {
  const { posts, zone, userId, canPost, isAdmin, edits } = loaderData;
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Updates</h1>
        {canPost && (
          <Link to="/members/updates/new" className={primary}>
            + Add new post
          </Link>
        )}
      </div>
      <p className="mt-2">News and announcements from the Organizing Team.</p>

      {canPost && edits.length > 0 && <EditedComments edits={edits} zone={zone} />}

      {posts.length === 0 ? (
        <p className="mt-8">No updates yet. Check back soon.</p>
      ) : (
        <div className="mt-8 grid gap-6">
          {posts.map((post) => (
            <Post
              key={post.id}
              post={post}
              zone={zone}
              userId={userId}
              canEdit={isAdmin || (canPost && post.authorId === userId)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Post({ post, zone, userId, canEdit, isAdmin }: { post: UpdatePost; zone: string; userId: string; canEdit: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  // A notification links to #comment-<id>: open that post's comments and bring the comment into view.
  const location = useLocation();
  useEffect(() => {
    const target = location.hash.replace(/^#comment-/, "");
    if (!target || !post.comments.some((c) => c.id === target)) return;
    setOpen(true);
    requestAnimationFrame(() => document.getElementById(`comment-${target}`)?.scrollIntoView({ block: "center" }));
  }, [location.hash, post.comments]);
  const remove = useFetcher<Outcome>();
  const count = post.comments.length;
  const listId = `comments-${post.id}`;
  return (
    <article className={card} aria-labelledby={`post-${post.id}`}>
      <header>
        <h2 id={`post-${post.id}`} className="text-2xl font-semibold">{post.title}</h2>
        <p className="mt-1 text-sm opacity-80">
          {post.authorId ? <Link to={`/members/people/${post.authorId}`} className="hover:underline">{post.authorName}</Link> : post.authorName} · {when(post.createdAt, zone)}
          {post.editedAt && " · edited"}
        </p>
        {(canEdit || isAdmin) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {canEdit && <Link to={`/members/updates/${post.id}/edit`} className={small}>Edit</Link>}
            {isAdmin && (
              <remove.Form
                method="post"
                onSubmit={(event) => {
                  if (!confirm(`Delete "${post.title}" and its comments? This can't be undone.`)) event.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={post.id} />
                <button type="submit" name="intent" value="delete-post" className={`${small} text-[#B3261E] dark:text-[#F2B8B5]`}>
                  Delete
                </button>
              </remove.Form>
            )}
          </div>
        )}
      </header>

      <RichText doc={post.body} className="mt-4" />

      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[#C9DADC] pt-3 dark:border-[#24363B]">
        <LikeButton post={post} />
        {count > 0 && (
          <button type="button" className={small} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
            {open ? "Hide comments" : `View comments (${count})`}
          </button>
        )}
      </div>

      {open && count > 0 && (
        <ul id={listId} className="mt-3 grid gap-3">
          {post.comments.filter((c) => !c.parentId).map((thread) => (
            <Thread
              key={thread.id}
              postId={post.id}
              thread={thread}
              replies={post.comments.filter((c) => c.parentId === thread.id)}
              zone={zone}
              userId={userId}
              isAdmin={isAdmin}
            />
          ))}
        </ul>
      )}

      <CommentBox postId={post.id} label={`Comment on ${post.title}`} isAdmin={isAdmin} onPosted={() => setOpen(true)} />
    </article>
  );
}

/** A top-level comment, its replies, and a reply box once someone presses Reply. */
function Thread({ postId, thread, replies, zone, userId, isAdmin }: {
  postId: string; thread: UpdateComment; replies: UpdateComment[]; zone: string; userId: string; isAdmin: boolean;
}) {
  const [replyTo, setReplyTo] = useState<{ to: UpdateComment; round: number } | null>(null);
  const reply = (to: UpdateComment) => setReplyTo((current) => ({ to, round: (current?.round ?? 0) + 1 }));
  const tagged = replyTo && replyTo.to.authorId !== userId ? { id: replyTo.to.authorId, name: replyTo.to.authorName } : null;
  return (
    <li>
      <Comment comment={thread} zone={zone} mine={thread.authorId === userId} isAdmin={isAdmin} onReply={() => reply(thread)} />
      {(replies.length > 0 || replyTo) && (
        <ul className="mt-2 ml-8 grid gap-2" aria-label={`Replies to ${thread.authorName}`}>
          {replies.map((r) => (
            <li key={r.id}><Comment comment={r} zone={zone} mine={r.authorId === userId} isAdmin={isAdmin} onReply={() => reply(r)} /></li>
          ))}
          {replyTo && (
            <li>
              <CommentBox
                key={replyTo.round}
                postId={postId}
                parentId={thread.id}
                label={`Reply to ${replyTo.to.authorName}`}
                isAdmin={isAdmin}
                tagged={tagged}
                onPosted={() => setReplyTo(null)}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function LikeButton({ post }: { post: UpdatePost }) {
  const fetcher = useFetcher<Outcome>();
  const pending = fetcher.formData?.get("intent");
  const liked = pending ? pending === "like" : post.likedByViewer;
  const likes = post.likes + (liked === post.likedByViewer ? 0 : liked ? 1 : -1);
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="id" value={post.id} />
      <button
        type="submit"
        name="intent"
        value={liked ? "unlike" : "like"}
        aria-pressed={liked}
        aria-label={`${liked ? "Unlike" : "Like"} ${post.title}`}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${
          liked ? "border-[#B3261E] bg-[#FCEDEC] text-[#8C1D18] dark:bg-[#3A1513] dark:text-[#F2B8B5]" : "border-[#9DB5B9] dark:border-[#3A5359]"
        }`}
      >
        <span aria-hidden="true">{liked ? "♥" : "♡"}</span> {liked ? "Liked" : "Like"}
        {likes > 0 && ` · ${likes}`}
      </button>
    </fetcher.Form>
  );
}

/**
 * The small box under each post, so commenting takes one step; with `parentId`, a reply that
 * starts by mentioning `tagged`, the person answered. Enter posts; Shift+Enter starts a new line.
 */
function CommentBox({ postId, parentId, label, isAdmin, tagged, onPosted }: {
  postId: string;
  parentId?: string;
  label: string;
  isAdmin: boolean;
  tagged?: { id: string; name: string } | null;
  onPosted: () => void;
}) {
  const fetcher = useFetcher<Outcome>();
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "comment") {
      setRound((r) => r + 1);
      onPosted();
    }
    // Runs once each time a comment finishes posting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const problem = fetcher.data && !fetcher.data.ok ? fetcher.data.problem : null;
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form key={round} method="post" className={parentId ? "mt-1" : "mt-4"}>
      <input type="hidden" name="intent" value="comment" />
      <input type="hidden" name="id" value={postId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <div className="flex items-start gap-2">
        <MentionTextarea
          name="body"
          id={parentId ? `reply-${parentId}` : `comment-${postId}`}
          label={label}
          rows={1}
          maxLength={COMMENT_MAX}
          submitOnEnter
          defaultValue={tagged ? `@${tagged.name} ` : ""}
          initialMentions={tagged ? [tagged] : []}
          autoFocus={Boolean(parentId)}
          canMentionEveryone={isAdmin}
          placeholder={parentId ? "Write a reply…" : "Write a comment…"}
          className={`${field} min-h-10 resize-y`}
        />
        <button type="submit" disabled={busy} className={`${primary} py-2 whitespace-nowrap`}>
          {busy ? "Posting…" : parentId ? "Reply" : "Comment"}
        </button>
      </div>
      {problem && <p className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>}
    </fetcher.Form>
  );
}

function Comment({ comment, zone, mine, isAdmin, onReply }: {
  comment: UpdateComment; zone: string; mine: boolean; isAdmin: boolean; onReply: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher<Outcome>();
  const remove = useFetcher<Outcome>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setEditing(false);
  }, [fetcher.state, fetcher.data]);
  if (remove.state !== "idle") return null;
  const problem = fetcher.data && !fetcher.data.ok ? fetcher.data.problem : null;
  return (
    <div id={`comment-${comment.id}`} className="rounded bg-[#F4F7F7] px-3 py-2 dark:bg-[#0F1C1E]">
      <p className="text-sm">
        <Link to={`/members/people/${comment.authorId}`} className="font-semibold hover:underline">{comment.authorName}</Link>
        {comment.authorIsAdmin && <AdminTag />}
        <span className="opacity-80"> · {when(comment.createdAt, zone)}{comment.editedAt && " · edited"}</span>
      </p>
      {editing ? (
        <fetcher.Form method="post" className="mt-2 grid gap-2">
          <input type="hidden" name="id" value={comment.id} />
          <MentionTextarea name="body" id={`edit-comment-${comment.id}`} label="Edit your comment" rows={3} maxLength={COMMENT_MAX}
            defaultValue={comment.body} initialMentions={comment.mentions} canMentionEveryone={isAdmin} className={field} autoFocus />
          <p className="text-sm opacity-80">The Organizing Team is told when a comment is edited.</p>
          {problem && <p className="text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>}
          <div className="flex gap-2">
            <button type="submit" name="intent" value="edit-comment" disabled={fetcher.state !== "idle"} className={primary}>Save</button>
            <button type="button" className={small} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : (
        <MentionText body={comment.body} mentions={comment.mentions} className="mt-1 whitespace-pre-wrap" />
      )}
      {!editing && (
        <div className="mt-1 flex gap-1">
          <button type="button" className={small} onClick={onReply}>Reply</button>
          {mine && <button type="button" className={small} onClick={() => setEditing(true)}>Edit</button>}
          {(mine || isAdmin) && (
            <remove.Form
              method="post"
              onSubmit={(event) => {
                if (!confirm(mine ? "Delete your comment?" : `Delete ${comment.authorName}'s comment?`)) event.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={comment.id} />
              <button type="submit" name="intent" value="delete-comment" className={`${small} text-[#B3261E] dark:text-[#F2B8B5]`}>Delete</button>
            </remove.Form>
          )}
        </div>
      )}
    </div>
  );
}

/** Comments members changed since the team last looked, with the text before and after. */
function EditedComments({ edits, zone }: { edits: CommentEdit[]; zone: string }) {
  const fetcher = useFetcher<Outcome>();
  if (fetcher.state !== "idle") return null;
  return (
    <section aria-labelledby="edited-heading" className="mt-6 rounded-lg border border-[#E8B95A] bg-[#FFF6E0] p-4 text-[#4A3410] dark:border-[#8A6A2A] dark:bg-[#2A2210] dark:text-[#F3E6D7]">
      <h2 id="edited-heading" className="font-semibold">
        {edits.length === 1 ? "1 comment was edited" : `${edits.length} comments were edited`}
      </h2>
      <p className="text-sm">Only people who can post updates see this.</p>
      <ul className="mt-3 grid gap-3">
        {edits.map((edit) => (
          <li key={edit.id} className="rounded bg-white/70 p-3 text-sm dark:bg-black/20">
            <p>
              <span className="font-semibold">{edit.authorName}</span> on "{edit.postTitle}" · {when(edit.editedAt, zone)}
            </p>
            <p className="mt-1"><span className="font-semibold">Before:</span> <span className="whitespace-pre-wrap">{edit.previousBody}</span></p>
            <p className="mt-1"><span className="font-semibold">After:</span> <span className="whitespace-pre-wrap">{edit.newBody}</span></p>
          </li>
        ))}
      </ul>
      <fetcher.Form method="post" className="mt-3">
        {edits.map((edit) => <input key={edit.id} type="hidden" name="editId" value={edit.id} />)}
        <button type="submit" name="intent" value="review-edits" className={primary}>Mark as seen</button>
      </fetcher.Form>
    </section>
  );
}
