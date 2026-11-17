import { expect, type APIRequestContext, type Page } from "@playwright/test";
import postgres from "postgres";

/** A new address each run, so earlier runs' emails and accounts never match. */
export function newEmail() {
  return `e2e-${crypto.randomUUID()}@example.com`;
}

/** Signs `email` in with an emailed link, through the sign-in page and Mailpit. */
export async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await signInLink(request, email));
  await expect(page).toHaveURL("/account");
}

/** Waits for the sign-in email to `email` to reach Mailpit, and returns the link in it. */
export async function signInLink(request: APIRequestContext, email: string) {
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

/** Gives the account for `email` a comp ticket for the current edition, in the local database. */
export async function giveTicket(email: string) {
  const sql = postgres(
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    { max: 1, onnotice: () => {} },
  );
  try {
    await sql`
      insert into public.tickets (profile_id, edition_id, status)
      select u.id, (select id from public.editions order by year desc limit 1), 'comp'
      from auth.users u
      where u.email = ${email}
    `;
  } finally {
    await sql.end();
  }
}
