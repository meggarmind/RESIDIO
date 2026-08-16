# Billing: Generate Invoices Enhancements

## Status

Approved and implemented across issues #52–#56. Final verification is recorded in issue #57 (2026-08-15). The estate-wide backfill remains deferred pending the human decision tracked by #73.

## Objective

Improve `/billing` → **Generate Invoices** so invoice generation is predictable, reviewable, safe for wallet balances, and suitable for both monthly operations and historical backfills.

## Current behavior

The action currently:

- Checks the billing permission for manual runs.
- Finds active houses, effective billing profiles, and billable residents.
- Creates missing monthly invoices from the resident’s move-in month through the selected target month; the UI currently passes the current date.
- Applies move-in-month pro-rating.
- Skips periods where a matching invoice already exists.
- Attempts to debit the resident wallet for each newly created invoice.
- Queues invoice email notifications after committed invoice creation with durable queued/sent/failed outcomes.
- Records generation counts, skips, errors, duration, and audit information.

The admin workflow now provides exact preview, month/mode selection, mutually exclusive scope narrowing, explicit wallet/email/late-fee controls, typed backfill confirmation, durable progress, and history actions. Resident-targeted billing profiles are resolved through the shared candidate engine.

## Proposed enhancements

### 1. Preview and controlled execution

Add a dry-run preview before writing data. The preview should show:

- Target month and billing scope.
- Eligible houses and residents.
- Invoices that would be created.
- Existing invoices that would be skipped.
- Estimated invoice value.
- Expected wallet deductions.
- Warnings, exclusions, and validation errors.

Add controls for:

- Current month only versus missing-period backfill.
- Selected billing month.
- Optional house, street, or resident scope.
- Vacant and special-property-status billing.
- Confirmation before execution.

### 2. Separate side effects

Make wallet and email behavior explicit execution options:

- Generate invoices only.
- Generate and auto-allocate available wallet funds.
- Generate and send invoice emails.

Historical backfills should default to no email and no wallet deduction unless the operator explicitly selects those options.

### 3. Complete resident-targeted billing

Implement profiles with `target_type = resident` using their configured applicable roles. Add validation for overlapping profiles so one resident is not unintentionally charged twice for the same billing period.

### 4. Duplicate and concurrency protection

- Add a database uniqueness constraint for the resident, house, billing profile, and billing period combination.
- Use an atomic insert/upsert approach instead of check-then-insert only.
- Prevent overlapping generation runs for the same scope and period.

### 5. Wallet safety

Make wallet allocation transaction-safe and concurrency-safe. The operation must preserve the wallet transaction ledger, invoice payment totals, and wallet balance if any step fails. The result should report total wallet funds applied and remaining unpaid invoice value.

### 6. Better run results and history

Expand the generation result and UI to show:

- Created invoice count and total amount.
- Skipped invoice count and amount.
- Failed invoice count and details.
- Wallet amount allocated.
- Unpaid amount remaining.
- Email queued, sent, and failed counts.
- Selected options and execution scope.

Add a run-history detail view with downloadable results and retryable failures.

### 7. Large-run operations

- Add progress reporting for large estates.
- Make processing resumable or retryable.
- Add a stronger confirmation for multi-year backfills.
- Keep a complete audit record of options, affected records, wallet deductions, and emails.

## Implementation phases

### Phase 1 — Preview and operator controls

Add preview/dry-run support, target-month selection, current-month versus backfill mode, scope filters, confirmation, and an improved result summary.

### Phase 2 — Side-effect controls

Separate invoice creation from wallet allocation and email delivery. Apply safe defaults for historical backfills and display the resulting wallet and email totals.

### Phase 3 — Billing coverage

Implement resident-targeted profiles, role matching, and overlap validation.

### Phase 4 — Data integrity and concurrency

Add database constraints, atomic invoice creation, run locking, and transaction-safe wallet allocation.

### Phase 5 — Operations and history

Add progress reporting, detailed generation history, downloads, resumable processing, and retry support.

## Acceptance criteria

- An operator can preview a run without creating invoices, changing wallets, or sending emails.
- The operator can choose the billing period and whether to backfill missing periods.
- Wallet deductions and email delivery require explicit selection.
- Re-running the same scope and period cannot create duplicate invoices or duplicate wallet deductions.
- Resident-targeted billing profiles are processed according to their configured roles.
- Failed runs expose actionable details and can be safely retried.
- Every run records its options, results, errors, wallet impact, and audit metadata.
- Existing monthly billing behavior remains correct for move-in pro-rating and invoice idempotency.

## Deployment note

This plan requires approval before implementation and deployment. Database constraints and wallet transaction changes should be tested against the legacy invoice and wallet chronology cases before production rollout.
