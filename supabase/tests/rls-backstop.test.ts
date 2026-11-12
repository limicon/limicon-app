import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

// Runs against the local Supabase database from `npm run db:start`.
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

/** Runs `work` in a transaction that is always rolled back, so tests leave no rows behind. */
async function inRolledBackTransaction(work: (tx: postgres.TransactionSql) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      await work(tx);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

describe("row-level security backstop", () => {
  test("every public table has RLS enabled and no policies", async () => {
    const tables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      select tablename, rowsecurity from pg_tables where schemaname = 'public'
    `;
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)).toEqual([]);

    const policies = await sql`
      select tablename, policyname from pg_policies where schemaname = 'public'
    `;
    expect(policies).toEqual([]);
  });

  test("the Data API's roles read no rows from any public table", async () => {
    await inRolledBackTransaction(async (tx) => {
      // Gives every table at least one row, so an empty result means access was blocked.
      const [user] = await tx<{ id: string }[]>`
        insert into auth.users (id, email, aud, role)
        values (gen_random_uuid(), 'rls-test@example.org', 'authenticated', 'authenticated')
        returning id
      `;
      await tx`insert into public.editions (year) values (2099)`;
      await tx`
        insert into public.admin_permissions (profile_id, permission)
        values (${user!.id}, 'test')
      `;

      const tables = await tx<{ tablename: string }[]>`
        select tablename from pg_tables where schemaname = 'public'
      `;
      for (const role of ["anon", "authenticated"]) {
        for (const { tablename } of tables) {
          // A savepoint keeps a permission error from aborting the whole transaction; a
          // refused read counts as no rows.
          const rows = await tx
            .savepoint(async (sp) => {
              await sp.unsafe(`set local role ${role}`);
              return sp.unsafe(`select 1 from public.${tablename}`);
            })
            .catch(() => []);
          await tx.unsafe("reset role");
          expect(rows, `${role} reading ${tablename}`).toHaveLength(0);
        }
      }
    });
  });
});

describe("new accounts", () => {
  test("get a profile, named from their Google details when present", async () => {
    await inRolledBackTransaction(async (tx) => {
      const metadata = { given_name: "Ada", family_name: "Lovelace" };
      const [user] = await tx<{ id: string }[]>`
        insert into auth.users (id, email, aud, role, raw_user_meta_data)
        values (gen_random_uuid(), 'new-member@example.org', 'authenticated', 'authenticated',
                ${tx.json(metadata)})
        returning id
      `;
      const [profile] = await tx`
        select first_name, last_name from public.profiles where id = ${user!.id}
      `;
      expect(profile).toEqual({ first_name: "Ada", last_name: "Lovelace" });
    });
  });
});
