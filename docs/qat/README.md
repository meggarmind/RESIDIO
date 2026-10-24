# QAT — Manual QA Campaign

Browser-driven, page-by-page functional QA of the Residio **Admin Dashboard**, executed by driving the real UI as a human operator would.

| | |
|---|---|
| **Campaign** | 2026-08-29 |
| **Build** | `43579eb` (master) |
| **Environment** | `http://localhost:3000` → cloud Supabase |
| **Branch** | `qa/manual-qat-20260829`, worktree at `C:/projects/RESIDIO-qat`, based on `master` (`43579eb`) |
| **Actors** | super_admin (`admin@residio.test`), unauthenticated visitor |
| **Status** | Session 2 complete — 20 defects filed; remaining gaps are stated, not hidden |

## Contents

| Document | Purpose |
|---|---|
| [test-plan.md](test-plan.md) | Scope, methodology, risk assessment, data policy, and all 225 numbered test scripts |
| [test-data-manifest.md](test-data-manifest.md) | Every record created during the campaign, for later pruning |
| [reports/](reports/) | Per-module execution reports with results and evidence |

## Module reports

| Module | Report | Total | Pass | Fail | Blocked / Deferred | Not yet run |
|---|---|---|---|---|---|---|
| Authentication & session | [qat-auth](reports/qat-auth-20260829.md) | 14 | 12 | 2 | 0 | 0 |
| Residents | [qat-residents](reports/qat-residents-20260829.md) | 28 | 8 | 0 | 0 | 20 |
| Payments | [qat-payments](reports/qat-payments-20260829.md) | 26 | 3 | 2 | 12 | 9 |
| Smoke pass | [qat-smoke](reports/qat-smoke-20260829.md) | 44 | 39 | 2 | 0 | 3 |
| Navigation & dashboard | [qat-navigation](reports/qat-navigation-20260829.md) | 13 | 7 | 1 | 1 | 4 |
| Houses | [qat-houses](reports/qat-houses-20260829.md) | 19 | 11 | 1 | 0 | 7 |
| Billing & wallet | [qat-billing](reports/qat-billing-20260829.md) | 28 | 8 | 3 | 7 | 10 |
| Security | [qat-security](reports/qat-security-20260829.md) | 28 | 15 | 5 | 6 | 2 |
| Approvals | [qat-approvals](reports/qat-approvals-20260829.md) | 11 | 3 | 0 | 8 | 0 |
| Reports & analytics | [qat-reports](reports/qat-reports-20260829.md) | 14 | 8 | 1 | 0 | 5 |
| Cross-cutting | [qat-cross-cutting](reports/qat-cross-cutting-20260829.md) | — | — | 1 | — | — |
| **Total** | | **225** | **114** | **18** | **34** | **59** |

## Defect register

Severity definitions follow `docs/validation/README.md`. **Every confirmed defect is filed as a GitHub issue**, labelled `bug` + `needs-triage`.

| ID | Severity | Summary | Module | Issue |
|---|---|---|---|---|
| QAT-AUTH-10-D1 | **HIGH** | Seven admin routes (`/documents`, `/announcements`, `/personnel`, `/projects`, `/expenditure`, `/analytics`, `/notifications`) are missing from the middleware route table and render to unauthenticated visitors. No data leaked — RLS holds — but the same gap removes the permission check for under-privileged authenticated roles. | AUTH | [#104](https://github.com/meggarmind/RESIDIO/issues/104) |
| QAT-PAY-D1 | **HIGH** | `/payments/new` crashes to an error boundary — a lucide icon is passed from a Server Component to a Client Component. The primary payment-entry path is unusable, blocking 12 downstream test cases. | PAY | [#105](https://github.com/meggarmind/RESIDIO/issues/105) |
| QAT-SMK-D1 | **HIGH** | `/settings/system` and `/settings/system/health` crash in `<CronHealthCard>` — missing optional chaining on a fallback term at `cron-health-card.tsx:152`. Disables the very page that would reveal a cron outage. | SMK | [#106](https://github.com/meggarmind/RESIDIO/issues/106) |
| QAT-PAY-D2 | MEDIUM | The "Completed" stat card on `/payments` hardcodes `'0'` whenever `pending_count === 0` — so it reads zero precisely when every payment is paid. Includes a secondary enum divergence: `'overdue'` exists in the payment validator but not in the database type. | PAY | [#114](https://github.com/meggarmind/RESIDIO/issues/114) |
| QAT-SMK-42 | MEDIUM | `resetEmailImports` has no `authorizePermission()` guard despite globally deleting all email imports, messages, transactions and linked payment records. Only RLS gates it. It appears to have inherited a directory-wide allowlist exemption intended for cron/webhook flows, which this UI-triggered admin action does not fit. | SMK | [#116](https://github.com/meggarmind/RESIDIO/issues/116) |
| QAT-HSE-D1 | **HIGH** | House detail pages report hardcoded `Financial Status: Clear — No pending payments` and `Last Inspection 2025-12-01 — Compliance verified` on all 179 properties. Verified against house 18A, which has seven unpaid invoices. `pendingDues={0}` and the date are literals at `houses/[id]/page.tsx:596`, rendered beside two correctly-wired cards. | HSE | [#109](https://github.com/meggarmind/RESIDIO/issues/109) |
| QAT-BIL-D3 | **HIGH** | No admin UI to credit or debit a resident wallet. `WalletAdjustmentDialog` is reachable only through `wallet-balance.tsx`, which nothing imports; `creditWallet`/`debitWallet` have zero callers, while `BILLING_MANAGE_WALLETS` guards the missing capability. ₦2,800,964 sits in wallets with no correction path. Blocked 5 test cases. | BIL | [#120](https://github.com/meggarmind/RESIDIO/issues/120) |
| QAT-SEC-D2 | **HIGH** | Security vehicles (7 hooks), visitor analytics (6 hooks) and unflag are implemented in the action/hook layer with no UI — 22 orphaned hooks in `use-security.ts`. Contradicts user stories SG-02 and AD-04. A flagged access log cannot be unflagged. | SEC | [#121](https://github.com/meggarmind/RESIDIO/issues/121) |
| QAT-SEC-D3 | MEDIUM | A code labelled "Permanent" expires after the category's `default_validity_days` — 23 hours for a Visitor — and is badged "Expiring Soon" at creation. `generateAccessCode` computes expiry regardless of `code_type`. | SEC | [#122](https://github.com/meggarmind/RESIDIO/issues/122) |
| QAT-SEC-O1 | MEDIUM | The same contact shows "Expired" in the list and "Active" on its detail page. Reproduced in a second session. The Status filter's "Expired" option also disagrees with the "Show Expired" toggle. | SEC | [#123](https://github.com/meggarmind/RESIDIO/issues/123) |
| QAT-SEC-O3 | LOW | `/security/contacts` default view renders a blank table with no empty state while a "Show Expired (2)" toggle shows records exist. Filter-driven empties render correctly — the earlier broader claim was refuted. | SEC | [#124](https://github.com/meggarmind/RESIDIO/issues/124) |
| QAT-AUTH-14 | LOW | `/auth/verify-2fa` renders a blank page when unauthenticated — no form, no error, no redirect. The authenticated path correctly redirects to `/dashboard`, so only the no-session case is unhandled. | AUTH | [#125](https://github.com/meggarmind/RESIDIO/issues/125) |
| QAT-SEC-D1 | MEDIUM | The Nigerian phone regex in `security-contact.ts:15` is declared and never referenced — dead code. Only `min(10)` is enforced, so `+1234567890` and `0912345678` create live security contacts. | SEC | [#112](https://github.com/meggarmind/RESIDIO/issues/112) |
| QAT-HSE-O1 | LOW | Two pre-existing house records render corrupted characters in their identifiers (`IBB-3?F?`, `KOA-10F-?`), so they cannot be typed or searched for. Likely legacy import encoding rather than an application fault. | HSE | [#119](https://github.com/meggarmind/RESIDIO/issues/119) |
| QAT-BIL-D1 | MEDIUM | The invoice-status donut sums five overlapping buckets as if they partition. `overdue` is a derived subset of `unpaid`, so 18 invoices are counted twice — the chart totals 607 against a true count of 589, and every segment is drawn against an inflated denominator. | BIL | [#110](https://github.com/meggarmind/RESIDIO/issues/110) |
| QAT-BIL-D2 | MEDIUM | `/billing` "Paid 12 / Unpaid 8" cards are current-page counts labelled "Completed payments" / "Pending invoices" with no page qualifier, beside a genuinely all-time "Total Invoices 589". The estate actually has 570 paid. | BIL | [#111](https://github.com/meggarmind/RESIDIO/issues/111) |
| QAT-XC-D1 | MEDIUM | A 15-second RBAC fetch timeout is swallowed and the resulting empty-permission profile is cached in `sessionStorage` for 5 minutes — silently stripping every permission-gated control with no user-facing message. Fails closed, so not a security hole. | XC | [#113](https://github.com/meggarmind/RESIDIO/issues/113) |
| QAT-RPT-D1 | LOW | `/analytics/announcements` renders nothing below the period selector when there is no data, where its sibling page shows zero cards and an explicit empty state. | RPT | [#117](https://github.com/meggarmind/RESIDIO/issues/117) |
| QAT-SEC-O2 | LOW | A one-time code used once reports "Access code has been revoked" rather than "already used" — the sentence a guard reads while deciding about the person in front of them. | SEC | [#118](https://github.com/meggarmind/RESIDIO/issues/118) |
| QAT-NAV-D1 | MEDIUM | Global search never returns results for payments, security contacts or documents, while residents and houses work. Also, house search matches the house number but not the House ID shown in the UI. | NAV | [#115](https://github.com/meggarmind/RESIDIO/issues/115) |

## Build drift during the campaign

**The code under test changed while the campaign was running, and execution was halted because of it.**

At start, `HEAD` was `43579eb`. By the end it was `999ce01` — three commits landed mid-run (`192a810`, `93ed5d0`, `999ce01`) — and the working tree carried uncommitted changes to `src/middleware.ts`, `src/lib/auth/action-roles.ts`, `src/app/auth/callback/route.ts` and `src/types/database.ts` from a concurrent session.

That in-progress work introduces a profile `approval_status` gate:

```ts
if (status === 'rejected' || status === 'suspended') { await supabase.auth.signOut(); ... }
...
return NextResponse.redirect(new URL('/pending-approval', request.url));
```

The `admin@residio.test` account does not satisfy the new gate, so **every admin route now redirects to `/pending-approval`**, which ended browser access mid-way through the Security module. The session profile was confirmed still valid at that point (`role_name: super_admin`, full permissions array, `/api/search` returning data) — this is a work-in-progress side effect, **not a defect, and not filed**.

Consequences to keep in mind when reading these reports:

- Findings are anchored to `43579eb` and were each verified against source at the time. Anything touching auth, middleware, or route protection should be re-checked against current `HEAD` before acting.
- **[#104](https://github.com/meggarmind/RESIDIO/issues/104) still stands as of the diff inspected** — the concurrent middleware work adds the approval gate but leaves `routePermissionConfig` unchanged, so the seven ungated routes remain ungated.
- Remaining Security cases, the deferred unauthenticated AUTH cases, and all Billing write operations could not be reached.

## Method notes

Testing drives the real application in a browser. Assertions are made against the accessibility tree, `location.pathname`, extracted page text, the browser console, and the network log.

### Two limitations worth stating plainly

**1. Screenshots are unavailable.** The Browser pane was not displayed during this run, so the page never composites frames and screenshot capture times out. A knock-on effect is that coordinate-based clicks do not hit their targets — elements must be focused via a JS selector before real keystrokes are sent, and forms submitted through the native `requestSubmit()`. Field values are read back from the DOM and confirmed before every submission.

This caused three false observations in the AUTH module, all diagnosed and retracted rather than reported. Displaying the Browser pane would restore full click and screenshot fidelity.

**2. Slow pages look like broken pages.** The parallel sweep agents used a 3-second settle wait. Six pages were reported as "stuck loading" that in fact render correctly given 10–20 seconds on this dev server.

Every anomaly reported by an agent was therefore **re-verified directly, with a 15–20 second wait, before being recorded as a defect**. Six claimed failures did not survive that re-check and are documented as retracted in the relevant reports. This is the single biggest methodological risk in a sweep of this kind, and it is why nothing here is filed on a sub-agent's word alone.

## Test data

All records created carry the prefix `QAT-20260829`. No pre-existing record was deleted at any point. See [test-data-manifest.md](test-data-manifest.md).

Operations deliberately **not** executed because they are destructive against shared cloud data: `pruneSystemData`, `resetEmailImports`, `promoteWhatsAppPilotToEstate`, enabling maintenance mode, and estate-wide invoice generation. Each is recorded as Skipped in its module report with the reason, so the coverage gap is explicit rather than silent. Maintenance mode was confirmed still disabled at the end of the run.

## Next session

Run against a **stable checkout** — ideally a dedicated branch or a local database — so the build cannot move underneath the campaign again.

1. Restore admin access (the `approval_status` gate now blocks `admin@residio.test`), or re-run once that work has landed.
2. **Billing & Wallet write operations — the largest gap.** Wallet credit, debit, allocation across invoices, batch reversal, statements, invoice corrections and disputes are all untested on the campaign's highest-risk module.
3. **Approvals state transitions** — 8 of 11 cases are Blocked and **cannot be unblocked by a super_admin**. `canAutoApprove()` returns true for `role === 'admin' || 'chairman'`, and all six approval producers check it first. Sign in as `financial_officer` and edit a bank account: that path has no data precondition, so a request appears immediately.
4. Remaining Security cases: regenerate/revoke codes, time-limited windows, flag/unflag, share pass, vehicles, CSV export, visitor analytics. Re-verify QAT-SEC-O1 (list vs detail status disagreement) and QAT-SEC-O3.
5. ~~Deferred unauthenticated AUTH cases~~ — **done**. All eight executed; the module is now fully covered and clean apart from [#125](https://github.com/meggarmind/RESIDIO/issues/125).
6. Re-run the 12 Payments cases blocked by [#105](https://github.com/meggarmind/RESIDIO/issues/105).
7. Mobile layout checks — need a visible Browser pane.
