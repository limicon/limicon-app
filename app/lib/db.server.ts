import { env } from "cloudflare:workers";
import postgres from "postgres";

/**
 * A Postgres connection through Hyperdrive, which pools connections near the database, so each
 * request opens its own client. It connects as a role that bypasses row-level security: every
 * query must check the signed-in member's permissions itself.
 */
export function createDb() {
  return postgres(env.HYPERDRIVE.connectionString, {
    // Hyperdrive limits how many connections one Worker invocation can open.
    max: 5,
    // Skips a lookup of custom Postgres types on every new connection.
    fetch_types: false,
  });
}

export type Db = ReturnType<typeof createDb>;
