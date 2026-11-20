/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import {
  addCommunityComment,
  countUnreadNotifications,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  editCommunityPost,
  findMentionable,
  listCommunityPosts,
  listNotifications,
  markNotificationsRead,
  resolveMentions,
  setCommunityLike,
} from "./community.server";
import type { Db } from "./db.server";
import { listRecentActivity } from "./profiles.server";

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

async function account(tx: Db, firstName: string) {
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${`u-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  await tx`update public.profiles set first_name = ${firstName} where id = ${user!.id}`;
  return user!.id;
}

const post = (tx: Db, authorId: string, body: string) => createCommunityPost(tx, { authorId, body, imageKey: null });

describe("community", () => {
  test("lists posts newest first with likes and comments, and pages to older ones", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx, "Ada");
      const grace = await account(tx, "Grace");
      const older = await post(tx, ada, "Older");
      await tx`update public.community_posts set created_at = now() + interval '1 day' where id = ${older}`;
      const newer = await post(tx, ada, "Newer");
      await tx`update public.community_posts set created_at = now() + interval '2 days' where id = ${newer}`;
      await setCommunityLike(tx, { postId: newer, userId: grace, liked: true });
      await setCommunityLike(tx, { postId: newer, userId: grace, liked: true });
      await addCommunityComment(tx, { postId: newer, userId: grace, body: "Lovely" });

      const [first, second] = await listCommunityPosts(tx, grace, { limit: 2 });
      expect(first).toMatchObject({ id: newer, authorName: "Ada", likes: 1, likedByViewer: true, comments: [{ authorName: "Grace", body: "Lovely" }] });
      expect(second).toMatchObject({ id: older, likes: 0, comments: [] });
      const [paged] = await listCommunityPosts(tx, grace, { before: first!.createdAt, limit: 1 });
      expect(paged!.id).toBe(older);
      expect((await listCommunityPosts(tx, grace, { postId: older })).map((p) => p.id)).toEqual([older]);
    });
  });

  test("search finds posts by their text, comments or author", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx, "Adaline");
      const grace = await account(tx, "Grace");
      const garden = await post(tx, ada, "Who wants to start a seed library?");
      const other = await post(tx, grace, "Morning walk");
      await addCommunityComment(tx, { postId: other, userId: ada, body: "Saw a heron by the creek" });
      const ids = async (query: string) => (await listCommunityPosts(tx, ada, { query, limit: 500 })).map((p) => p.id).filter((id) => [garden, other].includes(id));

      expect(await ids("SEED")).toEqual([garden]);
      expect(await ids("heron")).toEqual([other]);
      expect(await ids("adaline")).toEqual([garden]);
      expect(await ids("50%")).toEqual([]);
    });
  });

  test("members change only their own posts; moderators may delete anyone's", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx, "Ada");
      const grace = await account(tx, "Grace");
      const postId = await post(tx, ada, "First");
      expect(await editCommunityPost(tx, { postId, userId: grace, body: "Hacked" })).toBe(false);
      expect(await editCommunityPost(tx, { postId, userId: ada, body: "First, edited" })).toBe(true);
      await addCommunityComment(tx, { postId, userId: ada, body: "Me again" });
      const [comment] = (await listCommunityPosts(tx, ada, { postId }))[0]!.comments;
      expect(await deleteCommunityComment(tx, { commentId: comment!.id, userId: grace, moderator: false })).toBe(false);
      expect(await deleteCommunityPost(tx, { postId, userId: grace, moderator: false })).toBe(false);
      expect(await deleteCommunityPost(tx, { postId, userId: grace, moderator: true })).toBe(true);
    });
  });

  test("comments notify the post's author; replies join one thread and notify the replied-to", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx, "Ada");
      const grace = await account(tx, "Grace");
      const alan = await account(tx, "Alan");
      const postId = await post(tx, ada, "Seed swap?");
      const first = await addCommunityComment(tx, { postId, userId: grace, body: "Yes!" });
      const reply = await addCommunityComment(tx, { postId, userId: alan, body: "@Grace me too", parentId: first, mentions: [{ id: grace, name: "Grace" }] });
      const last = await addCommunityComment(tx, { postId, userId: ada, body: "Great", parentId: reply });
      // now() is the same all through a transaction, so give the replies their order.
      await tx`update public.community_comments set created_at = now() + interval '1 minute' where id = ${last}`;

      const [loaded] = await listCommunityPosts(tx, ada, { postId });
      expect(loaded!.commentCount).toBe(3);
      expect(loaded!.comments).toHaveLength(1);
      expect(loaded!.comments[0]!.replies.map((r) => r.body)).toEqual(["@Grace me too", "Great"]);

      const kinds = async (who: string) => (await listNotifications(tx, who)).map((n) => n.kind).sort();
      // Ada: Grace's and Alan's comments on her post. Grace: Alan named her (a mention beats a reply). Alan: Ada replied to him.
      expect(await kinds(ada)).toEqual(["comment", "comment"]);
      expect(await kinds(grace)).toEqual(["mention"]);
      expect(await kinds(alan)).toEqual(["reply"]);
      expect(await countUnreadNotifications(tx, ada)).toBe(2);
      await markNotificationsRead(tx, ada);
      expect(await countUnreadNotifications(tx, ada)).toBe(0);
      expect(await addCommunityComment(tx, { postId, userId: ada, body: "x", parentId: crypto.randomUUID() })).toBeNull();
    });
  });

  test("mentions keep only current members named in the text; @everyone only when allowed", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx, "Ada");
      await tx`insert into public.tickets (profile_id, edition_id, status) select ${ada}, id, 'paid' from public.editions order by year desc limit 1`;
      const grace = await account(tx, "Grace");
      await tx`insert into public.tickets (profile_id, edition_id, status) select ${grace}, id, 'paid' from public.editions order by year desc limit 1`;
      const visitor = await account(tx, "Vic");

      expect(await resolveMentions(tx, "Hi @Grace and @Vic", [grace, visitor, "junk"], false)).toEqual([{ id: grace, name: "Grace" }]);
      expect(await resolveMentions(tx, "Hi all", [grace], false)).toEqual([]);
      expect(await resolveMentions(tx, "Hi @everyone", [], false)).toEqual([]);
      expect(await resolveMentions(tx, "Hi @everyone", [], true)).toEqual([{ id: "everyone", name: "everyone" }]);
      expect((await findMentionable(tx, "gra")).map((p) => p.id)).toContain(grace);
      expect((await findMentionable(tx, "vic")).map((p) => p.id)).not.toContain(visitor);
    });
  });

  test("@everyone tells every current member once, and editing tells only the newly named", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ticket = (id: string) => tx`insert into public.tickets (profile_id, edition_id, status) select ${id}, id, 'paid' from public.editions order by year desc limit 1`;
      const admin = await account(tx, "Admin");
      const grace = await account(tx, "Grace");
      const alan = await account(tx, "Alan");
      await Promise.all([ticket(admin), ticket(grace), ticket(alan)]);

      const postId = await createCommunityPost(tx, {
        authorId: admin, body: "@everyone and @Grace: welcome", imageKey: null,
        mentions: [{ id: "everyone", name: "everyone" }, { id: grace, name: "Grace" }],
      });
      expect((await listNotifications(tx, grace)).filter((n) => n.postId === postId).map((n) => n.kind)).toEqual(["mention"]);
      expect((await listNotifications(tx, alan)).filter((n) => n.postId === postId).map((n) => n.kind)).toEqual(["everyone"]);
      expect((await listNotifications(tx, admin)).filter((n) => n.postId === postId)).toEqual([]);

      const plain = await createCommunityPost(tx, { authorId: grace, body: "Hello", imageKey: null });
      await editCommunityPost(tx, { postId: plain, userId: grace, body: "Hello @Alan", mentions: [{ id: alan, name: "Alan" }] });
      await editCommunityPost(tx, { postId: plain, userId: grace, body: "Hello @Alan!", mentions: [{ id: alan, name: "Alan" }] });
      expect((await listNotifications(tx, alan)).filter((n) => n.postId === plain).map((n) => n.kind)).toEqual(["mention"]);
    });
  });

  test("recent activity includes Community posts and comments", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx, "Ada");
      const postId = await post(tx, ada, "Hello, everyone");
      await tx`update public.community_posts set created_at = now() - interval '1 hour' where id = ${postId}`;
      await addCommunityComment(tx, { postId, userId: ada, body: "And welcome" });
      expect(await listRecentActivity(tx, ada)).toMatchObject([
        { place: "community", kind: "comment", postId, postTitle: "Hello, everyone", excerpt: "And welcome" },
        { place: "community", kind: "post", postId, excerpt: null },
      ]);
    });
  });
});
