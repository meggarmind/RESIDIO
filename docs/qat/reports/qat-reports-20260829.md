# QAT — Reports & Analytics — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-RPT` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, DOM structure counts, browser console. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Not yet executed |
|---|---|---|---|
| 14 | 8 | 1 | 5 |

One LOW defect. Analytics is the strongest-looking area tested in this campaign — its figures reconcile with every other screen.

## Results

| ID | Title | Status | Severity | Notes |
|---|---|---|---|---|
| QAT-RPT-01 | Reports hub renders | **Pass** | — | `/reports` renders "Financial Reports — Generate detailed financial reports and analytics for your estate", tabs New Report / History (7) / Schedules / Archive / Wallet Check, and "7 · 0 generated this month". |
| QAT-RPT-02 | Report request wizard | **Pass** | — | Five-step wizard renders: 1 Report Type, 2 Time Period, 3 Accounts, 4 Options, 5 Review, with Back/Next controls. Eight report types offered: Financial Overview, Collection Report, Invoice Aging Report, Transaction Log, Debtors Report, Indebtedness Report, Indebtedness Detail Report, Development Levy Report. |
| QAT-RPT-08 | Financial overview page | **Pass** | — | `/reports/financial-overview` renders filters (Start Date, End Date, Transaction Type, Bank Account) and, after Refresh, the result panel: "Total Income ₦0.00 · Total Expenses ₦0.00 · Net Balance ₦0.00 · Transactions 0" plus a Category Breakdown table with the explicit empty state "No transactions found for the selected period" and an Export CSV control. See the note below on why zero is the correct answer here. |
| QAT-RPT-09 | Analytics page renders | **Pass** | — | `/analytics` renders five tabs — Financial, Residents, Houses & Streets, Collections & Indebtedness, Payment Behavior — with live figures. No `NaN` or empty axes. |
| QAT-RPT-10 | Collections trend | **Pass** | — | "Revenue Trend — Monthly payment collections" renders. |
| QAT-RPT-11 | Indebtedness ranking | **Pass** | — | Collections & Indebtedness tab present; headline figures render (Outstanding ₦185,000.00, Overdue Invoices 18 / ₦175,000.00 total). |
| QAT-RPT-12 | Announcement analytics | **Fail** | **LOW** | Renders the period selector and "Showing data for: Jul - Aug 2026", then nothing at all. See QAT-RPT-D1. |
| QAT-RPT-14 | Console and network hygiene | **Pass** | — | No console errors on `/reports`, `/reports/financial-overview`, `/analytics`, or `/analytics/announcements`. |
| QAT-RPT-03..07, 13 | Generate a report, viewer, download, schedule CRUD, wallet reconciliation | Not yet executed | — | Deferred — generating a report writes to the shared archive, and schedule CRUD would create scheduled jobs. Left for a session where the created artifacts can be tracked in the data manifest. |

## Analytics figures reconcile across screens

This is worth recording positively, because it is the evidence that the underlying reporting layer is sound and that the anomalies found elsewhere in this campaign are presentation-layer issues:

| Figure | `/analytics` | `/dashboard` | `/billing` |
|---|---|---|---|
| Collection rate | 94.4% | 94% | — |
| Outstanding | ₦185,000.00 | ₦185,000 unpaid balance | — |
| Overdue | 18 invoices / ₦175,000.00 | 18 / ₦175,000 | 18 / ₦175,000.00 |
| Paid invoices | 570 | 570 | — |
| Unpaid invoices | 19 | 19 | — |
| Residents | 190 | — | — |
| Houses | 178 (162 occupied, 16 vacant) | — | — |

The `/analytics` collection rate of **94.4%** independently confirms the conclusion recorded in [qat-navigation-20260829.md](qat-navigation-20260829.md): the dashboard's Financial Health ring reading "0%" was an artifact of `requestAnimationFrame` being suspended in a non-compositing browser tab, not a data defect. Three screens agree on the real value.

One figure does **not** reconcile — `/billing` reports "Total Invoices 589 — All time invoices" while `/analytics` and `/dashboard` both sum to 607 across statuses. That is tracked in the Billing report, not here.

## Defects

### QAT-RPT-D1 — Announcement analytics renders no empty state  [LOW]

**Steps to reproduce**

1. Navigate to `/analytics/announcements`.
2. Wait for full load (18s).

**Expected**

Either metrics, or an explicit empty state.

**Actual**

The page renders its heading, a Refresh control, the period selector (This Month / Last Month / Last Quarter / Year to Date / Last Year / Custom) and the line "Showing data for: Jul - Aug 2026" — and then nothing. No zero-valued cards, no chart frames, no "no data" message. Just blank space below the selector.

**Root cause is data, not code**

There are zero announcements in the system. `/announcements` confirms it: "No announcements found — Create your first announcement to get started", with 0 table rows. So there is genuinely nothing to plot.

**Why it is still a defect**

The sibling page handles the identical situation properly. `/reports/financial-overview` with no imported transactions still renders "Total Income ₦0.00 · Total Expenses ₦0.00 · Net Balance ₦0.00 · Transactions 0" and states plainly: *"No transactions found for the selected period"*. The user knows the page worked and the answer is zero.

On `/analytics/announcements` the user cannot distinguish "no announcements this period" from "the page failed to load". That ambiguity is the defect, and it is cheap to fix — LOW severity precisely because the fix is a message, not a mechanism.

**Filed?** No — LOW stays in the register.

## Note on zero-valued financial figures

`/reports/financial-overview` reporting ₦0.00 across the board is **correct, not a defect**. That page reads imported bank-statement transactions, and no bank statements have been imported into this environment — corroborated by the dashboard's "ESTATE CASH ₦0 — Imported bank net cash + petty cash". The ₦17,034,053.00 visible on `/payments` is manually recorded payment records, which is a different source.

This is recorded explicitly because "a financial report showing all zeros" is exactly the kind of observation that gets filed as a critical bug without checking what feeds it.

## Not executed

| ID | Reason |
|---|---|
| QAT-RPT-03, 04, 05 | Generating a report writes a real artifact to the shared report archive. Deferred to a session where it can be tracked in the data manifest. |
| QAT-RPT-06, 07 | Report schedule CRUD would create real scheduled jobs against shared data. |
| QAT-RPT-13 | Wallet batch reconciliation panel — not reached. |

## Test data created

None. All interactions in this module were read-only; the single button pressed (Refresh on `/reports/financial-overview`) performs a read.
