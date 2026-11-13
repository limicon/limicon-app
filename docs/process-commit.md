# Committing

How an agent turns working-tree changes into a commit. A human reviews each commit before it's pushed.

Commits go straight to `main` until the team decides on pull requests (`docs/config-github.md`).

Write to the human in plain language; they may not know git. Include your recommendation when sensible.

## Steps

1. **Catch up.** `git fetch`, then `git status -sb`. If `main` is behind `origin/main`, run `git pull --rebase --autostash`, which sets uncommitted changes aside, updates, and puts them back. See [Conflicts](#conflicts).
2. **Choose the payload** from the files `git status` lists. One commit per logical change; split unrelated changes into separate commits. Stage named paths with `git add -- <paths>`. Don't use `git add .` or `git add -A`, which sweep in everything.
3. **Check for anything that doesn't belong.** Read the staged changes; stop and ask the human about any of these:
   - keys, tokens, passwords or other credentials, in any file; the repo is public
   - environment files (`.env*`)
   - build output, test reports or editor and OS files (such as `.DS_Store`)
   - lockfile changes when no dependency changed on purpose
   - very large files
   - files unrelated to the task
4. **Decide whether the change needs a docs/devjournal.md entry.** Most commits don't. Write one only if the future work of human teammates will be impacted by reading it. Stage it with the rest.
5. **Run the tests and checks.** Never ignore a failure, regardless of the cause. Run `npm run typecheck` and `npm test`, with the local Supabase running for the database tests.
6. **Draft the message.**
   - Subject: an imperative summary of the change, such as "Let hosts edit a session after submitting it". Keep it to 72 characters or fewer.
   - Body: what changed and why it matters. Leave out how the change was found. Don't hard-wrap lines.
   - Trailers: as in `AGENTS.md` → Writing → AI attribution.
7. **Commit.**
8. **Show the commit, in one message.** (If step 2 made several commits, show them all together.)
   - the full commit message
   - the committed files (`git show --stat HEAD`), plus anything left unstaged or untracked
   - the devjournal entry, if there is one
9. **Ask the human to request changes, or type `y` to push.**
   - For changes, amend the commit and go back to step 8.
   - On `y`, push.
   - If the push is rejected because `main` has moved, run `git pull --rebase --autostash` (see [Conflicts](#conflicts)), then go back to step 8 and say which conflicts you resolved.

## Conflicts

A `git pull --rebase --autostash` can hit two kinds of conflict:

- **A commit conflicts as it's replayed onto the new `main`.** Git stops partway through the rebase.
- **Uncommitted changes conflict as they're put back.** Git reports success anyway, so run `git status` after every pull. The stash still holds the changes as they were.

Resolve a conflict yourself only when keeping both sides is clearly right, such as two additions to the same list. For any other conflict, explain it to the human:

- For a commit conflict, run `git rebase --abort` first, which puts everything back as it was before the pull.
- For an uncommitted-changes conflict, leave the stash in place, and don't run the `git reset --hard` that Git suggests.

## Never, without explicit human approval

- `--no-verify` or any other way around a failing hook
- `--amend`, other than for changes the human asked for in step 9. If a commit itself fails, fix the problem and commit again.
- rewriting commits already pushed, or force-pushing
- discarding uncommitted changes (`git reset --hard`, `git checkout -- <path>`, `git restore`, `git clean`), which can't be recovered
