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
| Phase | Wave 2a: #171 in QA. Wave 2b worktrees built and installed, waiting on #171 to merge |
| Last completed | node_modules corruption repaired (D14); shared installs withdrawn (D15); #171 gates re-run green by me: 69 files / 410 tests |
| Epic HEAD | `dd482d1`+ (5 closed: 163,167,168,169,170) |
| Blocked issues | none |
| Consecutive QA failures | 0 |

## Issue status

Legend: TODO / IN-PROGRESS / QA / MERGED / CLOSED / BLOCKED

| # | Slice | Wave | Status | Branch | Notes |
|---|-------|------|--------|--------|-------|
| 163 | prettier undeclared | 0 | CLOSED (not reproducible) | — | cold npm ci proved premise false |
 blocks all of wave 2 |
| 168 | chairman settings.view | 1 | **CLOSED** | merged 3a415f7 | migration APPLIED + verified by name |
| 169 | main sidebar nav state | 1 | **CLOSED** | merged | |
| 170 | settings sidebar reopen | 1 | **CLOSED** | merged | |
| 171 | audit logs → /system | 2a | IN-PROGRESS | issue/171-audit-logs-to-system | template slice |
| 172 | account admin → /system | 2b | READY (worktree+install done) | issue/172-accounts-to-system | tabs: keep roles+rules, move assignments/pending/orphaned |
| 173 | notification queue | 2b | READY (worktree+install done) | issue/173-notification-queue | QueueViewer queue-viewer.tsx:133, NotificationHistory notification-history.tsx:111 |
| 175 | ownership backfill | 2b | READY (worktree+install done) | issue/175-ownership-backfill | |
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

**Worktree setup — all three steps, every time (D13, D15):**
1. `git worktree add .worktrees/issue-<n> -b issue/<n>-<slug> epic/180`
2. Copy `C:/projects/RESIDIO/.env.local` in, or the build gate proves nothing.
3. `npm ci` **inside the worktree** — its own real tree, ~3 min warm. Run these
   sequentially, never concurrently (they contend over locked native modules).

**NEVER** junction or otherwise share `node_modules` between worktrees — see D14 for what
that cost. **NEVER** `git worktree remove` a worktree that ever had a junction.
Teardown for the epic: leave the directories, `git worktree prune` at the very end.

After 2a: wave 2b is #172, #173, #175 in parallel; then #174 solo; then #176 solo.
