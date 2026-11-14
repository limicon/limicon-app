import { expect, test } from "@playwright/test";

test("a visitor sees the home page and a way to sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Limicon");
  await expect(page.getByRole("heading", { level: 1, name: "Limicon" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in or create an account" })).toBeVisible();
});
