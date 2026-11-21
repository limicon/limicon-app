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
  // Sending the email is the slow step: about 0.2s alone, but over 2.5s while several test
  // browsers start at once on a small machine, which crowds the default 5s.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 15_000 });
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

/** Runs `work` against the local database with a short-lived connection. */
async function withDb<T>(work: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    { max: 1, onnotice: () => {} },
  );
  try {
    return await work(sql);
  } finally {
    await sql.end();
  }
}

/** Makes an account for `email` that never signs in, such as another member hosting a session. */
export async function createAccount(email: string) {
  await withDb((sql) => sql`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated')
  `);
}

/** Gives the account for `email` a comp ticket for the current edition, in the local database. */
export async function giveTicket(email: string) {
  await withDb((sql) => sql`
    insert into public.tickets (profile_id, edition_id, status)
    select u.id, (select id from public.editions order by year desc limit 1), 'comp'
    from auth.users u
    where u.email = ${email}
  `);
}

/** Sets the profile name of the account for `email`. */
export async function setName(email: string, first: string, last: string) {
  await withDb((sql) => sql`
    update public.profiles set first_name = ${first}, last_name = ${last}
    where id = (select id from auth.users where email = ${email})
  `);
}

/**
 * Puts a published session on the current edition's calendar, hosted by the account for
 * `hostEmail`, straight into the local database. Returns its id.
 */
export async function publishSession(args: {
  hostEmail: string;
  title: string;
  theme: string;
  startsAt: string;
  minutes: number;
  timeZone: string;
  meetingLink?: string;
}) {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.sessions (edition_id, title, theme, session_types, starts_at, ends_at, time_zone, meeting_link, published)
      values ((select id from public.editions order by year desc limit 1), ${args.title}, ${args.theme}, '{dialog}',
              ${args.startsAt}, ${args.startsAt}::timestamptz + ${`${args.minutes} minutes`}::interval, ${args.timeZone},
              ${args.meetingLink ?? null}, true)
      returning id
    `;
    await sql`
      insert into public.session_hosts (session_id, profile_id, role)
      select ${row!.id}, id, 'host' from auth.users where email = ${args.hostEmail}
    `;
    return row!.id;
  });
}

/** RSVPs the account for `email` to a session, straight into the local database. */
export async function rsvpTo(email: string, sessionId: string) {
  await withDb((sql) => sql`
    insert into public.session_rsvps (session_id, profile_id, status)
    select ${sessionId}, id, 'registered' from auth.users where email = ${email}
  `);
}
