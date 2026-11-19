import { expect, test } from "@playwright/test";

test("a visitor sees the home page and a way to sign in", async ({ page }) => {
  await page.goto("/");

  // Admins name the event on the console's Edit page; it starts as "Limicon <year>".
  await expect(page).toHaveTitle(/^Limicon/);
  await expect(page.getByRole("heading", { level: 1, name: /^Limicon/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in or create an account" })).toBeVisible();
});

test("pages ask search engines not to list them while indexing is off", async ({ request }) => {
  const response = await request.get("/");

  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
