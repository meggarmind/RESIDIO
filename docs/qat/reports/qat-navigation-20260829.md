# QAT — Navigation & Dashboard — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-NAV` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, `/api/search` responses, browser console. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Investigated & cleared | Not yet executed |
|---|---|---|---|---|
| 13 | 7 | 1 | 1 | 4 |

## Results

| ID | Title | Status | Severity | Notes |
|---|---|---|---|---|
| QAT-NAV-01 | Dashboard loads with stat cards | **Pass** | — | Live figures render: `COLLECTION 94% — ₦3,100,000 collected of ₦3,285,000 invoiced`, `ACTION NEEDED 2438 items`, `ESTATE CASH ₦0`, `VERIFIED PAYMENTS ₦0 received this month`. |
| QAT-NAV-02 | Financial health widget | **Pass** | — | Renders `Unpaid Invoice Balance ₦185,000`, `Overdue Invoice Balance ₦175,000`, `Resident Wallet Credits ₦2,800,964`. The `0% COLLECTION` reading was investigated separately — see "Investigated and cleared" below. |
| QAT-NAV-03 | Pending payments widget | **Pass** | — | `2438 NEED ATTENTION — 2251 unverified payments · 187 resident verifications · 0 expiring contacts`. |
| QAT-NAV-04 | Recent activity feed | **Pass** | — | Renders newest-first with relative timestamps: "Aug 19 · Generate Invoice Generation Run · 11 days ago · Processed invoice generation run chunk", then Aug 14, Aug 11, Aug 10, Aug 7. Ordering is correct. |
| QAT-NAV-05 | Smart suggestions | **Pass** | — | Renders an actionable suggestion: "Invoices severely overdue — 17 invoices are 30+ days overdue. Send reminders?" with a "View overdue invoices" link. Consistent with the 18 overdue invoices reported in the status counts (30+ days is a subset). |
| QAT-NAV-06 | Invoice distribution | **Pass** | — | `INVOICE STATUS COUNTS — Overdue 18, Unpaid 19, Partially paid 0, Paid 570, Void 0`. |
| QAT-NAV-07 | Sidebar navigation completeness | **Pass** | — | All groups render: PEOPLE & PROPERTY (Residents, Houses, Contractors & Staff), FINANCIAL (Transactions, Import Statement, Import Email, Invoices & Dues, Generate Invoices, Expenditure), OPERATIONS (Security, Reports, Generate Reports, Financial Overview, Documents, Announcements, Approvals, Capital Projects), SYSTEM (Settings, System). |
| QAT-NAV-09 | Global search | **Fail** | **MEDIUM** | Returns residents and houses correctly, but the payments, contacts and documents segments never return results. See QAT-NAV-D1. |
| QAT-NAV-10 | Global search — no results | **Pass** | — | `/api/search?q=zzzz-no-such-record-qat` returns HTTP 200 with `{"residents":[],"houses":[],"payments":[],"contacts":[],"documents":[]}` — a clean empty result, no error. |
| QAT-NAV-08, 11, 12, 13 | Sidebar link traversal, offline banner, mobile layout, console hygiene | Not yet executed | — | Mobile layout deferred: viewport emulation is unreliable while the Browser pane is hidden. |

## Defects

### QAT-NAV-D1 — Global search never returns payments, security contacts, or documents  [MEDIUM]

**Steps to reproduce**

Query `/api/search` with terms known to exist in the data:

| Query | residents | houses | payments | contacts | documents |
|---|---|---|---|---|---|
| `Stella` | 1 | 0 | **0** | 0 | 0 |
| `Akintunde` | 1 | 0 | **0** | 0 | 0 |
| `FEYIJIMI` | 1 | 0 | **0** | 0 | 0 |
| `Kayode` | 3 | 5 | **0** | 0 | 0 |
| `18A` | 0 | 1 | **0** | 0 | 0 |
| `IBB-1` | 0 | **0** | 0 | 0 | 0 |

**Expected**

"Stella" matches resident *Stella Akintunde*, who has a visible payment record on `/payments` (`Jan 1, 2026 · Stella Akintunde · ₦10,000.00 · Bank Transfer · Paid`). A payments search should return it.

**Actual**

The `payments`, `contacts` and `documents` arrays are empty for every query attempted, while `residents` and `houses` populate correctly. Across six queries, those three segments never returned a single result.

**Secondary observation**

`IBB-1` returns nothing, although it is displayed as the House ID in the first column of `/houses`. The house number `18A` does match. So house search appears to cover the house number but not the displayed short name / ID, meaning an admin searching for the identifier the UI shows them gets no result.

**Confidence and caveat**

The payments/contacts/documents segments are unlikely to be empty by coincidence given 20+ visible payment records, but this was tested through the API rather than the search UI, and the underlying tables for contacts and documents may genuinely be empty in this environment (the Documents page reports 0 documents). The **payments** case is the solid one — matching data demonstrably exists. Recorded as MEDIUM pending confirmation of whether the contacts and documents tables hold any rows at all.

**Filed?** No — MEDIUM stays in the register per the campaign's issue policy.

## Investigated and cleared

### `Financial Health 0% COLLECTION` — harness artifact, not a defect

The dashboard appeared to show two different values for the same metric at the same time:

- Top KPI tile: `COLLECTION 94% — ₦3,100,000 collected of ₦3,285,000 invoiced`
- Financial Health widget: `Financial Health 0% COLLECTION — ₦3,100,000 collected`

This looked like a serious data-integrity defect on the primary admin screen — a headline financial figure reading 0% when collection is actually 94%. It is not.

Both components consume the **same** `collectionRate` field from the same `getAdminDashboardSnapshot()` response. The server computes it correctly at [get-enhanced-dashboard-stats.ts:419](src/actions/dashboard/get-enhanced-dashboard-stats.ts:419):

```ts
const collectionRate = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;
```

3,100,000 / 3,285,000 = 94.4%, which is what the top tile renders directly.

The difference is purely in presentation. The Financial Health widget renders through `ProgressRing`, which **animates from zero**:

```ts
const [progress, setProgress] = useState(0);
...
rafRef.current = requestAnimationFrame(animate);
...
{showValue && <span className="...">{Math.round(progress)}%</span>}
```

`requestAnimationFrame` is throttled or suspended entirely in a tab that is not compositing frames — which is exactly the state of the Browser pane during this run. The animation never advances, so `progress` stays at its initial `0` and the ring reports "0%".

A real user with a visible window sees the ring animate to 94%. **No defect. Not filed.**

This is recorded rather than quietly dropped because it is the clearest example of why every sub-agent finding in this campaign was re-verified before being reported: it was a confident, well-evidenced, plausible-looking bug that would have wasted a developer's afternoon.

## Not yet executed

| ID | Reason |
|---|---|
| QAT-NAV-12 | Mobile layout at 375×812 — viewport emulation is unreliable while the pane is hidden, and any layout finding would be unverifiable without a screenshot. Deferred rather than guessed at. |
| QAT-NAV-08, 11, 13 | Session ended before these were reached. |

## Test data created

None. This module is read-only.
