/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, expect, test } from "vitest";

import type { Db } from "./db.server";
import { AGREEMENTS, type RegistrationValues } from "./registration-form";
import { getRegistration, saveRegistration } from "./registration.server";

// Runs against the local Supabase database, with the app's own connection options.
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, fetch_types: false, onnotice: () => {} },
);

afterAll(() => sql.end());

async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

async function setUp(tx: Db) {
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role)
    values (gen_random_uuid(), ${`reg-${crypto.randomUUID()}@example.org`}, 'authenticated', 'authenticated')
    returning id
  `;
  const [edition] = await tx<{ id: number }[]>`insert into public.editions (year) values (2098) returning id`;
  return { userId: user!.id, editionId: Number(edition!.id) };
}

const values: RegistrationValues = {
  firstName: "Ada",
  lastName: "Lovelace",
  answers: { address: "1 Main St", city: "Toronto", country: "Canada", meet_wish: "Other gardeners" },
  agreements: AGREEMENTS.map((a) => a.key),
};

test("a new account has a blank, unsubmitted registration", async () => {
  await inRolledBackTransaction(async (tx) => {
    const { userId, editionId } = await setUp(tx);
    const { input, submitted } = await getRegistration(tx, userId, editionId);
    expect(submitted).toBe(false);
    expect(input.city).toBe("");
    expect(input.agree_code_of_conduct).toBe(false);
  });
});

test("saved answers come back, with names on the profile", async () => {
  await inRolledBackTransaction(async (tx) => {
    const { userId, editionId } = await setUp(tx);
    await saveRegistration(tx, userId, editionId, values);

    const { input, submitted } = await getRegistration(tx, userId, editionId);
    expect(submitted).toBe(true);
    expect(input).toMatchObject({ firstName: "Ada", lastName: "Lovelace", city: "Toronto", meet_wish: "Other gardeners", region: "" });
    expect(input.confirm_faq).toBe(true);
  });
});

test("saving again keeps when the person agreed and drops answers they cleared", async () => {
  await inRolledBackTransaction(async (tx) => {
    const { userId, editionId } = await setUp(tx);
    await saveRegistration(tx, userId, editionId, values);
    await tx`
      update public.registration_answers set answered_at = '2027-01-05T12:00:00Z'
      where profile_id = ${userId} and question = 'agree_code_of_conduct'
    `;

    await saveRegistration(tx, userId, editionId, { ...values, answers: { ...values.answers, meet_wish: undefined } });

    const rows = await tx<{ question: string; answeredAt: Date }[]>`
      select question, answered_at as "answeredAt" from public.registration_answers
      where profile_id = ${userId} and edition_id = ${editionId}
    `;
    expect(rows.map((r) => r.question)).not.toContain("meet_wish");
    const agreed = rows.find((r) => r.question === "agree_code_of_conduct")!;
    expect(agreed.answeredAt.toISOString()).toBe("2027-01-05T12:00:00.000Z");
  });
});
