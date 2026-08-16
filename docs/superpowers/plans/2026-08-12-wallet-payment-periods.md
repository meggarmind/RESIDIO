# Wallet Payment Periods, Bulk Settlement, and Future Prepayment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin payment receipts accurately describe the invoice months settled by a wallet credit, support one resident-scoped bulk settlement receipt, and support an admin-only future-month prepayment flow that creates, pays, and receipts a contiguous range of monthly invoices.

**Architecture:** Treat a wallet-funded settlement as an auditable batch with invoice allocation rows, rather than inferring coverage from the manually entered `payment_records.period_start` and `period_end` fields. A pure period formatter will render one month when the range has the same month and year, and an admin billing service will own existing-invoice settlement and future-invoice generation/allocation. Existing resident-portal wallet payment actions remain out of scope and are not reused for the admin rollout.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL migrations and RPCs, server actions with permission/audit enforcement, TanStack React Query, React Hook Form + Zod, Vitest, and the existing HTML/email receipt templates.

## Partial-payment receipt period correction (completed 2026-08-13)

- Added immutable allocation snapshots to `wallet_payment_batch_items` through cloud migration `20260813160000_add_wallet_batch_allocation_snapshots`.
- Updated `settle_wallet_invoices` so batch header periods include only allocations whose final status is `paid`; partial-only batches have no confirmed covered period.
- Updated admin and email receipts to list partial invoice allocations, amount applied, and balance outstanding. Historical batches without snapshots are labelled as having unavailable settlement status.
- Added receipt-period regression tests for full/partial mixed batches, partial-only batches, multi-month full settlement, and closing a previously partial invoice.
- Verification: 8 focused receipt-period tests and 3 integration tests pass; changed-file ESLint, TypeScript, `git diff --check`, production build, and live schema/function checks pass.

## Follow-up completion: types and reconciliation reporting (completed 2026-08-13)

- Regenerated `src/types/database.generated.ts` from the live cloud schema; allocation snapshot columns are now included in generated row/insert/update types.
- Added pure reconciliation rules and tests for batch/item amount, fully-paid period header, snapshot, and wallet transaction mismatches.
- Added authorized read-only `getWalletBatchReconciliation`, supporting resident/status/limit filters and summary counts, plus a Wallet Check panel on the admin Reports page.
- Verification: 16 focused Vitest/integration tests, focused ESLint, TypeScript, `git diff --check`, and live schema checks pass. The live database currently has zero wallet batches/items, so the reconciliation query returns zero findings.

## Follow-up completion: action coverage and ordinary-payment atomicity (completed 2026-08-13)

- Added action tests for authorization order, invoice period ordering, partial settlement counts, reversal, future-range validation, and atomic credit-plus-allocation parameters.
- Added admin Playwright coverage for the Reports Wallet Check panel and resident settlement entry point.
- Updated ordinary payment creation and manual approval so eligible invoice settlement receives the payment credit through `settle_wallet_invoices` in one wallet/invoice transaction; payments with no eligible invoice retain the credit in the wallet.
- Focused ESLint, TypeScript, and action tests pass. Playwright execution was attempted but did not return completion output from the runner and should be rechecked in the normal browser test environment.

## Implementation status (verified 2026-08-13)

Implemented in the admin dashboard and cloud Supabase project:

- Same-month and multi-month covered-period formatting with legacy fallback.
- Auditable `wallet_payment_batches` and `wallet_payment_batch_items` tables, RLS, receipt numbering, transactional settlement, and batch reversal RPCs.
- Ordinary admin payment/approval allocation now records payment-date-aware batches.
- Resident-scoped admin bulk settlement with one receipt per batch.
- Admin future-month prepayment with invoice creation, source payment record, wallet settlement, and one receipt.
- On-screen, print, emailed receipt, and resident finance history support for batch periods.

Known remaining work: the admin Playwright spec was added, but the desktop runner did not return a completion result and must be rechecked in a normal browser-test environment. A deeper transaction refactor would still be required if payment-record creation and wallet/invoice settlement must share one database transaction; the current implementation makes wallet credit plus eligible invoice allocation atomic. The live database currently has no wallet batches/items to exercise with a real partial settlement.

## Global Constraints

- All UI and write actions are for the Admin Dashboard; do not extend `src/app/(resident)/**` or `src/components/resident-portal/**`.
- Supabase is cloud-only; apply any future migration through the Supabase MCP workflow and regenerate `src/types/database.generated.ts` with `npm run db:types`.
- Every new or modified write server action must call `authorizePermission(PERMISSIONS.X)` before doing work and `logAudit(...)` after a successful write.
- A single receipt may cover only one resident and one payment/settlement batch; a multi-resident selection must be rejected or split into separate batches and receipts.
- Invoice coverage is inclusive and month-based: a monthly invoice contributes its `period_start` month through its `period_end` month.
- The existing payment-year chronology rule remains the default for ordinary wallet allocation; future prepayment is an explicit admin flow with an explicit requested month range.
- No configuration, live data, or migration is changed by this planning task.

---

## Current State and Product Decisions

The sample receipt currently renders `Sep 2025 - Sep 2025` because `PaymentReceipt` always formats both stored endpoints. For a same-month range, the receipt must render `Sep 2025`.

The admin payment flow in `src/actions/payments/create-payment.ts` already credits the resident wallet and calls `allocateWalletToInvoices`, but it does not persist an allocation relationship between the payment credit and the invoices it settles. The allocator has a payment-date parameter, but the normal admin create-payment and approval callers do not pass the payment date. The implementation must pass that date so an imported payment cannot debit invoices in a later calendar year.

There is already a `payMultipleInvoicesWithWallet` action and `BulkPaymentSheet`, but both are resident-portal code, do not implement the admin permission/audit contract, and use a sequential rollback strategy that can leave invoice rows partially updated. They must not be promoted into the admin flow without redesign.

The existing `payment_records.period_start` and `period_end` fields remain backward-compatible input/fallback fields. New receipt rendering must prefer persisted allocation-batch coverage, then fall back to those fields for historical payments that have no allocation batch.

## Proposed Data Model

Create two cloud tables in one migration:

```sql
wallet_payment_batches (
  id uuid primary key,
  resident_id uuid not null references residents(id),
  house_id uuid null references houses(id),
  source_payment_id uuid null unique references payment_records(id),
  batch_type text not null check (batch_type in ('payment_received', 'existing_wallet_settlement', 'future_prepayment')),
  receipt_number text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  period_start date null,
  period_end date null,
  status text not null check (status in ('completed', 'reversed')) default 'completed',
  created_by uuid null references profiles(id),
  created_at timestamptz not null default now()
)

wallet_payment_batch_items (
  id uuid primary key,
  batch_id uuid not null references wallet_payment_batches(id) on delete cascade,
  invoice_id uuid not null references invoices(id),
  amount_allocated numeric(12,2) not null check (amount_allocated > 0),
  invoice_period_start date not null,
  invoice_period_end date not null,
  created_at timestamptz not null default now(),
  unique (batch_id, invoice_id)
)
```

The batch stores the receipt identity and denormalized minimum/maximum covered period for fast reads. Item rows remain the source of truth for audit, reversals, invoice counts, and partial allocations. `source_payment_id` connects a received bank/cash/online payment to the settlement batch; an existing-wallet settlement may be created without a new payment record. A database constraint or RPC must ensure every batch item belongs to the batch resident and that the allocated amount does not exceed the invoice's remaining amount.

## File Map

- Create `supabase/migrations/<timestamp>_create_wallet_payment_batches.sql`: batch/item tables, indexes, RLS, and transaction-safe settlement RPCs.
- Modify `src/types/database.ts`: hand-maintained billing helper types for batches and items.
- Regenerate `src/types/database.generated.ts`: generated cloud schema types; never hand-edit.
- Create `src/lib/billing/payment-period.ts`: pure month-range derivation and display formatting.
- Create `src/lib/billing/__tests__/payment-period.test.ts`: same-month, multi-month, missing-period, and non-month-boundary coverage tests.
- Modify `src/actions/billing/wallet.ts`: return allocation details, preserve payment-date chronology, and call the atomic settlement primitive.
- Create `src/actions/billing/settle-invoices-with-wallet.ts`: admin existing-invoice settlement action.
- Create `src/actions/billing/create-future-prepayment.ts`: admin future-month invoice creation plus immediate wallet settlement.
- Modify `src/actions/payments/create-payment.ts`: create/link the payment batch and pass `payment_date` into allocation.
- Modify `src/actions/approvals/index.ts`: use the verified payment date and create the same batch linkage after manual payment approval.
- Modify `src/actions/billing/generate-invoices.ts`: extract reusable monthly-invoice creation logic or expose a constrained future-generation helper without changing cron behavior.
- Modify `src/actions/payments/get-payment.ts`: return batch coverage and allocation summary for admin receipt consumers.
- Modify `src/components/payments/payment-receipt.tsx`: render derived coverage and collapse same-month ranges.
- Modify `src/emails/payment-receipt.tsx` and `src/actions/email/send-payment-receipt-email.ts`: use the same derived coverage in email receipts.
- Modify `src/components/payments/payment-quick-view-sheet.tsx` only if the enriched payment response needs a prop adaptation; keep print/email actions intact.
- Create `src/components/billing/wallet-settlement-dialog.tsx`: resident-scoped admin preview and confirmation UI for existing invoices.
- Create `src/components/billing/future-prepayment-dialog.tsx`: admin month-range preview and confirmation UI.
- Modify `src/app/(dashboard)/billing/page.tsx`: add resident-scoped invoice selection and a settlement entry point without allowing cross-resident single receipts.
- Modify `src/app/(dashboard)/residents/[id]/page.tsx` and the resident finance components as needed: expose wallet balance, eligible invoices, settlement history, and future prepayment from the admin resident record.
- Modify `src/hooks/use-billing.ts` and create `src/hooks/use-wallet-settlement.ts`: query/mutation wrappers and invalidation for billing, resident finance, payments, and wallet batches.
- Modify `src/lib/auth/action-roles.ts`: add narrowly named permissions if the existing wallet/invoice permissions do not provide sufficient separation.
- Modify `src/__tests__/integration/module-integration.test.ts` only if a new action requires a documented allowlist exception; preferred outcome is full permission/audit compliance.
- Create focused action tests under `src/actions/billing/__tests__/`: atomic settlement, authorization, allocation order, future range, and receipt linkage.
- Add or extend admin Playwright coverage under `e2e/`: one single-month receipt, one bulk existing-invoice settlement, and one future-prepayment flow, using seeded admin data.
- Update `docs/README.md`, `ACTIONPLAN.md`, `TODO.md`, and `SESSION_STATE.md` with the plan and its unimplemented status.

## Task 1: Establish period semantics and the allocation ledger

**Files:** migration, billing types, period helper, unit tests, generated types.

- [ ] Write failing pure-function tests for:

```ts
formatCoveredPeriod('2025-09-01', '2025-09-30') // 'Sep 2025'
formatCoveredPeriod('2024-11-01', '2025-09-30') // 'Nov 2024 - Sep 2025'
deriveCoveredPeriod([
  { period_start: '2025-09-01', period_end: '2025-09-30' },
]) // { start: '2025-09-01', end: '2025-09-30' }
```

- [ ] Define behavior for null/invalid periods: return `null` and omit the receipt row rather than printing a misleading date.
- [ ] Add the batch/item migration with resident/invoice ownership checks, indexes on resident, source payment, batch, and invoice, and admin/read-only resident RLS policies matching the existing wallet model.
- [ ] Add an RPC or equivalent database transaction boundary that can update wallet balance, invoice amounts/status, wallet debit rows, batch row, and batch item rows together. The RPC must reject insufficient balance, void invoices, negative/zero remaining amounts, duplicate batch items, cross-resident invoices, and future periods outside the requested mode.
- [ ] Regenerate database types and make the pure tests pass.

**Verification:** `npm test -- --run src/lib/billing/__tests__/payment-period.test.ts`; inspect the migration for RLS and constraints; run `npm run db:types` only when the migration is applied to cloud during implementation.

## Task 2: Make ordinary admin payment allocation receipt-aware

**Files:** `src/actions/billing/wallet.ts`, `src/actions/payments/create-payment.ts`, `src/actions/approvals/index.ts`, `src/actions/payments/get-payment.ts`, focused action tests.

- [ ] Add an allocation result shape containing `batchId`, `receiptNumber`, `invoices`, `totalAllocated`, and derived `periodStart`/`periodEnd`.
- [ ] Pass the recorded `payment_date` from `createPayment` and manual approval into `allocateWalletToInvoices`; do not allow the allocator to silently substitute the current date for a historical payment.
- [ ] After a successful wallet credit, allocate FIFO by invoice period/due date, preserve the priority-house behavior, and create one completed batch for the payment when at least one invoice is settled. If no invoice is eligible, retain the wallet credit but leave batch coverage empty and make the receipt explicitly state that no invoice period has been assigned.
- [ ] Ensure `balance_after` is the actual post-debit balance for every wallet transaction, not a batch placeholder.
- [ ] Keep the ordinary payment-year guard. A payment dated September 2025 can settle September 2025 and earlier eligible invoices, but not October 2025 or later future-year invoices through the ordinary allocator.
- [ ] Add audit metadata containing batch ID, invoice count, total allocated, and covered period. Preserve the existing payment audit entry.
- [ ] Add tests for a single September invoice, November 2024 through September 2025, a later-calendar-year rejection, partial invoice payment, and no-eligible-invoice wallet credit.

**Verification:** focused Vitest action tests, `npm test -- --run src/__tests__/integration/module-integration.test.ts`, and targeted lint for modified actions/components.

## Task 3: Normalize the receipt and email presentation

**Files:** `src/components/payments/payment-receipt.tsx`, `src/emails/payment-receipt.tsx`, `src/actions/email/send-payment-receipt-email.ts`, payment query/types, component tests.

- [ ] Load the preferred batch coverage and allocation count for a payment; use the legacy payment fields only when no batch exists.
- [ ] Replace the current unconditional `start - end` rendering with `formatCoveredPeriod`. The sample case must show `Sep 2025`, while a true range shows `Nov 2024 - Sep 2025`.
- [ ] Keep receipt amount equal to the received payment amount. Do not replace it with the sum of invoice items when a wallet credit was partly retained or when an existing-wallet settlement has no new cash payment.
- [ ] Add a concise allocation summary for admin receipts where data is available, such as `Applied to 11 invoices`, without exposing internal IDs.
- [ ] Make email and print/quick-view use the same helper and fallback rules so the visual receipt, emailed receipt, and future PDF route cannot disagree.
- [ ] Add regression tests for same-month display, multi-month display, legacy fallback, and missing coverage.

**Verification:** focused receipt tests plus the existing TypeScript check. Manually compare the rendered HTML against the supplied sample at the same-month case.

## Task 4: Add admin bulk settlement for existing pending invoices

**Files:** new admin action/dialog/hook, billing page, resident finance surface, tests.

- [ ] Define an admin action input with `residentId`, optional `houseId`, and either explicit invoice IDs or an `allEligibleBefore` selection. Require one resident per call.
- [ ] Call `authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS)` before reading or writing settlement state, then validate that every selected invoice belongs to the resident and is `unpaid` or `partially_paid`.
- [ ] Preview invoice count, period range, total outstanding, wallet balance, amount to allocate, and resulting wallet balance. The preview must identify invoices that will remain unpaid when the wallet is insufficient.
- [ ] On confirmation, use the atomic settlement primitive to FIFO-settle as many eligible invoices as the balance permits, create one batch, and return receipt number, covered range, count paid, count partial, amount allocated, and remaining balance.
- [ ] Reject cross-resident selections, void/paid invoices, duplicate IDs, and empty eligible sets with actionable messages.
- [ ] Add the admin entry point in the billing registry and/or resident finance view. The single-receipt action must be resident-scoped; a cross-resident bulk operation may be added later only if it creates one batch/receipt per resident.
- [ ] Add audit logging after success and invalidate invoice, resident wallet, payment, and batch queries.
- [ ] Do not call `src/actions/billing/pay-multiple-invoices-with-wallet.ts` from this flow; that action remains portal-only and is not compliant with this admin design.

**Verification:** action tests for full FIFO, partial balance, insufficient balance, same-resident validation, permission denial, and audit call; admin e2e test verifies a single receipt covering multiple months.

## Task 5: Add admin future-month prepayment

**Files:** new action/dialog/hook, invoice-generation extraction, tests, permissions/audit metadata.

- [ ] Define input `{ residentId, houseId, startMonth: 'YYYY-MM', endMonth: 'YYYY-MM', amount, paymentDate, method, referenceNumber, notes }` and validate that the range is contiguous, start is not before the resident/house billing start, end is after start, and the request is bounded to 24 months per operation.
- [ ] Preview the exact monthly invoices to create, their rate snapshots, total amount, wallet credit, target allocation, and any existing invoices that will be reused. Require explicit confirmation when an existing unpaid invoice falls inside the selected future range.
- [ ] Reuse the billing profile/rate-card logic from `generate-invoices.ts`; do not duplicate monthly amount, first-month proration, invoice numbering, or idempotency rules. Future months after the current billable period use the full monthly rate unless an existing profile rule says otherwise.
- [ ] Create one admin payment record for the received funds, credit the wallet, create any missing invoices for the requested range, and settle only that requested range through a `future_prepayment` batch. Do not silently use the funds to pay unrelated older arrears.
- [ ] Use a transaction/RPC so an invoice-generation or allocation error cannot leave a paid receipt with unpaid target invoices or an untracked wallet debit. If the estate chooses to allow a partial future prepayment, the result must state exactly which months were paid and which remain due; the first version should reject insufficient total funds before writing.
- [ ] Add permissions for invoice creation and wallet management at the action boundary, audit the request, generated invoice IDs, allocation rows, covered range, and source payment, and send the existing payment notification only after the transaction succeeds.
- [ ] Add tests for September 2026–September 2027, already-existing invoice reuse, duplicate retry idempotency, insufficient funds, profile/rate changes, and rejection of a range containing a different resident/house.

**Verification:** focused action tests, invoice-generation tests, `npm test -- --run`, `npm run lint`, `npm run build`, and an admin Playwright flow that confirms one receipt covers the full requested range.

## Task 6: Reporting, reversals, and rollout safeguards

**Files:** statement/wallet views, reversal action, docs, tests.

- [ ] Show batch receipt number, batch type, covered range, invoice count, and allocation total in admin wallet transaction history and account statements.
- [ ] Update `reverse-payment-allocation.ts` so reversing a batch reverses all item allocations together, restores invoice balances and wallet balance atomically, marks the batch reversed, and records an audit event. A partial item reversal must be rejected in the first version.
- [ ] Ensure historical payments without batch rows retain current behavior through the legacy period fallback. Do not infer historical invoice coverage from timestamps alone unless an exact source relationship can be proven.
- [ ] Add an operational reconciliation query/report for batches where batch amount differs from item allocation total, item invoice period differs from stored batch coverage, or wallet transaction balances do not reconcile.
- [ ] Update the admin help copy to explain: payment receipt period means invoice period settled, wallet cash remaining is separate from unpaid invoice balance, and future prepayment is an explicit admin operation.
- [ ] Verify all new actions satisfy the module integration scanner and that portal paths remain unchanged.

**Verification:** full Vitest, lint, build, targeted e2e, and a read-only cloud reconciliation after implementation. No configuration change belongs in this plan.

## Acceptance Criteria

1. A payment settling only the September 2025 invoice prints and emails `Sep 2025`, never `Sep 2025 - Sep 2025`.
2. A single resident wallet settlement covering November 2024 through September 2025 creates one auditable batch and one receipt displaying `Nov 2024 - Sep 2025`.
3. The admin can preview and confirm a resident-scoped bulk settlement, see the resulting invoice count and balance, and receive actionable errors for insufficient funds or mixed residents.
4. The admin can request September 2026 through September 2027, have missing monthly invoices generated, have them paid immediately from the credited wallet, and receive one receipt for the complete range.
5. Every invoice allocation is traceable from receipt batch to invoice and wallet transaction, and reversals are atomic.
6. The ordinary payment-year chronology rule remains intact, and no resident portal surface is changed.

## Execution Handoff

Implementation completed for the admin wallet payment-period scope and the partial-payment receipt correction. Cloud migrations were applied through the connected Supabase integration, generated types were synchronized, and focused verification was run. Remaining verification is limited to re-running the added browser spec with a runner that returns a completion result, plus any future decision to make payment-record creation part of the same database transaction as settlement.
## Final verification update (2026-08-13)

- The login route no longer starts a competing AuthProvider session bootstrap; cloud seeded admin authentication now completes normally.
- The Reports Wallet Check panel and resident Transactions wallet-payment tools are integrated and covered by two passing admin Playwright specs.
- Focused wallet/action tests, module integration, targeted lint, and `git diff --check` pass. Full repository TypeScript retains unrelated baseline failures outside this wallet scope.

## Live cloud verification update (2026-08-15)

- Read-only verification against Supabase project `kzugmyjjqttardhfejzc` confirmed all allocation snapshot columns and the `settle_wallet_invoices` RPC signature. The function is `SECURITY INVOKER`.
- The cloud project has 581 invoices (570 paid, 11 unpaid), 52 positive wallet balances, 2,259 payment records, and 832 wallet transactions, but zero `wallet_payment_batches` and zero `wallet_payment_batch_items`.
- Real partial/full settlement and reversal verification remains pending an approved non-production fixture/branch or explicitly authorized reversible financial test data. No live financial rows were changed.
