# Branching, isolation and the `stage` backup

This repo is worked by **two machines** running **Claude Code, OpenCode and Codex** — often
concurrently, sometimes several sessions of one tool. No session may assume it is the only
one. These rules exist because every incident so far was caught by a person cross-checking,
not by anything stopping it.

## 1. Never work on `master`

`master` is a merge target, not a workspace. **Branch protection enforces this**: a direct
push is refused by the server, for every tool, on every machine, including the repo owner.

If your push to `master` is rejected, that is the rule working. Do not look for a way
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
`SESSION_STATE.md` rather than leaving the prefix to mislead the next session.

**A branch name is not evidence of its upstream.** A local branch can carry one name and
track another; that exact mismatch misled a session on 2026-09-02 into a false push-safety
claim. Before disclosing what branch you are on, run
`git rev-parse --abbrev-ref @{upstream}` and report *that*.

## 3. Sync before you work, not after

Rebase or merge `master` into your branch **before** starting work that is not central to
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

At session start: read `SESSION_STATE.md`, then declare your **tool, branch and intent**
there. Before taking a branch, check whether another session has declared it.

Never push to a branch another session has declared without asking that session and waiting
for an explicit answer. A clear is true as of its timestamp, not indefinitely.

If your host has a `Stop`/`SessionEnd` hook that checkpoints (this repo has seen
`git-sync.ps1 -Mode Checkpoint`, which commits WIP and pushes the current branch), you
cannot promise a commit stays local. Check before offering that guarantee, and say which
case you are in.

## 6. The `stage` backup

`stage` is the last `master` that passed checks — the rollback point.

- It advances **only** from `master`, **only** when the check gate is green, and only via
  `.github/workflows/stage-backup.yml`. Nothing pushes to it by hand.
- To see what you would roll back to: `git log origin/stage -1`.
- To roll back: branch from `origin/stage`, open a PR to `master`. Even a rollback goes
  through a PR — protection has no exceptions.

If `stage` and `master` are equal, the current `master` passed its checks. If `stage` lags,
the commits between them have not.

## What these rules cannot do

They bind sessions that read this file, and branch protection binds every tool at the
server. Neither binds a human merging from the GitHub UI who chooses to dismiss a check,
and nothing here can. Treat this as a standing instruction for agent-driven work plus one
real gate, not as a complete perimeter.

## Related

- `docs/agents/migrations-on-merge.md` — what a merge owes its migrations
- `docs/agents/session-roles.md` — the named Rex/Quinn two-session arrangement
- `SESSION_STATE.md` — the cross-session declaration log
- `AGENTS.md` — canonical setup and conventions
