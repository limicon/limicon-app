/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import type { Db } from "./db.server";
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

const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, fetch_types: false, onnotice: () => {} },
);

afterAll(() => sql.end());

async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

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
});
