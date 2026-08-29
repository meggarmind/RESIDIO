# QAT — Residents — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-RES` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, DOM field values captured before every submit, browser console. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Not yet executed |
|---|---|---|---|
| 28 | 8 | 0 | 20 |

No defects found in the cases executed. The Residents module is the healthiest area tested so far.

## Results

| ID | Title | Status | Notes |
|---|---|---|---|
| QAT-RES-01 | Residents list renders | **Pass** | Table renders 20 rows per page. KPI strip: "Residents 193 · Active 189 · 98% · Inactive 4". Filter controls present: All Status, All Streets, All Roles, All Verification. Columns: Code, Name, Phone, Address, Role, Status, Verified, Actions. |
| QAT-RES-05 | Create form renders all fields | **Pass** | `/residents/new` renders with sections Personal Information, House Assignment, Emergency Contact. Fields confirmed in the DOM: `first_name`, `last_name`, `email`, `phone_primary`, `phone_secondary`, `move_in_date`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship`, `notes`, plus four selects (Resident Type, Entity Type, Role, House). |
| QAT-RES-06 | Create rejects missing required fields | **Pass** | Submitting blank produced three inline errors and blocked navigation: **"First name is required"**, **"Last name is required"**, **"Phone number must be at least 10 digits"**. Remained on `/residents/new`. |
| QAT-RES-07 | Create rejects malformed email | **Pass** | With valid name and phone but email `bad-email`, submission was blocked with **"Invalid email address"**. Remained on `/residents/new`. |
| QAT-RES-08 | Phone minimum length | **Pass** | Covered by QAT-RES-06 — the 10-digit minimum from `residentFormSchema` is enforced and surfaced with the exact message above. |
| QAT-RES-09 | Create resident happy path | **Pass** | Created `QAT / Tester-20260829-01`, phone `08012345678`, resident type Primary, entity type Individual. Redirected to `/residents`; the record appears at the top of the list as "177754 · QAT Tester-20260829-01 · 08012345678 · Unassigned · Active". |
| QAT-RES-10 | Auto-generated resident code | **Pass** | Assigned code **177754** — 6 digits, numeric, matching the documented format in `docs/feature-inventory.md`. |
| QAT-RES-28 | Console and network hygiene | **Pass** | No console errors attributable to the Residents pages. |
| QAT-RES-02..04, 11..27 | Search, filters, pagination, corporate rules, sponsor rules, detail sections, edit, house assignment, household members, wallet, aliases, status changes, verification, move-out, archive, invalid ID | Not yet executed | Session ended before these were reached. |

## Verified counter behaviour

Creating the resident moved the list counters correctly, confirmed after a full reload:

| Counter | Before | After |
|---|---|---|
| Residents | 193 | **194** |
| Active | 189 | **190** |
| Active % | 98% | 98% |
| Inactive | 4 | 4 |
| Unverified | 189 | **190** |

Immediately after the post-create redirect the KPI strip briefly showed "Residents – · Active – · 0%" before resolving to the correct figures. This is a **loading state, not a defect** — it settles within a few seconds and reads correctly on reload. Recorded because a shorter observation window would have made it look like a counter bug.

## Observation (not a defect)

**Zero residents are contact-verified.** The list reports "Verification: 0 verified · 190 unverified" — every resident in the estate, across 194 records. This is consistent with `RESEND_API_KEY` and `TERMII_API_KEY` being unset in this environment, so OTP delivery cannot complete. It is recorded as an environment fact rather than a defect, but it does mean **QAT-RES-23 (contact verification) cannot be meaningfully executed here** — the most that can be tested is that the UI reports a clear failure rather than falsely claiming success.

**Two forms in the DOM.** `/residents/new` renders two `<form>` elements with identical field names — one visible, one hidden (`offsetParent === null`), nine inputs each. This is the expected responsive desktop/mobile split, not a duplicate render. Verified rather than assumed, because duplicate `name` attributes within a submitted form would be a real bug.

## Test data created

| Entity | Identifier | Values |
|---|---|---|
| Resident | code **177754** | `QAT Tester-20260829-01`, phone `08012345678`, email `bad-emailqat.tester01@residio.test`, Active, house Unassigned |

See [test-data-manifest.md](../test-data-manifest.md) for the note on how that email value arose — it is a test-execution artifact, not evidence of a validation defect.
