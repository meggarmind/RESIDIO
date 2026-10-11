# Branching, isolation, `stage` and promotion

This repo is worked by **two machines** running **Claude Code, OpenCode and Codex** — often
concurrently, sometimes several sessions of one tool. No session may assume it is the only
one. These rules exist because every incident so far was caught by a person cross-checking,
not by anything stopping it.

## 1. Never work on `master` (or `stage`)

`master` is a merge target, not a workspace, and so is `stage` (§6). **Branch protection
enforces this on both**: a direct push is refused by the server, for every tool, on every
machine, including the repo owner.

If your push to `master` or `stage` is rejected, that is the rule working. Do not look for a way
around it, do not ask a human to force it through, and do not ask another session to push
on your behalf — that last one is the same bypass wearing a disguise. Open a PR.

## 2. Branch names declare their lane

The prefix says which workstream owns the branch, so any session can see who holds it
without asking:

| Prefix | Lane | Created by |
| --- | --- | --- |
| `codex/issue-<n>-<slug>` | Repo and board issues | Codex (`scripts/issue-workflow.mjs`) |
| `feat/<slug>` | New features, optimization | Claude Code |
| `fix/<slug>` | Targeted fixes | Claude Code |
| `qa/<date>` | Manual QA passes | Any |
| `merge/<slug>` | Short-lived integration branch for resolving a merge | Any |

These are lane defaults, not walls — exceptions happen. When you cross lanes, say so in
your handoff comment on issue #412 rather than leaving the prefix to mislead the next session.

**A branch name is not evidence of its upstream.** A local branch can carry one name and
track another; that exact mismatch misled a session on 2026-09-02 into a false push-safety
claim. Before disclosing what branch you are on, run
`git rev-parse --abbrev-ref @{upstream}` and report *that*.

## 3. Sync before you work, not after

Rebase or merge `stage` into your branch **before** starting work that is not central to
the feature, and again before opening a PR. A branch that drifts 20 commits behind turns a
mechanical merge into a judgement call about conflicts nobody planned.

## 4. Migrations ride their own branch

A migration is applied **only** from the branch that introduces it, and only after that
branch merges. Never apply a migration from another branch. Never apply one "to close a gap
in the sequence" — a gap is usually deliberate, and the record explaining it may not be on
your branch.

Before applying anything that touches RBAC, auth or RLS, check open issues for that area.

`docs/agents/migrations-on-merge.md` holds the full discipline. Its load-bearing rule:
**verify by name against the database's applied list, never the directory.** The directory
looks correct in every one of these failure modes.

## 5. Assume other workstreams exist

**The remote branch list is the live registry — not the handoff record.**

The handoff record is written at end of session, after the coordination window it could
protect has closed. Do not use it for live signalling.

Instead:

```bash
git ls-remote --heads origin      # who is working on what, right now
```

**Push your branch early**, before you have much on it. The push is the declaration: the
prefix names your lane and the branch name names your work, visible to every tool on every
machine the moment it lands, with no PR in the way. Check that list before taking a branch.

The pinned issue **#412** is the end-of-session **handoff record** — what happened, what was
verified, what is left. Each session posts one comment; read and write it with:

```bash
gh issue view 412 --repo meggarmind/RESIDIO --comments
gh issue comment 412 --repo meggarmind/RESIDIO --body-file handoff.md
```

That is a record, not a signal. It lives in an issue rather than a file because `master` is
protected and a file change there costs a PR. `SESSION_STATE.md` is a frozen archive (2026-10-07).

Never push to a branch another session has declared without asking that session and waiting
for an explicit answer. A clear is true as of its timestamp, not indefinitely.

If your host has a `Stop`/`SessionEnd` hook that checkpoints, you cannot promise a commit
stays local. Check before offering that guarantee, and say which case you are in.

This repo has seen exactly that: `git-sync.ps1 -Mode Checkpoint`, which commits WIP and
pushes the current branch. **It was removed from the owner's machine on 2026-09-07**, so
that machine no longer auto-commits — but the check still applies, because a peer on a
different system may still run one. Verify your own host rather than assuming.

## 6. Stage and promotion

Since 2026-10-11 (owner decision, #420) `stage` is the **leading integration branch** and
`master` is **production**. Until then `stage` was a lagging backup moved by
`stage-backup.yml`; that workflow is deleted, and nothing about the old meaning still applies.

```
feature branch --PR--> stage   (Coolify residio-stage, stage.<domain>, Residio_Stage: UAT)
stage --PR "Release vX.Y.Z" (merge commit)--> master   (Coolify residio-prod, app.<domain>, Residio_Prod)
hotfix: branch from master --PR--> master, then merge master back into stage
```

- **Feature and fix branches start from `origin/stage` and their PRs target `stage`.**
  `npm run issue:workflow -- start` already branches from `origin/stage`.
- **A release is a PR from `stage` to `master`**, titled `Release vX.Y.Z`, merged with a
  **merge commit, never a squash**. A squash would give `master` commits `stage` does not have,
  and every later release PR would show already-shipped work again.
- **Label the release PR** with exactly one of `release:major`, `release:minor`,
  `release:patch` or `release:none` (meanings in `CORE.md` §7 and
  `scripts/release-version.mjs`). On merge, `.github/workflows/release.yml` pushes the next
  `vX.Y.Z` tag on the merge commit, counted from the last tag. No label, an unknown label or
  `release:none` pushes nothing; two different release labels fail the run without tagging. A
  `release:*` label on a PR into `stage` does nothing.
- **A hotfix branches from `master` and targets `master`.** Merge `master` back into `stage`
  in its own PR straight after, so the fix is not lost at the next release.
- **Both branches require the `PR gate` check** (`.github/workflows/pr-gate.yml`) and a PR.
  PRs into `master` also run the **`Security gate`** check (below).
- **Migrations are applied twice**: to Residio_Stage when they merge into `stage`, to
  Residio_Prod when the release merges into `master`. See `docs/agents/migrations-on-merge.md`.

**Rollback** is the previous release on `master`: its `vX.Y.Z` tag (or, for releases before
the first tag, its release merge commit). Redeploy that commit in Coolify, or open a revert
PR to `master` (and merge `master` back into `stage` afterwards). Even a rollback goes through
a PR. Never move a branch ref by hand.

To see what is in UAT but not yet in production:

```bash
git fetch origin stage master
git log --oneline origin/master..origin/stage
```

### The release flow and its security gate (#429)

```
feature PR --> stage     PR gate (lint, typecheck, vitest, build)
                          -> Coolify residio-stage deploys, UAT on Residio_Stage
Release PR stage --> master
                          PR gate + Security gate
                          -> merge commit, apply migrations to Residio_Prod (migrations-on-merge.md)
                          -> manual production deploy in Coolify (residio-prod)
```

`Security gate` (`.github/workflows/security-gate.yml`) runs on PRs into `master` only, never on
PRs into `stage`, and on demand from the Actions tab (**Run workflow**, pick `stage` to preview
the next release). It runs four checks, each a job with its own summary of counts:

| Check | Tool | Blocking in enforce mode |
| --- | --- | --- |
| Dependency audit | `npm audit --omit=dev` (full tree shown for information) | any critical or high production dependency |
| Secret scan | gitleaks over the PR's commits (whole history on a manual run) | any finding |
| Static analysis | CodeQL `javascript-typescript` | any error-level alert |
| RBAC/audit contract | `src/__tests__/integration/module-integration.test.ts` alone | any failure |

Read the release's posture from the PR's **Checks** tab: the `Security gate` job's summary has
the table per check, and each check job's summary has the detail.

**It is report-only today** (owner decision 2026-10-11): the check is green whatever it finds,
and its summary says how many findings would block. On 2026-10-11 the dependency audit alone
would block, with 1 critical and 9 high production advisories (3 critical and 28 high across
the full tree, the figure the Coolify build log shows).

**To make it blocking**, once the critical/high backlog is cleared:

1. Change one line in `security-gate.yml`, `SECURITY_GATE_MODE: report` to
   `SECURITY_GATE_MODE: enforce`, by PR. Enforce mode also fails when a check could not run,
   so an outage cannot pass a release silently.
2. The owner adds `Security gate` as a required status check on `master`'s branch protection.
   Require that single aggregate check, not the four jobs, as with `PR gate`.

The gate needs no secrets beyond `GITHUB_TOKEN`. A finding in the secret scan means rotating
the credential, not only deleting it, since it stays in history.

## What these rules cannot do

They bind sessions that read this file, and branch protection binds every tool at the
server. Neither binds a human merging from the GitHub UI who chooses to dismiss a check,
and nothing here can. Treat this as a standing instruction for agent-driven work plus one
real gate, not as a complete perimeter.

## Related

- `docs/agents/migrations-on-merge.md` — what a merge owes its migrations
- `docs/agents/session-roles.md` — the named Rex/Quinn two-session arrangement
- Issue #412 — the live cross-session handoff record (`SESSION_STATE.md` is its frozen archive)
- `AGENTS.md` — canonical setup and conventions
