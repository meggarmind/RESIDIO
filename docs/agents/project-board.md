# Project board: "Jazrmann Dashboard"

RESIDIO issues live on a GitHub Projects (v2) board, separate from the triage
labels described in `triage-labels.md`. New issues are added to it
automatically by `.github/workflows/add-issues-to-project.yml`; moving them
across columns as work progresses is manual (this doc is what makes that
manual step something an agent can do consistently).

- **Board**: https://github.com/users/meggarmind/projects/1 (owner: `meggarmind`, project number `1`)
- **Project node ID**: `PVT_kwHOCp3Gc84BgB2N`
- **Status field ID**: `PVTSSF_lAHOCp3Gc84BgB2NzhaQc4M`

## Status columns

| Status        | Option ID  |
| ------------- | ---------- |
| Backlog       | `f75ad846` |
| Ready         | `61e4505c` |
| In progress   | `47fc9ee4` |
| In review     | `df73e18b` |
| Done          | `98236657` |

## Triage label → Status mapping

| Triage label (`triage-labels.md`) | Board Status  |
| ---------------------------------- | ------------- |
| `needs-triage` / unlabeled         | Backlog       |
| `needs-info`                       | Backlog       |
| `ready-for-agent` / `ready-for-human` | Ready      |
| *(agent actively working the issue)* | In progress |
| *(PR open, awaiting review)*       | In review     |
| Issue/PR closed or merged, or `wontfix` | Done     |

## When to move an issue's Status

Per `CORE.md` section 9, every agent — under any harness — moves an issue automatically at
exactly three points:

1. **Picking up a `ready-for-agent`/`ready-for-human` issue to start work** → set Status to `In progress`.
2. **Opening the PR for it** → set Status to `In review`.
3. **The issue (or its PR) is closed or merged** → set Status to `Done`.

Do not move issues *backwards* (to `Backlog` or `Ready`) on your own; that stays manual, as does
the initial `Backlog` → `Ready` triage transition.

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

**Add yours at the same moment you set Status to `In progress`** (`CORE.md` §9, point 1):

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
window between an agent starting work and its first push. That window is what the `In progress`
step above is for. A branch whose prefix names no harness (`feat/`, `chore/`, bare `fix/`) is
deliberately left unlabelled rather than guessed at.

**The backstop trusts the lane, and the lane can be wrong.** #244 and #300 were worked by
**OpenCode** on `feat/issue-*` branches: the session wanted `--lane fix`, that lane was not
configured, and it fell back to `--lane claude`. A prefix-derived label would have credited Claude
Code for both. Configuring the `fix` lane removes that specific cause, but the general point
stands — **pass the lane that names your harness**, and if you cross lanes deliberately, say so
(`CORE.md` §7) and add the right label by hand. When the branch prefix and a human record
disagree, the human record wins.

Who worked which issue, at a glance:

```bash
gh issue list --repo meggarmind/RESIDIO --state all --label harness:claude --limit 200
```

## Commands

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
