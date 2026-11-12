import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so tests run in plain Node, without the Cloudflare and React
// Router build plugins.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "supabase/tests/**/*.test.ts"],
  },
});
