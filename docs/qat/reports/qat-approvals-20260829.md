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


---

# Session 2 addendum — 2026-08-30: why these cases cannot be executed

The plan was to unblock this module by driving a plots change on the `QAT-01` test house, producing a disposable approval request. That was attempted and it **did not produce a request** — the change applied directly, with the toast "House updated successfully", and `/approvals` still read "Everything caught up! No pending requests."

That is **correct application behaviour**, not a defect. Tracing it settles the module's testability for good.

## The approval path has two preconditions, and this campaign fails one by design

[update-house.ts:65](src/actions/houses/update-house.ts:65):

```ts
if (isPlotsChange && await hasExistingDevelopmentLevy(id)) {
    const autoApprove = await canAutoApprove();
    if (!autoApprove) {
        // create approval request; do NOT apply number_of_plots
    }
}
```

**Precondition 1 — the house must already carry a Development Levy.** `hasExistingDevelopmentLevy` queries `house_levy_history` for that house. `QAT-01` is a house we created hours earlier with no invoices at all ("No invoices generated for this property yet"), so this is `false` and the approval branch is skipped entirely. Choosing a clean test house guaranteed the bypass — the test setup was the flaw, not the app.

**Precondition 2 — the actor must not be able to auto-approve.** [approvals/index.ts:524](src/actions/approvals/index.ts:524):

```ts
export async function canAutoApprove(): Promise<boolean> {
  ...
  return profile?.role === 'admin' || profile?.role === 'chairman';
}
```

`admin@residio.test` carries `profile.role = 'admin'`, confirmed from the session profile. So `canAutoApprove()` returns **true** for this campaign's only authenticated actor.

## This is not specific to house plots

Every producer of approval requests is gated by the same call:

| Producer | Location |
|---|---|
| House plots change | `src/actions/houses/update-house.ts:67` |
| Billing profile effective date | `src/actions/billing/profiles.ts:230` |
| Bank account create / update / toggle / delete | `src/actions/imports/bank-accounts.ts:114, 225, 326, 404` |

All six call sites check `canAutoApprove()` first. A super_admin bypasses the maker-checker everywhere by design — that is the point of the feature: it exists to make *other* roles route their changes past a second pair of eyes.

## Conclusion

**The Approvals module is structurally untestable by a `super_admin` actor.** Eight cases (QAT-APR-03, 05, 06, 07, 08, 09, 10, and the substantive half of 02) remain Blocked, and no amount of retrying from this account will change that.

Recording it plainly rather than as a pass: the approve/reject state transitions, the mandatory rejection reason, and whether an approved change actually applies downstream are **all still unverified** on a module the test plan rates P1 with zero automated coverage.

## What it would take

Both preconditions must hold at once:

1. **A non-admin, non-chairman actor** — `financial_officer` or `secretary` from the seed set. This campaign deliberately scoped cross-role testing out; that decision is what closes this module off.
2. **A target that trips the precondition** — a house with an existing Development Levy in `house_levy_history`, or a billing profile whose effective-date change affects issued invoices, or any bank-account mutation (which needs no data precondition and is therefore the cheapest route).

**Bank account changes are the practical way in**: `canAutoApprove()` is the only gate on all four of those call sites, so signing in as a `financial_officer` and editing a bank account should create a request immediately, with no data setup at all.

## Side effect on test data

`QAT-01` now has **number_of_plots = 2** (changed from 1 during this attempt). The change applied directly and was not reverted. No Development Levy exists for the house, so there is no financial consequence — but the manifest records it.
