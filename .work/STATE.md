# STATE — Epic #180

**Read this before anything else on resume.** Then reconcile against
`git branch -a`, `git log --oneline -20`, `git status`. Git wins on disagreement.

- Trunk: **`master`** (not `main`)
- Integration branch: **`epic/180`**, hosted in the main checkout `C:/projects/RESIDIO`
- Per-issue worktrees: `.worktrees/issue-<n>` on `issue/<n>-<slug>`
- Epic branch is pushed to `origin` after every merge (this checkout has a known
  destructive-reset hazard; the push is the durable copy)

## Current position

| | |
|---|---|
| Phase | Wave 1 QA; 3 agents in flight (167-QA, 169-QA, 170-QA) |
| Last completed | #168 MERGED+CLOSED+migration applied; #163 CLOSED not-reproducible |
| Epic HEAD | `3a415f7` Merge #168 |
| Blocked issues | none |
| Consecutive QA failures | 0 |

## Issue status

Legend: TODO / IN-PROGRESS / QA / MERGED / CLOSED / BLOCKED

| # | Slice | Wave | Status | Branch | Notes |
|---|-------|------|--------|--------|-------|
| 163 | prettier undeclared | 0 | CLOSED (not reproducible) | — | cold npm ci proved premise false |
| 167 | middleware safety net | 1 | QA | issue/167-middleware-system-guard | blocks all of wave 2 |
| 168 | chairman settings.view | 1 | **CLOSED** | merged 3a415f7 | migration APPLIED + verified by name |
| 169 | main sidebar nav state | 1 | QA | issue/169-sidebar-nav-state | |
| 170 | settings sidebar reopen | 1 | QA (after 1 remediation) | issue/170-settings-group-reopen | |
| 171 | audit logs → /system | 2a | TODO | — | template slice |
| 172 | account admin → /system | 2b | TODO | — | |
| 173 | notification queue | 2b | TODO | — | |
| 175 | ownership backfill | 2b | TODO | — | |
| 174 | cron page + public API | 2c | TODO | — | security fix |
| 176 | rename /settings/system/* | 2d | TODO | — | after #174 |
| 177 | /system dashboard | 3 | TODO | — | |
| 178 | regroup Settings | 3 | TODO | — | |
| 165 | search_logs unread | 4a | TODO | — | judgement call pending |
| 166 | Cmd+1-5 wrong result | 4a | TODO | — | |
| 164 | search permission filter | 4b | TODO | — | |
| 179 | palette indexes Settings | 4c | TODO | — | |
| 180 | EPIC | — | OPEN | epic/180 | |

## Next action

Await the five in-flight agents (see AGENTS-INFLIGHT.md), then per issue: review the
diff myself, run the four gates, spawn a QA agent on `git diff epic/180...<branch>`,
and only on a clean PASS commit + merge + close + push.

**#163 is a reproduction run, not a fix.** Its premise looks stale — prettier is a
committed transitive dependency. Decide the real fix from what the cold `npm ci`
actually shows.
