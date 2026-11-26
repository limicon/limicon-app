import { defineConfig } from "vitest/config";

import { LOCAL_DATABASE_URL } from "./supabase/local";

// Kept apart from vite.config.ts so tests run in plain Node, without the Cloudflare and React
// Router build plugins.
export default defineConfig({
  // Resolves the `~/` imports the app uses, from the tsconfig `paths`.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["app/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    // The app's tests sit in a separate TypeScript project from `supabase/local.ts`, so they get
    // the address from here.
    env: { DATABASE_URL: LOCAL_DATABASE_URL },
  },
});
