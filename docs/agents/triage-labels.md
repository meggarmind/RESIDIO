# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `backlog`            | Not yet refined: observation or idea     |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

`needs-triage` is legacy: automation (`.github/workflows/board-sync.yml`) swaps it to `backlog` on open. File new issues with `backlog`. `backlog` and `needs-info` map to Backlog, `ready-for-*` to Ready (`project-board.md`).

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.
## Labels that are not triage labels

The tracker carries other label families that look like triage labels and are not. They carry no
Status mapping (`project-board.md`) and never substitute for one of the five above.

| Family | Meaning | Set by |
| --- | --- | --- |
| `harness:claude`, `harness:codex`, `harness:opencode` | This harness has worked this issue. **Additive and permanent** — two harnesses on one issue is two labels, and nobody removes anyone's label, including their own on merge. Not a lock; who holds a branch right now is `git ls-remote --heads origin`. | The agent, when it starts work on the issue (`CORE.md` §9), with `.github/workflows/harness-label.yml` as a backstop |
| `wayfinder:map`, `wayfinder:task`, … | Wayfinder map umbrellas and ticket kinds | The wayfinder skill |
| `post-pilot`, `blocked-on-app-readiness` | Deferral markers | Manual triage |
| `needs-attention`, `workflow:paused` | Issue-workflow monitor state | `scripts/issue-monitor.mjs` |
| `on-stage` | Closed issue whose PR is merged into `stage` but not yet released to Prod | board-sync automation; removed on the Prod release. Never on a parent or umbrella |
| `pinned` | Standing records (#412, #1006); automation never touches them | Manual |
