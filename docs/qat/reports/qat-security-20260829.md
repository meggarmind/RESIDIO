# QAT — Security — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-SEC` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` at execution start — see the build-drift warning below |
| **Evidence method** | Page-text extraction, verbatim UI messages, source verification. Screenshots unavailable — see [README](../README.md#method-notes). |

> ⚠️ **Build drift.** Partway through this module the working tree changed underneath the run: `HEAD` moved from `43579eb` to `999ce01` and a concurrent session began uncommitted work on `src/middleware.ts` introducing a profile `approval_status` gate. The `admin@residio.test` account is now redirected to `/pending-approval` on every admin route, which ended browser access. Findings below were gathered **before** that change. Items marked *unverified* could not be re-confirmed. See [README](../README.md#build-drift-during-the-campaign).

## Summary

| Total | Pass | Fail | Not verifiable | Not executed |
|---|---|---|---|---|
| 28 | 12 | 1 | 3 | 12 |

One MEDIUM defect confirmed in source. Three further anomalies observed but **not independently re-verified** before access was lost — they are recorded as leads, not findings.

## The access-code lifecycle works correctly

This is the module's core purpose — a guard verifying a visitor at the gate — and it behaved correctly end to end. Recording it in full because it is the most security-relevant flow in the product:

| Step | Result (verbatim) |
|---|---|
| Generate one-time code | `RES-KS6-GSJT` · One-Time · "Expiring Soon (23h)" · "Valid from 8/29/2026 to 8/30/2026 • Uses: 0/1" |
| Verify valid code | **ACCESS GRANTED** — with contact (name, phone, category, Active), resident (name, code 177754, phone), and code details (Uses 0/1) |
| Record check-in | Confirmation dialog with optional Gate Location and Notes → check-in recorded → form reset |
| Verify same code again | **ACCESS DENIED** — "Access code has been revoked", code status `Inactive`, `Uses: 1 / 1` |
| Verify invalid code `ZZZ999` | **ACCESS DENIED** — "Access code not found", no contact or resident details shown |
| Access log | 1 entry: "QAT-20260829 Visitor 01 · Visiting: QAT Tester-20260829-01(177754) · 8/29/2026, 10:13:08 PM · Still inside · Check Out" |
| Log filter | "Flagged Only" → "(0 total)" with proper empty state; "All Logs" → entry reappears |

A single-use code correctly refuses its second use, and an unknown code is distinguishable from a used one (the used code still renders its detail cards; the unknown one renders none). That distinction matters at a gate.

## Results

| ID | Title | Status | Severity | Notes |
|---|---|---|---|---|
| QAT-SEC-01 | Security hub renders | **Pass** | — | Tabs: Overview (default, `aria-selected="true"`), Verify Code, Contacts, Access Logs. Seven stat cards render: Active Contacts, Expiring Soon, Expired, Suspended, Today's Check-ins, Currently Inside, Flagged Today. |
| QAT-SEC-02 | Tab switching | **Pass** | — | All four tabs load their content. |
| QAT-SEC-03 | Contacts list renders | **Pass** | — | Columns: NAME, PHONE, CATEGORY, RESIDENT, STATUS, EXPIRES, ACCESS CODE, ACTIONS. Empty state "No security contacts found". |
| QAT-SEC-05 | Create form renders | **Pass** | — | Fields: `resident` (194 options), `category` (7 options), `full_name`, `phone_primary`, `phone_secondary`, `id_type` (6 options), `id_number`, `address`, `next_of_kin_name`, `next_of_kin_phone`, `notes`. |
| QAT-SEC-06 | Name minimum length | **Pass** | — | 1 character rejected: **"Full name must be at least 2 characters"**. |
| QAT-SEC-07 | Phone regex rejects invalid | **Fail** | **MEDIUM** | Only the length rule fires. See QAT-SEC-D1. |
| QAT-SEC-08 | Valid 0-prefix phone | **Pass** | — | `08012345678` accepted. |
| QAT-SEC-09 | Valid +234 phone | **Pass** | — | `+2348012345678` accepted. |
| QAT-SEC-10 | Invalid photo URL rejected | **Not verifiable** | — | **No photo URL field exists** in the form, confirmed by full DOM enumeration — although `photo_url: z.string().url()` is defined in the schema at [security-contact.ts:39](src/lib/validators/security-contact.ts:39). A schema field with no UI. Not a defect on its own; recorded as a spec/UI mismatch. |
| QAT-SEC-11 | Create contact happy path | **Pass** | — | Contact `QAT-20260829 Visitor 01` exists with phone `08012345678`, category Visitor, linked to resident QAT Tester-20260829-01 (177754). See the data-integrity note below on how it was created. |
| QAT-SEC-12 | Generate access code | **Pass** | — | "Generate Code" offers Permanent and One-Time. One-Time produced `RES-KS6-GSJT` with a correct 1-day window and `Uses: 0/1`. |
| QAT-SEC-13 | Verify valid code | **Pass** | — | ACCESS GRANTED with full contact/resident/code detail. |
| QAT-SEC-14 | Verify used code | **Pass (with defect in wording)** | LOW | Correctly denied with `Uses: 1/1`, but the reason text is wrong — see QAT-SEC-O2. |
| QAT-SEC-15 | Verify invalid code | **Pass** | — | "Access code not found", no details leaked about a non-existent code. |
| QAT-SEC-19/20 | Record check-in / check-out | **Pass (check-in)** | — | Check-in recorded with gate location and notes fields; log entry created and shows "Still inside" with a "Check Out" action. Check-out not driven. |
| QAT-SEC-21 | Access logs and filters | **Pass** | — | 1 log entry, correct fields, working status filter with proper empty state. |
| QAT-SEC-28 | Console hygiene | **Inconclusive** | — | Two `404 (Not Found)` resource errors observed once on a contact detail page; could not be pinned to a request before the network buffer rolled, and a later read was clean. Recorded, unconfirmed. |
| QAT-SEC-04, 16, 17, 18, 22–27 | Contact filters, regenerate, revoke, time-limited codes, flag/unflag, share pass, vehicles, status change, CSV export, visitor analytics | Not executed | — | Access to the application was lost before these were reached. |

## Defects

### QAT-SEC-D1 — Nigerian phone format is defined but never enforced  [MEDIUM]

**Observed**

Three phone values the format rule should reject were submitted to the Register Security Contact form:

| Input | Result |
|---|---|
| `12345` | Rejected — "Phone number must be at least 10 digits" |
| `+1234567890` | **Accepted** — contact created |
| `0912345678` | **Accepted** — contact created |

**Confirmed in source**

[security-contact.ts:15](src/lib/validators/security-contact.ts:15) declares the rule:

```ts
const phoneRegex = /^(\+234|0)[789][01]\d{8}$/;
```

but the field it should govern, at [line 36](src/lib/validators/security-contact.ts:36), never applies it:

```ts
phone_primary: z.string().min(10, 'Phone number must be at least 10 digits'),
```

`phoneRegex` is referenced **exactly once in the entire codebase — its own declaration.** It is dead code. The form does use `zodResolver(createSecurityContactSchema)` ([security-contact-form.tsx:69](src/components/security/security-contact-form.tsx:69)), so the resolver is wired correctly; the constraint simply was never attached.

Both `+1234567890` (not a Nigerian number) and `0912345678` (`09` is not followed by a valid `[01]` third digit, and the number is a digit short) pass the length-only check.

**Impact**

Security contacts are the people issued gate access codes. The phone number is how a guard reaches a visitor or calls the resident to confirm entry. Unreachable or malformed numbers degrade exactly that check. It permits bad data rather than granting unauthorised access, which is why this is MEDIUM rather than higher — but it is on the access-control surface, and the intended rule is already written and one line from working.

**Filed?** No — MEDIUM stays in the register.

## Unverified observations

Access to the application was lost before these could be independently re-confirmed. They are recorded as **leads for the next session**, not as findings.

### QAT-SEC-O1 — Contact status disagrees between list and detail view *(unverified)*

The same contact, at the same moment, reportedly showed status **"Expired"** in `/security/contacts` and **"Active"** on its own detail page. The edit form for a Visitor-category contact shows "Default validity: 1 days (max: 30 days)", so a plausible explanation is that the list derives status from an expiry window the detail view ignores.

If real, this matters: the list is what a guard or administrator scans, and it would mark a valid contact as expired. Needs re-verification against a stable build.

### QAT-SEC-O2 — "Access code has been revoked" shown for a merely exhausted code *(observed, verbatim)*

Verifying a one-time code for the second time returns:

```
ACCESS DENIED
Access code has been revoked
... Uses: 1 / 1, status Inactive
```

The code was never revoked — it was used once, legitimately, as designed. "Revoked" implies an administrator withdrew access, which at a gate reads as a security concern about that visitor; "already used" is a routine, expected outcome. The underlying data is correct (`Uses: 1/1`, `Inactive`); only the message conflates the two states.

Low severity, but it is the sentence a guard reads while deciding what to do about the person in front of them.

### QAT-SEC-O3 — No empty state when a contacts search returns nothing *(unverified)*

Searching the contacts list with no matches renders an empty `<tbody>` with no message, whereas the unfiltered empty list correctly shows "No security contacts found". A user cannot tell "no matches" from "search broken".

## Test data integrity note

Executing QAT-SEC-07 **created two live security contacts** as an unavoidable side effect: the two supposedly-invalid phone formats were accepted rather than rejected, so each submission produced a record. This is a direct consequence of the defect above — the test that proves the validation gap is the test that leaves the residue.

One of those records was subsequently renamed and reused as the `QAT-20260829 Visitor 01` happy-path contact rather than creating a third. Neither was deleted, per the campaign's data policy. Both are listed in [test-data-manifest.md](../test-data-manifest.md).

## Test data created

| Entity | Identifier | Values |
|---|---|---|
| Security contact | `e6a510dd-246b-40d2-b4e1-0fc3b6bfa814` | `QAT-20260829 Visitor 01`, phone `08012345678`, category Visitor, resident QAT Tester-20260829-01 |
| Security contact | (id not captured) | `ABB`, phone `+2348012345678`, category Visitor, resident QAT Tester-20260829-01 — created by QAT-SEC-07 |
| Access code | `RES-KS6-GSJT` | One-time, issued to the contact above, now used (`Uses: 1/1`, Inactive) |
| Access log entry | — | Check-in 8/29/2026 22:13:08, status "Still inside" — **left open**, no check-out recorded |
