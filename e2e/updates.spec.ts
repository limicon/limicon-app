import postgres from "postgres";
import { expect, test } from "@playwright/test";

import { giveTicket, newEmail, setName, signIn } from "./support";

/** Gives the account for `email` the Admin role, which can post updates. */
async function makeAdmin(email: string) {
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  try {
    await sql`
      insert into public.admin_permissions (profile_id, permission)
      select id, 'full' from auth.users where email = ${email}
    `;
  } finally {
    await sql.end();
  }
}

test("a poster adds an update, and a member likes it and comments", async ({ browser, request }) => {
  const title = `Week one news ${crypto.randomUUID().slice(0, 8)}`;

  // The poster writes the post.
  const posterEmail = newEmail();
  const poster = await browser.newPage();
  await signIn(poster, request, posterEmail);
  await setName(posterEmail, "Pat", "Poster");
  await makeAdmin(posterEmail);
  await poster.goto("/members/updates");
  await poster.getByRole("link", { name: "+ Add new post" }).click();
  await expect(poster.getByLabel("Start from")).toContainText("Newsletter");
  await poster.getByLabel("Title").fill(title);
  await poster.getByRole("textbox", { name: "Post" }).fill("Sessions start Monday.");
  await poster.getByRole("button", { name: "Post", exact: true }).click();
  await expect(poster).toHaveURL("/members/updates");
  const posted = poster.getByRole("article", { name: title });
  await expect(posted).toContainText("Sessions start Monday.");
  await expect(posted.getByRole("button", { name: /View comments/ })).toHaveCount(0);

  // A member sees it, without the button to post.
  const memberEmail = newEmail();
  const member = await browser.newPage();
  await signIn(member, request, memberEmail);
  await setName(memberEmail, "Mo", "Member");
  await giveTicket(memberEmail);
  // Members home flags posts the member hasn't seen, until they open Updates.
  await member.goto("/members");
  const updatesCard = member.getByRole("main").getByRole("link", { name: /^Updates/ });
  await expect(updatesCard).toContainText(/\d+ New Updates?/);
  await updatesCard.click();
  await expect(member.getByRole("heading", { name: "Updates", level: 1 })).toBeVisible();
  await expect(member.getByRole("navigation", { name: "Members" }).getByRole("link", { name: /^Updates/ })).not.toContainText("New Update");
  await member.getByRole("link", { name: "Home" }).click();
  await expect(updatesCard).not.toContainText("New Update");
  await member.goto("/members/updates");
  await expect(member.getByRole("link", { name: "+ Add new post" })).toHaveCount(0);
  const post = member.getByRole("article", { name: title });

  await post.getByRole("button", { name: `Like ${title}` }).click();
  await expect(post.getByRole("button", { name: `Unlike ${title}` })).toContainText("Liked · 1");

  await post.getByRole("combobox", { name: `Comment on ${title}` }).fill("Can't wait!");
  await post.getByRole("button", { name: "Comment" }).click();
  await expect(post.getByRole("button", { name: "Hide comments" })).toBeVisible();
  await expect(post.getByRole("listitem")).toContainText("Can't wait!");
  await expect(post.getByRole("combobox", { name: `Comment on ${title}` })).toHaveValue("");

  await post.getByRole("button", { name: "Edit" }).click();
  await post.getByRole("combobox", { name: "Edit your comment" }).fill("Can't wait for Monday!");
  await post.getByRole("button", { name: "Save" }).click();
  // The open edit box already holds the new text and mentions "edited", so wait for it to close,
  // which happens once the save succeeds.
  await expect(post.getByRole("combobox", { name: "Edit your comment" })).toHaveCount(0);
  await expect(post.getByRole("listitem")).toContainText("Can't wait for Monday!");
  await expect(post.getByRole("listitem")).toContainText("edited");

  // The poster is told about the edit.
  await poster.reload();
  const notice = poster.getByRole("region", { name: /edited/ });
  await expect(notice).toContainText("Before: Can't wait!");
  await expect(notice).toContainText("After: Can't wait for Monday!");

  // The member deletes their comment, and the link to comments goes away.
  member.on("dialog", (dialog) => dialog.accept());
  await post.getByRole("button", { name: "Delete" }).click();
  // Reloading before the delete finishes would cancel it.
  await expect(post.getByText("Can't wait for Monday!")).toHaveCount(0);
  await member.reload();
  await expect(post.getByRole("button", { name: /View comments/ })).toHaveCount(0);
});
