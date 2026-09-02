# QAT — Payments — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-PAY` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, DOM row counts, browser console. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Blocked | Not yet executed |
|---|---|---|---|---|
| 26 | 3 | 2 | 11 | 10 |

Eleven cases are **Blocked**: every create/validation case (QAT-PAY-07 through QAT-PAY-18) depends on the Record Payment form, which does not render at all — see QAT-PAY-D1.

## Results

| ID | Title | Status | Severity | Notes |
|---|---|---|---|---|
| QAT-PAY-01 | Payments list renders | **Pass** | — | 20 rows render with currency formatting. Live data confirmed: "Jan 1, 2026 · Stella Akintunde · ₦10,000.00 · Bank Transfer · Paid", "Dec 1, 2025 · AJEH OGORCHUKWU DAVID · ₦207,000.00 · Bank Transfer", reference `LEGACY-OJO-K-2-2025-12`. Total Collected ₦17,034,053.00. Takes ~10s to populate — see the slow-load note in the smoke report. |
| QAT-PAY-02..05 | Filters, pagination | Not yet executed | — | Filter controls confirmed present (Search Reference, Status, Payment Method, Date From/To, Resident). Exercise deferred. |
| QAT-PAY-06 | Create form renders | **Fail** | **HIGH** | `/payments/new` does not render. See QAT-PAY-D1. |
| QAT-PAY-07..18 | Amount boundaries, required fields, happy path, split payment | **Blocked** | — | Blocked by QAT-PAY-D1 — the form never renders, so no field can be exercised. |
| QAT-PAY-19..21 | Bulk selection, bulk status update, CSV export | Not yet executed | — | |
| QAT-PAY-22 | Bank statement import page | Not yet executed | — | |
| QAT-PAY-23 | Email imports page | Not yet executed | — | |
| QAT-PAY-24 | Reset email imports | **Skipped** | — | Deliberately not executed: globally destructive. Code inspection finding recorded as QAT-SMK-42 in the smoke report. |
| QAT-PAY-25 | Delete QAT payment | **Blocked** | — | No QAT payment could be created, because QAT-PAY-D1 blocks creation. |
| QAT-PAY-26 | Console and network hygiene | **Fail** | **MEDIUM** | Two distinct console errors observed. See QAT-PAY-D2 and the Observations section. |
| — | Payment stat cards | **Fail** | **MEDIUM** | See QAT-PAY-D2. |

## Defects

### QAT-PAY-D1 — Record Payment page crashes; primary payment-entry path unusable  [HIGH]

**Steps to reproduce**

1. Sign in as `super_admin`.
2. Navigate to `/payments/new`, or click "Record Payment" on `/payments`, or the "Record Payment" quick action on `/dashboard`.

**Expected**

The Record Payment form renders.

**Actual**

```
Something went wrong
Functions cannot be passed directly to Client Components unless you explicitly expose it
by marking it with "use server". Or maybe you meant to call this function rather than return it.
  {$$typeof: ..., render: function CreditCard}
                 ^^^^^^^^^^^^^^^^^^^
Error ID: 3256909499
```

**Root cause**

[src/app/(dashboard)/payments/new/page.tsx](src/app/(dashboard)/payments/new/page.tsx) is an async **Server** Component that passes a lucide icon across the RSC boundary:

```tsx
export default async function NewPaymentPage({ searchParams }: {...}) {
    ...
    <EnhancedPageHeader title="Record Payment" description="..." icon={CreditCard} />
```

`EnhancedPageHeader` is defined in `src/components/dashboard/enhanced-stat-card.tsx`, which is `'use client'`. A lucide icon is a `forwardRef` object wrapping a `render` function, and React cannot serialize that from server to client.

This is an isolated regression rather than a systemic pattern. Fifteen pages pass `icon=` to `EnhancedPageHeader`; fourteen of them are Client Components. `/payments/new` is the only Server Component among them.

Because the page needs to stay a Server Component to `await searchParams`, the fix is likely to move the header behind a client boundary rather than adding `'use client'` to the page.

**Impact**

The primary path for recording a resident payment is dead — money-in, the highest-risk module in the risk assessment. Whether the bulk payment sheet on `/payments` still allows entry was not verified, so it is unknown whether a workaround exists.

**GitHub issue**: [#105](https://github.com/meggarmind/RESIDIO/issues/105)

### QAT-PAY-D2 — "Completed" stat card reads 0 whenever every payment is paid  [MEDIUM]

**Steps to reproduce**

1. Navigate to `/payments` and let it fully populate.

**Expected**

With 20 visible records all showing status "Paid", the Completed count should be non-zero.

**Actual**

| Card | Displayed |
|---|---|
| Total Collected | ₦17,034,053.00 ✅ |
| Completed / "Successful transactions" | **0** ❌ |
| Pending / "Awaiting payment" | 0 |
| Overdue / "Requires attention" | 0 |

Confirmed stable across two loads with a 20-second wait. All 20 rows in the table read "Paid".

**Root cause**

[src/app/(dashboard)/payments/page.tsx:85](src/app/(dashboard)/payments/page.tsx:85):

```tsx
<EnhancedStatCard
  title="Completed"
  value={stats.pending_count > 0 ? `${Math.max(0, (paymentsResult?.count || 0) - stats.pending_count)}` : '0'}
/>
```

The count is only computed when `pending_count > 0`; otherwise it hardcodes `'0'`. So the card reads zero precisely in the healthiest state — when nothing is pending. The guard appears to be inverted: the intended fallback for "no pending payments" is presumably the full count, not zero.

**Secondary observation — `overdue` status is unreachable**

The Overdue card can never be non-zero. The status enums disagree:

- `src/types/database.ts:770` — `status: 'paid' | 'pending' | 'failed'`
- `src/lib/validators/payment.ts:3` — `z.enum(['pending', 'paid', 'overdue', 'failed'])`

`getPaymentStats` (`src/actions/payments/get-payment-stats.ts:24-36`) counts `r.status === 'overdue'`, a value the payment_records schema does not admit. The validator will also accept an `'overdue'` status that the database type does not model.

This is distinct from invoice overdue state, which does work — `/billing` correctly reports "₦175,000.00 · 18 overdue invoices". Recorded as MEDIUM: it is a real enum divergence, but the Overdue card reading 0 is arguably correct given the schema, so the defect is the enum drift rather than the display.

**Filed?** No — MEDIUM stays in the register per the campaign's issue policy.

## Observations (not defects)

**Console noise on the payments surface.** Two errors appear repeatedly in the browser console across admin navigation:

- `Internal Next.js error: Router action dispatched before initialization` (`__NEXT_ERROR_CODE: E668`), observed ten times in one session.
- `[AuthProvider] RBAC fetch failed or timed out: RBAC fetch timeout`.

The second is worth a dedicated investigation that this pass did not perform: if the client-side RBAC permission fetch can time out, the question is whether the UI then fails **open** (renders controls the user lacks permission for) or **closed** (hides them). Server-side `authorizePermission()` would still reject the action, so this is unlikely to be an authorization bypass — but it is unverified, and it should be checked rather than assumed.

## Not executed

| ID | Reason |
|---|---|
| QAT-PAY-24 | `resetEmailImports` hard-deletes all email imports, messages, transactions and linked payment records globally. Destructive against shared cloud data. |

## Test data created

None. No QAT payment record could be created — QAT-PAY-D1 blocks the creation path.
