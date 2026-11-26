import { describe, expect, test } from "vitest";

import type { Db } from "./db.server";
import type { ProfileEdit } from "./profile-form";
import { getProfileForEdit, getProfileView, listDirectory, listPopularKeywords, listRecentActivity, saveOwnSettings, saveProfile } from "./profiles.server";
import { plainToRichText } from "./rich-text";
import { addComment, createPost } from "./updates.server";
import { connectTestDb } from "./test-db";

const { inRolledBackTransaction } = connectTestDb();

/** An account; with `ticket`, a holder of a ticket for the current edition. */
async function account(tx: Db, ticket = true) {
  const [user] = await tx<{ id: string; email: string }[]>`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${`u-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id, email
  `;
  if (ticket) {
    await tx`
      insert into public.tickets (profile_id, edition_id, status)
      select ${user!.id}, id, 'paid' from public.editions order by year desc limit 1
    `;
  }
  return user!;
}

const edit = (overrides: Partial<ProfileEdit> = {}): ProfileEdit => ({
  firstName: "Ada", lastName: "Lovelace", avatarKey: null, headline: "Weaving numbers", bio: "I wrote the first program.\n\nAnd notes.", location: "London",
  businessName: null, titles: ["Analyst"], showEmail: false,
  links: [{ platform: "website", value: "ada.example" }, { platform: "instagram", value: "@ada" }],
  skills: ["Maths", "Poetry"], interests: ["Looms"],
  projects: [{ keywords: "Analytical engine, notes", description: "The first program." }],
  ...overrides,
});

describe("profiles", () => {
  test("saves a profile and shows it to members, with the email only when chosen", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      await saveProfile(tx, ada.id, edit());
      expect(await getProfileForEdit(tx, ada.id)).toEqual(edit());

      const view = await getProfileView(tx, ada.id);
      expect(view).toMatchObject({
        name: "Ada Lovelace", headline: "Weaving numbers", bio: "I wrote the first program.\n\nAnd notes.", email: null, titles: ["Analyst"],
        skills: [{ keyword: "Maths", key: "maths" }, { keyword: "Poetry", key: "poetry" }],
        interests: [{ keyword: "Looms", key: "looms" }],
      });

      await saveProfile(tx, ada.id, edit({ showEmail: true, links: [], projects: [] }));
      expect(await getProfileView(tx, ada.id)).toMatchObject({ email: ada.email, links: [], projects: [] });
    });
  });

  test("shows only current members' profiles", async () => {
    await inRolledBackTransaction(async (tx) => {
      const visitor = await account(tx, false);
      expect(await getProfileView(tx, visitor.id)).toBeNull();
      expect(await getProfileView(tx, "not-an-id")).toBeNull();

      const gone = await account(tx);
      await tx`update public.profiles set deactivated_at = now() where id = ${gone.id}`;
      expect(await getProfileView(tx, gone.id)).toBeNull();
    });
  });

  test("the directory finds members by shared keyword and leaves out those who opt out", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      const grace = await account(tx);
      const hidden = await account(tx);
      await saveProfile(tx, ada.id, edit());
      await saveProfile(tx, grace.id, edit({ firstName: "Grace", lastName: "Hopper", skills: ["maths"], interests: [], projects: [] }));
      await saveProfile(tx, hidden.id, edit({ firstName: "Hidden" }));
      await saveOwnSettings(tx, hidden.id, { showEmail: false, allowMessages: true, showInDirectory: false, emailNotifications: true, emailNotify: ["update_post"] });

      const ids = (entries: { id: string }[]) => entries.map((e) => e.id).filter((id) => [ada.id, grace.id, hidden.id].includes(id));
      expect(ids(await listDirectory(tx, { keyword: "MATHS" }))).toEqual([ada.id, grace.id]);
      expect(ids(await listDirectory(tx, { keyword: "analytical engine" }))).toEqual([ada.id]);
      expect(ids(await listDirectory(tx, { query: "hop" }))).toEqual([grace.id]);
      expect(ids(await listDirectory(tx, { query: "100%" }))).toEqual([]);
      expect((await listPopularKeywords(tx, 500)).find((k) => k.key === "maths")?.count).toBeGreaterThanOrEqual(2);
    });
  });

  test("recent activity lists posts and comments, newest first", async () => {
    await inRolledBackTransaction(async (tx) => {
      const ada = await account(tx);
      const postId = await createPost(tx, { authorId: ada.id, title: "Hello", body: plainToRichText("Hi"), template: null });
      await tx`update public.update_posts set created_at = now() - interval '1 hour' where id = ${postId}`;
      await addComment(tx, { postId, userId: ada.id, body: "And welcome" });

      expect(await listRecentActivity(tx, ada.id)).toMatchObject([
        { kind: "comment", postId, postTitle: "Hello", excerpt: "And welcome" },
        { kind: "post", postId, postTitle: "Hello", excerpt: null },
      ]);
    });
  });
});
