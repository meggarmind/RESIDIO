# SESSION_STATE.md — Live Handoff

Coordination file shared between OpenCode and Claude Code working on Residio.
**Keep this up to date at the end of every session.** Anyone starting work reads this first.

> This is the sole live handoff and project-state record for cross-agent work.

> **🎯 PRODUCT FOCUS — READ BEFORE ANY TASK (set 2026-08-06): ALL work targets the ADMIN DASHBOARD.** Resident Portal / self-service (`src/app/(resident)/**`, `src/components/resident-portal/**`) is **not planned for rollout** in the foreseeable future. Do not invest in portal/self-service work; keep it stable/local only. When a task touches portal code, ask: is this admin value? Ensure TODO.md/AGENTS.md/CLAUDE.md stay aligned with this direction.

---

## Last session (OpenCode, 2026-08-24 — OpenCode review agent)

## Last session (OpenCode, 2026-08-24 — WhatsApp Operations Console #7)

- Implemented the admin-only `/settings/whatsapp` operations console with searchable consent registry, consent-state filtering, masked numbers, timestamps, pending-contact review, active-session inspection/reset, disclosure-log filtering, and bot health counters.
- Added permission-first read actions for sessions, disclosure logs, and health metrics. Existing identity writes remain permission-first and audit successful writes; bulk opt-in import, pending attach/ignore, force-PIN updates, and session resets are covered by the existing action boundary.
- Added focused action tests for authorization boundaries, financial-field redaction, health aggregation, and registry/disclosure filters. Focused WhatsApp suite: 37/37; full Vitest: 280/280; TypeScript and scoped ESLint pass.
- Full repository lint remains blocked by existing generated/static `website/build` lint findings (123 errors, 1,522 warnings). Production build was attempted but the Windows child process was terminated by the runner before completion.
- No commit created. Existing unrelated wallet/property/security changes remain untouched.

- Added the project-local `meggar-review` OpenCode subagent at `.opencode/agent/meggar-review.md`. It verifies only `ready-for-agent` issues in the `In review` column of `meggarmind/projects/1`, moves unambiguous approvals to Done, and otherwise hands the issue back with `ready-for-human`.

## Last session (OpenCode, 2026-08-23 — Full issue sweep)

- **Issues implemented this session:** #16 (archive safety), #78 (backfill profile error), #82 (invoice naming format), #84 (role terminology), #95 (generation workflow separation), #97 (billing date filter), #102 (mobile dashboard parity), #103 (shell variant cleanup). Combined with prior work, 18 issues are now at In review.
- **Dashboard:** Mobile header shows page identity; mobile menu mirrors desktop IA; canonical shell identified (header.tsx + sidebar.tsx); modern-header.tsx and modern-sidebar.tsx removed (810 lines); all 9 Playwright dashboard specs pass at 390x844.
- **Billing:** New /billing/generate page with generation dialog, banner, and table-format history; prepayment invoices use `INV-{short_name}-{YYYY}-{MM}` format with null short_name fallback; billing filter bar includes This Month/Last Month/Last 3 Months/This Year date presets; `/billing?resident_id=` deep-link filter persists.
- **Resident management:** Archive uses AlertDialog with operational-impact summary; corporate fields hidden-but-preserved on entity_type toggle; display labels updated system-wide (Property Owner, Owner-Occupier, Renter, Occupant, Family Member).
- **Verification:** TypeScript clean; 221/221 Vitest tests pass; 9/9 dashboard Playwright specs pass; production build clean.
- **Git:** Commits 42a5be3, bbfb7e6, 5abf147, 6a1c8dc, e677795 on master. No uncommitted changes.
- **Remaining open issues not at In review:** #88 (Estate AI chatbot), #90 (Live Status Widgets), #91 (Cinematic Transitions), #92 (Premium Digital Passes) — all Ready with loose specs needing clarification. #73 (full-estate backfill) needs human decision. Performance chain (#58-63), WhatsApp chain (#1/6/7/8), and Financial Reports PRD (#24) are backlog epics.

## Last session (OpenCode, 2026-08-23 — Billing issues #79, #80, #94)

- **Parallel implementation:** Secured billing/resident query actions (#94) while implementing resident invoice deep-link filtering and the enhanced billing resident selector (#79/#80).
- **Security:** `getInvoices`, invoice detail, resident indebtedness, house payment status, cross-property payment summary, and the focused billing resident options query now fail closed on `BILLING_VIEW`; the general resident list uses `RESIDENTS_VIEW`.
- **Billing UX:** `/billing?resident_id=<id>` filters on first render; the selector loads all residents through a minimal-column query, sorts first/last name, searches active aliases, and uses a wider responsive trigger.
- **Verification:** `npx tsc --noEmit` passed; 9 focused Vitest tests passed; scoped ESLint passed; full `npm test -- --run` completed without reported failures; `npm run build` passed with only the known Paystack route-config warning. One low review follow-up remains: add component-level URL-to-query wiring coverage.
- **Git:** No commit created; all earlier dashboard and unrelated billing changes remain preserved in the working tree.
- **Tracking:** Issues #79, #80, and #94 have implementation evidence and are ready to move from In progress to In review.

## Last session (OpenCode, 2026-08-22 — Dashboard issues #98-#101)

- **Parallel implementation:** Used four independent sub-agents for scannable audit activity (#98), mobile navigation accessibility (#99), dashboard hydration/loading hardening (#100), and trustworthy dashboard metrics/actions (#101), then integrated and reviewed their work.
- **Dashboard behavior:** Activity labels and descriptions are human-readable while preserving transaction identifiers; mobile sheet controls have descriptions, names, visible focus, and 44px targets; debug rendering uses hydration-safe URL state; route/auth/error states are distinct; attention counts are queried from live resident/payment/security data; finance labels distinguish estate cash, wallet credits, verified payments, invoice counts, zero values, and unavailable data.
- **Verification:** `npx tsc --noEmit` passed; 16 focused Vitest tests passed; scoped ESLint has no errors (one pre-existing header image warning); `npm run build` passed; focused Playwright debug-path and mobile-navigation tests passed. Full `npm run lint` still fails on 125 pre-existing errors in generated/static artifacts outside this change. Full Vitest command completed without reported failures in captured output.
- **Git:** No commit created. Existing unrelated dirty changes in `.claude`, billing, searchable-select, and coordination files were preserved.
- **Next:** Close #98-#101 after user review, then start unblocked #102 (mobile orientation/navigation parity); #103 remains blocked by #102.

## Last session (OpenCode, 2026-08-22 — Admin guide deployment)

- **Docusaurus guide:** Added a TypeScript Docusaurus site under `website/` with a screenshot-led admin manual covering getting started, residents, properties, finance, security, operations, settings, and administration.
- **Screenshot safety:** Captured desktop/mobile admin screenshots through Playwright with browser-side masking for names, contact values, financial amounts, resident codes, house labels, UUIDs, and legacy contact placeholders. Added a reusable `website/scripts/capture-admin-screenshots.mjs` script requiring local credentials through environment variables.
- **Verification:** `website` typecheck and production build pass. Local Playwright verification passed for the homepage, key doc routes, image loading, desktop navigation, mobile navigation, and zero browser console errors on the fresh public deployment.
- **Deployment:** Published commit `fa37650` to `master` and static commit `9a77050` to `gh-pages`. GitHub Pages is configured in legacy branch mode and is live at [meggarmind.github.io/RESIDIO](https://meggarmind.github.io/RESIDIO/). The Actions workflow is present but its first run was blocked by the GitHub account billing lock; direct Pages publishing completed successfully.
- **Next:** Keep the guide synchronized with admin UI changes and resolve the existing mobile dialog accessibility warning tracked in TODO/dashboard follow-up issues.

## Last session (OpenCode, 2026-08-22 — Dashboard review tickets)

- Published the approved dashboard review slices as GitHub issues #98–#103, all labeled `ready-for-agent`.
- Independent issues: #98 Scannable audit activity, #99 Mobile navigation accessibility, #100 Dashboard hydration and loading hardening, and #101 Trustworthy dashboard metrics and actions.
- Dependencies: #102 Mobile dashboard orientation and navigation parity is blocked by #99; #103 Dashboard shell variant cleanup is blocked by #99 and #102.
- GitHub issue creation and labels verified. Project-board verification was unavailable because the current GitHub token lacks `read:project`; repository automation is configured to auto-add new issues.

---

## Last session (OpenCode, 2026-08-20 — Settings page restructuring)

## Last session (OpenCode, 2026-08-22 — Dashboard review via impeccable)

- **Scope:** UX critique + technical audit of `src/app/(dashboard)/dashboard` (admin focus). Parallel assessment sub-agents returned unusable output; review completed inline (degraded run) with direct code inspection + Impeccable detector.
- **Detector:** `detect.mjs` over the dashboard route returned **0 findings** (no slop patterns).
- **Top findings:** P1 hydration-risk debug block in `dashboard/page.tsx:109` (`window.location.search` during render); P2 hardcoded placeholder props in `ActionsCard` (`page.tsx:61`: `unverifiedPaymentsCount={0}`, `isLoading={false}`); P2 duplicate component families (`sidebar.tsx`/`modern-sidebar.tsx`, `header.tsx`/`modern-header.tsx`) drifting.
- **Strengths confirmed:** Suspense-streamed cards with skeletons, a11y touches (offline banner `aria-live`, breadcrumb `aria-current`, collapse buttons labeled).
- **Live-browser pass added:** Authenticated as seeded super-admin and inspected `/dashboard` at 1440x1000 and 390x844. No horizontal overflow and no browser errors. Confirmed coherent desktop content hierarchy and responsive single-column mobile flow.
- **Browser findings:** P1 mobile navigation Radix dialog emits the missing `Description` / `aria-describedby` warning twice; P1 multiple mobile controls are below 44x44 (menu/notifications 36x36, profile/theme 40x40, dialog close 16x16); P1 header includes an unlabelled icon-only button; P2 mobile header loses page identity (no visible Dashboard/greeting heading); P2 content labels expose weak/ambiguous semantics (`3,100,000 of 3,285,000 Invoices`, `Portfolio Value ₦0` vs `Wallet Credits ₦2,800,964`, generic audit verbs); P2 mobile nav is a reduced five-link subset versus the full desktop IA.
- **No product files changed. Next:** fix merged P1/P2 findings or extend review to billing surface.

## Last session (OpenCode, 2026-08-22 — Admin Playwright smoke pass)

- **Authenticated browser verification:** Used `playwright-cli` with the seeded super-admin account against the existing local server on port 3000. Dashboard, main admin modules, and the primary settings routes loaded without application error text or browser console errors.
- **Responsive check:** At 390x844, the dashboard rendered and the mobile menu opened with Dashboard, Residents, Transactions, Security, and Settings links.
- **Finding:** The mobile menu emits two Radix dialog accessibility warnings because `DialogContent` has no description/`aria-describedby`. No data-changing controls were exercised.
- **Worktree:** Existing uncommitted billing/searchable-select changes were preserved. No revert was performed because the requested revert target was not specified.
- **Next:** Clarify which change or interface state should be reverted; optionally add a dialog description and rerun the mobile check.

- **Settings page restructuring complete.** Split 6 monolithic settings pages into focused sub-routes with collapsible sidebar navigation. Total: 20+ new sub-routes created across the settings section.
- **Sidebar navigation upgraded.** Added `children?: SettingsItem[]` type to `settings-nav.ts`. Desktop sidebar (`settings-sidebar.tsx`) and mobile nav (`settings-mobile-nav.tsx`) both support nested items with auto-expand on active route.
- **Billing & Finance (970→5 pages):** `/settings/billing` (toggles+reminders), `/settings/billing/late-fees` (config+waivers), `/settings/billing/invoices`, `/settings/billing/development-levies`, `/settings/billing/profiles`.
- **General & Preferences (589→4 pages):** `/settings` (hub), `/settings/estate-info` (form+assistant+social), `/settings/branding` (logo), `/settings/data-management` (backfill).
- **Access & Security (486→3 pages):** `/settings/security` (general+reset), `/settings/security/permissions` (matrix), `/settings/security/categories` (CRUD).
- **Notifications/Reminders (722→2 pages):** `/settings/notifications/reminders` (status+overview), `/settings/notifications/reminders/schedule` (table+dialogs).
- **System Health (389→4 pages):** `/settings/system` (hub), `/settings/system/maintenance` (mode+session+duplicates), `/settings/system/data` (retention+prune), `/settings/system/health` (cron card).
- **Communications/Email (389→2 pages):** `/settings/email` (config+toggles), `/settings/email/debug` (debug mode+test+manual).
- **Import Integration (437→2 pages):** `/settings/email-integration` (connection), `/settings/email-integration/config` (import rules+quick actions).
- **Verification:** `npm run lint` clean (0 errors); `npm run build` GREEN — all new routes registered in build output.

---

## Previous session (OpenCode, 2026-08-16 — WhatsApp live verification)

- **Cloud verification:** `whatsapp_optins`, `whatsapp_pending_contacts`, `whatsapp_sessions`, and `whatsapp_link_tokens` each contain 0 rows. All four tables have RLS enabled and only `service_role` policies. Production WhatsApp rollout remains safely disabled (`whatsapp_rollout_mode=disabled`, empty pilot resident/street targeting, force PIN off, outbound cap 100, financial lookup cap 50).
- **Admin surface repaired:** `/settings/whatsapp` now mounts the existing opt-in import, pending-contact attach/ignore, and session-reset controls. Corrected the opt-in table's source/number/state column ordering.
- **Import hardening:** `importWhatsAppOptIns` now uses the canonical phone-normalizing `parseWhatsAppOptInImport` parser, reports malformed-row errors, and fails closed if the existing-opt-in lookup errors.
- **Verification:** WhatsApp-focused tests 21/21 pass; full Vitest 180/180 pass; scoped ESLint passes; `npm run build` passes. Authenticated browser verification passed against `/settings/whatsapp`: the import control is visible, all three live empty states match the cloud counts, and write controls are absent with zero rows. No production writes were attempted.
- **Next:** Proceed with a separately approved non-production WhatsApp fixture before exercising import/attach/reset writes.

---

## Last session (OpenCode, 2026-08-16 — Resident-House engagement coverage)

- **Closed the outstanding coverage gap for Personnel Accountability (#75/#76/#77):** added 21 tests (repo now 180/180 green).
  - **Lib** (`src/__tests__/personnel-engagements.test.ts`, 4 → 10 tests): resident-house scope label (`12A, Main St · Ada Okoro`), generic fallback when the house detail is null, concurrent count (`+1`), ended engagements not active, Estate precedence over Resident-House, and resident-house filter matching.
  - **Actions** (new `src/actions/personnel/__tests__/personnel-engagements-actions.test.ts`, 15 tests): `createResidentHouseEngagement` (unauthorized-before-client, RPC args, read-back, duplicate `23505` message, inactive-target DB message, read-back failure), `updateResidentHouseEngagement` (unauthorized, scope-scoped update, DB error), `endPersonnelEngagement` (unauthorized, sets today's end date + `is end_date null` guard, already-ended PGRST116 path), and `getActiveResidentHouses` (unauthorized, resident/house/street join labelling, placeholder fallback, base-query error).
- **Verification:** `npm test` 180/180 passing (module-integration included); scoped ESLint clean on both files. No production code changed.

---

## Last session (OpenCode, 2026-08-15 — Build unblock + module wiring)

- **Build blocker fixed:** `src/actions/personnel/engagements.ts` failed Turbopack compile — the destructured `engagement` on read-back collided with the function param. Renamed to `createdEngagement`.
- **Completed missing WhatsApp admin actions** (the `/settings/whatsapp` UI referenced actions that did not exist): added `importWhatsAppOptIns` (CSV `resident_code,phone_number`, resident lookup, in-batch dedupe, `admin_import` source), `updateWhatsAppPendingContact` (attach/ignore with resident validation), and `resetWhatsAppSession` (deletes the session row) to `src/actions/whatsapp/identity.ts`. Registered `whatsapp_sessions` as an `AuditEntityType` (+ label) in `src/types/database.ts`. All three are permission + audit compliant.
- **Fixed 6 pre-existing test failures** (committed, unrelated to this session's edits):
  - `billing-aggregate-rpc.test.ts` (4): the three adapters in `src/actions/billing/get-invoices.ts` were still doing unbounded JS reads. Rewired `getResidentIndebtedness`, `getHousePaymentStatus`, `getResidentCrossPropertyPaymentSummary` to the bounded RPCs `get_resident_indebtedness`, `get_house_payment_status`, `get_resident_cross_property_payment_summary` (all verified live in cloud), matching the test contract and removing the unbounded-fallback debt.
  - `dashboard-snapshot.test.ts` (2): added `getAdminDashboardSnapshot` (permission-first via `authorizePermission(PERMISSIONS.BILLING_VIEW)`, no client created on denial) in `get-enhanced-dashboard-stats.ts`, plus `ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY` and `useAdminDashboardSnapshot` in `src/hooks/use-dashboard.ts`.
- **Lint OOM fixed:** ESLint was crawling `.worktrees/**` (12 worktrees incl. their `.next` output) and OOM'd at ~4 GB. Added `.worktrees/**` to `globalIgnores` in `eslint.config.mjs`. Lint now completes; no errors in any file touched this session (115 pre-existing errors elsewhere untouched).
- **Verification:** `npm run build` GREEN (exit 0); `npm test` 159/159 passing (was 153 + 6 failing); scoped lint clean. Dev servers on ports 3000/3101 stopped to release the `.next` build lock.
- **Remaining:** WhatsApp settings UI still lacks wiring verification against live data (opt-in import + pending-contact attach paths untested end-to-end). The personnel `personnel-engagements` test file was added by the prior session; full action/UI coverage for Resident-House lifecycle is still outstanding per that session's notes.

---

## Last session (OpenCode, 2026-08-15 — Personnel Accountability #75/#76/#77)

- **Personnel Accountability (#75/#76/#77, uncommitted):** Added the RLS-enabled `personnel_engagements` schema, grants hardening, duplicate-active protection, Estate and Resident-House RPCs, admin-only server actions, audit logging, directory accountability badges/filters, engagement editing, history, and end actions. Existing Personnel remains unassigned unless an active engagement exists.
- **Resident-House workflow:** Active Resident Houses are loaded into the Personnel dialog; creation validates the active target through the RPC, and editing an existing Resident-House engagement preserves its target and updates its dates/responsibility instead of creating a duplicate. Directory filtering now covers Estate, Resident House, and Unassigned.
- **Verification:** targeted ESLint clean; `personnel-engagements` (4) and module-integration (3) tests pass; `git diff --check` clean. Full typecheck still has only the known five unrelated dashboard/WhatsApp export errors. Supabase Security Advisor has no `personnel_engagements` findings.
- **Remaining:** None for the core engagement lifecycle. Deeper action/UI coverage for Resident-House creation, inactive-target and duplicate rejection, lifecycle ending, and history rendering is now in place (see the Resident-House coverage session below). The create-Personnel-plus-engagement Estate path remains a two-write UI flow except for the dedicated atomic creation RPC.

---

## Prior session (Claude Code, 2026-08-15 — resident detail optimization + Analytics tabbed dashboards)

- **Resident detail page (`/residents/[id]`)**: compacted the Overview tab's Identity & Contact and Financial Summary (renamed from Invoices) cards using the `compact` Card variant; consolidated Wallet Balance into Financial Summary's stat row; added Resident Since, ID Verification, Portal Access, and conditional Company/Liaison Contact rows for corporate residents; fixed a real layout bug where the Identity card was force-stretched via CSS grid equal-height rows with its footer pinned via `mt-auto`, leaving a large blank gap for sparse residents. Merged to `master` at `9fa8454`.
- **Analytics page (`/analytics`)**: added a URL-synced tab bar (Financial / Residents / Houses & Streets / Collections & Indebtedness / Payment Behavior), matching the resident-detail tab pattern. Fixed a real pre-existing bug where the Financial tab's Revenue vs Expenses chart always rendered empty (component called with no props). Built four new dashboards backed by new server actions (`get-resident-breakdown`, `get-house-street-breakdown`, `get-collections-trend`, `get-indebtedness-rankings`, `get-payment-cadence`) and a new pure `classifyPaymentCadence` module (unit-tested) that buckets residents into monthly/annual/irregular/insufficient-data payers by interval regularity. Merged to `master` at `891cca9`.
- **Data-validation pass** (live cross-checks against cloud Supabase `kzugmyjjqttardhfejzc`) found and fixed two real issues:
  - `get-collections-trend.ts` anchored its trailing window to `new Date()`; this dataset's real invoice/payment activity tops out at Dec 2025/Jan 2026, so the "Dues Expected vs Collected" chart was always empty. Now anchors to the latest available `due_date`/`payment_date` instead.
  - `get-payment-cadence.ts`'s unranged `payment_records` select was silently truncated by PostgREST's default max-rows cap (151 residents have paid payments; only 38 were being classified). Replaced with a precomputed `resident_payment_cadence_summary` table refreshed nightly via a new `/api/cron/refresh-payment-cadence` cron job (migration `20260814000000_create_resident_payment_cadence_summary`), following this repo's existing `vercel.json` crons + `verifyCronAuth` pattern. Backfilled once manually and verified: 151 residents / 2,259 payment records processed, matching the live DB exactly.
- **Known, deliberately unfixed finding**: Top 10 Indebted/Non-Indebted only shows 6 residents (mirrored ascending/descending) because only 6 of 139 billable residents have ever had an invoice generated — a genuine upstream data-completeness gap tied to the separately-tracked Invoice Generation Redesign work (issues #52-57), not an analytics bug. Shipped as-is per user decision; not filed as its own issue.
- **Merge conflict caught and fixed**: merging `ui/resident-detail-optimize` produced a duplicate `WalletPaymentBatchTools` import/usage in `residents/[id]/page.tsx` (both the pre-existing `is_active`-filtered call and an incomplete concurrent-session variant lacking that filter landed via git's line-based auto-merge). Kept the `is_active`-filtered version, removed the duplicate.
- **Verification on merged `master`**: `npx tsc --noEmit` clean except the same 45 pre-existing baseline errors (reports/PDF/whatsapp files, unrelated); scoped `eslint` on all touched files clean except pre-existing issues already present before this session (`category-breakdown-chart.tsx` inline-tooltip pattern, `linked-houses.tsx` memoization). `npm test -- --run`: 114/122 passing; the 8 failures (`dashboard-snapshot.test.ts`, `module-integration.test.ts`, `billing-aggregate-rpc.test.ts`) are confirmed pre-existing via `git diff` — none of those files were touched by either merge. Full-repo `npm run lint` hung with no output after 6+ minutes (matches the documented Windows-environment lint-hang issue noted elsewhere in this file); scoped lint used instead per that same precedent.
- Both feature worktrees (`ui/resident-detail-optimize`, `ui/analytics-dashboards`) removed after merging. GitHub issues #70 and #71 closed (fixed on `master`); #72 (merge task) closed.

---

## Current snapshot (verified 2026-08-12)

| Item | State |
|------|-------|
| Runtime | Node v24.7.0 on **Windows 11** (migrated from WSL). Cross-platform: `.gitattributes` normalizes LF. |
| Git branch | `master`. Remote: `origin` → `git@github.com:meggarmind/RESIDIO.git` |
| Working tree | Contains in-progress, uncommitted work from active sessions; preserve unrelated changes. |
| Tests | `npm test` (Vitest) baseline **green: 10 files / 48 tests**; focused outbound changes **green: 2 files / 11 tests** after adding template coverage. **Playwright e2e: 48 passed / 8 failed / 5 skipped** (remaining 8 all login-timeout flake from cold dev-server latency; harness hardened). |
| Build | **`npm run build` GREEN (exit 0)** — first time; 39 page-groups, dashboard + api dynamic. `npx tsc --noEmit` clean (was 22 errors/7 files). |
| Lint | `npm run lint`: **323 errors / 489 warnings** (down from 351). Cleared safe buckets: RHF/ts fixes + static-prerender opts (`00d3ef9`); low-risk batch — empty-type→alias, `require()`→ESM, `<a>`→`<Link>`, typographic quotes in admin copy (`575220c`). Remaining 323 = mostly `no-unused-vars` + `no-explicit-any` (237); 18 `no-unescaped` resident-portal (out of scope). |
| Integration coverage | `module-integration.test.ts` passes. Fixed real gaps (permission+audit) for `system/prune-data`, `personnel/actions`, `projects/create-project`, `expenses/create+update`, `finance/petty-cash`, `finance/manual-verification`. Allowed `vendors`/`projects` as audit entity types. Recipient-facing/cron/webhook/auth flows (payments, billing wallet-pay, paystack init/verify/webhook, email-imports, 2FA login) are allowlisted with rationale — they cannot take an admin RBAC `authorizePermission` guard. Note: this test reports "70 permission / 51 audit gaps" but PASSES — gap summary includes allowlisted-but-still-missing entries, not a failure signal. |
| Lint | `npm run lint`: **142 errors / ~480 warnings** (from 323). `no-explicit-any`: 237 → ~40 (admin). `ban-ts-comment`: 9 → 2. `react-hooks/set-state-in-effect`: 38 → 36 (compiler rule; can't suppress). `no-unescaped-entities`: 18 → 15 (mostly portal). Remaining `any`s are a long tail (1 per file across ~30 admin files). |
| Perf | `force-dynamic` removed from dashboard layout. React Query staleTime: 1min → 5min. Sidebar hooks + AI assistant cached. `loading.tsx` shell skeleton created. Suspense boundaries on dashboard cards. Build green, tsc 0, Vitest 16/16. |
| Delivery priority | **Fast-track:** P0 finance/statements/imports/reports, P0 critical performance backlog, P1 WhatsApp/SMS operational integrations. WhatsApp issues #2–#5 are complete; issue #6 is next. Payment gateway is deferred; portal/self-service remains deprioritized. |
| Database documentation | **Verified 2026-08-10:** configured cloud Supabase REST access is working (HTTP 200). The architecture inventory now covers 30 later tables confirmed through zero-row live API requests; `docs/architecture/db-visual.sql` is explicitly marked as an incomplete historical snapshot. |
| Legacy import review | **Reconciliation/import in progress 2026-08-12:** all 136 ledger entries match exactly one existing house; the refreshed scoped snapshot contains 2,259 payment records, 223 resident-house assignments, 193 residents, and 53 payment aliases. Alias-only assignments were deactivated while their residents were retained with explanatory notes. OJO.K-2, OJO.K-8, OJO.K-9B, IBB-29B, IBB-33, GLB-5B, and the held-back spelling/alias cases were reconciled from user-confirmed source data. The payment manifest has 203/203 matched house/year totals after two idempotent legacy-payment imports. The corporate-tenant migration is live; all six user-named corporate transactors are verified as corporate tenants (four paired with confirmed individual landlords and two intentionally owner-unassigned); Hassan Ogwe is linked as non-resident landlord for the twelve reviewed GLB 19*/20* rentals. |

---

## Coordination rules

1. **One source of truth for project setup**: `AGENTS.md`. `CLAUDE.md` defers to it for stack/commands/architecture; `CLAUDE.md` keeps the auth/audit integration contract only. Don't let these diverge.
2. **Update this file** at end of every session: bump "Current snapshot", log what changed, set next steps.
3. **Commit + push** the end of every session so the tree the other agent opens is clean and shared (do not leave 18 modified files sitting in the tree).
4. **Test baseline**: `npm test` is currently red on integration. This is a known, intentional gap list — do not treat it as "all good". Fix gaps (add `authorizePermission` + `logAudit`) or add allowlist entries as you complete modules.
5. Shared credentials are LOCAL-ONLY: never commit `.env` or service keys. `.env*` is gitignored.

---

## Before you start

```bash
git fetch && git pull          # sync with remote if another agent pushed
npm install                    # only if package.json changed
npm test                       # confirm known-current baseline
cat AGENTS.md                  # commands, architecture, conventions
```

## Before you finish

```bash
npm run lint && npm run build  # must pass
npm test                       # document any remaining failures here
```

Then update `Current snapshot` + `Last session` below, commit, and push.

---

## Last session (OpenCode, 2026-08-11)

- **WhatsApp pilot controls (#8):** Added disabled/pilot/estate modes, resident/street targeting, fail-closed outbound and financial access enforcement, admin rollout controls, configurable daily caps, retention purge for expired sessions and processed-message deduplication rows, and monitoring. Cloud verification confirmed service-role-only RLS for operational WhatsApp tables and no current WhatsApp data rows. Applied migration `seed_whatsapp_pilot_control_defaults`; production is explicitly disabled with empty pilot targeting, 100 outbound/day, and 50 financial lookups/day. Pilot/retention/dispatch tests pass; full Vitest currently has 6 unrelated failures in concurrent dashboard/billing work. Controlled provider exercise remains.
- **Pilot exercise hardening:** Added explicit inbound financial pause enforcement and targeted tests proving out-of-pilot residents cannot reach financial readers. The targeted rollout/financial/dispatch suite passes **20 tests**; simulator/provider coverage already verifies duplicate webhooks, retries, STOP/START, approved templates, and safe provider failures.

- **WhatsApp outbound messaging (#6, in progress):** Added Meta Cloud API template-message support and named `invoice_reminder`, `payment_received`, and `announcement` contracts. Invoice reminders, admin-created payments, and emergency announcements now use the notification queue, preserving recipient contact fields, history, retry status, preferences, and opt-in enforcement. Added an approved-template allowlist and system-setting daily outbound cap (`whatsapp_outbound_daily_cap`, default 100). SMS remains dormant.
- **Verification:** Focused outbound tests passed 12 tests; focused ESLint passed with five pre-existing warnings and no errors. Repository typecheck remains blocked by unrelated reconciliation/report/PDF errors outside the WhatsApp and notification changes.
- **WhatsApp lookup guard:** Added `whatsapp_daily_financial_lookup_cap` (default 50), counted against today's immutable disclosure logs and enforced at the webhook financial-reader boundary. Added denial-path coverage.
- **Next:** Add producer-level integration tests for reminder/payment/announcement queue creation, then complete issue #6 and proceed to the operations console.

- **WhatsApp Channel Foundation (#2):** Implemented direct Meta Cloud API provider boundary, safe configuration handling, signed webhook at `/api/whatsapp/webhook`, in-memory simulator, notification dispatcher wiring, and cloud `whatsapp_processed_messages` table with RLS and 24-hour deduplication expiry. SMS was removed from `IMPLEMENTED_CHANNELS` because it is not operational.
- **Verification:** Cloud migration applied and RLS verified. `npm test -- --run` passed 8 files / 30 tests; `npx tsc --noEmit` passed; targeted WhatsApp/notification lint passed; full repository lint remains failing on pre-existing unrelated errors; `npm run build` passed.
- **Review hardening:** Added route handshake/signature tests, simulator send coverage, release-on-handler-failure retry behavior, expired-ID cleanup, and regenerated `src/types/database.generated.ts` from cloud schema.
- **Issue tracking:** Closed [GitHub issue #2](https://github.com/meggarmind/RESIDIO/issues/2). Next implementation slice is [#3 Resident Identity and Consent](https://github.com/meggarmind/RESIDIO/issues/3).
- **WhatsApp Core Financial Standing (#4):** Added 15-minute sessions, deterministic Balance/Last Payment/Next Due/Wallet menu, multi-house property selection, optional and force-PIN policy, consent invariant, authoritative financial readers, and immutable disclosure logging. Added force-PIN admin control and cloud schema/type updates.
- **Verification:** Full Vitest passed 10 files / 45 tests; targeted WhatsApp lint passed; cloud migrations applied. Full typecheck/build are currently blocked by unrelated concurrent `scripts/reconcile-ibb33-glb5b.ts` errors; the WhatsApp code has no reported type errors. Issue #4 is closed; [#5 Period-Based WhatsApp Statements](https://github.com/meggarmind/RESIDIO/issues/5) is next.
- **WhatsApp Period-Based Statements (#5):** Added fixed periods (month/year/six months), bounded latest-row statement composition, current billable property/all-properties scope validation, authoritative payment totals, void filtering, and disclosure logging. Added composition and flow tests. Issue #5 is closed; [#6 Outbound Estate Messaging](https://github.com/meggarmind/RESIDIO/issues/6) is next.
- **Verification:** Full Vitest passed 10 files / 48 tests; targeted WhatsApp lint passed. Full typecheck/build remain blocked by unrelated concurrent reconciliation-script errors; no WhatsApp errors were reported.
- **WhatsApp Identity and Consent (#3):** Added canonical phone matching with shared-number ambiguity protection, one-time link tokens, opt-in records, STOP/START handling, pending contacts, explicit community/financial eligibility tier, consent-enforced outbound dispatch, and admin opt-in/pending-contact operations view. Added permission/audit integration, RLS policies, and generated cloud database types.
- **Verification:** Cloud migrations and RLS verified. Full Vitest passed 9 files / 37 tests; targeted WhatsApp lint passed; `npx tsc --noEmit` is currently blocked by an unrelated concurrent `src/app/(dashboard)/residents/loading.tsx` prop error; the latest build was blocked by another concurrent `.next/lock` holder. Issue #3 is closed; [#4 Core Financial Standing Menu](https://github.com/meggarmind/RESIDIO/issues/4) is next.

- **WhatsApp Assistant design and planning:** Ran a domain-modeling grilling session. Recorded the agreed domain language in `CONTEXT.md` and created ADR-0001 for the deliberate WhatsApp resident-facing exception to the web-portal guardrail and ADR-0002 for direct Meta Cloud API delivery behind a provider-agnostic module.
- **WhatsApp PRD:** Published [PRD #1](https://github.com/meggarmind/RESIDIO/issues/1) with the `ready-for-agent` label.
- **WhatsApp vertical slices:** Published dependency-ordered issues [#2](https://github.com/meggarmind/RESIDIO/issues/2) through [#8](https://github.com/meggarmind/RESIDIO/issues/8), all labeled `ready-for-agent`: channel foundation, identity/consent, core financial standing, statements, outbound messaging, operations console, and pilot controls.
- **Channel reality recorded:** SMS is not implemented despite existing code advertising it as implemented; issue #6 explicitly requires resolving that discrepancy accurately while adding WhatsApp.
- **Verification:** GitHub issue list confirmed #1–#8 and labels. No application tests were run because this session only created planning/documentation and GitHub issues.

- **Database architecture audit (Codex, 2026-08-10):** Confirmed read access to cloud Supabase. Reconciled `docs/architecture/database-schema.md` with generated types and the live API, corrected `wallets` to `resident_wallets`, and documented later finance, projects, operations, notifications, reporting, search, and assistant tables. No schema or application data was changed.

- **Database architecture audit (Codex, 2026-08-10):** Confirmed read access to cloud Supabase. Reconciled `docs/architecture/database-schema.md` with generated types and the live API, corrected `wallets` to `resident_wallets`, and documented later finance, projects, operations, notifications, reporting, search, and assistant tables. No schema or application data was changed.
- **Legacy tracker review (Codex, 2026-08-10):** Created `docs/importdata/legacy-record-ledger.md` and reconciled L-0001 / OJO.K-2 through read-only queries. It proposes a name/alias correction, tenant→resident-landlord assignment correction from 2015-01-01, and one missing Dec 2025 NGN 30,000 payment. No database write was made; the only open decision is archive vs delete for an alias-only secondary record.
- **Legacy tracker review (Codex, 2026-08-11):** Added IBB source-only entries L-0038–L-0046 for Houses 1, 3A F-3/F-4, unreadable 3?/F?, 5, 7, 10A, 16, and 16A. Parallel transcription preserved source payment totals, blue-cell dates, status notes, and unresolved clipped-name/property ambiguities. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** User confirmed Maxwell Mensah’s `3 ? F ?` label, canonical names Chukwuma Bright Unaegbu and Odubugwu Justin Chidera, all gray names as aliases, and House 5 acquisition text as notes-only. User instructed that IBB landlord/self-occupied source labels be ignored for role classification. Ledger updated; no database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Added IBB L-0047–L-0061 covering Houses 18E-2 through 27. Preserved payment totals, development/security/utility notes, blue-cell dates, source inconsistencies, and unresolved OCR/highlight ambiguity. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Corrected L-0049 to Wilson Tobias Chukwu and confirmed L-0059's September 2025 cell as a move-in marker. Added IBB L-0062–L-0072 (Houses 29A–38), including explicit landlord/entity mappings for Houses 32, 33, and 38. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** Confirmed Ubah Karl Chinedu as the primary resident at IBB-29B with Villanova Realty as payment alias; Margaret Akpo/Rivers Geena Asuquo as IBB-31 F-3 payment aliases; and Bakre Olarenwaju Ishola as IBB-36B payment alias. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Added source-only GLB L-0073–L-0091 (Houses 1A–12), preserving payments, blue-cell dates, source totals, and purchase/development/security notes. GLB source-name classification remains open in the ledger. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** Confirmed all GLB source references as payment aliases except William Racheal Ti, who is the GLB-5B landlord. His residency and ownership-start date remain unspecified. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Added source-only GLB L-0092–L-0101 (Houses 16–19C). Hassan Ogwe is recorded as the user-confirmed landlord for every 19-series property. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** Confirmed Christian Ounorah and Ochuagbachris Chinenye as GLB-17A Flat 1 payment aliases; Anosike Ezinne Angela as the GLB-19B F-2 linked secondary resident; and Asiegbu David as GLB-19C F-3 payment alias. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Added source-only GLB L-0102–L-0106 (20 F-1/F-3/F-4/F-5/F-9), all under user-confirmed landlord Hassan Ogwe. Preserved separation and pre-move-in payment anomalies. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** GLB-20 F-9 move-in and first billing are both confirmed as 2022-08-01. Its 2022 paid NGN18,000 is NGN6,000 pre-move-in payment plus a NGN12,000 prior-tenant credit applied for the new tenant. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** Canonicalized all previous `Alh Hassan` landlord references to **Hassan Ogwe**, confirmed `resident_landlord`, and added GLB-21 as his resident-landlord record from 2015-01-01. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Added KOA L-0108–L-0125 (Houses 1A–16) with user-confirmed linked secondary, alias, and landlord assignments for Houses 5, 10-series, 15-series, and 16. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** Confirmed Omokehinde Patrick and Escodak Investments as payment aliases; Anwuli Okafor as a KOA-13A linked secondary resident; and Odera Okafor as ignored/skipped. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** Added KOA L-0126–L-0136 (Houses 17–19), preserving blue-cell dates, payment history, the House 19 renovation fee, and one outstanding source-name classification. No database query or write was made.
- **Legacy tracker clarification (Codex, 2026-08-11):** Confirmed Abodunde Olayemi as the KOA-17 payment alias. No database query or write was made.
- **Legacy tracker review (Codex, 2026-08-11):** User declared the supplied legacy tracker complete. The no-write review pass is closed at L-0136; remaining houses will be added later or manually. Database reconciliation/import remains suspended pending explicit authorization.
- **Legacy tracker reconciliation (Codex, 2026-08-11):** User authorized the next phase. A read-only cloud Supabase snapshot was generated for all OJO.K, IBB, GLB, and KOA houses: 136/136 legacy labels now have a single existing-house match. Current records contain 193 resident-house assignments, 2,257 payment records, and no payment aliases across the scoped houses. Import writes remain pending a safe policy for new residents without phone numbers and preservation of legacy alias-only resident records.
- **Legacy tracker import (Codex, 2026-08-11):** User approved `LEGACY-NO-PHONE` placeholders for genuinely new residents and preservation of alias-only resident rows. Applied and re-verified five safe alias conversions (OJO.K-2, IBB-18F-3, GLB-5A, GLB-9A, KOA-6). The records remain in place with a conversion note, their incorrect active assignments are inactive, and seven payment aliases exist. OJO.K-2 was also corrected to Chukwuemeka Francis Abara and `resident_landlord` from 2015-01-01. Continue with the remaining confirmed alias/ownership/history reconciliation; payment rows require deduplication against the existing 2,257 records.
- **Legacy tracker import (Codex, 2026-08-11):** Applied a second, dry-run-validated alias batch: 31 additional user-confirmed aliases were created (38 total). Nine entries were intentionally left unresolved because their confirmed canonical resident was not currently active at the house; they require historical-owner/tenant reconciliation rather than unsafe alias attachment.
- **Legacy tracker import (Codex, 2026-08-11):** Applied and verified the user-confirmed OJO.K-9B split: corrected the combined record to tenant Ernest Obaseki, created linked secondary Daisy Obaseki and non-resident landlord Olumide Olawole Agu with `LEGACY-NO-PHONE` placeholders, and added the Ernest Agho Johnbull payment alias. Snapshot after write: 188 residents, 195 assignments, 39 aliases, 2,257 payments in the four-street scope.
- **Legacy tracker import (Codex, 2026-08-11):** Applied a third dry-run-validated batch: added eight aliases/corrections (47 aliases total), corrected Markson Nembadoon, Anyanwu Chinenyi Kingsley, Mrs Ikoli, Toliluope Ayodele, Asuquo Edet Edak Inukim, and Stella Akintunde; converted the three IBB-26 Olufunke Titilola owner assignments to aliases while retaining the original resident record with notes.
- **Legacy tracker import (Codex, 2026-08-11):** Applied and read-back verified OJO.K-8’s user-confirmed history: Eso Mobolaji Agboo resident-landlord (2015-01-01 through 2020-12-31), Ekomobong Uduakobo tenant (2021-01-01 through 2022-12-31), vacancy in 2023, and Eso’s return from 2024-01-01. Corrected the tenant surname from Udakobo to Uduakobo. Generated `legacy-payment-reconciliation.json`/`.csv`: 201 of 203 comparable house/year totals match; OJO.K-2 2025 is short NGN30,000 and OJO.K-8 2024 is short NGN60,000 pending dated payment insertion.
- **Legacy tracker import (Codex, 2026-08-11):** Re-ran the two-delta payment import after dry-run validation. Added OJO.K-2 Dec-2025 NGN30,000 and OJO.K-8 Mar-2024 NGN60,000 as verified bank-transfer records with idempotent `LEGACY-*` references and provenance notes. A refreshed cloud snapshot has 2,259 payments; the read-only manifest reports 203/203 comparable house/year totals matched. Remaining work is structural owner/corporate-entity reconciliation rather than payment import.
- **Corporate tenant model + reconciliation (Codex, 2026-08-11):** User approved corporate entities as active billable tenants. Application validation/options, migration `20260811130000_allow_corporate_tenants.sql`, and architecture documentation now permit corporate `tenant` assignments with `is_live_in = false`. The user applied the cloud migration; readback verified IBB-32 Angel Crest (tenant) + Akintayo Olawunmi Elizabeth (non-resident landlord), and IBB-38 Debiruss School (tenant) + Simeon Kayode Oni (non-resident landlord).
- **GLB landlord reconciliation (Codex, 2026-08-11):** Verified Hassan Ogwe as active non-resident landlord at all twelve reviewed GLB 19*/20* rental houses. His GLB-21 resident-landlord assignment remains unchanged. Replaced the incorrect GLB-20F-9 landlord assignment by deactivating it and retaining the former resident record with an explanatory note. Ownership acquisition dates were not supplied, so the new links use first documented occupancy dates and carry `ownership-start-unverified` tags.
- **Remaining corporate transactors (Codex, 2026-08-11):** Verified House of Mercy Church/OJO.K-14 and Shushan Pharmacy/OJO.K-14A as corporate tenants with Christian Philips as non-resident landlord. Verified Kemchuta Homes/IBB-36A and Praise House/OJO.K-9C as corporate tenants; no individual owner was supplied, so no owner assignment was invented. All six named corporate tenant records have `is_live_in = false`.
- **IBB-33 and GLB-5B reconciliation (Codex, 2026-08-11):** Converted Chief Okoro into Alphonsus’s payment alias and deactivated only the incorrect active alias assignment, retaining the original resident record and note. User then clarified that Alphonsus Okoro is the IBB-33 resident-landlord; the live assignment now verifies that role with `is_primary = true` and `is_live_in = true` from 2023-07-01. William Racheal Ti remains GLB-5B’s non-resident landlord.
- **OJO.K 12-series reconciliation (Codex, 2026-08-11):** Verified Tim Akenroye as non-resident landlord of reviewed Houses 12BQ, 12F-1, 12F-2, and 12F-4. Corrected tenant move-in dates to 2024-04-01, 2025-03-01, 2025-01-01, and 2018-10-01 respectively. Landlord links are tagged `ownership-start-unverified` because the tracker does not state acquisition dates.
- **KOA 10-series reconciliation (Codex, 2026-08-11):** Corrected Boniface Obijiaku’s 10F-5 role from tenant to resident-landlord (`is_primary = true`, `is_live_in = true`, 2015-01-01). Linked him as non-resident landlord at reviewed 10F-?, 10F-1, 10F-2, 10F-3, 10F-4, and 10F-6; each tenant date now reflects the reviewed blue-cell move-in month.
- **KOA 15-series reconciliation (Codex, 2026-08-11):** Corrected Stella Akintunde’s House 15 role to resident-landlord (`is_primary = true`, `is_live_in = true`, 2015-01-01). Linked her as non-resident landlord at 15F-2 and corrected Martins Awonusi’s blue-cell move-in to 2024-11-01.
- **KOA 16 reconciliation (Codex, 2026-08-11):** Corrected Esther Dike’s existing House 16 assignment from non-resident to resident-landlord and verified `is_primary = true`, `is_live_in = true`, with the legacy 2015-01-01 move-in date.
- **OJO.K 16-series reconciliation (Codex, 2026-08-11):** Corrected Houses 16A–16F to the user-confirmed `resident_landlord` role (`is_primary = true`, `is_live_in = true`) and tracker move-in months: 2025-09, 2022-08, 2023-09, 2022-06, 2023-05, and 2025-03. Corrected canonical names to Sonubi Bolanle Prince Richard and Benson Odun Tondea where needed.
- **OJO.K 11/12 reconciliation (Codex, 2026-08-11):** Verified the four 11-series flats as live-in tenants and corrected move-ins to 2018-08, 2023-08, 2020-03, and 2022-11. Corrected Tim Akenroye at House 12 to a live-in resident-landlord from 2015-01-01.
- **OJO.K 4/6 reconciliation (Codex, 2026-08-11):** Applied the user-confirmed resident-landlord role to Constance Oka and Samaila Aleyideino, with 2019-01-01 legacy starts.
- **OJO.K 9A reconciliation (Codex, 2026-08-11):** Verified the four payment aliases and corrected Taofik Oladele Abass from tenant to the user-confirmed resident-landlord. The existing 2024-01-01 date is retained.
- **OJO.K 17 reconciliation (Codex, 2026-08-11):** Linked the user-confirmed secondary residents Ofurie Paul and newly created Samson Onyema Ogbu to the primary record. Samson has a clearly marked `LEGACY-NO-PHONE` placeholder; both links now use the January 2015 legacy start.
- **OJO.K 19 reconciliation (Codex, 2026-08-11):** Added the user-confirmed payment alias Eghe Osagboigbovo Ralphael and corrected Felix Evansinha to resident-landlord from the documented January 2015 start.
- **OJO.K 20F-1/21 correction (Codex, 2026-08-11):** Restored Adebowale Olusegun Joshua at 20F-1 to tenant. Moved Adegoke Adeola Mary to the correct OJO.K 21 payment-alias record for landlord Gbenga Raheem.
- **OJO.K confirmed tenant batch (Codex, 2026-08-11):** Reconciled 20F-2, 22F-1, 22F-4, 22F-1b, and 23 as live-in tenants with the user-confirmed blue-cell move-in months: 2025-08, 2022-10, 2020-02, 2021-08, and 2024-08.
- **IBB 18F-4 correction (Codex, 2026-08-11):** Verified the user-confirmed canonical name Wilson Tobias Chukwu was already present; corrected the active tenant move-in to the November 2020 blue-cell date.
- **IBB 26F-3 reconciliation (Codex, 2026-08-11):** Verified the Olufunke Titilola payment alias and corrected Mrs Ikoli’s live-in tenant move-in date to the user-confirmed September 2025 marker.
- **Legacy reconciliation snapshot (Codex, 2026-08-11):** Refreshed `docs/importdata/db-reconciliation-snapshot.json`. All 136 legacy house labels map uniquely; current scope has 178 houses, 220 assignments, 189 residents, 50 payment aliases, and 2,259 payment records.
- **IBB move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for 18F-2, 18F-3, 18F-1, 20, 21A, 21C, 23B, and 23C while preserving their existing roles.
- **IBB 25–27 move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for Houses 25, 26F-1, 26F-2, 26F-4, and 27 while preserving their existing roles and aliases.
- **IBB 29–38 move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for 29A, 29ABQ, 29B, 31F-1, 31F-3, 31F-4, 32, 33, 36A, 36B, and 38 while preserving prior role, ownership, and corporate-tenant decisions.
- **GLB 1–5 move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for 1A, 1B, 2A, 2B, 3A, 3B, 4, 5A, and 5B while preserving existing roles and confirmed aliases.
- **GLB 6–12 move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for 6, 7A, 7B, 8, 9A, 9BF-1, 9BF-2, 9D, 11, and 12 while preserving existing roles, ownership links, and aliases.
- **GLB 16–19 move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for 16, 16BQ, 17AFLT1, 19, 19?, 19AF-1/2/3, 19BF-2, and 19CF-3 while preserving existing roles and Hassan Ogwe links.
- **GLB 20-series move-in batch (Codex, 2026-08-11):** Corrected the primary tenant move-ins at 20F-1, 20F-3, 20F-4, 20F-5, and 20F-9 while retaining Hassan Ogwe’s ownership links and the documented 20F-9 credit context.
- **KOA 1A–9 move-in batch (Codex, 2026-08-11):** Corrected documented tracker starts for 1A, 1B, 2, 5, 6, 8, and 9 while preserving existing roles, aliases, and linked-resident decisions.
- **KOA 10–19 move-in batch (Codex, 2026-08-12):** Applied and read-back verified the user-confirmed tracker move-in dates for the KOA 10–19 set without altering established roles, aliases, or ownership links. A final label-level check confirmed the two normalized database labels `18F1` and `18F2`; both now carry the correct 2022-10-01 move-in date.
- **IBB-29B alias conversion (Codex, 2026-08-12):** Replaced the active alias-only Villanova Realty assignment with user-confirmed primary Ubah Karl Chinedu, preserving the former corporate record as inactive with a conversion note and adding Villanova Realty as a payment alias. Ubah uses the approved `LEGACY-NO-PHONE-UBAH-KARL-CHINEDU` placeholder. A duplicate unassigned placeholder created during the interrupted first attempt was retained and marked inactive rather than deleted.
- **Alias audit (Codex, 2026-08-12):** Audited remaining confirmed tracker aliases. Existing spelling/unit variants were retained; added the only two missing aliases: Prince Vovo Yvest for IBB-18F-3 / Lana Anih and Susan Onome Opiri for OJO.K-16C / Susan Onome Badiru. Refreshed snapshot count: 53 payment aliases.
- **Alias correction (Codex, 2026-08-12):** User corrected IBB-18F-3’s alias spelling from the initial transcription. The ledger and live payment alias now use **Prince Wowo West** for Lana Anih.
- **Linked-secondary audit (Codex, 2026-08-12):** Created the missing confirmed secondary residents Oloruntola Temi (KOA-5) and Anwuli Okafor (KOA-13A) using approved placeholders and active household links. Repaired Anosike Ezinne Angela’s GLB-19B F-2 link with the correct primary sponsor, 2020-01-01 move-in, and live-in status. Read-back verified all three links.
- **Active-alias assignment safety audit (Codex, 2026-08-12):** A scoped live audit across OJO.K, IBB, GLB, and KOA found one remaining active payment-only assignment: Oyedare Gbenga David at IBB-3AF-2. The legacy ledger confirms this name is a security-payment alias for Chibueze Nicholas James, so the assignment was deactivated with a 2026-08-12 move-out, while the resident record was retained and marked inactive with an explanatory note. A final audit returned zero active payment-alias assignments.
- **Occupancy-integrity audit (Codex, 2026-08-12):** A scoped review found no contradictory tenant/resident-landlord live-in combinations. It did find five active tenant/non-resident-landlord pairs where both were marked primary; the five landlord links were safely normalized to non-primary without changing resident, owner, or occupancy roles. Final verification: zero multiple-primary houses and zero contradictory live-in role combinations. Sixteen unassigned houses are outside the reviewed tracker scope and were intentionally left untouched.
- **Placeholder-contact audit (Codex, 2026-08-12):** Verified every `LEGACY-NO-PHONE` record is conspicuously marked and documented. Six active placeholders have supported active assignments; the seventh is the intentionally retained inactive duplicate Ubah Karl Chinedu record from the interrupted conversion. The final audit returned zero unexpected placeholder issues.
- **Legacy import closeout (Codex, 2026-08-12):** Refreshed the final scoped snapshot and payment manifest: 136/136 house mappings are unique and 203/203 comparable payment rows match. Alias, occupancy, and placeholder audits are clean. Published `docs/importdata/legacy-import-closeout.md`; the only deferred houses are outside the reviewed tracker ledger and remain untouched for later/manual entry.

- **Handoff consolidation (2026-08-10):** Deleted obsolete `HANDOFF_SUMMARY.md` and `NEXT_SESSION_HANDOFF_PROMPT.md`. `SESSION_STATE.md` is now documented as the sole live handoff in `AGENTS.md`, `CLAUDE.md`, and project-management guidance. Agents must update `SESSION_STATE.md`, `TODO.md`, and active `ACTIONPLAN.md` progress automatically after substantive work, even without an explicit user request. Documentation-only change; no test suite run.

## Previous session (OpenCode, 2026-08-07)

- **Estate Assistant:** Fixed the header close action to close the conversation while retaining the floater. Added globally managed assistant visibility, display name, and opening-greeting controls to `/settings`; deployed the `disable_ai_assistant` and `ai_assistant_greeting_enabled` defaults. Targeted lint passes and `npm run build` is green; the repository-wide lint baseline remains failing on unrelated existing errors.

- **Build blocker cleared.** Fixed 22 tsc errors across 7 files: RHF `Resolver` generic mismatch in `log-expense-dialog.tsx` (15-error cascade) via explicit cast; missing lucide/type imports (`Receipt`/`FileText`/`PersonnelInsert`); `ExpensePaymentMethod` union lacked `card`/`other` (added + labels); wrong role literal in `header.tsx`; `URLSearchParams` typing; `title` null in `petty-cash-dashboard`; missing report options in `cron/generate-reports`. Opted `(dashboard)` subtree (`force-dynamic` in layout) + `/verify-2fa` (Suspense boundary around `useSearchParams`) out of static prerender.
- Committed (not yet pushed): `00d3ef9` (build fixes), `575220c` (low-risk lint), `7ff59f9` (session doc). Working tree now clean.
- `npm run build` GREEN, `tsc` clean, `npm test` 5/16 green, `npm run lint` 351→323 errors.

## Last session (OpenCode, 2026-08-07 — UI/UX Phase 3)

- **Phase 3 (Payment Flow + PDF Import Polish) complete.** Merged PDF import final steps into UI/UX Review Phase 3 and completed it.
- **3a — PDF upload visual polish** (`statement-upload.tsx`): AnimatePresence dropzone (spring-animated upload icon on drag, scale/opacity transitions for file-selected state), file-type-specific icons with colored icon tiles, `input-tactile` on password input, smooth height-reveal animation on password section, `btn-hover-lift` on continue button.
- **3a — Wizard stepper polish** (`payments/import/page.tsx`): framer-motion animated step circles (spring scale on active), animated connector bars (backgroundColor transition from muted→primary), shadow on card container, fixed description to mention PDF format.
- **3a — Import preview/result stat tiles** (`import-preview.tsx`, `import-confirmation.tsx`, `import-results.tsx`): Upgraded all stat cards from `rounded-lg` to `rounded-xl`, added `shadow-sm` and `bg-muted/20` backgrounds, consistent border/semantic color treatment across bank import preview, confirmation, and results screens.
- **3b — PDF Import Test CLI** (`scripts/test-pdf-import.ts`): New CLI script testing 6 areas — pdfjs-dist worker loading, text extraction, coordinate-based transaction parsing, encryption detection, invalid-PDF error handling, and full pipeline against sample PDF. All 6 tests pass. Run with `npx tsx scripts/test-pdf-import.ts [path-to-pdf]`.
- **3c — Manual verification**: Deferred. Sample PDF in `docs/legacydata/` is encrypted and requires Next.js request scope for password retrieval (cookies). Needs manual testing through web UI at `/payments/import`.
- **3d — Payment form polish** (`payment-form.tsx`): Added `btn-hover-lift` to submit button (was already well-polished with framer-motion submit states, success glow, property selector with icons).
- **3e — Approvals queue polish** (`approvals/page.tsx`): Upgraded dialog containers from `rounded-lg` to `rounded-xl`, added `btn-hover-lift` to confirm button, added Loader2 spinner to processing state (was text-only).
- **3f — Import preview consistency**: Aligned bank import table wrapper from `rounded-lg` to `rounded-xl` (matching email import's `rounded-xl`), updated email import row hover from hardcoded `gray-50`/`#0F172A` to theme-aware `hover:bg-muted/50 transition-colors`.
- **Verification**: `tsc` clean, `npm test` 16/16 green, `npm run build` GREEN (exit 0). New file: `scripts/test-pdf-import.ts`. Modified files: `statement-upload.tsx`, `payments/import/page.tsx`, `import-preview.tsx`, `import-confirmation.tsx`, `import-results.tsx`, `payment-form.tsx`, `approvals/page.tsx`, `email-imports/[importId]/page.tsx`, `ACTIONPLAN.md`, `TODO.md`, `SESSION_STATE.md`.

## Previous session (OpenCode, 2026-08-07 — e2e cleanup, part 2)

- **Fixed two sign-in RBAC races in `auth-provider.tsx`** (committed `fddd39f`): (A) after the app boots logged-out (Guest path sets `isInitialized=true`), a real `SIGNED_IN` was skipped — `fetchProfile` never ran, leaving `profile=null` and the sidebar nav filtered to Dashboard+System until a manual reload. Now always fetches profile on `SIGNED_IN`. (B) the metadata fallback (used when the `profiles` SELECT fails, e.g. `security@residio.test` has no `profiles` row) returned empty permissions and early-returned; it now continues into legacy role lookup + RBAC so role-less rows still get permissions.
- **Dashboard e2e now 6/6** (`dashboard.spec.ts`): wait for permission-filtered nav to settle before asserting sidebar hrefs (TC2.2/2.3/2.6); raised stat-card timeout for cold-start (TC2.1).
- **Houses/Residents e2e now 17/17**: `residents-houses.spec.ts` house-management tests selected `table tbody tr` `.first()` which is a **loading skeleton row** (no link) in `houses-table.tsx` → switched to `tr:has(a[href^="/houses/"])`. Root blocker was **empty Cloud DB**: `houses`/`payment_records` had 0 rows. Seeded via MCP: Main St + Duplex type + house 1 (tenant household: RES200 Ada tenant + RES201 Bisi household_member) + house 2 (landlord RES999). **Important DB constraint discovered**: `validate_residency_exclusivity()` forbids one person in two units, and `validate_unit_occupancy_state()` forbids `resident_landlord` + `tenant` in the same unit. The canonical `supabase/seed.sql` was **broken against current schema** (used `'landlord'` role — enum is `resident_landlord` — and double-linked one resident) → fixed it.
- **Payments/Billing e2e now 17/17**: TC5.8 asserted a checkbox unconditionally but payment table is empty (no data) → now skips gracefully like TC5.9/5.10.
- **Harness**: `playwright.config.ts` serial (workers=1, fullyParallel=false); portal spec `.describe.skip`; `loginAs` hardened (45s timeout + reload-retry for mid-run dev-server latency).
- Remaining: 8 e2e failures in a full 11.8-min run were all `loginAs` timing out mid-run (transient dev-server slowness) — harness now retries; expect them to fold.

## Wallet payment-period closeout (2026-08-13)

- Added the login-route AuthProvider guard so the login page does not compete with its sign-in client for the Supabase browser auth lock.
- Integrated the Wallet Check report panel and resident wallet payment-batch tools into the admin Reports and resident Transactions surfaces.
- Added atomic ordinary-payment/approval allocation through `settle_wallet_invoices`, preserving wallet-only credit when no eligible invoice exists.
- Verification: focused wallet/action tests pass, module integration passes (3 tests), targeted lint and `git diff --check` pass, and both wallet Playwright specs pass against seeded cloud auth. Full repository TypeScript still has unrelated baseline failures in imports, reports, analytics, PDF, WhatsApp, and dashboard snapshot work.

## Wallet live-verification follow-up (2026-08-15)

- Read-only cloud verification against Supabase project `kzugmyjjqttardhfejzc` confirmed the allocation snapshot columns, the `settle_wallet_invoices(uuid, uuid[], text, date, uuid, uuid, numeric, numeric, uuid)` RPC, and `SECURITY INVOKER` execution.
- Current cloud readiness: 581 invoices (570 paid, 11 unpaid), 62 resident wallets, 52 positive wallet balances, 2,259 payment records, 832 wallet transactions, and **zero** wallet payment batches/items. No live partial/full settlement or reversal can be exercised safely without creating or using financial test data.
- The remaining live-verification item is therefore blocked on an approved non-production fixture/branch or an explicitly authorized reversible test settlement. No financial rows were written in this follow-up.

## Generated database types recovery (OpenCode, 2026-08-15)

- Restored `src/types/database.generated.ts` from the designated Supabase MCP cloud-generator artifact after `npm run db:types` replaced it with a local Docker connection error. The restored file byte-matches the artifact's `types` payload; standalone TypeScript validation passes and includes `personnel_engagements` plus `personnel_engagement_scope`.

## Invoice issues #44/#54–57 investigation (OpenCode, 2026-08-15)

- **#44** (parent PRD): umbrella; phases #45–49 closed, redesign re-scoped remainder into #52–57. Stays open until #54–57 + #73 land.
- **#52/#53** (Tasks 1–2): DONE — merged to `master` and applied to cloud (`20260812235852_invoice_generation_redesign` + hardening migrations; `create_generated_invoice` RPC live; 5 profile versions; all 581 invoices carry version provenance).
- **#55** (Task 3, run lifecycle): completed and merged; see the closeout entry below.
- **#55 closeout (OpenCode, 2026-08-15):** Completed and merged to `master` at `58fdb31`. Applied cloud migrations `20260813160000_add_invoice_generation_run_claims` and `20260813170000_harden_invoice_generation_run_lifecycle`; verified service-role-only grants for claim/refresh/approval RPCs. Extracted the shared run service, converted the legacy generator to a durable-run compatibility wrapper, made cron prepare only current-month estate-wide invoice-only runs and advance one bounded chunk, added run/legacy history merging, and added action, history, and worker tests. Focused verification: 29 tests passed including module-integration; scoped lint passed. Full Vitest remains at the documented baseline failures outside invoice generation; build remains blocked by pre-existing reports/PDF type errors. The two invoice worktrees are pending cleanup.
- **#54** (Task 4, durable email): NOT STARTED — `send-invoice-email.ts` sends direct via Resend; `generate-invoices.ts:144` fire-and-forget. Needs `notification_queue` wiring with `invoice-generated:<id>` dedup. Blocked by #55.
- **#54 closeout (OpenCode, 2026-08-15):** Implemented durable post-commit invoice email delivery. Added the `invoice-generated:<invoice-id>` unique queue key, candidate queue/status fields, run-level queued/sent/failed email totals, queue-status aggregation in `refresh_invoice_generation_run`, and notification-worker synchronization. The standalone `sendInvoiceEmail` action now queues instead of sending directly. Cloud migrations `20260815093000_invoice_generation_email_delivery`, `20260815093100_invoice_generation_email_queue_index`, and `20260815093200_invoice_email_processing_summary` are applied; focused delivery/worker/module tests pass. Issue #54 is ready to close after commit.
- **#56** (Task 5, admin workflow): NOT STARTED — dialog still calls `generateMonthlyInvoices` directly with toast-only result; history panel reads legacy log only. Blocked by #54+#55.
- **#56 closeout (OpenCode, 2026-08-15):** Implemented and committed in `b29f152`. The billing dialog now supports selected-month/backfill requests, exact request-bound previews, mutually exclusive scope narrowing, safe backfill side-effect defaults, typed confirmation, durable prepare/approval/progress state, and bounded processing. History now shows durable status, email totals, CSV output, cancellation, and failed-candidate retry. Added admin E2E coverage for current-month controls, backfill defaults, and durable history. TypeScript, scoped lint, and focused tests pass; Playwright execution is currently blocked by the Windows runner's `ChildProcess.kill` cleanup failure before test execution.
- **#57** (Task 6, verification/closeout): final verification completed. Full Vitest is **149 passed / 6 baseline failures** (dashboard snapshot and billing aggregate tests); focused invoice/UI/module tests pass. Build remains blocked by the pre-existing reports/PDF type error in `src/actions/reports/generate-report-pdf.ts`; scoped TypeScript and lint for changed invoice/UI files pass. Cloud migrations, RPC grants, security/performance advisors, and the invoice email unique key were verified. Live wallet reconciliation is data-limited: 581 invoices, NGN 3.205M due, NGN 3.1M paid, zero wallet batches/items, zero generation runs/candidates; no financial fixture was created. Known advisor findings (GraphQL exposure of durable run tables and unindexed generated-schema foreign keys) are recorded as follow-up, with no new critical #54/#56 finding. Issue #57 is ready to close.
- **Critical path:** #73 human backfill decision → close #44. Related: #73 (only 6/139 billable residents ever invoiced; full-estate backfill deliberately deferred pending the human decision on rates/periods).

## Next steps (fast-track priority)

1. **Finance:** Complete statements, automatic statement import/reconciliation, financial reports, exports, and scheduled delivery. Payment gateway remains deferred.
2. **Performance:** Execute all remaining `ACTIONPLAN.md` Phase 6 items, starting with dashboard aggregates/per-card queries, middleware query reduction, and bundle splitting.
3. **Communications:** Build WhatsApp and SMS operational integrations, including compliance, delivery tracking, and alert integration.
4. **Quality gates:** Run lint, build, Vitest, and E2E verification as each fast-track slice lands.
5. **Secondary backlog:** Address lint long tail, README, and deferred browser-only accessibility checks after P0 delivery is underway.
