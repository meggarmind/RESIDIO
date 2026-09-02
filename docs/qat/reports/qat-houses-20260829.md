# QAT — Houses — 2026-08-29

| | |
|---|---|
| **Module** | `QAT-HSE` |
| **Actor** | super_admin (`admin@residio.test`) |
| **Build** | `43579eb` (master) |
| **Evidence method** | Page-text extraction, DOM field values verified before every submit, code trace. Screenshots unavailable — see [README](../README.md#method-notes). |

## Summary

| Total | Pass | Fail | Not yet executed |
|---|---|---|---|
| 19 | 11 | 1 | 7 |

One **HIGH** defect. Setting that aside, the Houses module's form validation, filtering, and CRUD are the most solid of any module tested — and it is the only module so far with **zero console errors** across every page and interaction.

## Results

| ID | Title | Status | Severity | Notes |
|---|---|---|---|---|
| QAT-HSE-01 | Houses list renders | **Pass** | — | KPIs: Properties **178**, Occupied **162 (91%)**, Vacant **16**. Columns: ID, House, Street, Type, Status, Actions. Footer "Showing 1 to 20 of 178". |
| QAT-HSE-02 | Search and filter | **Pass** | — | Street filter "Kayode Oni Animashaun" → 39 rows, all matching, with an "Active Filters" banner. Adding Status "Vacant" → 3 rows (KOA-17B, KOA-20A, KOA-20B), all matching both criteria. "Clear all" restored 178/162/16. Filters compose correctly. |
| QAT-HSE-03 | Create form renders | **Pass** | — | Named fields: `house_number`, `short_name`, `address_line_2`, `date_added_to_portal`, `number_of_plots`, `notes`. Three comboboxes: Street (4 options), House Type (10 options), Billing Profile Override (default + 5 rates). |
| QAT-HSE-04 | Rejects blank submission | **Pass** | — | Exact messages: **"House number is required"**, **"Please select a street"**. Stayed on `/houses/new`. |
| QAT-HSE-05 | Rejects missing street | **Pass** | — | With house number filled, the house-number error cleared and **"Please select a street"** remained. Validation updates per-field correctly. |
| QAT-HSE-06 | Plots boundary: zero | **Pass (with note)** | — | The field is `type="number"` with `min="1"`. Setting `0` produced no error message; the value silently reverted to `1`. The minimum is enforced, so no invalid record can be created — but the correction is silent. See the note below on the limits of this observation. |
| QAT-HSE-07 | Plots boundary: one | **Pass** | — | Accepted; also the field default. |
| QAT-HSE-08 | Short name 50-char boundary | **Pass** | — | Exactly 50 `A` characters: accepted, no error. 51 characters: rejected with **"Short name must be 50 characters or less"**. Boundary is exact and correctly inclusive. |
| QAT-HSE-09 | Create house happy path | **Pass** | — | Created `QAT-01` on Kayode Oni Animashaun, 1 plot. Redirected to `/houses`. KPIs moved 178→**179** Properties and 16→**17** Vacant; Occupied correctly unchanged at 162. |
| QAT-HSE-10 | Property status | **Pass** | — | New house correctly derived as Vacant with 0 active residents. |
| QAT-HSE-11 | House detail sections | **Fail** | **HIGH** | All four tabs render without error and with correct empty states — but two cards display hardcoded values. See QAT-HSE-D1. |
| QAT-HSE-14 | Ownership history records events | **Pass** | — | History tab shows "Added to Portal 8/29/2026 — House added to Residio portal" for the new house. Event captured correctly at creation. |
| QAT-HSE-18 | Invalid house ID in URL | **Pass** | — | `/houses/00000000-0000-0000-0000-000000000000` renders a clean **"House not found — Back to Houses"**. No crash, no error boundary, no console errors. |
| QAT-HSE-19 | Console and network hygiene | **Pass** | — | **Zero console errors** across the list, filters, create form, both failed submissions, all four detail tabs, and the invalid-UUID page. The only module to achieve this. |
| QAT-HSE-12, 13, 15, 16, 17 | Occupancy flip on assign/remove, yearly payment summary with data, transition preview, edit persistence | Not yet executed | — | Require assigning the QAT resident to the QAT house and generating invoices against it. |

## Defects

### QAT-HSE-D1 — House detail page reports hardcoded "Financial Status: Clear" on properties that owe money  [HIGH]

**Evidence**

House **18A, Kayode Oni Animashaun** (`f866af4d-4f58-48fc-826e-df7684bdaa83`) is occupied by FEYIJIMI ADEWOLE, who has multiple unpaid Service Charge invoices visible on `/billing` — Jan, Mar, Apr, May, Jun, Jul and Aug 2026, ₦10,000 each, several past due date.

Its detail page reports:

```
18A  Kayode Oni Animashaun  Duplex
Occupancy        Occupied — 1 active residents
Financial Status Clear — No pending payments        <-- false
Last Inspection  2025-12-01 — Compliance verified   <-- hardcoded
```

The identical "Last Inspection 2025-12-01 / Compliance verified" also appears on `QAT-01`, a house created minutes earlier during this test run and never inspected.

**Root cause** — [houses/[id]/page.tsx:596](src/app/(dashboard)/houses/[id]/page.tsx:596):

```tsx
<HouseStatsCards
  occupancyStatus={house.is_occupied ? 'occupied' : 'vacant'}
  totalResidents={activeResidents.length}
  pendingDues={0} // Mocked for now, pending backend integration
  lastInspectionDate="2025-12-01"
/>
```

The first two props are wired to real data; the last two are literals. That mixture is what makes the placeholders read as genuine — they render in identical styling beside correct figures, with no visual cue.

**Impact**

An administrator opening a property page is told it is financially clear when it owes money, across all 179 properties. The realistic failure is an operational decision taken on false information — granting access, issuing a clearance, or dropping a debt follow-up. The move-out flow depends on financial clearance, so a mocked zero on the property view points in a risky direction.

**GitHub issue**: [#109](https://github.com/meggarmind/RESIDIO/issues/109)

## Observations

### Two pre-existing house records contain corrupted characters  [LOW]

Two of the 178 pre-existing houses render mojibake in their identifier:

```
IBB-3?F?    3?F?     Ibrahim Babatunde   Flat (Apartment)   Occupied
KOA-10F-?   10F-?    Kayode Oni Animashaun  Flat (Apartment)  Occupied
```

Observed independently in two separate test runs, so it is not a one-off extraction glitch. Most likely an encoding problem in legacy imported data rather than an application fault — but a house identifier that cannot be typed or searched is a practical problem for whoever has to look it up. Worth a data check; not filed.

### Plots minimum is enforced silently

The `number_of_plots` field reverts `0` to `1` without a message. The minimum holds, so no invalid record can be created, and this is recorded as a Pass.

Stated honestly: this case was exercised by a synthetic DOM value-set rather than by typing, because `type="number"` inputs do not support the text-selection API used to clear a field. A real user typing `0` may see different feedback. The security-relevant part — that an invalid value cannot be persisted — is confirmed; the exact UX is not.

### Auto-generated shortname may not track a later house-number edit — not reproduced

The created house `QAT-01` was reported as carrying the generated ID `KOA-QAT-05`, which corresponds to an earlier draft house number (`QAT-05`) used during the validation cases, not to the final `QAT-01`.

If the shortname generator does not re-run when the house number changes, a property could carry an identifier that disagrees with its number — the ID column is what `/houses` displays, so this is worth confirming. **It was not independently reproduced**, and the observed value is equally consistent with the shortname having been regenerated at a moment when the number field still read `QAT-05`. Recorded as a lead for the next session, not as a defect.

## Test data created

| Entity | Identifier | Values |
|---|---|---|
| House | `QAT-01` (UUID `a6a5f7df-9cfb-485e-8219-d1d00084d4c9`) | Street Kayode Oni Animashaun, 1 plot, no house type, Status Vacant, generated ID `KOA-QAT-05` |

No pre-existing house was modified, archived, or deleted.
