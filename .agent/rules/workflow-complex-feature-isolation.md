---
trigger: always_on
---

# Multi-phase work

Superseded by `CORE.md` -- read `CORE.md` section 8 ("Delivery lifecycle") and section 15
("Coordinated delivery").

The previous version of this rule created a per-task tracking file at
`docs/todo/<task-slug>.md` and ended by committing and pushing automatically. Both are
withdrawn:

- **Isolation is a git worktree, not a markdown file.** Work is issue-first and isolated in
  `.worktrees/issue-<number>`; every agent that writes files gets its own worktree.
- **State lives in the tracker**, not a temporary file: the issue records scope corrections and
  measured facts, `ACTIONPLAN.md` the active plan, `SESSION_STATE.md` the handoff.
- **Nothing commits and pushes on its own.** Implementing agents commit and stop; the user does
  the merging.
