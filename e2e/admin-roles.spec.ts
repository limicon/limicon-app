import postgres from "postgres";
import { expect, test } from "@playwright/test";

import { createAccount, newEmail, setName, signIn } from "./support";

/** Gives the account for `email` the role `role` in the local database. */
async function giveRole(email: string, role: string) {
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  try {
    await sql`
      insert into public.admin_permissions (profile_id, permission)
      select id, ${role} from auth.users where email = ${email}
    `;
  } finally {
    await sql.end();
  }
}

test("removing someone from a role asks why, and the reason shows in the role history", async ({ page, request }) => {
  const adminEmail = newEmail();
  await signIn(page, request, adminEmail);
  await setName(adminEmail, "Rae", "Remover");
  await giveRole(adminEmail, "full");

  const boEmail = newEmail();
  const bo = `Bo ${crypto.randomUUID().slice(0, 8)}`;
  await createAccount(boEmail);
  await setName(boEmail, bo, "Bookkeeper");
  await giveRole(boEmail, "bookkeeper");

  // From the Team page: Cancel changes nothing, and Remove waits for a reason.
  await page.goto("/admin/team");
  const bookkeepers = page.getByRole("region", { name: "Bookkeeper", exact: true });
  const row = bookkeepers.getByRole("listitem").filter({ hasText: bo });
  await row.getByRole("button", { name: "Remove" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove role?" });
  await expect(dialog).toContainText(`${bo} Bookkeeper from the Bookkeeper role`);
  await expect(dialog.getByRole("button", { name: "Remove" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Remove" }).click();
  await dialog.getByLabel("Reason").fill("Handed the books to Cy");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Role removed.")).toBeVisible();
  await expect(bookkeepers.getByText(bo)).toHaveCount(0);
  const removals = page.getByRole("region", { name: "Recent removals" });
  await expect(removals.getByRole("listitem").filter({ hasText: bo })).toContainText("Handed the books to Cy");

  // From the person's page: unticking a role and saving asks too.
  await giveRole(boEmail, "bookkeeper");
  await removals.getByRole("link", { name: `${bo} Bookkeeper` }).first().click();
  await page.getByRole("checkbox", { name: "Bookkeeper" }).uncheck();
  await page.getByRole("button", { name: "Save roles" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reason").fill("Back off the books");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Roles saved.")).toBeVisible();
  const history = page.getByRole("heading", { name: "Role history" }).locator("..");
  await expect(history).toContainText("Back off the books");
  await expect(history).toContainText("Handed the books to Cy");
  await expect(history).toContainText("by Rae Remover");
});
