# QAT — Billing, Invoices & Wallet — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-BIL` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, DOM row counts, code trace. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Skipped | Not yet executed |
|---|---|---|---|---|
| 28 | 6 | 2 | 1 | 19 |

Two MEDIUM defects, both in presentation rather than in the billing engine itself. The underlying invoice data is sound — see the reconciliation in [qat-reports-20260829.md](qat-reports-20260829.md).

## Results

| ID | Title | Status | Severity | Notes |
|---|---|---|---|---|
| QAT-BIL-01 | Invoice list renders | **Pass** | — | `/billing` renders 20 rows with invoice number, resident, house, period, due date, amount, type, status. Sample: `INV-202608-F866AF4D-8DB20966-2CF8159A · FEYIJIMI ADEWOLE · 18A, Kayode Oni Animashaun · Aug 2026 · 31/08/2026 · ₦10,000.00 · Service Charge · unpaid`. Takes ~10s to populate. |
| QAT-BIL-02 | Overdue statistics | **Pass** | — | "Overdue ₦175,000.00 · 18 overdue invoices" — reconciles exactly with `/dashboard` and `/analytics`. |
| QAT-BIL-09 | Generation history is durable | **Pass** | — | `/billing/generate` renders 10 historical runs with period, trigger, status, generated/skipped/error counts and relative time. Both MANUAL and CRON triggers present, e.g. `2026-08-01 MANUAL COMPLETED 8 generated 0 skipped 0 errors — 11 days ago`, and failed runs surfaced with a Retry action, e.g. `2025-11-30 CRON — 33 errors — 0 generated, 15 skipped, 33 errors — Retry`. CSV export offered per run. |
| QAT-BIL-25 | Late fee settings render | **Pass** | — | `/settings/billing/late-fees` renders (confirmed in the smoke pass). |
| QAT-BIL-21 | Billing profile page renders | **Pass** | — | `/settings/billing/profiles` renders "Billing Profiles (Rate Cards) — Define the standard rates for different types…". Create not executed. |
| QAT-BIL-27 | Invoice overdue state | **Pass** | — | Overdue invoices are correctly derived and consistently reported as 18 / ₦175,000.00 across three screens. |
| QAT-BIL-06 | Generation preview | **Fail** | **MEDIUM** | Not a preview failure — see QAT-BIL-D2 regarding the "Total Invoices" count on the surrounding page. The preview step itself was not driven; see Not Executed. |
| — | Invoice status distribution chart | **Fail** | **MEDIUM** | See QAT-BIL-D1. |
| — | Billing stat card scoping | **Fail** | **MEDIUM** | See QAT-BIL-D2. |
| QAT-BIL-08 | Estate-wide generation | **Skipped** | — | Deliberately not executed — would create hundreds of real invoices in a shared database. |
| QAT-BIL-03..05, 07, 10..20, 22..24, 26, 28 | Filters, per-house levy, invoice detail, corrections, disputes, wallet credit/debit/allocation, statements, profile CRUD, waivers | Not yet executed | — | See Not Executed. |

## Defects

### QAT-BIL-D1 — Invoice status donut chart double-counts overdue invoices  [MEDIUM]

**What is wrong**

`overdue` is not a stored invoice status — it is a **derived subset** of `unpaid` (and `partially_paid`) invoices whose `due_date` has passed. Every server action treats it that way, e.g. [get-enhanced-dashboard-stats.ts:447](src/actions/dashboard/get-enhanced-dashboard-stats.ts:447):

```ts
supabase.from('invoices').select('*', { count: 'exact', head: true })
  .in('status', ['unpaid', 'partially_paid'])
  .lt('due_date', new Date().toISOString().split('T')[0]),
```

`fetchInvoiceDistribution` runs five count queries — `unpaid`, `paid`, `partially_paid`, `overdue`, `void` — and the overdue bucket is **not excluded** from the unpaid bucket. So the same 18 rows appear in both.

The card then treats those five overlapping buckets as if they were a partition. [invoice-distribution-card.tsx:33](src/components/dashboard/invoice-distribution-card.tsx:33), inside `DonutChart`:

```ts
const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);
```

and again at [line 178](src/components/dashboard/invoice-distribution-card.tsx:178):

```ts
const total = Object.values(distribution).reduce((sum, val) => sum + val, 0) - distribution.void;
```

**Observed effect**

With Paid 570, Unpaid 19, Partially Paid 0, Overdue 18, Void 0, the derived total is **607**. The true invoice count is **589** — confirmed independently by `/billing`, which runs an unfiltered `count: 'exact'` over the whole table. The chart is inflated by exactly the 18 double-counted rows.

Consequences:
- Every donut segment is drawn against an inflated denominator. Paid renders as 570/607 = 93.9% of the ring when it is really 570/589 = 96.8%.
- The Overdue wedge is drawn as a slice of its own, when those invoices are already inside the Unpaid wedge. The chart shows parts that do not form a whole.

**Why the numbers themselves are not wrong**

Each individual figure is correct in isolation: there really are 19 unpaid invoices, and 18 of them really are overdue. The defect is presenting a subset alongside its own superset in a chart whose geometry assumes mutual exclusivity. A fix could either exclude overdue from the unpaid bucket, or render overdue as an annotation rather than a segment.

**Filed?** No — MEDIUM stays in the register.

### QAT-BIL-D2 — "Paid" and "Unpaid" cards show current-page counts but are labelled as totals  [MEDIUM]

**Steps to reproduce**

1. Navigate to `/billing`, let it load.
2. Compare the header cards against the pagination footer.

**Observed**

| Card | Value | Description shown |
|---|---|---|
| Total Invoices | 589 | "All time invoices" |
| Paid | **12** | "Completed payments" |
| Unpaid | **8** | "Pending invoices" |
| Total Value | ₦140,000.00 | "**Current page total**" |
| Overdue | ₦175,000.00 | "18 overdue invoices" |

12 + 8 = 20, which is exactly the page size.

**Root cause**

[billing/page.tsx:177](src/app/(dashboard)/billing/page.tsx:177):

```ts
const paidCount = invoices.filter(inv => inv.status === 'paid').length;
const unpaidCount = invoices.filter(inv => inv.status === 'unpaid').length;
const totalAmount = invoices.reduce((sum, inv) => sum + (Number(inv.amount_due) || 0), 0);
```

`invoices` is only the current page — `getInvoices` applies `.range(from, to)` with `limit = 20`. All three values are page-scoped and computed identically.

**The defect is the labelling, not the maths.** "Total Value" honestly declares itself "Current page total". "Paid" and "Unpaid" are computed the same way but are described as "Completed payments" and "Pending invoices", with no page-scope qualifier — sitting immediately beside a card that genuinely is all-time ("Total Invoices 589 · All time invoices").

An administrator glancing at this screen reads "12 paid, 8 unpaid" against an estate that actually has 570 paid and 19 unpaid. The figures are off by a factor of ~47 for paid, and they silently change when the user pages or resizes the page.

**Filed?** No — MEDIUM stays in the register.

## A hypothesis that was wrong, and why it is recorded

The 589-vs-607 gap was initially read the other way round: that `/billing` was **under**-counting by excluding overdue invoices from its "all time" total. The delta matching the overdue count exactly (607 − 589 = 18) made that look compelling.

It was backwards. Tracing the queries showed `/billing` runs a plain unfiltered `count: 'exact'` with no status filter at all — 589 is the true row count — and the inflation is in the dashboard/analytics card, which sums overlapping buckets.

Recorded because the wrong version would have sent someone hunting for a phantom filter in the billing query that does not exist, and because "the delta equals the overdue count" was suggestive of either explanation. Arithmetic coincidence is not a diagnosis.

## Not executed

| ID | Reason |
|---|---|
| QAT-BIL-08 | Estate-wide invoice generation — would create hundreds of real invoices in a shared cloud database. Explicitly on the campaign's do-not-execute list. |
| QAT-BIL-06, 07 | The generation **preview** step was not driven. `/billing/generate` presents a "Generate Invoices" action; with no clearly-labelled dry-run affordance verified, driving it risked triggering real generation. Deferred rather than risked — a dev with knowledge of the dialog's flow can confirm whether a safe preview stage exists. |
| QAT-BIL-10 | Per-house levy generation for `QAT-01` — the QAT house creation was still in flight in a parallel agent when this module was written up. |
| QAT-BIL-11..20, 22..24, 26 | Invoice detail, corrections, disputes, wallet credit/debit/allocation, statement generation, profile CRUD, late-fee waivers. These write real financial records; deferred to a session where each created artifact can be tracked in the data manifest. |

**This is the largest coverage gap in the campaign.** Billing and Wallet is rated P1 / High risk — it is where money owed and money held are tracked — and the wallet operations in particular (credit, debit, allocation across invoices, batch reversal) remain untested by this pass. The two defects found here are presentational; the transactional core is simply unverified.

## Test data created

None.
