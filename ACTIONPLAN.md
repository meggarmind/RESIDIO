# Action Plan: Finance, Performance & Communications Fast-Track

> The **live project state** (current phase, git state, test baseline, next steps) lives in
> **`SESSION_STATE.md`** — read/update that for coordination instead of relying on this file.

Created: 2026-01-08T00:00:00Z
Status: IN PROGRESS

## Fast-Track Priorities

1. **P0 Finance:** Financial statements, automatic statement import, reconciliation, billing, payments, and reports.
2. **P0 Performance:** Complete Phase 6 before expanding heavy admin workflows.
3. **P1 Communications:** WhatsApp and SMS integrations for estate/admin operational communications.

## Personnel Accountability

- **#75/#76/#77 Personnel Accountability (2026-08-15, uncommitted):** Estate and Resident-House engagement schema/RPCs, authorized/audited actions, directory badges and filters, engagement editing, history, and end lifecycle actions are implemented. Focused verification passes; deeper Resident-House action/UI coverage remains next.

Payment gateway integration is explicitly deferred and is not part of the current finance fast-track.

**Schema baseline:** On 2026-08-10, the cloud Supabase inventory was reconciled with the architecture documentation. Finance, reporting, operations, and assistant tables are documented; the legacy DDL export is flagged as incomplete.

**Legacy import control:** Review legacy tracker records in `docs/importdata/legacy-record-ledger.md` before any database write. Each entry must preserve source facts, separate candidate matches from confirmed matches, and identify unresolved occupancy/payment context.

**Corporate tenant migration (2026-08-11):** `supabase/migrations/20260811130000_allow_corporate_tenants.sql` has been applied to cloud. The verified live model permits corporate `tenant` assignments with `is_live_in = false`; IBB-32 and IBB-38 now pair corporate tenants with their individual non-resident landlords.

**Legacy import reconciliation (2026-08-12):** The review pass is complete at L-0136 and the user authorized reconciliation. A read-only Supabase snapshot and house-match report in `docs/importdata/` confirm all 136 reviewed records map uniquely to existing houses. User-confirmed resident/alias/history corrections are being applied with legacy placeholder contacts and retained alias rows; OJO.K-8’s occupancy history is verified. `legacy-payment-reconciliation.json`/`.csv` compare 203 house/year payment totals, all matched after two provenance-tagged payment inserts. The corporate-tenant migration is live: all six user-named corporate transactors are verified as tenants, with four confirmed individual landlords and two intentionally owner-unassigned cases. OJO.K, IBB, GLB, and KOA tracker move-in reconciliation passes are complete for the reviewed/confirmed records, including normalized KOA `18F1`/`18F2` labels, the IBB-29B Ubah Karl Chinedu/Villanova Realty primary-alias conversion, final tracker-alias audit, verified linked-secondary records, a final active-alias assignment audit (zero active payment-only alias assignments remaining), occupancy-flag normalization (zero multiple-primary or contradictory live-in role combinations), and a clean `LEGACY-NO-PHONE` placeholder audit.

**Legacy import closeout (2026-08-12):** Published `docs/importdata/legacy-import-closeout.md`. The final snapshot confirms 136/136 unique house mappings, and the final payment manifest confirms 203/203 comparable house-year totals matched. Future tracker records and the documented no-assignment houses remain deferred for later/manual processing.

Portal/self-service work remains out of scope. Finance and communications integrations must remain admin/estate operational capabilities, not new resident portal surfaces.

## Invoice Generation Redesign

- **Task 3 / issue #55 complete (2026-08-15):** Durable prepare/approve/cancel/retry/read actions, bounded chunk processing, conservative cron behavior, compatibility generation wrapper, and run-preferred history are merged to `master` (`58fdb31`). Cloud claim/refresh/approval migrations are applied and focused verification passes.
- **Task 4 / issue #54 complete (2026-08-15):** Invoice email delivery now queues after committed invoice creation with a unique `invoice-generated:<invoice-id>` key. Queue, sent, and failed outcomes are persisted and aggregated into candidate/run summaries; queue retries do not recreate invoices.
- **Task 5 / issue #56 complete (2026-08-15):** `/billing` now prepares exact durable requests, supports controlled backfills and scopes, shows live run progress and approval state, and exposes durable history cancellation/retry actions. Playwright coverage is added; execution remains blocked by the Windows runner cleanup failure.
- **Task 6 / issue #57 complete (2026-08-15):** Full regression, focused verification, cloud advisors, RPC grants, and wallet reconciliation checks are recorded. The remaining six Vitest failures and reports/PDF build error are pre-existing baseline issues; no live wallet fixture was created because the cloud has zero wallet batches/items.
- **Next:** Resolve the human rate/period decision for the estate-wide backfill (#73). Do not run it until that decision is recorded.

## PDF Import Dependencies & APIs

| Dependency       | Purpose                              | Free Tier? | Docs Link | Approved |
|------------------|--------------------------------------|------------|-----------|----------|
| pdfjs-dist       | Core PDF text extraction             | Free (MIT) | [Link](https://github.com/mozilla/pdf.js) | Yes |
| qpdf (CLI)       | PDF decryption (server-side)         | Free (GPL) | [Link](https://github.com/qpdf/qpdf) | Yes |
| @thednp/dommatrix | Polyfill for DOMMatrix in Node.js   | Free (MIT) | [Link](https://github.com/thednp/dommatrix) | Yes |

## Phase 1: Navigation & Structure ✅ COMPLETE

- Grouped nav items into logical sections (Core, People & Property, Financial, Operations, System)
- Created `NavItem` interface and `ADMIN_NAV_ITEMS` config in `src/config/navigation.ts`
- Unified sidebar and mobile nav to use shared config with permission-based filtering

## Phase 2: Card Component System ✅ COMPLETE

- Added `variant` prop to Card with 5 variants: `default`, `stat`, `list`, `featured`, `compact`
- Applied to KPI cards, dashboard lists, property hero, document cards

## Phase 3: Payment Flow Enhancement ✅ COMPLETE

This phase merges the PDF import final steps with the payment flow UI improvements.

### PDF Import Completion
- [x] 3a: Finalize visual polish for the PDF upload section (tactile depth, micro-animations per DESIGN_AGENTS.md)
- [x] 3b: Comprehensive API/Infrastructure Test CLI (MANDATORY — verify worker loading, parsing, error handling)
- [~] 3c: Final manual verification with real sample PDF — deferred (sample PDF is encrypted; requires web UI request scope for password retrieval)

### Payment Flow UI
- [x] 3d: Review and polish payment submission flow (manual proof of payment)
- [x] 3e: Review and polish payment verification/maker-checker UX
- [x] 3f: Ensure import preview (bank + email) has consistent styling and clear action affordances

### Checkpoints
- [x] PDF infrastructure working (worker loading successfully)
- [x] Correct transaction categorization (Deposit vs Withdrawal)
- [x] PDF visual polish applied (AnimatePresence dropzone, tactile button, password reveal animation)
- [x] Payment flow tactile polish (btn-hover-lift on submit, spinner on approval confirm)
- [x] Import preview consistent across bank and email imports (rounded-xl, theme-aware hover, shadow-sm stat tiles)

## Phase 4: Page Improvements ✅ COMPLETE

- [x] 4a: Audit individual pages for layout consistency and spacing
- [x] 4b: Apply card variant system to remaining inconsistent cards
- [x] 4c: Standardize form layouts and field spacing
- [~] 4d: Verify responsive behavior on mobile viewports (deferred — needs browser testing)

### Details
- Spacing: removed double-padding on /billing, expenditure and projects islands, fixed space-y-8→6 on settings pages
- Headers: migrated 7 pages from plain h1 to EnhancedPageHeader (payments/new, residents/new, houses/new, security/contacts, announcements, notifications, reports)
- Card variants: applied variant='featured' interactive animate to project and report cards, variant='stat' animate to audit-logs stat cards
- Forms: added max-w-* constraints to resident/house/security-contact forms, added md: prefix to grid-cols-2 across 6 dialog/page forms, standardized space-y-4→6, normalized submit row to Submit→Cancel pattern, normalized grid class ordering

## Phase 5: Accessibility & Polish ✅ COMPLETE

- [x] 5a: Audit color contrast ratios (OKLCH) — fixed --border light theme (0.922→0.85 for WCAG 1.4.11)
- [x] 5b: Verify keyboard navigation across all interactive elements — added role/tabIndex/onKeyDown to report version selector, AI assistant suggestion bubble
- [x] 5c: Add missing aria-labels and role attributes — 20+ icon-only buttons across tables, detail pages, dropdown triggers, AI assistant
- [~] 5d: Test screen reader compatibility for key flows (deferred — needs browser testing)

---

## Phase 6: Performance Optimization 🔴 CRITICAL / IN PROGRESS

Based on the 2026-08-08 performance audit. Quick wins implemented; remaining work below.

### Quick Wins ✅ COMPLETE

- [x] Remove blanket `force-dynamic` from `(dashboard)/layout.tsx` — all admin pages now static-pre-renderable
- [x] Raise React Query defaults: `staleTime` 1min → 5min
- [x] Add `staleTime: 5min` to `usePendingApprovalsCount` + `useGeneralSettings` (sidebar hooks)
- [x] Lazy-load AI assistant settings on first open (not mount); add `disable_ai_assistant` setting
- [x] Create `(dashboard)/loading.tsx` shell skeleton (no more blank-screen transitions)
- [x] Add `<Suspense>` boundaries around dashboard card groups

### Medium Effort ⏳ PENDING

- [ ] **Dashboard data fetching overhaul:** Replace `fetchFinancialHealth` row-level fetch with aggregate SQL (SUM/COUNT). Split `getEnhancedDashboardStats` into per-card queries so `<Suspense>` boundaries actually stream. Add `staleTime: 5min` to the dashboard hook.
- [ ] **Middleware DB query reduction:** Move `profiles` + `role_permissions` queries into `Promise.all` with auth check. Consider caching `role_id` in session JWT metadata (avoid 2-4 DB roundtrips per request).
- [ ] **Add `Suspense` + `loading.tsx` to remaining route groups:** `/payments`, `/residents`, `/houses` — each block on their respective data queries with no fallback.

### Larger Investment ⏳ PENDING

- [ ] **Bundle splitting:** `next/dynamic` + `ssr: false` for `framer-motion` (~130KB) and `recharts` (~500KB) chart components. Lazy-load heavy admin dialogs (log-expense, personnel, etc.).
- [ ] **Per-query caching config:** Audit all `useQuery` hooks and add domain-appropriate `staleTime` values (list data 30-60s, config data 5min, dashboard 5min).
- [ ] **Monthly trend aggregation:** Replace `fetchMonthlyTrends`'s 12 parallel queries with a cron-updated materialized view / aggregation table (`dashboard_monthly_summaries`).
- [ ] **`window.location.reload()` → React Query invalidation** in error recovery paths.

### Change Log (Performance)

- 2026-08-08: Performance audit completed; Quick Wins implemented. Medium/Large items added to backlog.
- 2026-08-10: Performance backlog elevated to critical for the finance and communications fast-track.

## Phase 7: WhatsApp Assistant Planning ✅ PRD / ISSUES PUBLISHED

- [x] Domain-modeling grilling completed; canonical terms recorded in `CONTEXT.md`.
- [x] ADR-0001 recorded the deliberate WhatsApp resident-facing exception; ADR-0002 recorded direct Meta Cloud API delivery.
- [x] PRD published as GitHub issue [#1](https://github.com/meggarmind/RESIDIO/issues/1).
- [x] Vertical slices published as GitHub issues [#2](https://github.com/meggarmind/RESIDIO/issues/2)–[#8](https://github.com/meggarmind/RESIDIO/issues/8), dependency-ordered and labeled `ready-for-agent`.
- [x] Implement issue #2 first: WhatsApp Channel Foundation is complete and closed.
- [x] Implement issue #3: Resident Identity and Consent is complete and closed.
- [x] Implement issue #4: Core Financial Standing Menu is complete and closed.
- [x] Implement issue #5: Period-Based WhatsApp Statements is complete and closed.
- [ ] Implement issue #6 next: Outbound Estate Messaging.
- [ ] Resolve the SMS implementation-status discrepancy before marking outbound channel work complete.

## Change Log

- 2026-08-10: Estate Assistant close behavior corrected; added global visibility, display-name, and greeting controls under General Settings.
- 2026-08-11: WhatsApp Assistant PRD and seven dependency-ordered implementation issues published; domain glossary and ADRs added.
- 2026-01-08: Initialized UI/UX Review Phases from frontend-developer agent review.
- 2026-01-08: Completed Phase 1 (Navigation) and Phase 2 (Card System).
- 2026-08-07: Merged PDF import final steps (old Steps 7-9) into Phase 3.
- 2026-08-07: Completed Phase 3 — visual polish (dropzone, wizard stepper, stat tiles), test CLI, payment form/approvals polish, import preview consistency.
- 2026-08-07: Completed Phases 4 & 5 — page layout consistency (spacing, EnhancedPageHeader migration, card variants), form standardization (max-w, md:grid-cols-2, space-y-6, submit rows), accessibility (aria-labels on 20+ icon-only buttons, keyboard nav on interactive divs, OKLCH border contrast fix).
**Wallet payment-period closeout (2026-08-13):** Partial-payment-safe receipt periods, immutable cloud allocation snapshots, resident-scoped bulk settlement, future prepayment, batch reversal, reconciliation reporting, and atomic ordinary payment/approval allocation are implemented. The login bootstrap fix resolves the Supabase client lock; both admin wallet Playwright specs pass. Focused wallet/action tests, module integration, targeted lint, and `git diff --check` pass. Full repository TypeScript still has unrelated baseline failures in imports, reports, analytics, PDF, WhatsApp, and dashboard snapshot work.

**Wallet live-verification follow-up (2026-08-15):** Read-only Supabase verification confirmed the snapshot columns and `SECURITY INVOKER` settlement RPC. The cloud project currently contains 11 eligible unpaid invoices and 52 positive wallets but zero wallet payment batches/items, so real partial/full settlement and reversal behavior cannot be exercised without an approved fixture or reversible financial test data. No live rows were changed.
