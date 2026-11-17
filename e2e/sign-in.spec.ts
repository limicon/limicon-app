import { expect, test } from "@playwright/test";

import { newEmail, signIn } from "./support";

test("a visitor signs in with an emailed link", async ({ page, request }) => {
  const email = newEmail();

  await signIn(page, request, email);

  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});
