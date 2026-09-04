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
| Phase | **Waves 0-4a COMPLETE (15/17 closed).** Next: wave 4b (#164) solo, then 4c (#179) |
| Last completed | #165 + #166 merged and closed |
| Gates (re-run 2026-09-04 on `b80c6c3`) | **73 files / 435 tests**, tsc exit 0, lint **0 errors / 326 warnings**, build exit 0. One timeout — `whatsapp/webhook/twilio/route.test.ts`, passes alone in 835ms, the D10 flake in a second file. See **D25** |
| Epic HEAD | `b80c6c3`, post-#166 merge (15 closed: 163, 165, 167-178) |
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
| 164 | search permission filter | 4b | TODO | — | merges on top of #166's `global-search-command.tsx` |
| 179 | palette indexes Settings | 4c | TODO | — | this is what makes #166 live |
| 180 | EPIC | — | OPEN | epic/180 | closes when #164 + #179 land |
| 181 | #177 RBAC inconsistency | — | OPEN, untriaged | — | spawned by #177; board Backlog, not an epic slice |

## Next action

**Nothing is in flight.** (`AGENTS-INFLIGHT.md` describes the wave 0+1 dispatch of
2026-09-02 and is historical — do not read it as a live roster.)

**Dispatch #164, solo.** It is wave 4b because it touches **both** search files that
wave 4a just changed — `src/app/api/search/route.ts` (#165's guard) and
`src/components/dashboard/global-search-command.tsx` (#166's rewrite) — so it could not
run beside them. Its brief must carry:

- #166 rekeyed the shortcut map from `${type}-${id}` to **href**, and left
  `groupedResults` and `orderedResults` as two independent implementations of the same
  bucket-by-type rule. They agree today; nothing structurally keeps them agreeing. #164
  edits this file next and should not widen that gap.
- The route's only auth touch is `supabase.auth.getUser()` for logging
  (`route.ts:185`); `QUICK_ACTIONS` at `:69` is filtered by query text alone at
  `:129-130`. Verified on `epic/180` — see ISSUE-CLAIMS-VERIFIED.md.

Then **#179 solo** (wave 4c): blocked by #178 for the final Settings shape and by #164
for the palette's permission filtering. #179 is also what turns #166's latent divergence
live, so its brief must say so.

Per issue, unchanged: review the diff myself, run the four gates, spawn a QA agent on
`git diff epic/180...<branch>`, and only on a clean PASS **commit + merge + close +
push**. All four steps — #166 was merged and pushed on 2026-09-03 but not closed until
2026-09-04, and its board Status sat at "In progress" for a day with the work already on
the epic branch.

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
