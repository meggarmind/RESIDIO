# Residio — Manual QA Test Plan (QAT)

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-08-29 |
| **Build under test** | `43579eb` (master) |
| **Environment** | `http://localhost:3000` (Next.js dev) against **cloud** Supabase |
| **Executed by** | Claude Code, driving the in-app browser as a human user |
| **Test type** | Manual functional / exploratory, black-box, risk-based |

---

## 1. Purpose and scope

Residio has automated coverage — Vitest unit + integration suites and eight Playwright specs covering phases 1–5 (auth, dashboard shell, residents/houses, payments/billing) at happy-path depth. It has **no** manual, page-by-page functional QA pass, and no QA artifacts of any kind.

This plan closes that gap for the **Admin Dashboard**, which `AGENTS.md` and `CLAUDE.md` name as the sole forward-work surface.

### In scope

- **Deep, scripted coverage** of nine core modules: Auth, Navigation/Dashboard, Residents, Houses, Payments, Billing & Wallet, Security, Approvals, Reports & Analytics.
- **Smoke coverage** of the remaining admin surface: Announcements, Documents, Personnel, Projects, Expenditure, Notifications, and the `/settings/**` tree.
- Cross-cutting non-functional checks: browser console errors, failed network calls, React hydration warnings, mobile layout on primary pages.

### Out of scope

| Excluded | Reason |
|---|---|
| Resident Portal (`/portal/**`, 13 pages) | Explicitly not planned for rollout (`AGENTS.md`); its Playwright suite is deliberately `describe.skip`. |
| Cross-role RBAC boundary testing (chairman / financial_officer / security_officer) | Scoped out for this pass by agreement; only `super_admin` and unauthenticated actors are exercised. |
| Third-party delivery paths (Paystack charges, Resend email, WhatsApp sends, Termii SMS, Gmail OAuth) | No provider keys are configured in this environment. Tests assert **graceful degradation**, not delivery. |
| Load, stress, and performance benchmarking | Not a functional QA concern for this pass. |
| Penetration testing / security scanning | Covered separately by the `/security-review` and `qa-director` tooling. |

---

## 2. Actors

| Actor | Credentials | Represents |
|---|---|---|
| **Unauthenticated visitor** | — | Anyone hitting the app without a session. Used for route-protection tests. |
| **Super Administrator** | `admin@residio.test` / `password123` | `super_admin` role — holds every permission in every module, including `system.*`. |

Roles present in the system but **not** exercised this pass: `chairman`, `vice_chairman`, `financial_officer`, `security_officer`, `secretary`, `project_manager`, `resident`.

Personas referenced from `docs/user-stories.md`: Estate Administrator (`AD-nn`), Resident (`RS-nn`), Security Guard (`SG-nn`), Secondary Resident (`SS-nn`). Where a script validates a user story, the story ID is cited.

---

## 3. Test methodology

Risk-based black-box testing executed through the real UI, in a real browser, as a human operator would.

### Techniques applied

| Technique | Applied to |
|---|---|
| **CRUD lifecycle testing** | Every entity module: create, read, list/filter, update, archive. Persistence is re-asserted after a full page reload, not just from optimistic UI state. |
| **Equivalence partitioning** | Enum inputs — payment method (cash / bank_transfer / pos / cheque / online), status (pending / paid / overdue / failed), resident roles, property status. |
| **Boundary value analysis** | Numeric and length limits: amount = 0, negative, decimal, very large; number of plots = 0 and 1; `short_name` at 50 and 51 chars; bank account number at 9, 10, 12, 13 digits. |
| **Negative testing** | Required-field omission, malformed email, Nigerian phone regex, split-payment sum mismatch, invalid UUID in URL params. |
| **State-transition testing** | Invoice pending → paid → overdue; resident active → inactive → archived; access code active → used → expired → revoked; approval pending → approved/rejected; house occupied ⇄ vacant. |
| **Authorization testing** | Every protected route prefix requested without a session must redirect to `/login`. |
| **Cross-field / business-rule testing** | Corporate-entity role restrictions, sponsor requirement for staff roles, one-home policy, move-out financial clearance. |
| **Exploratory charters** | A timeboxed free-form pass per module after the scripted cases, to surface what the scripts did not anticipate. |

### Cross-cutting checks (applied on every page visited)

1. Page reaches a rendered state without an error boundary or 500.
2. Browser console contains no error-level messages. React hydration mismatches count as failures.
3. No network request returns 4xx or 5xx.
4. Primary interactive controls are reachable and labelled in the accessibility tree.

### Entry criteria

- Dev server running and reachable at `http://localhost:3000`.
- `admin@residio.test` can authenticate against the cloud database.
- Baseline `npm test` state known.

### Exit criteria

- Every scripted case has a recorded status: **Pass**, **Fail**, **Blocked**, or **Skipped**.
- Every Fail has a severity, reproduction steps, and evidence.
- Every CRITICAL and HIGH defect has a filed GitHub issue.
- All created test data is recorded in `test-data-manifest.md`.

### Severity definitions

Matching `docs/validation/README.md`:

| Severity | Meaning | Action |
|---|---|---|
| **CRITICAL** | Data loss, security or authorization bypass, exposed secrets, or a core workflow that cannot complete at all. | Fix immediately; GitHub issue filed. |
| **HIGH** | A major function is broken or produces wrong data; no reasonable workaround. | Fix before release; GitHub issue filed. |
| **MEDIUM** | Function works but with a defect, or a workaround exists. Confusing UX, missing validation feedback. | Fix in current phase; register only. |
| **LOW** | Cosmetic, copy, minor layout, or nice-to-have. | Backlog; register only. |

### Status definitions

| Status | Meaning |
|---|---|
| **Pass** | Actual result matches expected result in full. |
| **Fail** | Actual result deviates from expected. Carries a severity. |
| **Blocked** | Could not execute because a prerequisite failed or the feature is unreachable. |
| **Skipped** | Deliberately not executed — destructive, or requires an unconfigured integration. Reason always recorded. |

---

## 4. Test data policy

The backend is a **shared cloud database**. Every record created during this campaign carries the prefix `QAT-20260829` so it is greppable, identifiable, and prunable later. **No pre-existing record is ever deleted.**

| Entity | Naming convention |
|---|---|
| Resident | First name `QAT`, last name `Tester-20260829-01` (incrementing) |
| House | House number `QAT-01` (incrementing), on an existing street |
| Security contact | `QAT-20260829 Visitor 01`, phone `08012345678` |
| Document | `QAT-20260829 Test Document` |
| Personnel / Project / Expense | `QAT-20260829 <name>` |
| Payment / Invoice | Reference or description contains `QAT-20260829` |
| Street / House type / Category | `QAT-20260829 <name>` |

Everything created is logged in [test-data-manifest.md](test-data-manifest.md) with its database ID.

### Do-not-execute list

These operations are destructive against shared data. They are **scripted as Skipped** with the reason recorded, so the coverage gap is explicit rather than silent.

| Operation | Location | Why excluded |
|---|---|---|
| `pruneSystemData` | `/settings/system/data` | Hard-deletes audit logs older than 6 months, notifications, and search logs. Irreversible. |
| `resetEmailImports` | `/payments/email-imports` | Hard-deletes **all** email imports, messages, transactions, and any payment records linked to them — globally when called without a `userId`. |
| `promoteWhatsAppPilotToEstate` | `/settings/whatsapp` | One-way. Expands WhatsApp messaging from the pilot allowlist to the entire estate; cannot be reverted through the UI. |
| Enable maintenance mode | `/settings/system/maintenance` | Redirects every non-`super_admin` user app-wide to `/maintenance` until manually disabled. |
| Estate-wide `generateMonthlyInvoices` | `/billing/generate` | Would create hundreds of real invoices. The **preview** step is tested; execution stops before confirm. |
| `deletePayment` / `bulkUpdatePayments` on pre-existing rows | `/payments` | Hard delete with no soft-delete fallback. Only QAT-created rows are touched, with the selection visually confirmed first. |
| Cron endpoints (`/api/cron/*`) | direct HTTP | Trigger the same bulk operations outside the UI approval flow. `CRON_SECRET` is unset here in any case. |

---

## 5. Risk assessment

Modules are prioritised by business impact against existing automated coverage — good coverage lowers the likelihood of undetected defects.

| Module | Business impact | Existing automated coverage | Risk | Priority |
|---|---|---|---|---|
| Billing & Wallet | **High** — money owed, money held | Partial (`payments-billing.spec.ts`, `wallet-batches.spec.ts`) | **High** | P1 |
| Payments | **High** — money received | Partial (`payments-billing.spec.ts`) | **High** | P1 |
| Security | **High** — physical estate access | **None** | **High** | P1 |
| Approvals | Medium-High — gates billing and property changes | **None** | **High** | P1 |
| Residents | High — the core registry everything hangs off | Partial (`residents-houses.spec.ts`) | Medium | P2 |
| Houses | High — occupancy drives billing | Partial (`residents-houses.spec.ts`) | Medium | P2 |
| Auth & Session | **High** — gates everything | Good (`auth.spec.ts`) | Medium | P2 |
| Reports & Analytics | Medium — decision support | **None** | Medium | P2 |
| Navigation / Dashboard | Medium — the entry surface | Good (`dashboard.spec.ts`) | Low | P3 |
| Settings tree | Medium — misconfiguration is quiet and wide-reaching | **None** | Medium | P3 (smoke) |
| Announcements / Documents / Personnel / Projects / Expenditure | Low-Medium | **None** | Low-Medium | P3 (smoke) |

---

## 6. Test scripts

Each case lists **Preconditions → Steps → Expected result**. The `Ref` column cites what motivated the case: a user story (`AD-01`), a `docs/feature-inventory.md` row, a validator file, or `EXPLORATORY`.

---

### 6.1 AUTH — Authentication, session, and route protection

Actor: unauthenticated, then super_admin. Routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/verify-2fa`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-AUTH-01 | Login page renders | Navigate to `/login` with no session. | Email and password fields, submit button, and links to register / forgot-password are present. No console errors. | `auth.spec.ts` TC1.1 |
| QAT-AUTH-02 | Login rejects empty submission | On `/login`, click submit with both fields blank. | Inline validation blocks submission; no navigation occurs. | `src/lib/validators` |
| QAT-AUTH-03 | Login rejects malformed email | Enter `not-an-email` and any password, submit. | Email-format validation message shown; no auth request fired. | Boundary/negative |
| QAT-AUTH-04 | Login rejects wrong password | Enter `admin@residio.test` with `wrongpassword`, submit. | Error message displayed; stays on `/login`; no session created. | `auth.spec.ts` TC1.3 |
| QAT-AUTH-05 | Login rejects unknown account | Enter `nobody-qat@residio.test` / `password123`. | Generic credential error. Message must not disclose whether the account exists (user-enumeration check). | Security |
| QAT-AUTH-06 | Valid super_admin login | Enter `admin@residio.test` / `password123`, submit. | Redirects to `/dashboard` within timeout; user menu shows the admin identity. | AD-01 |
| QAT-AUTH-07 | Session persists across reload | After login, hard-reload `/dashboard`. | Remains authenticated; no bounce to `/login`. | EXPLORATORY |
| QAT-AUTH-08 | Authenticated user redirected away from `/login` | While logged in, navigate to `/login`. | Redirects to `/dashboard`. | `src/middleware.ts` |
| QAT-AUTH-09 | Sign-out clears session | Open user menu, sign out, then navigate to `/dashboard`. | Lands on `/login`; protected content is not rendered. | `dashboard.spec.ts` |
| QAT-AUTH-10 | Unauthenticated route protection sweep | With no session, request each of: `/dashboard`, `/residents`, `/houses`, `/payments`, `/billing`, `/security`, `/reports`, `/approvals`, `/documents`, `/announcements`, `/settings`, `/settings/roles`, `/settings/system`, `/approvals`, `/personnel`, `/projects`, `/expenditure`. | Every one redirects to `/login`. Any route that renders content is a **CRITICAL** authorization bypass. | `src/middleware.ts` |
| QAT-AUTH-11 | Register page renders and validates | Navigate to `/register`; submit blank, then with mismatched or weak password. | Page renders; validation messages appear for each violation. | EXPLORATORY |
| QAT-AUTH-12 | Forgot-password page behaviour | Navigate to `/forgot-password`; submit a malformed email, then a well-formed one. | Malformed is rejected inline. Well-formed shows a neutral confirmation that does not reveal whether the address is registered. | Security |
| QAT-AUTH-13 | Reset-password page without token | Navigate to `/reset-password` with no token. | Renders an error or redirects; does not present a usable reset form. | Negative |
| QAT-AUTH-14 | 2FA verification page reachable | Navigate to `/auth/verify-2fa` directly. | Renders without crashing, or redirects safely. No unhandled exception. | EXPLORATORY |

---

### 6.2 NAV — Dashboard shell and navigation

Actor: super_admin. Route: `/dashboard`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-NAV-01 | Dashboard loads with stat cards | Navigate to `/dashboard`. | Stat cards render with numeric values (not skeletons or `NaN`/`undefined`). | `dashboard.spec.ts` TC2.1 |
| QAT-NAV-02 | Financial health widget | Inspect the financial-health section. | Renders collection-rate / outstanding figures; values are numeric and internally consistent. | `getDashboardFinancialHealth` |
| QAT-NAV-03 | Pending payments widget | Inspect pending-payments section. | Lists pending items or an explicit empty state. No raw error text. | `getDashboardQuickStats` |
| QAT-NAV-04 | Recent activity feed | Inspect the recent-activity section. | Shows recent audited actions with timestamps in a sane order (newest first). | AD-01 |
| QAT-NAV-05 | Smart suggestions | Inspect the smart-suggestions panel. | Renders suggestions or an empty state; any action link resolves to a real route. | `getSmartSuggestions` |
| QAT-NAV-06 | Invoice distribution chart | Inspect the invoice distribution widget. | Chart renders; the legend/segments match the underlying counts. | `getDashboardInvoiceDistribution` |
| QAT-NAV-07 | Sidebar navigation completeness | Hover the collapsed sidebar to expand; enumerate links. | Every module reachable; labels legible when expanded. | `expandSidebar` helper |
| QAT-NAV-08 | Every sidebar link resolves | Click through each sidebar destination. | Each loads its page without 404 or error boundary. | EXPLORATORY |
| QAT-NAV-09 | Global search | Use the global search control with a known resident name. | Returns matching results; selecting one navigates to that record. | `/api/search` |
| QAT-NAV-10 | Global search — no results | Search for `zzzz-no-such-record-qat`. | Explicit empty state, not a spinner or a crash. | Negative |
| QAT-NAV-11 | Offline banner absent when online | Load `/dashboard` normally. | The offline banner is not shown while connectivity is fine. | `admin-offline.spec.ts` |
| QAT-NAV-12 | Mobile layout | Resize to 375×812 and reload `/dashboard`. | No horizontal overflow; mobile nav toggle present and operable. | `dashboard.spec.ts` mobile |
| QAT-NAV-13 | Console and network hygiene | Read console errors and non-2xx requests after full load. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.3 RES — Residents

Actor: super_admin. Routes: `/residents`, `/residents/new`, `/residents/[id]`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-RES-01 | Residents list renders | Navigate to `/residents`. | Table renders with rows; KPI strip shows counts and an active percentage. | `residents-houses.spec.ts` |
| QAT-RES-02 | Search by name | Type a known surname into the search box. | List narrows to matches; clearing restores the full list. | EXPLORATORY |
| QAT-RES-03 | Filter by status | Apply each status filter in turn. | Result set changes coherently; the count reflects the filter. | Equivalence partitioning |
| QAT-RES-04 | Pagination | Page forward and back. | Different rows per page; no duplicates across pages; page indicator tracks. | EXPLORATORY |
| QAT-RES-05 | Create form renders all fields | Navigate to `/residents/new`. | Name, contact, role, corporate, and house-assignment fields render with labels. | `residentFormSchema` |
| QAT-RES-06 | Create rejects missing required fields | Submit blank. | Validation errors on `first_name` and `last_name` at minimum; no record created. | `residentFormSchema` |
| QAT-RES-07 | Create rejects malformed email | Enter `bad-email`, submit. | Email-format error shown. | `residentFormSchema` |
| QAT-RES-08 | Create rejects short phone | Enter a 5-digit phone. | Minimum-length error (min 10). | `residentFormSchema` |
| QAT-RES-09 | Create resident happy path | Create `QAT / Tester-20260829-01`, role `tenant`, valid email and phone. | Record saves; redirects to the detail or list page; the resident appears in the list after reload. | AD-01 |
| QAT-RES-10 | Auto-generated resident code | Open the created resident's detail page. | A `resident_code` is present and is a 6-digit numeric value. | feature-inventory |
| QAT-RES-11 | Corporate entity requires company name | Toggle corporate on, leave company name blank, submit. | Validation blocks; company name is required for corporate entities. | `residentFormSchema` |
| QAT-RES-12 | Corporate role restriction | With corporate on, attempt role `resident_landlord`. | Rejected — corporate entities are limited to `non_resident_landlord`, `tenant`, `developer`. | `residentFormSchema` |
| QAT-RES-13 | Sponsor required for staff roles | Choose role `domestic_staff` with no sponsor, submit. | Validation requires a sponsor resident. | `residentFormSchema` |
| QAT-RES-14 | Resident detail page sections | Open the detail page. | Renders linked houses, wallet balance, payment history, security contacts, and contact-verification status without error. | EXPLORATORY |
| QAT-RES-15 | Edit resident persists | Change the phone number, save, then reload. | New value persists after reload. | CRUD |
| QAT-RES-16 | Assign house | Assign the QAT resident to the QAT house. | Assignment succeeds; the house appears under linked houses. | AD-01 |
| QAT-RES-17 | One-home policy enforcement | Attempt to assign a second residency-role house to the same resident. | Blocked with a clear message, or permitted per documented rule — record which. | `validateHouseAssignment` |
| QAT-RES-18 | Unassign house | Remove the house assignment. | Assignment removed; house occupancy updates accordingly. | CRUD |
| QAT-RES-19 | Household members | Add a household member to the QAT resident. | Member is created and listed. | RS-04 |
| QAT-RES-20 | Wallet adjustment dialog | Open the wallet adjustment dialog; inspect without committing, then credit a small QAT-tagged amount. | Dialog validates amount; credit reflects in wallet balance and transaction list. | AD-03 |
| QAT-RES-21 | Payment aliases | Open payment aliases; add `QAT-20260829 Alias`. | Alias saves and lists; name length 2–100 enforced. | `import.ts` validator |
| QAT-RES-22 | Status change active → inactive | Change resident status to inactive. | Status updates and persists; list filter reflects it. | State transition |
| QAT-RES-23 | Contact verification trigger | Trigger email verification for the QAT resident. | Given Resend is unconfigured, the UI reports a clear failure or queued state — it must not silently claim success. | RS-05 |
| QAT-RES-24 | Move-out wizard opens | Open the move-out wizard for the QAT resident. | Wizard renders its clearance step, showing outstanding balance. Do not complete. | RS-06 |
| QAT-RES-25 | Move-out blocked with debt | With an outstanding invoice, inspect the clearance step. | Clearance reports the outstanding amount and blocks confirmation. | feature-inventory |
| QAT-RES-26 | Archive resident | Archive a QAT-created resident. | Soft-deletes (status `archived`); active house assignments deactivate; record still retrievable. | `delete-resident.ts` |
| QAT-RES-27 | Invalid resident ID in URL | Navigate to `/residents/00000000-0000-0000-0000-000000000000`. | Graceful not-found state, not an unhandled exception. | Negative |
| QAT-RES-28 | Console and network hygiene | Check console and network across residents pages. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.4 HSE — Houses

Actor: super_admin. Routes: `/houses`, `/houses/new`, `/houses/[id]`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-HSE-01 | Houses list renders | Navigate to `/houses`. | Table renders; occupancy-rate KPI present and numerically plausible. | `residents-houses.spec.ts` |
| QAT-HSE-02 | Search and filter | Search by house number; apply a street filter. | Results narrow correctly; clearing restores. | EXPLORATORY |
| QAT-HSE-03 | Create form renders | Navigate to `/houses/new`. | House number, street select, house type, plots, status fields render. | `houseFormSchema` |
| QAT-HSE-04 | Create rejects blank house number | Submit blank. | Required-field error on house number. | `houseFormSchema` |
| QAT-HSE-05 | Create rejects missing street | Submit without selecting a street. | Street is required and must be a valid existing street. | `houseFormSchema` |
| QAT-HSE-06 | Plots boundary: zero | Enter `0` plots. | Rejected — minimum is 1. | Boundary value |
| QAT-HSE-07 | Plots boundary: one | Enter `1` plot. | Accepted. | Boundary value |
| QAT-HSE-08 | Short name 50-char boundary | Enter exactly 50 characters, then 51. | 50 accepted; 51 rejected. | `houseFormSchema` |
| QAT-HSE-09 | Create house happy path | Create house `QAT-01` on an existing street, 1 plot, status vacant. | Saves; appears in the list after reload. | AD-01 |
| QAT-HSE-10 | Property status equivalence | Set each of occupied / vacant / under_renovation / under_construction. | Each accepted and displayed with the right badge. | Equivalence partitioning |
| QAT-HSE-11 | House detail page sections | Open `QAT-01` detail. | Residents, payment status, yearly payment table, ownership history all render. | EXPLORATORY |
| QAT-HSE-12 | Occupancy flips on assignment | Assign the QAT resident, then reload the house. | Occupancy status reflects the active resident. | feature-inventory |
| QAT-HSE-13 | Occupancy flips on removal | Remove all residents, reload. | Status flips to vacant. | feature-inventory |
| QAT-HSE-14 | Ownership history records events | After assign/unassign, open ownership history. | History entries exist with dates and event descriptions. | AD-01 |
| QAT-HSE-15 | Yearly payment summary | Inspect the yearly payment table. | Renders 12 periods; paid/unpaid state matches the invoice data. | EXPLORATORY |
| QAT-HSE-16 | Property transition preview | Open the transition preview for a landlord→tenant or developer→owner change. | Preview shows the intended changes without committing them. | AD-01 |
| QAT-HSE-17 | Edit house persists | Change the short name, save, reload. | Change persists and propagates to the list display. | CRUD |
| QAT-HSE-18 | Invalid house ID in URL | Navigate to a non-existent house UUID. | Graceful not-found, not a crash. | Negative |
| QAT-HSE-19 | Console and network hygiene | Check console and network across houses pages. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.5 PAY — Payments

Actor: super_admin. Routes: `/payments`, `/payments/new`, `/payments/[id]`, `/payments/import`, `/payments/email-imports`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-PAY-01 | Payments list renders | Navigate to `/payments`. | Table renders with rows; amounts formatted as currency. | `payments-billing.spec.ts` |
| QAT-PAY-02 | Filters by status | Apply each of pending / paid / overdue / failed. | Result set matches the filter for every value. | Equivalence partitioning |
| QAT-PAY-03 | Filters by method | Filter by each payment method. | Result set matches. | Equivalence partitioning |
| QAT-PAY-04 | Date-range filter | Apply a narrow date range. | Only payments inside the range are listed. | EXPLORATORY |
| QAT-PAY-05 | Pagination | Page forward and back. | No duplicate or skipped rows. | EXPLORATORY |
| QAT-PAY-06 | Create form renders | Navigate to `/payments/new`. | Resident/house selector, amount, method, status, date, reference fields render. | `paymentFormSchema` |
| QAT-PAY-07 | Amount boundary: zero | Enter amount `0`. | Rejected — amount must be positive. | `paymentFormSchema` |
| QAT-PAY-08 | Amount boundary: negative | Enter `-100`. | Rejected. | `paymentFormSchema` |
| QAT-PAY-09 | Amount boundary: decimal | Enter `1500.50`. | Accepted and stored to 2 decimal places. | Boundary value |
| QAT-PAY-10 | Amount boundary: very large | Enter `999999999999`. | Either accepted and displayed without overflow, or rejected with a clear message. Record which. | Boundary value |
| QAT-PAY-11 | Create rejects missing resident | Submit without selecting a resident/house. | Required-field validation blocks. | `paymentFormSchema` |
| QAT-PAY-12 | Record payment happy path | Record a payment for the QAT resident, amount 5000, method `bank_transfer`, reference `QAT-20260829-PAY01`. | Saves; appears in the list; totals update. | AD-02 |
| QAT-PAY-13 | Payment detail page | Open the created payment. | Detail tabs render; amount, method, resident, and reference match what was entered. | `payments-billing.spec.ts` |
| QAT-PAY-14 | Receipt preview | Open the receipt preview for the QAT payment. | Receipt renders with correct figures; download/print path is reachable. | EXPLORATORY |
| QAT-PAY-15 | Email receipt with no provider | Attempt to email the receipt. | Clear "email not configured" style failure. Must not report success. | Graceful degradation |
| QAT-PAY-16 | Quick-view sheet | Open the quick-view sheet from a list row. | Sheet opens with summary data and closes cleanly. | EXPLORATORY |
| QAT-PAY-17 | Split payment sum rule | Open split payment; set total 10000 with splits 4000 + 5000. | Rejected — split sum must equal the total (±0.01). | `splitPaymentSchema` |
| QAT-PAY-18 | Split payment happy path | Set total 10000 with splits 5000 + 5000 across two houses. | Accepted and recorded against both. | `splitPaymentSchema` |
| QAT-PAY-19 | Bulk selection action bar | Select two QAT rows via checkboxes. | Action bar appears showing the selected count. | `payment-table.tsx` |
| QAT-PAY-20 | Bulk status update on QAT rows only | With only QAT rows selected, apply a status change. | Only the selected rows change; selection is visually confirmed before applying. | `bulkUpdatePayments` |
| QAT-PAY-21 | CSV export | Trigger CSV export. | Export completes and contains the expected columns. | AD-02 |
| QAT-PAY-22 | Bank statement import page | Navigate to `/payments/import`. | Upload UI renders; file-type guidance shown. Do not complete an approval. | AD-08 |
| QAT-PAY-23 | Email imports page | Navigate to `/payments/email-imports`. | Page renders; Gmail connection status shows disconnected (no OAuth keys). | AD-07 |
| QAT-PAY-24 | Reset email imports — **not executed** | — | **Skipped**: globally destructive. Also inspect whether the control is permission-gated in the UI. | Do-not-execute |
| QAT-PAY-25 | Delete QAT payment | Delete a QAT-created payment only. | Row removed; no pre-existing record affected. | CRUD |
| QAT-PAY-26 | Console and network hygiene | Check console and network across payments pages. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.6 BIL — Billing, invoices, and wallet

Actor: super_admin. Routes: `/billing`, `/billing/generate`, `/billing/[id]`, `/settings/billing/**`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-BIL-01 | Invoice list renders | Navigate to `/billing`. | Invoice table renders with status badges and amounts. | `payments-billing.spec.ts` |
| QAT-BIL-02 | Overdue statistics | Inspect the overdue summary. | Overdue count and total are numerically consistent with the filtered list. | EXPLORATORY |
| QAT-BIL-03 | Filter by invoice status | Apply each status filter. | Result set matches. | Equivalence partitioning |
| QAT-BIL-04 | Filter by invoice type | Apply each type filter. | Result set matches. | Equivalence partitioning |
| QAT-BIL-05 | Searchable resident filter | Filter by the QAT resident. | Only that resident's invoices are listed. | `billing-resident-filter.test.ts` |
| QAT-BIL-06 | Generation preview — current month | Open `/billing/generate`, select the current month, run **preview only**. | Preview lists candidate invoices with counts and totals; nothing is committed. | AD-02 |
| QAT-BIL-07 | Generation preview — backfill defaults | Switch to a backfill period. | Defaults populate sensibly; preview recalculates. | `billing-generation-history.test.ts` |
| QAT-BIL-08 | Estate-wide generation — **not executed** | — | **Skipped**: would create hundreds of real invoices in a shared database. | Do-not-execute |
| QAT-BIL-09 | Generation history is durable | Inspect the generation history panel. | Prior runs are listed with timestamps and outcomes. | `billing-generation-history.test.ts` |
| QAT-BIL-10 | Per-house levy generation | Generate a development levy for house `QAT-01` only. | A single scoped invoice is created for that house. | AD-02 |
| QAT-BIL-11 | Invoice detail page | Open the QAT invoice. | Line items, amounts, due date, and status render correctly. | EXPLORATORY |
| QAT-BIL-12 | Invoice correction dialog | Open the correction dialog on the QAT invoice. | Dialog validates input and shows the correction timeline. | feature-inventory |
| QAT-BIL-13 | Invoice dispute flow | Raise a dispute on the QAT invoice. | Dispute is recorded and the invoice reflects the disputed state. | EXPLORATORY |
| QAT-BIL-14 | Wallet credit | Credit the QAT resident's wallet with 10000. | Balance increases; a wallet transaction is recorded with the right sign. | AD-03 |
| QAT-BIL-15 | Wallet debit | Debit 2000 from the QAT wallet. | Balance decreases correctly; transaction recorded. | AD-03 |
| QAT-BIL-16 | Debit beyond balance | Attempt to debit more than the balance. | Rejected with a clear message; balance unchanged. | Boundary/negative |
| QAT-BIL-17 | Pay invoice with wallet | Apply wallet funds to the QAT invoice. | Invoice moves to paid; wallet balance reduces by exactly the invoice amount. | AD-03 |
| QAT-BIL-18 | Wallet allocation to multiple invoices | Allocate wallet balance across two open QAT invoices. | Allocation applies in a documented order; totals reconcile. | AD-03 |
| QAT-BIL-19 | Wallet transaction history | Open the wallet transaction list. | All credits, debits, and allocations from this run appear in order. | AD-03 |
| QAT-BIL-20 | Statement generator | Generate a statement for the QAT resident. | Statement renders with opening balance, transactions, and closing balance that reconcile. | RS-01 |
| QAT-BIL-21 | Billing profile create | Create billing profile `QAT-20260829 Profile`. | Saves with items and an effective date. | AD-02 |
| QAT-BIL-22 | Billing profile item amount boundary | Enter a negative item amount. | Rejected — amount must be ≥ 0. | `billing.ts` validator |
| QAT-BIL-23 | Effective-date impact check | Change the effective date on the QAT profile. | The impact check reports affected invoices and, where required, routes to approval. | Approvals link |
| QAT-BIL-24 | Billing profile duplicate | Duplicate the QAT profile. | A copy is created with a distinct name; the original is unchanged. | CRUD |
| QAT-BIL-25 | Late fee settings render | Navigate to `/settings/billing/late-fees`. | Current rules render and are editable. | AD-02 |
| QAT-BIL-26 | Late fee waiver request | Request a waiver on a late fee for the QAT invoice. | Request is created and appears in the approvals queue. | Approvals link |
| QAT-BIL-27 | Invoice state transition to overdue | Inspect an invoice past its due date. | Status is `overdue` and the badge matches. | State transition |
| QAT-BIL-28 | Console and network hygiene | Check console and network across billing pages. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.7 SEC — Security

Actor: super_admin. Routes: `/security`, `/security/contacts`, `/security/contacts/new`, `/security/contacts/[id]`, `/security/logs`, `/security/verify`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-SEC-01 | Security hub renders | Navigate to `/security`. | Tabs render; stat cards populate; default tab loads content. | SG-01 |
| QAT-SEC-02 | Tab switching | Switch between contacts / codes / verification tabs. | Each tab loads its content without error; tab state is reflected in the UI. | EXPLORATORY |
| QAT-SEC-03 | Contacts list renders | Navigate to `/security/contacts`. | Table renders with category and status columns. | SG-01 |
| QAT-SEC-04 | Contact filters | Filter by category and by status. | Result set matches each filter. | Equivalence partitioning |
| QAT-SEC-05 | Contact create form renders | Navigate to `/security/contacts/new`. | Name, phone, category, photo/ID URL fields render. | `security-contact.ts` |
| QAT-SEC-06 | Name minimum length | Enter a 1-character name. | Rejected — minimum is 2 characters. | Boundary value |
| QAT-SEC-07 | Phone regex rejects invalid | Enter `12345`, then `+1234567890`, then `0912345678`. | All rejected — must match `^(\+234\|0)[789][01]\d{8}$`. | `security-contact.ts` |
| QAT-SEC-08 | Phone regex accepts valid 0-prefix | Enter `08012345678`. | Accepted. | `security-contact.ts` |
| QAT-SEC-09 | Phone regex accepts valid +234 prefix | Enter `+2348012345678`. | Accepted. | `security-contact.ts` |
| QAT-SEC-10 | Invalid photo URL rejected | Enter `not-a-url` in the photo URL field. | Rejected as an invalid URL. | `security-contact.ts` |
| QAT-SEC-11 | Create contact happy path | Create `QAT-20260829 Visitor 01`, phone `08012345678`, a valid category. | Saves and appears in the list. | SG-01 |
| QAT-SEC-12 | Generate access code | Generate an access code for the QAT contact. | Code is issued, displayed, and marked active with an expiry. | RS-02 |
| QAT-SEC-13 | Verify valid code at gate | On `/security/verify`, enter the active QAT code. | Verification succeeds; contact and house details are shown. | SG-01 |
| QAT-SEC-14 | Verify already-used code | Re-verify the same single-use code. | Rejected with an "already used" style message, not a generic failure. | SG-03 |
| QAT-SEC-15 | Verify invalid code | Enter `ZZZ999`. | Rejected cleanly; no record created. | Negative |
| QAT-SEC-16 | Regenerate access code | Regenerate the code for the QAT contact. | A new code is issued; the previous one no longer verifies. | State transition |
| QAT-SEC-17 | Revoke access code | Revoke the active code, then attempt verification. | Verification is refused for the revoked code. | State transition |
| QAT-SEC-18 | Time-limited code | Generate a code with a validity window. | Code carries the window; verification outside it is refused. | SS-02 |
| QAT-SEC-19 | Record check-in | Record a check-in for the QAT contact. | Access log entry created with timestamp. | SG-02 |
| QAT-SEC-20 | Record check-out | Record the matching check-out. | Log entry updated/paired; duration derivable. | SG-02 |
| QAT-SEC-21 | Access logs list and filters | Navigate to `/security/logs`; filter by date and status. | Entries from this run appear; filters narrow correctly. | SG-02 |
| QAT-SEC-22 | Flag and unflag access | Flag a QAT access log entry, then unflag it. | Flag state toggles and persists after reload. | EXPLORATORY |
| QAT-SEC-23 | Share pass modal | Open the share-pass modal for the QAT code. | Modal renders the pass; share/copy actions are present and do not error. | RS-02 |
| QAT-SEC-24 | Vehicle record | Add a vehicle with a plate for the QAT contact; search by plate. | Vehicle saves; plate search finds it. | SG-02 |
| QAT-SEC-25 | Contact status change | Suspend, then reactivate the QAT contact. | Status transitions persist; a suspended contact's code does not verify. | State transition |
| QAT-SEC-26 | CSV export of contacts | Export security contacts to CSV. | Export completes with expected columns. | AD-04 |
| QAT-SEC-27 | Visitor analytics | Inspect the visitor analytics view. | Charts/metrics render with data consistent with the logs. | AD-04 |
| QAT-SEC-28 | Console and network hygiene | Check console and network across security pages. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.8 APR — Approvals

Actor: super_admin. Route: `/approvals`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-APR-01 | Approvals queue renders | Navigate to `/approvals`. | Queue table renders, or shows an explicit empty state. | RS-07 |
| QAT-APR-02 | Filter by status | Filter pending / approved / rejected. | Result set matches. | Equivalence partitioning |
| QAT-APR-03 | Search within queue | Search by requester or subject. | Results narrow correctly. | EXPLORATORY |
| QAT-APR-04 | Pagination | Page through the queue. | No duplicate or skipped rows. | EXPLORATORY |
| QAT-APR-05 | Request detail view | Open a QAT-originated request (from BIL-23 or BIL-26). | Detail shows request type, requester, and the proposed change. | RS-07 |
| QAT-APR-06 | Reject requires a reason | Attempt to reject with the reason field blank. | Blocked — a rejection reason is mandatory. | Negative |
| QAT-APR-07 | Reject with reason | Reject a QAT request with a reason. | Status moves to rejected; the reason is stored and displayed. | State transition |
| QAT-APR-08 | Approve a request | Approve a QAT request. | Status moves to approved; the underlying change is applied. | State transition |
| QAT-APR-09 | Approved state persists | Reload after approving. | Status remains approved; the item leaves the pending filter. | CRUD |
| QAT-APR-10 | Payment proof viewer | Open a request that carries a payment proof, if one exists. | Proof renders in the viewer; otherwise record as not-applicable. | EXPLORATORY |
| QAT-APR-11 | Console and network hygiene | Check console and network on `/approvals`. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.9 RPT — Reports and analytics

Actor: super_admin. Routes: `/reports`, `/reports/financial-overview`, `/analytics`, `/analytics/announcements`.

| ID | Title | Steps | Expected result | Ref |
|---|---|---|---|---|
| QAT-RPT-01 | Reports hub renders | Navigate to `/reports`. | Tabs render; each loads its content. | AD-02 |
| QAT-RPT-02 | Report request wizard | Open the request wizard and step through it. | Each step validates and advances; the summary reflects the selections. | EXPLORATORY |
| QAT-RPT-03 | Generate a report | Complete the wizard for a small-scope report. | Report generates and appears in the archive. | AD-02 |
| QAT-RPT-04 | Report viewer | Open the generated report in the viewer. | Content renders with data consistent with the source module. | EXPLORATORY |
| QAT-RPT-05 | Report download | Trigger download/PDF for the generated report. | Download path resolves without a server error. | AD-02 |
| QAT-RPT-06 | Report schedule create | Create a schedule `QAT-20260829 Schedule`. | Saves and lists with its cadence. | AD-02 |
| QAT-RPT-07 | Report schedule edit and delete | Edit the QAT schedule, then delete it. | Both operations succeed; only the QAT schedule is affected. | CRUD |
| QAT-RPT-08 | Financial overview page | Navigate to `/reports/financial-overview`. | Figures render and reconcile with the dashboard financial-health widget. | AD-02 |
| QAT-RPT-09 | Analytics page renders | Navigate to `/analytics`. | Charts render with data; no empty or `NaN` axes. | AD-04 |
| QAT-RPT-10 | Collections trend | Inspect the collections trend chart. | Trend renders across periods with plausible values. | `getCollectionsTrend` |
| QAT-RPT-11 | Indebtedness ranking | Inspect the indebtedness view. | Ranked list renders; amounts are consistent with the billing module. | `getIndebtednessAnalytics` |
| QAT-RPT-12 | Announcement analytics | Navigate to `/analytics/announcements`. | Metrics render or show an explicit empty state. | EXPLORATORY |
| QAT-RPT-13 | Wallet batch reconciliation panel | Open the wallet reconciliation panel from reports. | Panel renders batches and their reconciliation state. | `wallet-batches.spec.ts` |
| QAT-RPT-14 | Console and network hygiene | Check console and network across report pages. | Zero error-level console messages; zero 4xx/5xx. | Cross-cutting |

---

### 6.10 SMK — Smoke pass across the remaining admin surface

Actor: super_admin. One case per page. **Expected result for every case:** the page loads without an error boundary or 500, renders its primary element, produces zero error-level console messages and zero 4xx/5xx network responses, and its primary call-to-action opens without error.

| ID | Route | ID | Route |
|---|---|---|---|
| QAT-SMK-01 | `/announcements` | QAT-SMK-21 | `/system/audit-logs` |
| QAT-SMK-02 | `/announcements/new` | QAT-SMK-22 | `/settings/data-management` |
| QAT-SMK-03 | `/documents` | QAT-SMK-23 | `/settings/cron-status` |
| QAT-SMK-04 | `/personnel` | QAT-SMK-24 | `/settings/roles` |
| QAT-SMK-05 | `/projects` | QAT-SMK-25 | `/settings/user-roles` (expect redirect) |
| QAT-SMK-06 | `/expenditure` | QAT-SMK-26 | `/settings/billing` |
| QAT-SMK-07 | `/notifications` | QAT-SMK-27 | `/settings/billing/profiles` |
| QAT-SMK-08 | `/settings` | QAT-SMK-28 | `/settings/billing/invoices` |
| QAT-SMK-09 | `/settings/appearance` | QAT-SMK-29 | `/settings/billing/development-levies` |
| QAT-SMK-10 | `/settings/branding` | QAT-SMK-30 | `/settings/security` |
| QAT-SMK-11 | `/settings/estate-info` | QAT-SMK-31 | `/settings/security/categories` |
| QAT-SMK-12 | `/settings/bank-accounts` | QAT-SMK-32 | `/settings/security/permissions` |
| QAT-SMK-13 | `/settings/streets` | QAT-SMK-33 | `/settings/notifications` |
| QAT-SMK-14 | `/settings/house-types` | QAT-SMK-34 | `/settings/notifications/templates` |
| QAT-SMK-15 | `/settings/transaction-tags` | QAT-SMK-35 | `/settings/notifications/schedules` |
| QAT-SMK-16 | `/settings/document-categories` | QAT-SMK-36 | `/settings/notifications/history` |
| QAT-SMK-17 | `/settings/announcement-categories` | QAT-SMK-37 | `/settings/notification-queue` |
| QAT-SMK-18 | `/settings/message-templates` | QAT-SMK-38 | `/settings/email` |
| QAT-SMK-19 | `/settings/system` | QAT-SMK-39 | `/settings/email-integration` |
| QAT-SMK-20 | `/settings/system/health` | QAT-SMK-40 | `/settings/whatsapp` |

Additional targeted checks folded into the smoke pass:

| ID | Title | Expected result |
|---|---|---|
| QAT-SMK-41 | Middleware route-config gap | `src/middleware.ts` defines a local `routePermissionConfig` that omits prefixes present in `ROUTE_PERMISSIONS` (`/documents`, `/announcements`, `/settings/announcement-categories`, `/settings/document-categories`, `/settings/email-integration`, `/payments/email-imports`). Determine whether those pages self-gate. If an under-privileged role could reach them, this is an authorization gap. |
| QAT-SMK-42 | `resetEmailImports` authorization | The action has `logAudit` but **no** `authorizePermission()` guard, while being globally destructive. Determine what actually gates it (RLS on the user-scoped client, or the UI control). Assess and record severity. **Do not invoke it.** |
| QAT-SMK-43 | Maintenance mode is off | `/settings/system/maintenance` shows maintenance mode disabled at the end of the run — confirming the campaign did not enable it. |
| QAT-SMK-44 | Unconfigured integrations degrade gracefully | `/settings/email`, `/settings/email-integration`, and `/settings/whatsapp` each report their provider as unconfigured rather than crashing or claiming readiness. |

---

## 7. Test case index

| Module | Prefix | Cases |
|---|---|---|
| Authentication & session | `QAT-AUTH` | 14 |
| Navigation & dashboard | `QAT-NAV` | 13 |
| Residents | `QAT-RES` | 28 |
| Houses | `QAT-HSE` | 19 |
| Payments | `QAT-PAY` | 26 |
| Billing & wallet | `QAT-BIL` | 28 |
| Security | `QAT-SEC` | 28 |
| Approvals | `QAT-APR` | 11 |
| Reports & analytics | `QAT-RPT` | 14 |
| Smoke pass | `QAT-SMK` | 44 |
| **Total** | | **225** |

---

## 8. Execution order

Sequenced so that each module's test data feeds the next:

1. **AUTH** (unauthenticated cases first, then login)
2. **NAV**
3. **RES** → creates the QAT resident
4. **HSE** → creates the QAT house; consumes the resident for assignment and occupancy cases
5. **PAY** → records payments against the QAT resident and house
6. **BIL** → generates the QAT invoice and exercises the wallet; produces approval requests
7. **SEC**
8. **APR** → consumes the approval requests raised in BIL
9. **RPT**
10. **SMK**

Reports are written incrementally, one per module, as execution completes.

---

## 9. Deliverables

| Artifact | Path |
|---|---|
| This test plan | `docs/qat/test-plan.md` |
| Rolling summary and defect register | `docs/qat/README.md` |
| Per-module execution reports | `docs/qat/reports/qat-<module>-20260829.md` |
| Test data manifest | `docs/qat/test-data-manifest.md` |
| GitHub issues for CRITICAL/HIGH defects | `meggarmind/RESIDIO`, labelled `bug` + `needs-triage` |
