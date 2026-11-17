// Prints "true" when a change touches only documentation: files under docs/, and the root
// AGENTS.md, CLAUDE.md and README.md. CI and the commit process use it to skip tests and builds
// for such changes.
//
//   node scripts/is-docs-only.mjs --staged   the staged changes, before a commit
//   node scripts/is-docs-only.mjs <base>     the changes from <base> to HEAD, in CI
//
// No change at all, or anything else it can't decide, prints "false", so the checks run. A usage
// error exits 2. In GitHub Actions it also writes docs_only=<result> to $GITHUB_OUTPUT.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const DOCS_ONLY_PATHS = ["docs/", "AGENTS.md", "CLAUDE.md", "README.md"];

// Everything except the docs paths, from the repo root wherever the script runs. Git applies a
// pathspec before rename detection, so a rename from app/ into docs/ still shows the app/ deletion.
const NON_DOCS_PATHSPEC = [":/", ...DOCS_ONLY_PATHS.map((path) => `:(top,exclude)${path}`)];

// True when `git diff --quiet` finds differences. Exit 1 means differences; anything else
// but 0 is a git error, which throws.
function differs(diffArgs, pathspec = []) {
  try {
    execFileSync("git", ["diff", "--quiet", ...diffArgs, "--", ...pathspec], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function parseArgs(args) {
  if (args.length !== 1) return null;
  if (args[0] === "--staged") return ["--cached"];
  if (args[0].startsWith("-")) return null;
  // A push that creates a branch has an all-zero "before" commit, and a missing base arrives
  // empty: either way there is nothing to compare, so the checks run.
  if (/^0*$/.test(args[0])) return [];
  return [`${args[0]}...HEAD`];
}

const diffArgs = parseArgs(process.argv.slice(2));
if (diffArgs === null) {
  console.error("usage: node scripts/is-docs-only.mjs --staged | <base>");
  process.exit(2);
}

let result = false;
if (diffArgs.length > 0) {
  try {
    result = differs(diffArgs) && !differs(diffArgs, NON_DOCS_PATHSPEC);
  } catch (error) {
    console.error(`is-docs-only: ${error.message}`);
  }
}

console.log(String(result));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${result}\n`);
