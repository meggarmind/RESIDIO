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

Per `CLAUDE.md`'s `## Agent skills` section, Claude moves an issue automatically at exactly two points:

1. **Picking up a `ready-for-agent`/`ready-for-human` issue to start work** → set Status to `In progress`.
2. **The issue (or its PR) is closed or merged** → set Status to `Done`.

`In review` is not set automatically — it's fine to leave manual for now. Any other transition (e.g. moving something back to Backlog) should be done only when explicitly asked.

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
