import { useEffect, useRef, useState } from "react";
import { data, Link, useFetcher } from "react-router";

import { RichText } from "~/components/rich-text";
import { servicesContext } from "~/context";
import { isUuid } from "~/lib/admin.server";
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
      if (!(await addComment(db, { postId: id, userId, body: checked.body }))) throw data("Not found", { status: 404 });
      return { ok: true, intent };
    }
    case "edit-comment": {
      const checked = checkComment(form.get("body"));
      if (!checked.ok) return { ok: false, intent, problem: checked.problem };
      if ((await editComment(db, { commentId: id, userId, body: checked.body })) === "not-found") throw data("Not found", { status: 404 });
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
    <section className="max-w-3xl">
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
  const remove = useFetcher<Outcome>();
  const count = post.comments.length;
  const listId = `comments-${post.id}`;
  return (
    <article className={card} aria-labelledby={`post-${post.id}`}>
      <header>
        <h2 id={`post-${post.id}`} className="text-2xl font-semibold">{post.title}</h2>
        <p className="mt-1 text-sm opacity-80">
          {post.authorName} · {when(post.createdAt, zone)}
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
          {post.comments.map((comment) => (
            <Comment key={comment.id} comment={comment} zone={zone} mine={comment.authorId === userId} isAdmin={isAdmin} />
          ))}
        </ul>
      )}

      <CommentBox postId={post.id} title={post.title} onPosted={() => setOpen(true)} />
    </article>
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

/** The small box under each post, so commenting takes one step. */
function CommentBox({ postId, title, onPosted }: { postId: string; title: string; onPosted: () => void }) {
  const fetcher = useFetcher<Outcome>();
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.intent === "comment") {
      setText("");
      onPosted();
    }
    // Runs once each time a comment finishes posting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  const problem = fetcher.data && !fetcher.data.ok ? fetcher.data.problem : null;
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form ref={form} method="post" className="mt-4">
      <input type="hidden" name="id" value={postId} />
      <div className="flex items-start gap-2">
        <textarea
          name="body"
          rows={1}
          maxLength={COMMENT_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter posts, as in most comment boxes; Shift+Enter starts a new line.
            if (event.key === "Enter" && !event.shiftKey && text.trim()) {
              event.preventDefault();
              form.current?.requestSubmit();
            }
          }}
          placeholder="Write a comment…"
          aria-label={`Comment on ${title}`}
          className={`${field} min-h-10 resize-y`}
        />
        <button type="submit" name="intent" value="comment" disabled={busy || !text.trim()} className={`${primary} py-2 whitespace-nowrap`}>
          {busy ? "Posting…" : "Comment"}
        </button>
      </div>
      {problem && <p className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>}
    </fetcher.Form>
  );
}

function Comment({ comment, zone, mine, isAdmin }: { comment: UpdateComment; zone: string; mine: boolean; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher<Outcome>();
  const remove = useFetcher<Outcome>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setEditing(false);
  }, [fetcher.state, fetcher.data]);
  if (remove.state !== "idle") return null;
  const problem = fetcher.data && !fetcher.data.ok ? fetcher.data.problem : null;
  return (
    <li className="rounded bg-[#F4F7F7] px-3 py-2 dark:bg-[#0F1C1E]">
      <p className="text-sm">
        <span className="font-semibold">{comment.authorName}</span>
        <span className="opacity-80"> · {when(comment.createdAt, zone)}{comment.editedAt && " · edited"}</span>
      </p>
      {editing ? (
        <fetcher.Form method="post" className="mt-2 grid gap-2">
          <input type="hidden" name="id" value={comment.id} />
          <textarea name="body" rows={3} maxLength={COMMENT_MAX} defaultValue={comment.body} aria-label="Edit your comment" className={field} autoFocus />
          <p className="text-sm opacity-80">The Organizing Team is told when a comment is edited.</p>
          {problem && <p className="text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>}
          <div className="flex gap-2">
            <button type="submit" name="intent" value="edit-comment" disabled={fetcher.state !== "idle"} className={primary}>Save</button>
            <button type="button" className={small} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </fetcher.Form>
      ) : (
        <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
      )}
      {!editing && (mine || isAdmin) && (
        <div className="mt-1 flex gap-1">
          {mine && <button type="button" className={small} onClick={() => setEditing(true)}>Edit</button>}
          <remove.Form
            method="post"
            onSubmit={(event) => {
              if (!confirm(mine ? "Delete your comment?" : `Delete ${comment.authorName}'s comment?`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={comment.id} />
            <button type="submit" name="intent" value="delete-comment" className={`${small} text-[#B3261E] dark:text-[#F2B8B5]`}>Delete</button>
          </remove.Form>
        </div>
      )}
    </li>
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
