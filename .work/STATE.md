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
| Phase | **Waves 0-4b COMPLETE (16/17 closed).** Only **#179** remains (wave 4c, solo) |
| Last completed | #164 merged `575d284` and closed |
| Gates (2026-09-04 on `968c68d`) | **75 files / 446 tests**, tsc exit 0, lint **0 errors / 326 warnings**, build exit 0. No flake this run; see **D25** for the two files that time out under load |
| Epic HEAD | `968c68d`, post-#164 merge + doc re-stamp (16 closed: 163-178) |
| Blocked issues | none |
| Consecutive QA failures | 0 |
| Spawned, not in the epic | **#181** (OPEN) — inconsistent RBAC in two #177 server actions |

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
| 174 | cron page + public API | 2c | **CLOSED** | merged | hole closed + CRON_SECRET path for the backup workflow |
| 176 | rename /settings/system/* | 2d | **CLOSED** | merged | revalidatePath handoff landed |
| 177 | /system dashboard | 3 | **CLOSED** | merged | flat nav item; surfaced #181 |
| 178 | regroup Settings | 3 | **CLOSED** | merged | 6 groups, 30 links; Roles narrowing caught (D21) |
| 165 | search_logs unread | 4a | **CLOSED** | merged `2e815c5` | D18 + D22: card mounted **and** the action guarded |
| 166 | Cmd+1-5 wrong result | 4a | **CLOSED** | merged `b80c6c3` | divergence was latent, not live — see below |
| 164 | search permission filter | 4b | **CLOSED** | merged `575d284` | route was fully unauthenticated, not just unfiltered; D26 |
| 179 | palette indexes Settings | 4c | **TODO — the last slice** | — | makes #166's latent divergence live; reads `settings-nav.ts` + `navigation.ts` |
| 180 | EPIC | — | OPEN, In progress | epic/180 | closes when #179 lands |
| 181 | #177 RBAC inconsistency | — | OPEN, untriaged | — | spawned by #177; board Backlog, not an epic slice |

## Next action

**Dispatch #179, solo — the last slice.** Index Settings and System pages in the
Cmd+K palette, generated from `settings-nav.ts` and the System section of
`navigation.ts` so they cannot drift, permission-filtered with the same
`hasAnyPermission` the sidebars use. "email import" must find the page.

Its brief must carry, or the work goes wrong:

- **#179 is what makes #166's fix load-bearing.** Review proved the badge/hotkey
  divergence does not reproduce today only because `/api/search` returns
  type-keyed arrays that concatenate in `groupOrder` sequence. Settings entries
  keyed on route slugs break that accident. The shortcut map is keyed by **href**
  for exactly this reason — do not rekey it.
- **`groupedResults` and `orderedResults`** in `global-search-command.tsx` are two
  independent implementations of one bucket-by-type rule, agreeing by convention.
  #179 is the last slice on this file; unify them rather than adding a third.
- **Quick Actions moved** to `src/lib/search/quick-actions.ts` (#164), guarded by
  `src/__tests__/quick-action-permissions.test.ts`. New palette entries need the
  same treatment: permissions that match `ROUTE_PERMISSIONS`, and a test that
  fails when they are narrowed — a subset assertion will not (D21).
- #178 settled the final Settings shape: six groups, 30 links.

Per issue, unchanged: review the diff myself, run the four gates, spawn a QA
agent on `git diff epic/180...<branch>`, and only on a clean PASS **commit +
merge + close + push** — all four steps.

**Then close the epic:** #180 itself, and decide what to do with #181 (open,
untriaged, spawned by #177) before calling the epic finished.

**Worktree setup — all three steps, every time (D13, D15):**
1. `git worktree add .worktrees/issue-<n> -b issue/<n>-<slug> epic/180`
2. Copy `C:/projects/RESIDIO/.env.local` in, or the build gate proves nothing.
3. `npm ci` **inside the worktree** — its own real tree, ~3 min warm. Run these
   sequentially, never concurrently (they contend over locked native modules).

**NEVER** junction or otherwise share `node_modules` between worktrees — see D14 for what
that cost. **NEVER** `git worktree remove` a worktree that ever had a junction.
Teardown for the epic: leave the directories, `git worktree prune` at the very end.

Wave plan, for reference: 0 (#163) → 1 (#167-#170) → 2a (#171) → 2b (#172, #173, #175)
→ 2c (#174) → 2d (#176) → 3 (#177, #178) → **4a (#165, #166) ← done to here** →
4b (#164) → 4c (#179).
