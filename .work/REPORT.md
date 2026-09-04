# REPORT — Epic #180, Settings information architecture

Maintained continuously. If the session dies mid-epic, everything delivered up to that
point is recorded here.

## 1. Per-issue results

| # | Title | Delivered | Model | QA | Cycles | Closed |
|---|-------|-----------|-------|----|--------|--------|
| 163 | prettier undeclared | **Nothing — premise disproved.** A cold `npm ci` in a clean clone installs prettier 3.7.4 and runs 383/383 green. Closed as not reproducible with evidence. | haiku (reproduction only) | n/a | 0 | ✅ |
| 168 | Chairman regains `settings.view` | Migration granting `chairman` → `settings.view` and nothing else; two false documentation claims corrected. Migration **applied to the live database and verified by name**. | haiku + sonnet QA | **PASS** (9/9) | 0 (1 defect fixed by me) | ✅ |
| 167 | middleware `/system` safety net | Generic `/system` guard + `adminOnlyRoutes` + a structural test. Closed the hole before any page existed to fall through it. | haiku + sonnet QA | **PASS** | 0 (1 tautological test replaced by me) | ✅ |
| 169 | main sidebar nav state | `use-sidebar-nav-state.ts` module store on `useSyncExternalStore`; the effect that clobbered the reader's choice is gone | sonnet + sonnet QA | **PASS** | 0 | ✅ |
| 170 | settings group reopen + mobile multi-open | Reopen-on-entry rule persisted across full page loads; mobile rewritten multi-open on the shared store | sonnet + sonnet QA | **PASS** | 1 | ✅ |
| 171 | audit logs → `/system/audit-logs` | The template slice: move, redirect, both route entries, `system/layout.tsx`, and the `/system` coverage test five later slices depend on | sonnet + sonnet QA | **PASS** | 0 (3 stale docs swept by me) | ✅ |
| 172 | account admin → `/system/accounts` | Five tabs split two/three; components relocated unedited; permissions narrowed as specified | sonnet + sonnet QA | **FAIL → fixed → PASS** | 1 | ✅ |
| 173 | one notification queue backend | `queue-management.ts` deleted; queue and history become two `/system` pages on the integrated backend | sonnet + sonnet QA | **PASS** | 0 | ✅ |
| 175 | ownership backfill → `/system/data-tools` | Moved; dead `dataManagementVisible` branch removed; `revalidatePath` re-pointed | haiku + sonnet QA | **PASS** | 0 | ✅ |
| 174 | cron page + close public API | Unauthenticated `/api/health/cron-status` closed — verified by request, not inspection — plus a `CRON_SECRET` path for the backup workflow, and one canonical cron page. Both stale links re-pointed, including the one inside the outage-alert email. | sonnet + sonnet QA | **PASS** (after 2 doc defects fixed) | 0 | ✅ |
| 176 | rename `/settings/system/*` | `/settings/maintenance` + `/settings/data-retention`; the `/settings/system` overview retired to a redirect. Permissions byte-identical — a path move, not an authorization change. D16's `revalidatePath` handoff landed. | sonnet + sonnet QA | **PASS** | 0 | ✅ |
| 177 | `/system` health dashboard | One page answering "is anything wrong?", assembled from five existing server actions; header health link re-pointed (D20). Flat nav item, not parent-with-children. **Surfaced #181.** | sonnet + sonnet QA | **PASS**, no defects | 0 | ✅ |
| 178 | regroup Settings | Six subject groups, 30 links, depth 2; the two Gmail pages merged on the config page's markup; both e2e group-name regexes updated. A nav permission narrowing caught and reverted by me — D21. | sonnet + sonnet QA | **PASS**, no defects | 0 | ✅ |
| 165 | search_logs has a reader | Search tab on the analytics page using all three orphaned modules — **and** `getSearchAnalytics` guarded on `settings.view_audit_logs`, which it had never been (D22). Two limitations left noted in code, not hidden. | sonnet + sonnet QA | **PASS** | 0 | ✅ |
| 166 | `Cmd+1-5` badge order | Badges and hotkeys now derive from one flattening. QA established the symptom does **not** reproduce today — the divergence is latent, and goes live when #179 adds palette entries. Shortcut map rekeyed to href before merge on QA's advice. | sonnet + sonnet QA | **PASS** | 0 | ✅ |

## 2. Decisions taken on the user's behalf

Full log with rationale and reversibility: `.work/DECISIONS.md` — **D1–D23**, all
reversible.

Setup (D1–D6): trunk is `master` not `main`; `epic/`+`issue/` branch prefixes adopted
over the AGENTS.md lane list; the unmerged ADR branch merged into the epic so its
binding constraints travel with it; a pre-existing red typecheck repaired in its own
commit; worktrees share `node_modules` by junction (**later reversed — D15**); #174
serialized before #176.

The ones a reader should not miss:

- **D9** — #163's premise was false; closed with evidence rather than fixed as written.
- **D14 (INCIDENT)** — I damaged the shared `node_modules` during worktree teardown and
  the damage masqueraded as a code failure. **D15 replaces D5**: every worktree now gets
  its own real `npm ci`, never a junction.
- **D18 + D22** — #165's either/or resolved on evidence, then reshaped when the action
  turned out to have no authorization at all.
- **D21** — a nav permission narrowed in a way no gate could catch, because the coverage
  test is structurally blind to the inverse defect.
- **D23** — verified, rather than assumed, that middleware consumes `ROUTE_PERMISSIONS`
  directly. Had #104's "hand-maintained second copy" claim still been true, every
  `/system` guard this epic added would have been decorative.

## 3. Opus escalations

None. Every slice so far has been served by Haiku or Sonnet at default effort.

## 4. Deferred, BLOCKED, or awaiting a call

Nothing blocked. Two things for your visibility:

- **#163 was closed rather than fixed.** The requested change — declaring `prettier` as a
  devDependency — would have been wrong: this repo never imports prettier itself, and the
  declaration would misdescribe a production transitive requirement as a dev tool. Full
  evidence in D9 and on the issue. Reopen if a cold `npm ci` ever fails for you.
- **#168's migration is applied to the live database.** Additive and reversible (the
  rollback SQL is in the migration file). Post-apply verification confirms chairman's only
  permission in the `settings` or `system` categories is `settings.view`.

## 5. Contradictions and gaps between issues, CONTEXT.md and the ADRs

Recorded in `.work/PLAN.md` under "Contradictions and gaps found while planning" —
eight so far. The two that change how the work runs: `npm test` is bare `vitest`
(watch mode, never exits) despite every issue body instructing agents to run it, and
#174/#176 collide over `/settings/system` without either issue acknowledging it.

## 6. Residual risks and follow-ups

- **The middleware hazard — closed, and verified twice.** `src/middleware.ts` skips its
  entire authorization block when no `ROUTE_PERMISSIONS` prefix matches, so a `/system/*`
  page shipped without an entry would be fully public. #167 installed the generic guard,
  #171 installed the structural test, both merged before any `/system` page shipped, and
  **D23 confirmed middleware consumes `ROUTE_PERMISSIONS` directly** rather than the
  stale copy #104 describes — without which every guard would have been decorative.
- **`/analytics` is still reachable without a session** — none of the 51
  `ROUTE_PERMISSIONS` keys is a prefix of it and it is absent from `adminOnlyRoutes`.
  That is **#104**, not this epic's to fix. #165 closed the exposure that mattered by
  guarding the action server-side, independently of the routing gap.
- **#181, spawned by #177**, is open and untriaged: two system-dashboard server actions
  authorize inconsistently with the rest of the RBAC surface.
- **`groupedResults` and `orderedResults` are two implementations of one rule** after
  #166. They agree today; nothing structurally keeps them agreeing. #164 edits that file
  next and carries this in its brief.
- ~~**Baseline caveat:** tests are green only because of a stray prettier install.~~
  **RETRACTED — see D9.** A cold `npm ci` in a clean clone runs green; prettier is a
  committed transitive dependency of `@react-email/render`. A green test run here means
  what it appears to mean.
- **A second file now shows the D10 load flake.**
  `src/app/api/whatsapp/webhook/twilio/__tests__/route.test.ts` timed out at 15s in a
  full-suite run on 2026-09-04 and passed in **835ms** in isolation, same shape as
  `module-integration.test.ts`. Not chargeable to any slice; re-run the file alone before
  believing it.
