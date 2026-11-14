import { expect, test, type APIRequestContext } from "@playwright/test";

test("a visitor signs in with an emailed link", async ({ page, request }) => {
  // A new address each run, so earlier runs' emails never match.
  const email = `e2e-${crypto.randomUUID()}@example.com`;

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(await signInLink(request, email));

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

/** Waits for the sign-in email to `email` to reach Mailpit, and returns the link in it. */
async function signInLink(request: APIRequestContext, email: string) {
  const mailpit = process.env.MAILPIT_URL;
  let link: string | undefined;
  await expect(async () => {
    const search = await request.get(`${mailpit}/api/v1/search`, {
      params: { query: `to:"${email}"` },
    });
    const { messages } = await search.json();
    expect(messages).toHaveLength(1);
    const message = await request.get(`${mailpit}/api/v1/message/${messages[0].ID}`);
    link = (await message.json()).Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0];
    expect(link).toBeDefined();
  }).toPass({ timeout: 10_000 });
  return link!;
}
