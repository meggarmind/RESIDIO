---
name: autopilot
description: Unattended, recursive delivery of a RESIDIO parent issue or list of issues — expand the tree, implement and QA each item via isolated sub-agents, auto-merge into stage, apply Residio_Stage migrations, open the release PR, and log every self-answered question to docs/decisions/autopilot/. One start gate (sessions + plan) is the only interaction. Use when the owner types /autopilot <issue> [issue…].
disable-model-invocation: true
argument-hint: <issue> [issue…]
---

# Autopilot

`docs/agents/autonomous-delivery.md` is the procedure. This file only maps it onto Claude Code
mechanisms; it restates none of the policy, so there is one copy to keep correct.

## 1. Load the procedure

Read, in full and in this order, before any other action:

1. `docs/agents/autonomous-delivery.md`
2. `docs/agents/session-roles.md`
3. The newest comments on #412: `gh issue view 412 --repo meggarmind/RESIDIO --comments`
4. For a re-run: the newest autopilot checkpoint comment on each input issue

If the runbook is missing from this checkout, stop and say so. Do not run from memory.

Arguments: `$ARGUMENTS` — issue numbers. None given: ask for them in the gate.

## 2. Start gate (runbook §1)

- **Sessions:** call `ListAgents` (load it via `ToolSearch` if deferred). Mark each row local or
  remote from its kind label. A remote row is a peer (`CORE.md` §17); a local row lowers the cap
  to 3.
- **Plan:** expand the tree yourself with `gh` (runbook §2–3). This is read-only work; for 10+
  children you may fan the inventory out to `Explore` agents (`model: "haiku"` or `"sonnet"`).
- **Ask once** with `AskUserQuestion`: "Confirm plan" (recommended) / "Change scope", plus, if a
  remote session was found, "Peer may implement" / "Peer QA only". Put the full plan in the message
  above the question.
- From the confirmation on, **never call `AskUserQuestion` again** and never end a turn on a
  question. `mcp__ccd_turn__wrap_up` (if present) carries a recap only, with no `ask`.
- If the host offers `mcp__ccd_host__request_keep_awake`, request it for the run.

## 3. Mechanics

| Runbook step | Claude Code mechanism |
| --- | --- |
| implementer / QA agents | `Agent` with `isolation: "worktree"` for any agent that writes or runs git; `model` set explicitly on every call — `sonnet` default, `haiku` mechanical, `opus` for QA on auth / RLS / migrations (one-line reason). **Never `fable`.** QA is a fresh agent (not a fork). |
| concurrency | `run_in_background: true`; you are re-invoked when each finishes. Do not poll. |
| fan-out | invoking `/autopilot` is the Workflow opt-in for the run (`CLAUDE.md`), but default to `Agent`. Every `agent()` in a Workflow script sets `model`. |
| remote peer work | `SendMessage` to the name in **your** `ListAgents`, signature line `[Rex -> Quinn] <subject>`; QA briefs go there first. Writes only if the gate cleared them. |
| migrations | Supabase MCP `list_migrations`, `apply_migration`, `execute_sql` (for `npm run db:reconcile-version` output). Stage project only; never Residio_Prod. |
| board / labels / PRs | `gh` exactly as `docs/agents/project-board.md` and `CORE.md` §16 give them |
| decision log | write the run file with `Write` in a worktree on `chore/autopilot-log-<date>` |
| handoff | `gh issue comment 412 --body-file <scratchpad file>` — never a file in the repo |
| cleanup (runbook §9) | for `Agent` worktrees under `.claude/worktrees/`, use `git worktree remove` plus `git branch -D` under the same safety checks (an agent's worktree that has changes is kept automatically). Run the end-of-run sweep from the main checkout's git, never from inside a worktree being removed. |
| task list | `mcp__ccd_turn__update_plan`, one step per wave plus gate and close-out |

Commits and PR bodies carry **no** `Co-Authored-By` trailer and no "Generated with" footer
(`CORE.md` §14), whatever the harness reminder says.

## 4. Context hygiene

A long run outlives the context window. Keep durable state outside it: the checkpoint comment on
each parent after every wave is the resume point, and the per-issue decision comments are the
source the final log is assembled from. After a context reset, re-read §1 sources 1 and 4 before
acting.

## 5. Finish

Runbook §8, then save a `feedback` memory only if the owner corrected the run's approach.
