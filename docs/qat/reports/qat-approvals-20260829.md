# QAT — Approvals — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-APR` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, DOM structure counts, browser console. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Blocked |
|---|---|---|---|
| 11 | 3 | 0 | 8 |

**The approval queue is empty**, so eight of eleven cases cannot be executed. This is an honest coverage gap, not a pass.

## Results

| ID | Title | Status | Notes |
|---|---|---|---|
| QAT-APR-01 | Approvals queue renders | **Pass** | `/approvals` renders: "Approval Queue — Review and approve or reject pending change requests." Empty state is explicit and well-formed: "Change Requests · Pending · No requests found · Everything caught up! No pending requests." Pagination footer reads "Showing 1 to 0 of 0 requests". |
| QAT-APR-02 | Filter by status | **Pass (partial)** | A "Pending" status filter control is present. With zero records the filter cannot be shown to change the result set, so only its presence is verified. |
| QAT-APR-04 | Pagination | **Pass (partial)** | "Rows per page 20" control present; footer correctly reports 0 of 0 rather than a broken or blank state. |
| QAT-APR-03 | Search within queue | **Blocked** | No records to search against. |
| QAT-APR-05 | Request detail view | **Blocked** | No request exists to open. |
| QAT-APR-06 | Reject requires a reason | **Blocked** | Cannot reach the reject dialog with an empty queue. |
| QAT-APR-07 | Reject with reason | **Blocked** | As above. |
| QAT-APR-08 | Approve a request | **Blocked** | As above. |
| QAT-APR-09 | Approved state persists | **Blocked** | As above. |
| QAT-APR-10 | Payment proof viewer | **Blocked** | As above. |
| QAT-APR-11 | Console and network hygiene | **Pass** | No console errors on `/approvals`. |

## Why this matters more than the numbers suggest

Approvals is rated **P1 / High risk** in the test plan: it has no automated coverage, and it gates billing-profile effective-date changes and house-plot changes — decisions with direct financial consequences. Its core state transitions (`pending → approved`, `pending → rejected`, mandatory rejection reason, downstream application of the approved change) are therefore **entirely untested**, by both the automated suite and this manual pass.

The empty queue is not evidence that the module works. It is evidence that nothing has exercised it.

## How to unblock these cases

An approval request must exist first. The intended producers, from the code:

| Producer | Route | Notes |
|---|---|---|
| Billing profile effective-date change | `/settings/billing/profiles` → edit effective date | `checkEffectiveDateImpact` routes to approval when the change affects issued invoices. Request type `billing_profile_effective_date`. |
| House plots change | `/houses/[id]` → edit Number of Plots | Request type `house_plots_change`. Plot count drives the Development Levy (₦500,000 per plot), which is why it needs sign-off. |
| Late fee waiver request | `/billing` → invoice → request waiver | `requestLateFeeWaiver` |

The cleanest way to cover this properly in a later session is to drive the **house-plots change on the `QAT-01` test house** — it is estate data we created, so the resulting approval request is disposable, and it exercises the full loop: create request → appears in queue → reject without reason (expect blocked) → reject with reason → verify persisted state.

That was not attempted in this session because the QAT house creation was still in flight in a parallel agent, and manufacturing an approval request against a **pre-existing** house or billing profile would have meant altering real estate configuration — outside the campaign's data policy.

## Test data created

None.
