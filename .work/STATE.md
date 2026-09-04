# STATE — Epic #180

> **2026-09-04 — EPIC #180 IS COMPLETE.** All 18 slices (#163–#181) closed; `epic/180`
> merged to `master` via PR #198. Both migrations it carried are applied and verified by
> name against the database. **Next work starts from `origin/master`.**
>
> ⚠️ The local `master` branch in `C:/projects/RESIDIO` is **stale and divergent** — 6
> unpushed commits, 81 behind origin at the time of writing, and `git pull` on it
> conflicts. Those 6 are old `feat/admin-dashboard-settings` work. Branch from
> `origin/master` explicitly; do not `git checkout master` and pull.
>
> The database is available again and the four previously-blocked checks are done —
> see "Database facts, verified" below, and the verification comment on #182.

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
| Phase | **COMPLETE — 18/18 closed, merged to `master` (PR #198).** |
| Last completed | #181 merged `66ded86`; epic merged to master `ed8e76f` |
| Gates (2026-09-04 on `968c68d`) | **75 files / 446 tests**, tsc exit 0, lint **0 errors / 326 warnings**, build exit 0. No flake this run; see **D25** for the two files that time out under load |
| Epic HEAD | `968c68d`, post-#164 merge + doc re-stamp (16 closed: 163-178) |
| Follow-ups left open | **#197** (Recent Activity blank for chairman — a consequence of #181, filed deliberately) |
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
| 180 | EPIC | — | **CLOSED** | merged to master `ed8e76f` | PR #198 |
| 181 | audit + queue RBAC bypass | 4d | **CLOSED** | merged `66ded86` | migration applied + verified by name; a revoke AND a grant |

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

**Epic #180 is finished. Start epic #182, branching from `origin/master`.**

`docs/adr/0007-one-role-vocabulary.md` is on master and is the binding design — read it
first. Its counts were corrected against the live database this session.

**#183** is the only slice marked `ready-for-agent`: the ratchet test stopping new
migrations from referencing `profiles.role`. It needs no database. Two things recorded on
it and on #186 that must not be lost:

- The ratchet must **ignore SQL comments**. This project's convention puts rollback SQL in
  a comment block, so a migration that *removes* a legacy reference still contains the
  string, and a naive grep would block the very work the test exists to encourage.
- A role with no legacy equivalent (`vice_chairman`, `secretary`, `project_manager`) has
  `profiles.role = NULL`, so it is currently **denied** by all 33 remaining direct-read
  policies regardless of its RBAC grants. Rewriting them to `has_permission()` therefore
  **widens** access. That is the opposite direction from #190's bucket-collapse hazard,
  and the two populations are disjoint — they need opposite reasoning.

`audit_logs` already left #186's scope (done in #181): direct-`profiles.role` policies are
now **33 across 28 tables**, `get_my_role()` callers **97 across 36**.

