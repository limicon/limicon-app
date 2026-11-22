import { createRequestHandler } from "react-router";

import { createDb } from "../app/lib/db.server";
import { googleCalendarConfig, runCalendarSync } from "../app/lib/google-calendar.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },

  // Every minute (wrangler.jsonc `triggers`): syncs Google Calendar with any session still queued,
  // which retries syncs that failed after a form post.
  async scheduled(_controller, env) {
    const config = googleCalendarConfig(env as unknown as Record<string, unknown>);
    if (!config) return;
    const sql = createDb(env.HYPERDRIVE.connectionString);
    try {
      await runCalendarSync(sql, config);
    } finally {
      await sql.end();
    }
  },
} satisfies ExportedHandler<Env>;
