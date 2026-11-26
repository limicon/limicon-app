/**
 * The local Supabase database, for tests. Its port is `[db] port` in `config.toml`, and
 * `wrangler.jsonc` gives the app the same address as Hyperdrive's `localConnectionString`.
 */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54372/postgres";
