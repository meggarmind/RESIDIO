# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.
## Labels that are not triage labels

The tracker carries other label families that look like triage labels and are not. They carry no
Status mapping (`project-board.md`) and never substitute for one of the five above.

| Family | Meaning | Set by |
| --- | --- | --- |
| `harness:claude`, `harness:codex`, `harness:opencode` | This harness has worked this issue. **Additive and permanent** — two harnesses on one issue is two labels, and nobody removes anyone's label, including their own on merge. Not a lock; who holds a branch right now is `git ls-remote --heads origin`. | The agent, when it moves the issue to **In progress** (`CORE.md` §9), with `.github/workflows/harness-label.yml` as a backstop |
| `wayfinder:map`, `wayfinder:task`, … | Wayfinder map umbrellas and ticket kinds | The wayfinder skill |
| `post-pilot`, `blocked-on-app-readiness` | Deferral markers | Manual triage |
| `needs-attention`, `workflow:paused` | Issue-workflow monitor state | `scripts/issue-monitor.mjs` |
