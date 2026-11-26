import { describe, expect, test } from "vitest";

import { listNotifications } from "./community.server";
import type { Db } from "./db.server";
import { getOwnSettings } from "./profiles.server";
import { plainToRichText } from "./rich-text";
import {
  addComment,
  countUnseenPosts,
  createPost,
  markUpdatesSeen,
  deleteComment,
  editComment,
  listPosts,
  listUnreviewedEdits,
  markEditsReviewed,
  setLike,
} from "./updates.server";
import { connectTestDb } from "./test-db";

const { inRolledBackTransaction } = connectTestDb();

async function account(tx: Db, firstName = "Ada") {
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${`u-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  await tx`update public.profiles set first_name = ${firstName} where id = ${user!.id}`;
  return user!.id;
}

const post = (tx: Db, authorId: string, title = "Hello") =>
  createPost(tx, { authorId, title, body: plainToRichText("Welcome"), template: null });

describe("updates", () => {
  test("lists posts newest first with likes and comments", async () => {
    await inRolledBackTransaction(async (tx) => {
      const author = await account(tx, "Lauren");
      const member = await account(tx, "Grace");
      const older = await post(tx, author, "Older");
      await tx`update public.update_posts set created_at = now() - interval '1 day' where id = ${older}`;
      const newer = await post(tx, author, "Newer");
      await setLike(tx, { postId: newer, userId: member, liked: true });
      await setLike(tx, { postId: newer, userId: member, liked: true });
      await addComment(tx, { postId: newer, userId: member, body: "Great news" });

      const posts = (await listPosts(tx, member)).filter((p) => [older, newer].includes(p.id));
      expect(posts.map((p) => p.title)).toEqual(["Newer", "Older"]);
      expect(posts[0]).toMatchObject({ authorName: "Lauren", likes: 1, likedByViewer: true });
      expect(posts[0]!.comments).toMatchObject([{ authorName: "Grace", body: "Great news", editedAt: null }]);
      expect(posts[1]).toMatchObject({ likes: 0, likedByViewer: false, comments: [] });

      await setLike(tx, { postId: newer, userId: member, liked: false });
      expect((await listPosts(tx, member)).find((p) => p.id === newer)).toMatchObject({ likes: 0 });
    });
  });

  test("editing a comment records the change for the team until marked seen", async () => {
    await inRolledBackTransaction(async (tx) => {
      const author = await account(tx);
      const member = await account(tx, "Grace");
      const other = await account(tx);
      const postId = await post(tx, author);
      await addComment(tx, { postId, userId: member, body: "First" });
      const [comment] = (await listPosts(tx, member)).find((p) => p.id === postId)!.comments;

      expect(await editComment(tx, { commentId: comment!.id, userId: other, body: "Hijacked" })).toBe("not-found");
      expect(await editComment(tx, { commentId: comment!.id, userId: member, body: "First" })).toBe("unchanged");
      expect(await editComment(tx, { commentId: comment!.id, userId: member, body: "Second" })).toBe("saved");

      const edits = (await listUnreviewedEdits(tx)).filter((e) => e.commentId === comment!.id);
      expect(edits).toMatchObject([{ authorName: "Grace", previousBody: "First", newBody: "Second", postTitle: "Hello" }]);
      expect((await listPosts(tx, member)).find((p) => p.id === postId)!.comments[0]!.editedAt).not.toBeNull();

      await markEditsReviewed(tx, edits.map((e) => e.id), author);
      expect((await listUnreviewedEdits(tx)).filter((e) => e.commentId === comment!.id)).toEqual([]);
    });
  });

  test("members delete only their own comments; moderators delete any", async () => {
    await inRolledBackTransaction(async (tx) => {
      const author = await account(tx);
      const member = await account(tx);
      const other = await account(tx);
      const postId = await post(tx, author);
      await addComment(tx, { postId, userId: member, body: "One" });
      await addComment(tx, { postId, userId: member, body: "Two" });
      const [one, two] = (await listPosts(tx, member)).find((p) => p.id === postId)!.comments;

      expect(await deleteComment(tx, { commentId: one!.id, userId: other, moderator: false })).toBe(false);
      expect(await deleteComment(tx, { commentId: one!.id, userId: member, moderator: false })).toBe(true);
      expect(await deleteComment(tx, { commentId: two!.id, userId: author, moderator: true })).toBe(true);
      expect((await listPosts(tx, member)).find((p) => p.id === postId)!.comments).toEqual([]);
    });
  });

  test("counts others' posts since the member last opened Updates", async () => {
    await inRolledBackTransaction(async (tx) => {
      const author = await account(tx);
      const member = await account(tx);
      // Earlier tests' posts are rolled back, but posts already in the local database count too.
      const before = await countUnseenPosts(tx, member);
      await post(tx, author);
      await post(tx, member);
      expect(await countUnseenPosts(tx, member)).toBe(before + 1);

      await markUpdatesSeen(tx, member);
      expect(await countUnseenPosts(tx, member)).toBe(0);
      // now() is fixed within a transaction, so the next post is dated after the visit by hand.
      const later = await post(tx, author);
      await tx`update public.update_posts set created_at = now() + interval '1 minute' where id = ${later}`;
      expect(await countUnseenPosts(tx, member)).toBe(1);
    });
  });

  test("comments on a missing post are refused", async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await account(tx);
      expect(await addComment(tx, { postId: crypto.randomUUID(), userId: member, body: "Hi" })).toBe(false);
    });
  });

  test("replies join a thread, start by naming the person answered, and tell them", async () => {
    await inRolledBackTransaction(async (tx) => {
      const author = await account(tx, "Lauren");
      const member = await account(tx, "Grace");
      await tx`insert into public.admin_permissions (profile_id, permission) values (${author}, 'full')`;
      const postId = await post(tx, author);
      await addComment(tx, { postId, userId: member, body: "Lovely news" });
      const [first] = (await listPosts(tx, author)).find((p) => p.id === postId)!.comments;
      expect(first).toMatchObject({ parentId: null, authorIsAdmin: false });

      await addComment(tx, { postId, userId: author, body: "@Grace thank you", parentId: first!.id, mentions: [{ id: member, name: "Grace" }] });
      const reply = (await listPosts(tx, author)).find((p) => p.id === postId)!.comments.find((c) => c.body === "@Grace thank you")!;
      expect(reply).toMatchObject({ parentId: first!.id, authorIsAdmin: true, mentions: [{ id: member, name: "Grace" }] });
      // Replying to a reply stays in the same thread and tells that reply's author.
      await addComment(tx, { postId, userId: member, body: "Of course", parentId: reply.id });
      const last = (await listPosts(tx, author)).find((p) => p.id === postId)!.comments.find((c) => c.body === "Of course")!;
      expect(last.parentId).toBe(first!.id);

      // Lauren: Grace commented on her post, then answered Lauren's reply. Grace: named in Lauren's reply (a mention beats a reply).
      expect((await listNotifications(tx, member)).map((n) => [n.kind, n.place])).toEqual([["mention", "updates"]]);
      expect((await listNotifications(tx, author)).map((n) => [n.kind, n.place, n.postId]).sort()).toEqual([
        ["comment", "updates", postId],
        ["reply", "updates", postId],
      ]);
      // A third member replying to Grace tells Grace, not the post's author.
      const alan = await account(tx, "Alan");
      await addComment(tx, { postId, userId: alan, body: "Same question", parentId: first!.id });
      expect((await listNotifications(tx, author)).length).toBe(2);
      expect((await listNotifications(tx, member)).map((n) => n.kind).sort()).toEqual(["mention", "reply"]);
      expect(await addComment(tx, { postId, userId: member, body: "x", parentId: crypto.randomUUID() })).toBe(false);
    });
  });

  test("new members get email for new Updates posts only, until they choose more", async () => {
    await inRolledBackTransaction(async (tx) => {
      const member = await account(tx);
      expect(await getOwnSettings(tx, member)).toMatchObject({ emailNotifications: true, emailNotify: ["update_post"] });
      await expect(tx`update public.profiles set email_notify = '{nonsense}' where id = ${member}`).rejects.toThrow();
    });
  });
});
