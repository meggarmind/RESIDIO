# Invoice Generation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a safe, auditable admin invoice-generation system with scoped monthly runs, controlled backfills, immutable historical rates, reliable wallet settlement and notifications, and durable run history.

**Architecture:** Treat invoice generation as a durable financial operation, not a browser-triggered loop. A PostgreSQL RPC owns each invoice's atomic invoice/item/wallet effects and database constraints own idempotency. Server actions prepare, approve, queue, and observe generation runs; the existing cron/notification infrastructure processes bounded run chunks and post-commit delivery jobs.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/RLS/RPC, TanStack React Query, React Hook Form + Zod, Vitest, Playwright.

## Global Constraints

- Admin dashboard only; do not extend resident-portal surfaces.
- Use Supabase MCP for cloud migrations and regenerate `src/types/database.generated.ts` with `npm run db:types`; never use local Supabase commands.
- Every new write action authorizes first with `authorizePermission`, audits successful writes with `logAudit`, and updates the module-integration allowlists only when justified.
- Use `@/...` imports, preserve unrelated working-tree changes, and run focused tests before broader verification.
- Default approval policy is one authorized approver; a billing setting may require a distinct preparer and approver for threshold backfills.
- Backfill wallet allocation, resident email, and late-fee assessment are opt-in and off by default.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<timestamp>_invoice_generation_redesign.sql` | Versions, durable runs/candidates/approvals, immutable invoice identity, RLS, RPCs, and settings. |
| `src/lib/billing/invoice-generation.ts` | Pure date/range/confirmation and request/result types shared by UI/actions. |
| `src/actions/billing/invoice-generation-runs.ts` | Authorized prepare/approve/cancel/retry/read actions. |
| `src/actions/billing/process-invoice-generation-run.ts` | Bounded service-role worker action that claims and processes candidates. |
| `src/actions/billing/generate-invoices-preview.ts` | Refactored dry-run to use the same candidate/rate selector as execution. |
| `src/actions/billing/generate-invoices.ts` | Compatibility wrapper for cron/API callers; delegates to the run service. |
| `src/app/api/cron/generate-invoices/route.ts` | Creates only a current-month, estate-wide, side-effect-free scheduled run and advances queued work. |
| `src/components/billing/generate-invoices-dialog.tsx` | Admin workflow: scope, mode, preview, safeguards, approval, progress, result. |
| `src/components/billing/generation-history-panel.tsx` | Durable run state, approval state, downloadable result, retry and cancel actions. |
| `src/hooks/use-billing.ts` | Run query/mutation hooks and invalidation. |
| `src/actions/email/send-invoice-email.ts` | Queue post-commit invoice email work with idempotency instead of fire-and-forget delivery. |
| `src/__tests__/billing/*` and `e2e/payments-billing.spec.ts` | Financial rules, authorization, API/RPC integration seams, and admin flow coverage. |

## Task 1: Add the durable database contract

**Files:**
- Create: `supabase/migrations/<timestamp>_invoice_generation_redesign.sql`
- Modify: `src/types/database.ts`
- Modify: `src/lib/auth/action-roles.ts`
- Test: `src/__tests__/integration/module-integration.test.ts`

**Consumes:** Existing `invoices`, `invoice_items`, `billing_profiles`, `billing_items`, `resident_wallets`, `wallet_transactions`, `wallet_payment_batches`, and `notification_queue` tables.

**Produces:** `billing_profile_versions`, `billing_profile_version_items`, `invoice_generation_runs`, `invoice_generation_candidates`, and `invoice_generation_approvals`; a database uniqueness contract and `create_generated_invoice(...)` RPC.

- [ ] **Step 1: Write migration assertions as a SQL review checklist**

  Include preflight queries in a migration comment to detect duplicate business keys before creating the constraint:

  ```sql
  SELECT resident_id, house_id, billing_profile_id, period_start, period_end, count(*)
  FROM public.invoices
  WHERE billing_profile_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5
  HAVING count(*) > 1;
  ```

- [ ] **Step 2: Apply a migration that creates immutable rate versions and durable runs**

  Create profile versions with a unique `(billing_profile_id, effective_from)`, first-of-month check, JSON/item snapshot, creator, approval metadata, and `is_locked`. Create generation runs/candidates with explicit statuses (`draft`, `awaiting_approval`, `queued`, `processing`, `completed`, `completed_with_errors`, `cancelled`) and candidate statuses (`pending`, `processing`, `created`, `skipped`, `failed`, `cancelled`). Store request scope/options and result totals as JSONB plus explicit numeric totals.

- [ ] **Step 3: Migrate existing profiles into initial versions and preserve invoice provenance**

  Insert one locked initial version per profile using its `effective_date` (normalised to the first of that month), copy existing `billing_items`, and add nullable `billing_profile_version_id` to invoices. Backfill it from the profile's initial version without altering existing invoice totals or snapshots.

- [ ] **Step 4: Add business-key uniqueness and an unambiguous invoice number**

  Add a unique index that prevents duplicate generated charges:

  ```sql
  CREATE UNIQUE INDEX invoices_generated_business_key
    ON public.invoices (resident_id, house_id, billing_profile_version_id, period_start, period_end)
    WHERE billing_profile_version_id IS NOT NULL;
  ```

  Generate new invoice references from period, house short id, and version short id (for example `INV-202608-AB12CD34-EF56GH78`) inside the RPC. Do not change legacy references.

- [ ] **Step 5: Implement `create_generated_invoice` as an atomic security-definer RPC**

  The RPC must lock the candidate row, insert the invoice with `ON CONFLICT DO NOTHING`, insert all invoice items only when the invoice was inserted, optionally call/compose the established wallet allocation primitive, and insert a candidate outcome. Restrict execute to `authenticated` and `service_role`, set a safe `search_path`, and never expose it to `PUBLIC`.

  ```sql
  CREATE OR REPLACE FUNCTION public.create_generated_invoice(
    p_candidate_id uuid,
    p_actor_id uuid
  ) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  -- SELECT candidate FOR UPDATE; INSERT invoice ON CONFLICT; INSERT items;
  -- update candidate and return {status, invoice_id, amount, wallet_allocated}.
  $$;
  ```

- [ ] **Step 6: Add RLS and settings**

  Enable RLS on every new table. Grant finance roles read access; restrict prepare/approve/cancel mutations to the application/RPC policy. Seed `invoice_generation_dual_approval_enabled`, `invoice_generation_high_value_threshold`, and `invoice_generation_backfill_max_months` with safe defaults.

- [ ] **Step 7: Regenerate types and verify migration through Supabase**

  Apply with Supabase MCP, run read-only validation queries for tables, indexes, RLS, function grants, and the preflight duplicate query. Run `npm run db:types`; never hand-edit generated types.

- [ ] **Step 8: Commit**

  ```bash
  git add supabase/migrations src/types/database.generated.ts src/types/database.ts src/lib/auth/action-roles.ts
  git commit -m "feat: add durable invoice generation schema"
  ```

## Task 2: Build a single candidate and rate-selection engine

**Files:**
- Create: `src/lib/billing/invoice-generation.ts`
- Create: `src/lib/billing/__tests__/invoice-generation.test.ts`
- Modify: `src/actions/billing/generate-invoices-preview.ts`
- Modify: `src/actions/billing/generate-invoices.ts`

**Consumes:** Versioned profile rows from Task 1 and current house/resident eligibility rules.

**Produces:** Shared `InvoiceGenerationRequest`, `InvoiceGenerationCandidate`, `selectPeriods`, and `resolveBillableCandidates` interfaces.

- [ ] **Step 1: Write failing pure-function tests**

  Cover `selected_month` producing exactly one period, `backfill` producing an inclusive range, a move-in prorated first period, first-of-month version selection, rejection of mid-month versions, and an error when no version exists for a requested historical period.

  ```ts
  expect(selectPeriods({ mode: 'selected_month', targetMonth: '2026-08-01' }))
    .toEqual(['2026-08-01']);
  expect(selectPeriods({ mode: 'backfill', fromMonth: '2026-06-01', targetMonth: '2026-08-01' }))
    .toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
  ```

- [ ] **Step 2: Implement validated request and candidate types**

  Define Zod validation for mode, target/from month, mutually exclusive scope selectors, wallet/email/late-fee flags, typed confirmation text, and trigger. Enforce no historical side effects unless explicitly selected.

- [ ] **Step 3: Implement eligibility and profile semantics once**

  House-targeted profiles create one candidate for the priority billable resident. Resident-targeted profiles create one candidate for each active matching resident-house role. Scope only narrows candidates; inactive accounts, vacancy/renovation/construction rules and applicable roles remain authoritative. Return skip reasons rather than silently dropping candidates.

- [ ] **Step 4: Refactor preview and legacy entrypoint to consume the engine**

  Preview must compute the same candidates, version, proration, invoice identity, existing-invoice status, wallet estimate, and warnings as execution. `generateMonthlyInvoices` becomes a thin compatibility wrapper that prepares and processes an approved current-month run; it must not retain its own invoice loop.

- [ ] **Step 5: Run focused tests**

  ```bash
  npm test -- --run src/lib/billing/__tests__/invoice-generation.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/billing src/actions/billing/generate-invoices-preview.ts src/actions/billing/generate-invoices.ts
  git commit -m "feat: centralize invoice generation candidates"
  ```

## Task 3: Implement governed run lifecycle and chunk processor

**Files:**
- Create: `src/actions/billing/invoice-generation-runs.ts`
- Create: `src/actions/billing/process-invoice-generation-run.ts`
- Create: `src/actions/billing/__tests__/invoice-generation-runs.test.ts`
- Modify: `src/actions/billing/get-generation-log.ts`
- Modify: `src/app/api/cron/generate-invoices/route.ts`
- Modify: `src/app/api/admin/generate-invoices/route.ts`

**Consumes:** Task 1 schema/RPC and Task 2 candidate engine.

**Produces:** `prepareInvoiceGenerationRun`, `approveInvoiceGenerationRun`, `cancelInvoiceGenerationRun`, `retryFailedInvoiceGenerationCandidates`, `processInvoiceGenerationRun`, and durable list/detail reads.

- [x] **Step 1: Write failing action tests for authorization and state transitions**

  Assert: unauthorised users cannot prepare/approve/cancel; routine monthly runs queue after a single approver; threshold runs await a distinct second approver only when the setting is enabled; cancellation only cancels pending candidates; retry creates work only for failed candidates.

- [x] **Step 2: Implement prepare and approval actions**

  `prepareInvoiceGenerationRun(request)` builds and persists candidates and totals without invoices, wallets, or emails. It sets `awaiting_approval` only when the configured dual-approval policy applies; otherwise it queues the run. Audit the request, candidate totals, side-effect options, and typed confirmation.

- [x] **Step 3: Implement bounded worker processing**

  Claim a queued/processing run and at most 50 pending candidates with `FOR UPDATE SKIP LOCKED` semantics inside an RPC or a status-claim RPC. Process each candidate via `create_generated_invoice`; recompute totals after every chunk; mark completed only when no pending candidates remain. Never delete completed invoices when cancelled.

- [x] **Step 4: Make cron conservative**

  The scheduled route prepares only the current month, estate-wide, with wallet allocation, email, and late fees disabled. It may advance an already queued run by one bounded chunk. Preserve timing-safe cron authorization and return the durable run ID/status.

- [x] **Step 5: Keep old log readers compatible during migration**

  Make history readers prefer generation runs while retaining legacy log display for existing records. Include prepared-by, approved-by, scope, options, progress, created/skipped/failed/wallet/email totals, and error details.

- [x] **Step 6: Run tests and commit**

  ```bash
  npm test -- --run src/actions/billing/__tests__/invoice-generation-runs.test.ts
  git add src/actions/billing src/app/api/cron/generate-invoices src/app/api/admin/generate-invoices
  git commit -m "feat: add governed invoice generation runs"
  ```

## Task 4: Make invoice email a durable post-commit effect

**Files:**
- Modify: `src/actions/email/send-invoice-email.ts`
- Create: `src/lib/notifications/__tests__/invoice-generation-email.test.ts`
- Modify: `src/actions/billing/process-invoice-generation-run.ts`
- Modify: `src/actions/notifications/queue.ts`

**Consumes:** Completed invoice creation from Task 3 and existing `notification_queue` dispatch/retry infrastructure.

**Produces:** Deduplicated `invoice-generated:<invoice-id>` jobs with queued/sent/failed visibility in candidate/run summaries.

- [x] **Step 1: Write a failing queue test**

  Assert a created candidate with `sendEmails: true` creates one job after the invoice transaction succeeds; reprocessing the candidate does not create another; `sendEmails: false` creates none.

- [x] **Step 2: Replace direct asynchronous sending with queue insertion**

  Queue a single `email` notification after the invoice RPC reports success. Persist the queue ID/status on the candidate. Do not call a network email provider from inside generation processing.

- [x] **Step 3: Surface delivery outcome safely**

  Aggregate queued/sent/failed counts from candidate/notification status in run details. Retry only failed delivery work; never recreate an invoice to retry email.

- [x] **Step 4: Run tests and commit**

  ```bash
  npm test -- --run src/lib/notifications/__tests__/invoice-generation-email.test.ts
  git add src/actions/email/send-invoice-email.ts src/actions/billing/process-invoice-generation-run.ts src/actions/notifications/queue.ts src/lib/notifications
  git commit -m "feat: queue invoice generation emails reliably"
  ```

## Task 5: Rebuild the admin billing workflow

**Files:**
- Modify: `src/components/billing/generate-invoices-dialog.tsx`
- Modify: `src/components/billing/generation-history-panel.tsx`
- Modify: `src/hooks/use-billing.ts`
- Modify: `src/app/(dashboard)/billing/page.tsx`
- Test: `e2e/payments-billing.spec.ts`

**Consumes:** Run actions and run detail interfaces from Task 3.

**Produces:** A controlled admin-only wizard and durable operations view.

- [x] **Step 1: Add request controls and safe defaults**

  Include selected month, `selected_month`/`backfill`, optional house/street/resident scope, wallet allocation, resident email, and late-fee review flags. Selecting backfill clears wallet/email/late-fee defaults. Hide side effects from cron-only state.

- [x] **Step 2: Bind Preview to the exact request**

  Display candidate count/amount, existing skips, excluded properties, historical-rate errors, projected wallet allocation, and explicit warnings. Disable prepare until a successful preview matches the current request.

- [x] **Step 3: Add graduated confirmation and approval state**

  Require typed confirmation containing the requested range and total when the range spans multiple months or exceeds the configured threshold. Show whether the current policy needs a second approver and provide a run ID/status after preparation.

- [x] **Step 4: Display progress and results durably**

  Poll the run detail while queued/processing; show created/skipped/failed counts and values, wallet allocation, unpaid value, and email queue outcome. Keep the modal open until the run reaches a terminal state; link to the history detail instead of relying on a toast.

- [x] **Step 5: Upgrade history actions**

  Add run state, scope/options, approval actors, result export, cancel for pending work, and retry-failed candidates. Do not expose destructive edit/delete actions for generated invoices.

- [x] **Step 6: Add Playwright coverage**

  Cover an admin current-month preview/prepare, a backfill that defaults side effects off and requires typed confirmation, and a history-row retry/cancel visibility case using seeded data.

- [x] **Step 7: Commit**

  ```bash
  git add src/components/billing src/hooks/use-billing.ts src/app/(dashboard)/billing/page.tsx e2e/payments-billing.spec.ts
  git commit -m "feat: add controlled invoice generation workflow"
  ```

## Task 6: Final financial verification and operational documentation

**Files:**
- Modify: `docs/plan/billing-generate-invoices-enhancements.md`
- Modify: `TODO.md`
- Modify: `ACTIONPLAN.md`
- Modify: `SESSION_STATE.md`
- Test: `src/__tests__/integration/module-integration.test.ts`
- Test: `src/actions/billing/__tests__/invoice-generation-runs.test.ts`
- Test: `e2e/payments-billing.spec.ts`

**Consumes:** Completed Tasks 1-5.

- [x] **Step 1: Replace the proposed-plan status with the approved decisions and shipped behavior**

  Record the current-month default, explicit backfill, historical-rate versioning, configurable dual approval defaulting off, immutable corrections, queue delivery, and cancellation policy.

- [x] **Step 2: Run financial regression coverage**

  ```bash
  npm test -- --run
  npm run lint
  npm run build
  npm run test:e2e -- payments-billing.spec.ts
  ```

  Document any pre-existing failures separately from changed-file failures.

- [x] **Step 3: Verify cloud safety post-migration**

  Use Supabase advisors for security and performance. Verify every new exposed table has RLS, the RPC has no `PUBLIC` execute grant, unique-index enforcement works, and wallet batch records reconcile to invoice payment totals.

- [x] **Step 4: Update handoff state and commit**

  ```bash
  git add docs TODO.md ACTIONPLAN.md SESSION_STATE.md
  git commit -m "docs: record invoice generation redesign"
  ```

## Plan Review

**Spec coverage:** Tasks 1-2 cover immutable period-effective rates, resident-targeted profiles, unambiguous identity, and idempotency. Tasks 1 and 3 cover run locks, transactional invoice/item/wallet outcomes, approval, cancellation, retry, and retention. Task 4 covers durable email. Task 5 covers preview, scope, side-effect defaults, confirmation, progress, and history. Task 6 covers security, verification, and handoff documentation.

**Placeholder scan:** No implementation step relies on unspecified future work; each task names the files, public interfaces, and test cycle needed for its deliverable.

**Type consistency:** All UI and worker paths consume a persisted `InvoiceGenerationRequest` and `InvoiceGenerationCandidate`; invoice writes flow only through `create_generated_invoice`, and notifications use the existing durable queue after a successful invoice result.
