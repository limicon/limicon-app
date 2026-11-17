import { expect, test, type Page } from "@playwright/test";

import { giveTicket, newEmail, signIn } from "./support";

const mainMenu = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("a visitor who chooses Members is told a ticket is needed", async ({ page }) => {
  await page.goto("/");
  await mainMenu(page).getByRole("link", { name: "Members" }).click();

  const dialog = page.getByRole("dialog", { name: "The Members area is for ticket holders" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Get a ticket" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Already have a ticket? Sign in" })).toBeVisible();
  await expect(page).toHaveURL("/");

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("a members-only address shows the same message to a visitor", async ({ page }) => {
  await page.goto("/members/schedule");

  await expect(page).toHaveURL("/members-only");
  await expect(page.getByRole("heading", { name: "The Members area is for ticket holders" })).toBeVisible();
});

test("an account opens the Members area once it has a ticket", async ({ page, request }) => {
  const email = newEmail();
  await signIn(page, request, email);

  // Without a ticket: the pop-up, with no sign-in link since the account is signed in.
  await mainMenu(page).getByRole("link", { name: "Members" }).click();
  const dialog = page.getByRole("dialog", { name: "The Members area is for ticket holders" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Sign in/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();

  // The public menu never lists the Members area's own sections.
  await expect(mainMenu(page).getByRole("link", { name: "Schedule" })).toHaveCount(0);

  await giveTicket(email);
  await page.reload();
  await mainMenu(page).getByRole("link", { name: "Members" }).click();

  await expect(page).toHaveURL("/members");
  await expect(page.getByRole("heading", { level: 1, name: /^Welcome to Limicon \d{4}$/ })).toBeVisible();
  const membersMenu = page.getByRole("navigation", { name: "Members" });
  for (const section of ["Updates", "Schedule", "Host a session", "Community"]) {
    await expect(membersMenu.getByRole("link", { name: section })).toBeVisible();
  }
});
