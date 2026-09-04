# STATE — Epic #180

> **2026-09-04 — Supabase MCP restored; the four blocked checks are done.** `.work/RESUME.md`
> has been consumed and deleted. Verified figures are recorded on epic #182
> (issuecomment-5541896711); the short version is below under "Database facts, verified".

**Read this before anything else on resume.** Then reconcile against
`git branch -a`, `git log --oneline -20`, `git status`. Git wins on disagreement.

- Trunk: **`master`** (not `main`)
- Integration branch: **`epic/180`**, hosted in the main checkout `C:/projects/RESIDIO`
- Per-issue worktrees: `.worktrees/issue-<n>` on `issue/<n>-<slug>`
- Epic branch is pushed to `origin` after every merge (this checkout has a known
  destructive-reset hazard; the push is the durable copy)

## Database facts, verified 2026-09-04

Read from the live database, not from migration files. Full detail and the SQL are on
epic #182.

- **No live lockout.** Zero active accounts hold a `role_id` with a `NULL` legacy `role`.
  All three active accounts carry both vocabularies, consistently mapped. The "probable
  live bug" in #182 is latent, not live — **slice ordering is unchanged**.
- **All 103 permission seeds are applied.** `app_permissions` matches the `PERMISSIONS`
  constants exactly, both directions. Nothing denies for want of a row.
- **Policy counts were under-read from files.** Direct `profiles.role` readers are
  **34 across 29 tables** (not 32/25); `get_my_role()` callers are **97 across 36 tables**
  (not 80/28). The two sets are disjoint. #186/#187 and #190 need rescoping.
- **#184's invariant already holds** — exactly one active `super_admin`, so the trigger
  will not fail on existing data.
- **#191 is safe** — `has_security_permission()` has zero callers of any kind.
- **A fifth legacy reader exists that no slice covers**: `create_generated_invoice()`
  authorizes off `profiles.role`. Not a live break (its only caller uses
  `createAdminClient()`, so `auth.uid()` is `NULL` and the guard short-circuits), but
  plpgsql is late-bound, so #194 would drop the column and leave it silently broken.
  Add it to #193/#194 or #188.
- **The column drop is structurally clean** — `pg_depend` shows no view, index or
  constraint on `profiles.role`. Function bodies are the only dependents.
- **Bucket collapse is confirmed in deployed code**, not just in files: `get_my_role()`
  maps `vice_chairman → chairman` and `financial_officer → financial_secretary`.

## Current position

| | |
|---|---|
| Phase | **Waves 0-4c COMPLETE (17/18 closed).** Only **#181** (4d) remains |
| Last completed | #164 merged `575d284` and closed |
| Gates (2026-09-04 on `968c68d`) | **75 files / 446 tests**, tsc exit 0, lint **0 errors / 326 warnings**, build exit 0. No flake this run; see **D25** for the two files that time out under load |
| Epic HEAD | `968c68d`, post-#164 merge + doc re-stamp (16 closed: 163-178) |
| Blocked issues | none |
| Consecutive QA failures | 0 |
| Spawned, taken into the epic | **#181** — re-scoped 2026-09-04 after verification; now wave 4d |

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
| 179 | palette indexes Settings | 4c | **CLOSED** | merged `9d1c879` | cmdk was discarding the new matching before render (D27); first component-render test in the repo |
| 180 | EPIC | — | OPEN, In progress | epic/180 | closes when #179 lands |
| 181 | audit + queue RBAC bypass | 4d | **QUEUED** | — | re-scoped: 3 audit fns on legacy roles, queue module unguarded, **and an RLS migration** |

## D27 — cmdk filters on top of your filter

`CommandDialog` renders cmdk with filtering **on** by default. cmdk scores every
`CommandItem` against its `value` prop and hides anything scoring 0 — so a local
filter that matches on anything wider than `value` has its extra matches silently
discarded before render. In #179 this hid the issue's own acceptance criterion:
`"email import"` scored 0 and never appeared, while `"import email"` scored above
zero and did, so the unit test asserting the two were equal passed against a UI in
which they were opposites.

`global-search-command.tsx` now passes `shouldFilter={false}`, which makes its local
filters load-bearing: **any source added to that palette must filter itself.** The two
resident-portal palettes deliberately still use cmdk's default.

No unit test could see this, because none rendered the component. The repo's first
component-rendering test (`src/components/dashboard/__tests__/`) covers it; it was
verified load-bearing by reverting the fix and watching it fail. That brought in
`jsdom`, `@testing-library/react` and `@testing-library/jest-dom` as devDependencies
— **other worktrees and the other machine need `npm install`** before `npx vitest run`
will pass.

## Next action

**Dispatch #181 — the last slice of the epic.** The issue as filed was wrong in
both directions; **the correcting comment on #181 is the brief, not the body.** It
covers three audit functions gated on legacy roles, the unguarded notification-queue
module, an `audit_logs` RLS migration that contradicts ADR-0006, and the pre-epic
cleanup absorbed into it (the unread `AuthorizationResult.role`, the dead
`LEGACY_TO_NEW_ROLE_MAP`, middleware's unused `role` select, and the UI/server
divergence at `role-assignment-section.tsx:169` / `pending-accounts-list.tsx:72`).

It needs a migration, so it needs the database — which is now **available and
verified** (see "Database facts, verified 2026-09-04" above). Check its RLS change
against the 34 legacy policies recorded there before writing it; #181's migration and
epic #182's slices #186/#187 touch the same surface.

Per issue, unchanged: review the diff myself, run the four gates, spawn a QA
agent on `git diff epic/180...<branch>`, and only on a clean PASS **commit +
merge + close + push** — all four steps.

**Then #181, solo (wave 4d).** Verified and re-scoped on 2026-09-04 — the issue as
filed was wrong in both directions; the correcting comment on the issue is the brief.
The four things its brief must carry:

- **`getQueueStatistics` is the priority.** It delegates to `getQueueStats()`
  (`src/lib/notifications/queue.ts:371`), which uses **`createAdminClient()`** at `:379`
  — service role, RLS bypassed, no auth check anywhere. Same shape as the
  `/api/health/cron-status` hole #174 closed.
- **The rest of `actions/notifications/queue.ts` is a defence-in-depth gap, not an
  exposure.** Zero `authorizePermission` and zero `getUser()` in the whole module, but
  those functions use the RLS-bound client and `notification_queue_select` holds.
- **The legacy `['admin','chairman']` check is in three functions**, not the one the
  issue names: `get-audit-logs.ts:46`, `:141`, `:195`.
- **An action-only fix does not close the ADR-0006 breach.** The `audit_logs` SELECT
  policy (`20251213200000_create_audit_logs.sql:75-83`) admits chairman *and* reads
  `profiles.role` directly. So this slice needs a **migration**, which per `CLAUDE.md`
  means checking open issues first — it touches RBAC/RLS — and applying + verifying by
  name after merge.

**Then close the epic:** #180 itself.

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
