# Autonomous delivery ("autopilot")

A runbook for delivering a parent issue, or a list of issues, **end to end without the owner
watching**: expand the tree, implement and QA every item, land it on `stage`, apply Stage
migrations, and open the release PR — answering its own questions on the way and writing every
question and decision down.

This file is tool-neutral (`CORE.md` §2). Claude Code runs it through the `autopilot` skill
(`.claude/skills/autopilot/`); Codex and OpenCode read this file directly. Every decision in it
was taken by the owner on 2026-10-15 (#625) — do not re-litigate them.

**Everything in `CORE.md` still binds.** This runbook changes exactly two things for the length
of a run, and only after the start gate (§1) is confirmed:

1. `CORE.md` §15 "Stop and ask the user" becomes **decide, log, or park** (§4). There is no one
   to ask.
2. The run lands its own feature PRs on `stage` and applies their migrations to Residio_Stage
   (`CORE.md` §16 "Who merges" and §11 rule 6 already allow this; the run does it without being
   prompted).

It never merges into `master`, never touches Residio_Prod, and never deploys production.

---

## 0. Input

One or more issue numbers. Any of them may be a parent. Read issue #412's latest handoff comments
first (`CORE.md` §14) — they carry decisions the run must honour.

## 1. Start gate — the only interactive step

The owner is present at launch and absent afterwards. Everything that needs their consent is
collected here, once.

**1a. Detect sessions.** List every reachable agent session (Claude Code: `ListAgents`). For
each, record its kind — **local** (same machine: contention, not capacity) or **remote** (a
different system: capacity, `CORE.md` §17). Read `docs/agents/session-roles.md` before planning
any cross-session work.

**1b. Find claims.** `git ls-remote --heads origin` and open PRs. An issue with a live branch or
open PR is claimed by someone else unless it is plainly this run's own earlier work (§8).

**1c. Expand the tree** (§2) and classify every node (§3).

**1d. Present the gate**, then wait for the reply:

- sessions found — name, kind, and what each appears to be working on; **call out any remote
  session explicitly**
- the expanded tree, the execution order (waves), and per item: action, model tier, and why
- items to be skipped (closed, portal, claimed, `ready-for-human`) and items expected to park
- concurrency: 5 tree-mutating agents on this machine; **3** if another local session is active;
  up to 8 total if a remote peer is cleared for writes, never more than 5 per side
- the question: *Confirm the plan? And, if a remote peer was found: may it implement (worktrees,
  commits, pushes on its own branches), or QA and read-only work only?*

Always show the gate, even when no other session is found. Without an explicit "yes" the peer is
QA and read-only only (`CORE.md` §17 already permits that). After confirmation, **never ask the
owner anything again** in this run.

## 2. Expanding the tree

For each input number, recursively and to any depth:

1. native GitHub sub-issues (`gh issue view <n> --json subIssues`)
2. `- [ ] #n` task lists in the body
3. `#n` references in the body that the text presents as part of the work (not "Related:")

Skip and record: closed issues; resident-portal / self-service work (`CORE.md` §3); issues
claimed by another session (§1b). Order the remainder by stated dependencies (`blockedBy`,
"depends on", "after #n"); independent items share a wave. A parent is complete when all its
children are done or parked — **never close a parent because its children closed** (`CORE.md`
§8).

**Inventory before planning** (`CORE.md` §15). Issue bodies go stale. Check each item against the
code and, where it applies, the database. An item that is already done is closed with the
evidence (commit, file:line, query result); a body that is wrong is corrected in a comment before
any agent is briefed from it.

## 3. Triage by label

| Label | Action |
| --- | --- |
| `ready-for-agent` | implement |
| `backlog` (legacy `needs-triage`) / unlabelled | triage it yourself (`docs/agents/triage-labels.md`), then implement or skip with a reason |
| `needs-info` | answer the open question from precedent (§4), record it, then implement |
| `wayfinder:grilling` | decide it from precedent (§4), post the decision as the issue's answer, close it, and let its dependants proceed |
| `ready-for-human` | **skip** — the owner said it needs them. Comment that the run passed it over |
| `wontfix` | skip |

## 4. Answering your own questions

Whenever a question arises that `CORE.md` §15 would have asked the owner, settle it in this order
and stop at the first source that answers it:

1. **The owner's recorded decisions** — #412 handoffs, comments on the issue and its parents,
   `docs/adr/`, `CONTEXT.md`, and (Claude Code) account memory. Cite the source.
2. **Project policy and docs** — `CORE.md`, `docs/agents/*.md`, `DESIGN_AGENTS.md`, the code's
   existing conventions.
3. **Your own recommendation** — the option you would have proposed first. Say why.

Then log it (§7) and carry on.

### Park, do not decide

Some decisions are too expensive to make on precedent. If an item needs any of the following,
**park it**:

- the set of people who can see or do something **widens** (RBAC, RLS, route permissions) —
  narrowing is decidable
- a destructive migration or data deletion (DROP, destructive ALTER, DELETE/UPDATE of existing
  rows, a migration the code cannot run without)
- money calculations: billing, invoicing, levies, wallet, payment amounts
- secrets, credentials, or personal data

Also park an item that **fails QA twice** (`CORE.md` §15), with the failing evidence.

To park: post the question, the options, your recommendation and the evidence as a comment on the
issue; add `ready-for-human`; record it in the run log (§7). Skip everything that depends on it.
Keep going on every other branch.

Defects found outside an item's scope are **filed, not absorbed** (`CORE.md` §10 rule 4, §15):
file the issue, parent it to the right map, leave it out of the run.

## 5. Per-item delivery

Exactly `CORE.md` §15 and §16, with no shortcuts:

1. Add your `harness:*` label (`CORE.md` §9); the board moves to **In progress** by itself when the branch is pushed (step 2).
2. Integration worktree `.worktrees/issue-<n>` on `<lane>/issue-<n>-<slug>` from `origin/stage`;
   push it at once — the push is the claim (`CORE.md` §7).
3. Dispatch the implementer into its own worktree, with the full brief and verbatim clauses from
   `CORE.md` §15 ("Dispatch"). Model per tier; top tier needs a one-line reason.
4. Dispatch a **fresh, blind** QA agent — on the remote peer where one is available — that
   mutation-tests the tests. Top tier for anything touching auth, RLS or migrations.
5. FAIL → back to the implementer with the defects. Second FAIL → park (§4).
6. PASS / PASS WITH NOTES → verify the diff yourself (`CORE.md` §15 "Your verification duties"),
   run the real gate, open the PR (body `Closes #N`; board-sync sets **In review**), arm auto-merge
   (`CORE.md` §16). A PR carrying a migration on the park list is never reached: it was parked.
7. Once merged (`gh pr view <n> --json state,mergedAt`): apply its migrations to Residio_Stage,
   verify by name in the database's applied list, and restore the authored version
   (`CORE.md` §11 rules 2, 5, 6). If applying fails, that item's migration is parked: record it
   as withheld on the issue and in the #412 handoff (`CORE.md` §11 rule 4).
8. Clean up the item (§9) as soon as it is merged and its migrations are verified. The merge closes the issue and board-sync sets **On stage**; Done follows the Prod release, so do not set it by hand. If any wiki page under `website/docs`
   describes the changed code, update and re-stamp it in the same PR (`CORE.md` §12).

## 6. Waves, checkpoints, and stopping

After each wave, post a **checkpoint comment on every input parent issue**: done (PR, merged,
migrations applied), in flight (branch), parked (why), skipped (why), next wave. A re-run starts
by reading the newest checkpoint and resumes from it, treating its own branches and PRs as its
own rather than as another session's claim.

There is no cap on the number of issues. Concurrency caps are §1d's.

**Stop the whole run** — do not loop or retry blindly — when the environment is broken: the gate
workflow itself erroring (as distinct from a test failing), Supabase MCP or `gh` auth failing, a
push rejected for anything but a stale branch, the disk or memory exhausted. Write the checkpoint,
the run log and the #412 handoff with the exact failure, then end.

A failing spec is not a failure until re-run alone on an idle machine (`CORE.md` §15 "Flakes").

## 7. The decision log

Every question the run answered for itself, and every park, is recorded twice:

- **as it happens** — a comment on the issue it concerns
- **at the end** — in `docs/decisions/autopilot/<YYYY-MM-DD>-<input numbers>.md`, format in
  `docs/decisions/autopilot/README.md`, landed via a closing `chore/autopilot-log-<date>` PR into
  `stage` (gate, then auto-merge)

## 8. End of run

1. **Release PR.** If a `stage` → `master` PR is open, update its body; otherwise open one titled
   `Release (pending tag)`. Pick exactly one `release:*` label by `CORE.md` §7 and give the reason
   in the run log. List the migrations applied to Residio_Stage but not to Residio_Prod (compare
   both databases' applied lists by name). **Never arm auto-merge on it and never merge it.**
2. The run log PR (§7).
3. A final checkpoint on each input parent.
4. A handoff comment on #412 (`CORE.md` §14, §16): what shipped, applied versus merged, what was
   parked and why, decisions the next session must not re-litigate, worktrees left in place.
5. The cleanup sweep (§9). Say what was removed and what was left, and why.
6. A final report: shipped, parked (each with the one question the owner must answer), skipped,
   created versus closed issues and the net (`CORE.md` §10 rule 5), agents per machine.

## 9. Cleanup of done issues

Stale worktrees and branches read to the next session as live work (`CORE.md` §16), so the run
removes its own as it goes. **Scope: issues in the run's tree that are done**, meaning the issue is
closed (On stage counts) or its PR is merged. That covers items this run delivered and items found already done.

**Per item, right after §5 step 7**, and again **as a sweep at end of run** over every done issue
in the tree:

1. **Sub-agent worktrees.** Remove every worktree that the run's implementer and QA agents used
   for the item, along with their local branches.
2. **Integration worktree.** `git worktree remove .worktrees/issue-<n>`, then
   `git branch -D <branch>`. A squash merge leaves the branch looking unmerged to git, which is
   why `-D` is used, and also why the PR state below is the test.
3. **Remote branch.** Delete it (`git push origin --delete <branch>`) if GitHub's
   delete-on-merge has not already done so.
4. `git worktree prune` and `git fetch --prune` once the sweep is finished.

Remove something only when **every** one of these holds. If any fails, leave it in place and
record the reason in the run log:

- The branch's PR is `MERGED` (`gh pr view <branch> --json state,headRefOid`), or the issue was
  closed as already done and the branch has no commits beyond `origin/stage`.
- The branch tip equals the merged PR's `headRefOid`. A commit pushed after the merge is unshipped
  work and must not be deleted.
- The worktree has no uncommitted or untracked changes (`git -C <path> status --porcelain` is
  empty).
- No session is working in it. Another local session's worktree or branch belongs to that
  session, even when its issue is done. Remove only what this run created, plus worktrees for done
  issues that no listed session claims.
- It is not `stage`, `master`, `gh-pages`, or the branch checked out in the main checkout.

Parked and skipped items keep their branches and worktrees. A parked branch is the evidence the
owner will need.
