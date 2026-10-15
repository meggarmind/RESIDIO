# Autopilot decision logs

One file per unattended run of `docs/agents/autonomous-delivery.md`, named
`<YYYY-MM-DD>-<input issue numbers joined by "-">.md` (e.g. `2026-10-16-290.md`,
`2026-10-16-101-102.md`). Each file lands in a closing `chore/autopilot-log-<date>` PR into `stage`.

These files exist so the owner can review afterwards every call the run made on their behalf. Each
decision is also posted as a comment on the issue it concerns, at the moment it was made.

## Format

```markdown
# Autopilot run — <date> — inputs #<n>[, #<n>…]

- Harness / machine: <harness>, <machine>
- Start gate: confirmed <time>. Sessions: <none | list, with kind>. Peer writes: <cleared | QA only | none>
- Agents: <n> on this machine, <n> on <peer>

## Outcome

| Issue | Title | Result | PR | Migrations (Residio_Stage) |
| --- | --- | --- | --- | --- |
| #n | … | merged / parked / skipped / closed-already-done / decided | #pr | applied: <names> / none |

Issues created: <n>. Closed: <n>. Net: <+/-n>.
Release PR: #<n>, label `release:<x>` — <one-line reason>.

## Decisions

### D1 — #<issue>: <the question, as one sentence>
- **Options:** <a> / <b> / …
- **Decided:** <the choice>
- **Basis:** owner precedent | project docs | recommendation — <cite: #412 comment link, issue comment, ADR, CORE §, file:line>
- **Reversible by:** <what undoing it would take>

## Parked — needs the owner

### P1 — #<issue>: <the question>
- **Why parked:** <widens access | destructive migration | money | secrets/PII | QA failed twice>
- **Recommendation:** <what the run would have done>
- **Evidence:** <links>
- **Blocked dependants:** #n, #n

## Cleanup

- Removed: <worktree paths, local branches, remote branches>
- Kept: <path / branch> — <uncommitted changes | commits after merge | claimed by <session> | parked>

## Skipped

- #n — <closed | portal | claimed by <branch> | ready-for-human | wontfix>
```
