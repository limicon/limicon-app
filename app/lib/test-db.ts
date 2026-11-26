/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, expect } from "vitest";

import type { Db } from "./db.server";

/**
 * Connects a test file to the local database, with the app's own client options, and closes the
 * connection after the file's tests. `vitest.config.ts` sets `DATABASE_URL`.
 */
export function connectTestDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is unset; run database tests through Vitest");
  const sql = postgres(url, { max: 1, fetch_types: false, onnotice: () => {} });
  afterAll(() => sql.end());

  /** Runs `work` in a transaction that always rolls back, so tests leave no rows behind. */
  async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
    const rollback = new Error("rollback");
    await expect(
      sql.begin(async (tx) => {
        // A transaction runs the same tagged-template queries as the client the app passes around.
        await work(tx as unknown as Db);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  }

  return { sql, inRolledBackTransaction };
}
