---
name: task-observer
description: Session-scoped pattern watching for RESIDIO. Invoke at the start of any multi-step, tool-using task; it keeps a running list of corrections, repeated manual steps and friction, and at the end decides whether any deserves memory, a CORE.md rule, or a documented skill.
---

# task-observer

A light discipline, not a process. Run it alongside the work and keep its notes in your head or
in the scratchpad directory, never in the repo (`CORE.md` §14: no handoff files).

## While working, note

- **Corrections:** the user changed or rejected your approach.
- **Confirmations of a non-obvious choice:** the user accepted something unusual without pushback.
- **Repeated steps:** the same multi-command sequence run twice or more.
- **Friction:** an instruction that was wrong, stale, unrunnable in this environment, or
  contradicted another one.

## At the end, route each note

| What it is | Where it goes |
| --- | --- |
| One-off preference or fact about how the user runs the project | account memory only, as `feedback` (`CLAUDE.md` Memory; `CORE.md` §18) |
| Project policy, seen as a repeated correction | a rule in `CORE.md`, placed by the §2 routing rule |
| Claude Code mechanism (tool, skill, model, hook) | `CLAUDE.md` |
| A repeated procedure that needs steps | a skill under `.claude/skills/<name>/SKILL.md` |
| A defect or stale instruction outside this task | file an issue (`CORE.md` §10 rule 4); do not absorb it |

## Graduation threshold

A first occurrence goes to memory only. Promote to a rule or a skill when the same correction or
procedure has recurred, or the user asks. A skill gets a one-line `description` that says when to
use it, links to the policy it implements rather than restating it, and is added to the table in
`CLAUDE.md`.

## Report

Close the session with at most a few lines in the #412 handoff: what was captured, where it went,
and what you chose not to promote. Say which file received any new rule.
