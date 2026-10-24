# Project board: "MeggaView"

RESIDIO issues live on a GitHub Projects (v2) board, separate from the triage
labels described in `triage-labels.md`. New issues are added to it
automatically by `.github/workflows/add-issues-to-project.yml`, and since #1104
`.github/workflows/board-sync.yml` moves them across columns (and swaps the
matching labels) as work progresses. The commands below are the manual
fallback for when automation fails.

- **Board**: https://github.com/users/meggarmind/projects/1 (owner: `meggarmind`, project number `1`)
- **Project node ID**: `PVT_kwHOCp3Gc84BgB2N`
- **Status field ID**: `PVTSSF_lAHOCp3Gc84BgB2NzhaQc4M`

## Status columns

The pinned issue **#1006** is the live definition of each Status and of who moves an issue.
Read it at session start, with #412. If a definition changes, update #1006 and this file together.

| Status        | Option ID  |
| ------------- | ---------- |
| Backlog       | `f75ad846` |
| Ready         | `61e4505c` |
| In progress   | `47fc9ee4` |
| In review     | `df73e18b` |
| On stage      | `e2a2fcdd` |
| Done          | `98236657` |

## Triage label → Status mapping

| Triage label (`triage-labels.md`) | Board Status  |
| ---------------------------------- | ------------- |
| `backlog` / unlabeled (`needs-triage` is legacy)  | Backlog       |
| `needs-info`                       | Backlog       |
| `ready-for-agent` / `ready-for-human` | Ready      |
| *(issue branch pushed, or draft PR)* | In progress |
| *(non-draft PR open)*              | In review     |
| `on-stage` (closed issue, live on Stage, not yet on Prod) | On stage |
| Released to Prod, hotfix, sync PR, or `wontfix` | Done |

## What moves an issue's Status

Owner decisions, 2026-10-24 (#1104). Automation moves the board; agents do not, as a routine.
The rules are data in `.github/board-automation.json`, applied by `scripts/board-sync.mjs` from
`.github/workflows/board-sync.yml`.

| Status | When | Labels | Issue state | Moved by |
| --- | --- | --- | --- | --- |
| Backlog | new or unrefined observation or idea, or waiting on info | `backlog` (replaces `needs-triage`) or `needs-info` | open | automation on open |
| Ready | refined: scope, success criteria and validation steps written | `ready-for-agent` / `ready-for-human` | open | the label; automation sets Status |
| In progress | issue branch pushed (`<lane>/issue-<n>-…`) or draft PR | `harness:*` (unchanged) | open | automation |
| In review | non-draft PR open (QA, testing, security review, automatic or manual) | | open | automation |
| On stage | PR merged into `stage` | `on-stage` | **closed** | automation |
| Done | release PR `stage` → `master` merged; or hotfix merged to `master`; or sync PR; or `wontfix` / not planned; or, in a repo with no `stage`, PR merged | | closed | automation |

- **Ready.** An agent may set `ready-for-agent` after refining the issue with the owner or
  decomposing an agreed plan; the owner can veto. Automation sets Status and comments a warning when
  the Scope, Success criteria or Validation headings are missing.
- **On stage.** PRs say `Closes #N`, so the merge into `stage` closes the issue. Closed plus
  On stage means "closed, not yet on Prod".
- **Done.** When the issue's closing PR is an ancestor of the release merge commit, automation
  removes `on-stage` and comments "Released in vX.Y.Z".
- **Parents and umbrellas** (`wayfinder:map`, issues with sub-issues) take their Status from their
  children: any child started → In progress; all children closed → On stage (the parent stays
  open); all children Done → Done and closed. They never carry `on-stage`, and no single child
  closes them.
- **Backward moves** are automation-only: a PR closed unmerged with no other open PR → In progress;
  an issue reopened → In progress if a branch or PR exists, else Ready (and `on-stage` removed).
  Every other backward move stays manual.
- **`pinned` issues** (#412, #1006) are never touched.
- **Reconciler.** A nightly run of `node scripts/board-sync.mjs --reconcile` corrects drift and
  writes a summary. It can also be started by hand as a `workflow_dispatch` run of `board-sync.yml`;
  `dry_run` defaults to true, so set it false to apply changes.

### What agents still do

1. Promote an issue to `ready-for-agent` once it is refined.
2. File new issues with `backlog`, not `needs-triage`.
3. Write `Closes #N` in PR bodies (`scripts/issue-workflow.mjs finish` already does).
4. At session end, check the reconciler output or the board for every issue touched, and list each
   issue's final Status in the #412 handoff (still required). Fix Status by hand, with the commands
   below, only if automation failed.

## Harness labels

Three harnesses work this repo — Claude Code, OpenCode and Codex (`CORE.md` §7) — and they all
authenticate as the same GitHub login, so the **assignee cannot tell them apart** (#297). A board
single-select field cannot hold two values either. Repo labels can, so that is where the harness
tag lives:

| Label | Harness |
| --- | --- |
| `harness:claude` | Claude Code |
| `harness:codex` | Codex |
| `harness:opencode` | OpenCode |

**Add yours when you start work on the issue** (`CORE.md` §9):

```bash
gh issue edit <ISSUE_NUMBER> --add-label harness:claude
```

The labels are **additive and permanent**. They record that a harness *has worked* the issue, not
that it currently holds it:

- Two harnesses on one issue is simply two labels.
- **Never remove another harness's label.** Do not remove your own when the PR merges either —
  together they are the record of who worked what.
- They are **not a lock**. Who holds a branch right now is `git ls-remote --heads origin`.

They reach the board for free: project 1 already has a `Labels` field, so `harness:*` shows on the
card and filters like any other label. Remember the board is user-scoped — qualify with
`repo:meggarmind/RESIDIO label:harness:claude`.

`.github/workflows/harness-label.yml` adds the label from the branch prefix when a PR opens or is
pushed to, deriving the lane from `branchPrefixes` in `.github/issue-workflow.json`. It is a
**backstop, not the mechanism**: it is non-blocking, it only ever adds, and it cannot cover the
window between an agent starting work and its first push. That window is what adding the label by
hand at the start of work is for. A branch whose prefix names no harness (`feat/`, `chore/`, bare `fix/`) is
deliberately left unlabelled rather than guessed at.

`.github/workflows/pr-claim-check.yml` reads the same labels from the other side. It resolves the
PR's own lane from the branch prefix, then looks at the linked issues for a `harness:*` label
belonging to a **different** harness, and warns when it finds one — the two-harness case above,
surfaced at the moment it matters rather than discovered later. It ignores the PR's own label
(the branch prefix already implies it, and `harness-label.yml` is writing it on the same event),
and it is **advisory**: an overlap annotation on a passing job, never a block. It gated on the
assignee until #344, which could only ever report "unassigned" for the reason this section opens
with.

**The backstop trusts the lane, and the lane can be wrong.** #244 and #300 were worked by
**OpenCode** on `feat/issue-*` branches: the session wanted `--lane fix`, that lane was not
configured, and it fell back to `--lane claude`. A prefix-derived label would have credited Claude
Code for both. Configuring the `fix` lane removes that specific cause, but the general point
stands — **pass the lane that names your harness**, and if you cross lanes deliberately, say so
(`CORE.md` §7) and add the right label by hand. When the branch prefix and a human record
disagree, the human record wins.

**Attributing an issue after the fact.** Three evidence sources, strongest first:

1. **Commit trailers on the branch.** Claude Code signs its commits
   `Co-Authored-By: Claude Opus 5`; OpenCode and Codex commits are bare. So a trailer proves
   Claude touched it, and a bare commit means "not Claude" rather than naming which of the other
   two. **This only holds for commits before 2026-10-12**: from then on no harness signs its
   commits (`CORE.md` §14), so for later work the `harness:*` label is the record. Read them per commit, not per branch — that is how a two-harness ticket shows up:

   ```bash
   MERGE=$(git log origin/<base> --format=%H --grep="Merge pull request #<PR> " -1)   # <base>: stage for feature PRs, master for release/hotfix PRs
   git log --format='%h %s%n%b' "$MERGE^1..$MERGE^2" | grep -iE "^[0-9a-f]{8} |co-authored-by"
   ```

   Worktrees get cleaned up; the merged commits on `master` are the same commits and outlive them.
2. **An explicit record in the #412 handoff comments**, which name the harness per session.
3. **The branch prefix** — weakest, for the reason above.

**#125 is the worked example.** Its branch is `codex/issue-125-*`, so the prefix says Codex and
nothing else. Per commit, the fix (`3460369e`) is bare and the follow-up test (`6943ec0f`) carries
the Claude trailer: **Codex wrote the fix, Claude Code added the test.** It carries both labels.
Attributing it from the prefix alone would have erased half of what happened.

Who worked which issue, at a glance:

```bash
gh issue list --repo meggarmind/RESIDIO --state all --label harness:claude --limit 200
```

## Commands (manual fallback)

Use these only when board-sync has failed or is lagging; the nightly reconciler would otherwise
revert a hand edit that contradicts the rules.

Find the project item ID for a given issue number:

```bash
gh project item-list 1 --owner meggarmind --format json --limit 200 \
  | jq -r --arg n "<ISSUE_NUMBER>" '.items[] | select((.content.number|tostring)==$n) | .id'
```

Set that item's Status:

```bash
gh project item-edit \
  --id <ITEM_ID> \
  --project-id PVT_kwHOCp3Gc84BgB2N \
  --field-id PVTSSF_lAHOCp3Gc84BgB2NzhaQc4M \
  --single-select-option-id <OPTION_ID>
```

Where `<OPTION_ID>` is one of the IDs in the table above (e.g. `47fc9ee4` for "In progress").

## Roadmap fields

The board carries date fields used by the Roadmap view. They already exist — do not create new ones.

| Field         | Field ID                          |
| ------------- | --------------------------------- |
| Start date    | `PVTF_lAHOCp3Gc84BgB2NzhaQdIM`    |
| Target date   | `PVTF_lAHOCp3Gc84BgB2NzhaQdIQ`    |

```bash
gh project item-edit \
  --id <ITEM_ID> \
  --project-id PVT_kwHOCp3Gc84BgB2N \
  --field-id PVTF_lAHOCp3Gc84BgB2NzhaQdIM \
  --date 2026-09-08
```

**Dates go on `wayfinder:map` issues only**, never on their children. Eight dated bars read as a
roadmap; ninety overlapping ones do not. Children are grouped under their parent by the Roadmap's
swimlane mode, so they do not need dates of their own to appear.

## Every issue has a map parent

As of 2026-09-07 the backlog is organised into **eight `wayfinder:map` umbrella issues**, and
**every open issue is a GitHub native sub-issue of exactly one of them**. The maps are grouped by
outcome — the state the product reaches — not by domain:

| Map | Destination |
| --- | --- |
| [#289](https://github.com/meggarmind/RESIDIO/issues/289) | Core app readiness — **the gate**; everything production waits on it |
| [#292](https://github.com/meggarmind/RESIDIO/issues/292) | Schema and migration integrity |
| [#290](https://github.com/meggarmind/RESIDIO/issues/290) | Authorization and data-exposure floor |
| [#291](https://github.com/meggarmind/RESIDIO/issues/291) | Billing and invoicing integrity |
| [#262](https://github.com/meggarmind/RESIDIO/issues/262) | Admin-only go-live on self-hosted Residio |
| [#295](https://github.com/meggarmind/RESIDIO/issues/295) | Developer workflow and tooling reliability |
| [#293](https://github.com/meggarmind/RESIDIO/issues/293) | WhatsApp and estate messaging |
| [#294](https://github.com/meggarmind/RESIDIO/issues/294) | Dashboard experience and performance |

**When you file a new issue, parent it to a map in the same breath.** An orphan is invisible on the
roadmap and silently absent from every map's completed/total count:

```bash
CHILD=$(gh api repos/meggarmind/RESIDIO/issues/<NEW_ISSUE> --jq .id)
gh api repos/meggarmind/RESIDIO/issues/<MAP_NUMBER>/sub_issues -F sub_issue_id=$CHILD
```

Note the API takes the issue's **database id**, not its number, and an issue may have **at most one
parent** — re-parenting means detaching first.

Find orphans at any time:

```bash
gh api graphql --paginate -f query='query($endCursor:String){repository(owner:"meggarmind",name:"RESIDIO"){issues(states:OPEN,first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{number parent{number} labels(first:20){nodes{name}}}}}}' \
  --jq '.data.repository.issues.nodes[] | select(.parent == null) | select([.labels.nodes[].name] | index("wayfinder:map") | not) | .number'
```

The board is **user-scoped** and carries issues from other repositories, at least one of which is
also a `wayfinder:map`. Always qualify the filter:
`repo:meggarmind/RESIDIO label:wayfinder:map`.
