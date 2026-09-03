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
| Phase | **Waves 0,1,2a,2b COMPLETE (9/17 closed).** Wave 2c running: #174 solo (security) |
| Last completed | #172/#173/#175 merged+closed; 3-way conflicts in the convergence files resolved by hand; wave-boundary doc sweep done |
| Epic HEAD | `424143a`+ (9 closed: 163,167,168,169,170,171,172,173,175) |
| Blocked issues | none |
| Consecutive QA failures | 0 |

## Issue status

Legend: TODO / IN-PROGRESS / QA / MERGED / CLOSED / BLOCKED

| # | Slice | Wave | Status | Branch | Notes |
|---|-------|------|--------|--------|-------|
| 163 | prettier undeclared | 0 | CLOSED (not reproducible) | — | cold npm ci proved premise false |
| 167 | middleware safety net | 1 | **CLOSED** | merged | blocks all of wave 2; unblocked it |
| 168 | chairman settings.view | 1 | **CLOSED** | merged 3a415f7 | migration APPLIED + verified by name |
| 169 | main sidebar nav state | 1 | **CLOSED** | merged | |
| 170 | settings sidebar reopen | 1 | **CLOSED** | merged | |
| 171 | audit logs → /system | 2a | **CLOSED** | merged | template slice |
| 172 | account admin → /system | 2b | **CLOSED** | merged | tabs: keep roles+rules, move assignments/pending/orphaned |
| 173 | notification queue | 2b | **CLOSED** | merged | QueueViewer queue-viewer.tsx:133, NotificationHistory notification-history.tsx:111 |
| 175 | ownership backfill | 2b | **CLOSED** | merged | |
| 174 | cron page + public API | 2c | IN-PROGRESS | issue/174-cron-canonical | security fix; guard must be proven by a real request |
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

**Worktree setup — all three steps, every time (D13, D15):**
1. `git worktree add .worktrees/issue-<n> -b issue/<n>-<slug> epic/180`
2. Copy `C:/projects/RESIDIO/.env.local` in, or the build gate proves nothing.
3. `npm ci` **inside the worktree** — its own real tree, ~3 min warm. Run these
   sequentially, never concurrently (they contend over locked native modules).

**NEVER** junction or otherwise share `node_modules` between worktrees — see D14 for what
that cost. **NEVER** `git worktree remove` a worktree that ever had a junction.
Teardown for the epic: leave the directories, `git worktree prune` at the very end.

After #174: **#176 solo** (must follow #174). #176's brief MUST include D16 —
re-point `revalidatePath('/settings/system/data')` in `src/actions/system/prune-data.ts`
to `/settings/data-retention`, since #176 performs that rename.

Then wave 3 (#177, #178 parallel), wave 4a (#165, #166), 4b (#164), 4c (#179).
