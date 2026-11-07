# GitHub configuration

How limicon-app is set up on GitHub, and what's still to decide. Org `limicon` on GitHub, public repo `limicon-app`, default branch `main`.

Status: Current as of 2026-11-06.

## Decisions open

1. **Commit straight to `main`, or go through pull requests?** Pull requests let tests run, and someone review, before a change reaches `main`. Committing straight to `main` is quicker, but a broken change lands first and gets fixed after. This decides how much of the next section applies.
2. **Track work in GitHub Issues, or somewhere else?** Issues and Projects are on by default. If work is tracked elsewhere, turning them off avoids a second to-do list nobody reads.

## Branch protection and pull requests

How changes get into `main`, and who can change it.

These settings follow from decision 1. They go together:

- **Commit directly to `main`.** The pull request settings barely matter. Branch protection shrinks to blocking force pushes and deletion of `main`. CI runs after each push instead of gating it, so a broken commit sits on `main` until the next one fixes it.
- **Short-lived branches merged into `main` by PR.** The two tables below apply.

### Pull request settings

Suggestions for Settings → General → Pull Requests (inspired by is-app).

| Setting | Now | Candidate | Notes |
|---|---|---|---|
| Allow merge commits | on | on | Keeps each PR as one visible unit in `main`'s history. |
| Allow squash merging | on | off | Collapses a PR's commits into one. If several methods are allowed, whoever merges picks one each time. |
| Allow rebase merging | on | off | Replays the PR's commits onto `main` with no merge commit, so there's no record of where the PR started and ended. |
| Default merge commit title | "Merge pull request #N from …" | PR title | |
| Default merge commit message | PR title | PR description | Moves the PR body into `main`'s history. |
| Always suggest updating PR branches | off | on | Prompts the author when `main` has moved. The **Update branch** button merges `main` into the branch; rebasing locally is the alternative. |
| Automatically delete head branches | off | on | Deletes the remote branch after merge. |
| Allow auto-merge | off | off | Auto-merge waits only for *required* checks, so it's only safe once every check that matters is required. |

The Candidate column configures "merge commits only" for detailed semi-linear history.

### Branch protection on `main`

`limicon-app` has no branch protection.

The candidate below is a repository ruleset targeting the default branch (`~DEFAULT_BRANCH`), modelled on `is-app`'s. Keeping the ruleset as code in a script would put rule changes through review.

| Rule | Now | Candidate | Notes |
|---|---|---|---|
| Restrict deletions | off | on | Nobody can delete `main`. |
| Block force pushes | off | on | `main`'s history can't be rewritten. |
| Require a pull request | off | on, 0 approvals | Every change goes through a PR, solo work included, so CI runs before merge. Zero approvals means one person isn't blocked waiting for review. |
| Require code owner review | off | on | With zero approvals, this applies only to paths in `.github/CODEOWNERS`. Listing `.github/workflows/` and `CODEOWNERS` there means a workflow change, which can reach CI secrets, needs a second person. |
| Require status checks | off | the main CI job | Needs CI. The check name is the job's `name:` in the workflow file. |
| Require branches to be up to date | off | on | Needs CI. CI must have passed on the exact commit that lands. |
| Bypass list | — | Repository admin, "For pull requests only" | Admins can override a rule only by ticking a checkbox in the merge box. The other mode, "Always", silently skips every rule, code owner review included. |

## Reference: already set or not yet needed

Everything below is either already configured or waits on code that doesn't exist yet. A skim can stop here.

### Actions

Automated jobs, such as tests and scheduled maintenance, that run on GitHub's servers. Settings → Actions → General. Some of these are inherited from the org.

| Setting | Now | Notes |
|---|---|---|
| Default `GITHUB_TOKEN` permissions | read (org default) | A workflow that needs more asks for it in its own `permissions:` block. |
| Allow GitHub Actions to create and approve PRs | on (org) | Lets a workflow open PRs with `GITHUB_TOKEN`, for example a scheduled `npm audit fix` PR. A PR opened that way doesn't trigger other workflows, so its CI waits until someone clicks **Approve workflows to run**. |
| Require actions pinned to a full-length commit SHA | off (org) | Guards against an action's tag being moved to different code. The cost is that every action reference has to be a SHA, which Dependabot can keep up to date. |
| Fork PR workflow approval | all external contributors (org) | Anyone who isn't an org member or repo collaborator needs a write-access user to approve each workflow run on their PR. Matters only once outsiders can open PRs. |

### Environments

A way to lock production passwords behind an approval step. None yet. An environment with a required reviewer is an option for production credentials: any workflow using them then waits for approval, which repo secrets don't do.

### Security

`limicon-app` uses the org's default security configuration, `limicon-org-config-1` (org Settings → Advanced Security → Configurations), which checks for leaked passwords and vulnerable libraries. It's enforced, so repo admins can't switch its features off. Only an org owner or security manager can change which configuration a repo uses.

| Feature | Setting | Notes |
|---|---|---|
| Dependency graph, Dependabot alerts | on | Alerts on known-vulnerable dependencies. |
| Dependabot security updates | on, grouped | Dependabot opens fix PRs. Grouping is an org setting that bundles fixes into one PR per package manager and directory. |
| Secret scanning and push protection | on | Push protection blocks a commit containing a recognized secret before it reaches GitHub. |
| Private vulnerability reporting | on | Gives outside reporters a private channel on the Security tab. |
| Code scanning | CodeQL default setup | Default setup needs no workflow file. It has no languages to scan until the repo has code or workflow files. |

### Settings that should be kept in files

As much as possible, settings should live in the repo and be versioned with the code. `limicon-app` has `SECURITY.md`, which points reporters to private vulnerability reporting. It doesn't have these yet:

- `.github/CODEOWNERS`: the paths that need code owner review.
- `.github/dependabot.yml`: version-update PRs. One pattern: run weekly, group minor and patch bumps, and wait a few days after a release before proposing it.
- `.github/PULL_REQUEST_TEMPLATE.md`: shapes the PR body, which becomes the merge commit message if the merge commit settings use the PR description.
