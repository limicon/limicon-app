import { execSync } from "node:child_process";

/**
 * Starts the local Supabase if it isn't running, and stops it again after the tests. A stack
 * that was already running, such as one started for development or by CI, is left as it is.
 * Tests find Mailpit through `process.env.MAILPIT_URL`.
 */
export default function globalSetup() {
  let teardown: (() => void) | undefined;
  try {
    execSync("npx supabase status", { stdio: "ignore" });
  } catch {
    execSync("npx supabase start", { stdio: "inherit" });
    teardown = () => {
      execSync("npx supabase stop", { stdio: "inherit" });
    };
  }

  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  process.env.MAILPIT_URL = status.MAILPIT_URL;
  return teardown;
}
