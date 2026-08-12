# Legacy Tracker Import Ledger

This is a review ledger only. It records a faithful translation of the legacy tracker and the proposed database operations; it is **not** an import script and must not be used to write to Supabase until the legacy-review pass is complete.

**Review-pass status (2026-08-11):** The supplied legacy-tracker screenshots are fully reviewed through L-0136. Additional houses will be added later or entered manually. The user authorized the consolidated reconciliation/import phase on 2026-08-11. Reconciliation is in progress: only user-confirmed resident/alias/history corrections have been written; payment records remain subject to the separate reconciliation manifest before import.

## Conventions

- Each entry represents one property, keyed by the legacy street shortcode and apparent house number.
- Source wording is retained when its meaning is uncertain. No dates, residents, payments, or relationships are inferred without evidence.
- **Candidate match** means a database search is required; it is not authority to merge or update an existing resident.
- Currency amounts are shown as `NGN` where the legacy sheet uses `N`/`₦` notation.
- A blue-highlighted month cell is the source of truth for the move-in month. Use explicit user-provided billing instructions for each property rather than normalising the first billing month.
- When there is no blue move-in cell, the earliest paid month is both the move-in month and the first billing month. L-0001 uses this rule: January 2015.
- During screenshot review, do **not** query Supabase. Database matching, duplicate detection, and payment reconciliation take place only after every legacy record has been reviewed and the consolidated bulk-import file is ready.

---

## L-0001 — OJO.K / House 2

### Source trace

- Source: user-supplied legacy-tracker screenshot, received 2026-08-10.
- Street mapping: `J.O.K` → **Ojo Kadiri** (`OJO.K`) — active street in the application.
- Confirmed property identifier: **House 2, Ojo Kadiri**.

### Legacy transcription

| Field | Translated value | Confidence / handling |
|---|---|---|
| Primary resident | `Chukwuemeka Francis Abara` | Confirmed landlord and self-occupier. |
| Payment aliases | `Chukwuemeka Francis`; `Emeka Abara`; `Pastor` | Confirmed aliases; retain as legacy matching/payment references. |
| Occupancy note | `LANDLORD/SELF-OCCUPIED` | Confirmed resident-house role: `resident_landlord`. |
| Move-in / first billing | January 2015 | No blue cell is visible; earliest paid month sets both dates under the confirmed import rule. |
| Building note | `BUILDING/TERRACE` | Preserve as property-type/context note; reconcile with the application house type. |
| Compound rent / other notes | `COMPOUND RENT C = N 5,000`; `OTHERS = N = 3,000` | Explicitly excluded from import interpretation. |
| Billing-rate rule | NGN 5,000/month for 2015–2024; NGN 10,000/month from 2025 onward | Confirmed; use this rule when reconciling annual legacy totals. |

### Legacy payment history

| Year | Legacy rate | Payments visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2026 | NGN 10,000 | None visible | NGN 0 | NGN 80,000 | Preserve as an open 2026 balance; the screenshot does not identify the covered months. |
| 2025 | NGN 10,000 | Apr NGN 100,000; Dec NGN 30,000 | NGN 130,000 | `(NGN 10,000)` credit | Payment facts captured; allocation and credit treatment need later reconciliation. |
| 2024 | NGN 5,000 | No row visible | — | — | Monthly billing rate is confirmed; no payment/balance is inferred from this screenshot. |
| 2023 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2022 | NGN 5,000 | Oct NGN 70,000 | NGN 70,000 | `(NGN 10,000)` credit | Payment facts captured; allocation needs later reconciliation. |
| 2021 | NGN 5,000 | Nov NGN 60,000; Dec NGN 50,000 | NGN 110,000 | `(NGN 50,000)` credit | Payment facts captured; allocation needs later reconciliation. |
| 2020 | NGN 5,000 | Mar NGN 60,000 | NGN 60,000 | NGN 0 | Payment facts captured. |
| 2019 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2018 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2017 | NGN 5,000 | Six monthly NGN 5,000 entries visible (month labels appear Jan–Jun) | NGN 30,000 | NGN 30,000 | Month-by-month positions are visually small; retain the annual total as authoritative pending source confirmation. |
| 2016 | NGN 5,000 | Monthly NGN 5,000 entries visible | NGN 60,000 | NGN 0 | The visual month positions are not fully legible, but annual paid/due totals are clear. |
| 2015 | NGN 5,000 | Monthly NGN 5,000 entries visible | NGN 60,000 | NGN 0 | The annual paid/due totals are clear. |
| **Sheet total** | — | — | **NGN 520,000** | **NGN 220,000** | Preserve exactly; do not recompute or post yet. |

### Database cross-check and proposed actions

| Area | Current determination | Proposed action after review |
|---|---|---|
| House | **Matched:** `OJO.K-2` (active, occupied; ID recorded in the review evidence only). | No create/update proposed. |
| Primary resident | **Matched with name correction:** active primary resident `EMEKA ABARA` is attached to this house. | Update the resident name to `Chukwuemeka Francis Abara`; add missing payment aliases `Emeka Abara`, `Chukwuemeka Francis`, and `Pastor` after confirming the preferred alias spelling/casing. |
| Existing role/occupancy | The matched primary resident has one active assignment from **2015-01-01**, but its role is incorrectly `tenant`. | Update that assignment to `resident_landlord`; retain the existing start date and open-ended status. No former tenancy/ownership history should be added. |
| Secondary residents | An active secondary record named `CHUKWUEMEKA FRANCIS` is currently linked as `household_member` from 2026-08-08. The user confirms this is not a resident; it is a payment alias/full-name fragment. | **User decision required:** archive/end the erroneous secondary record and assignment, or delete them if they have no dependent records. Do not create any secondary resident. |
| Payments | Existing database payments match the visible legacy payments for 2015–2017, Mar 2020, Nov/Dec 2021, Oct 2022, and Apr 2025. The records are `status=paid`, currently `is_verified=false`; there are no invoices. | Create **one missing payment**: NGN 30,000, 2025-12-01, for the matched primary resident/house. Preserve the legacy source as its note/provenance. Do not invent a coverage period or alter verified state without an import policy decision. |
| Legacy balance | Legacy sheet total is NGN 520,000 paid and NGN 220,000 due/debt. | Keep as legacy reconciliation evidence; do not create invoices or carry-forward balances from this screenshot alone. |

### Database reconciliation evidence (captured before the query suspension)

- Existing house: `OJO.K-2`, active and occupied.
- Existing primary resident: `EMEKA ABARA`, active, primary; no `resident_payment_aliases` currently exist.
- Existing assignment: 2015-01-01 to present, currently `tenant` (conflicts with confirmed landlord/self-occupied source).
- Existing secondary assignment: `CHUKWUEMEKA FRANCIS`, `household_member`, 2026-08-08 to present (conflicts with confirmed alias-only source).
- Existing payment records align with the legacy payment cells except December 2025 NGN 30,000; no invoices exist for this house.

### Confirmation status

The source interpretation and its already-captured database reconciliation are complete. No further database query should be made until the consolidated bulk-import file is ready. The only open decision is how to retire the erroneous active secondary-resident record that represents an alias rather than a person.

---

## L-0002 — OJO.K / House 4

### Source trace and resident translation

- Source: user-supplied legacy-tracker screenshot, received 2026-08-11.
- Confirmed property: **House 4, Ojo Kadiri**.
- Primary resident: **Constance Oka** — confirmed landlord/self-occupier; proposed role `resident_landlord`.
- No secondary residents are identified in the source.
- A blue `NGN 5,000` cell appears in **January 2019**. This establishes January 2019 as the move-in month and first billing month.
- Billing rate: NGN 5,000/month through 2024; NGN 10,000/month from 2025 onward.

### Legacy payment history

| Year | Legacy rate | Payments visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2026 | NGN 10,000 | None visible | NGN 0 | NGN 80,000 | Preserve as open legacy balance. |
| 2025 | NGN 10,000 | Feb NGN 17,500; Jul NGN 60,000; Sep NGN 30,000 | NGN 107,500 | NGN 12,500 | Payment facts captured; do not allocate beyond source. |
| 2024 | NGN 5,000 | No row visible | — | — | No payment/balance inference. |
| 2023 | NGN 5,000 | Feb NGN 100,000 | NGN 100,000 | `(NGN 40,000)` credit | Preserve visible credit. |
| 2022 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2021 | NGN 5,000 | Jul NGN 100,000 | NGN 100,000 | `(NGN 40,000)` credit | Preserve visible credit. |
| 2020 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2019 | NGN 5,000 | Jan–Dec NGN 5,000 each; Jan is blue | NGN 60,000 | NGN 0 | January is the confirmed move-in and first billing month. |
| **Sheet total** | — | — | **NGN 367,500** | **NGN 132,500** | Preserve exactly; do not recompute or post. |

### Proposed bulk-file rows (not database actions)

- Resident/house assignment: Constance Oka → OJO.K-4; `resident_landlord`; move-in and first billing `2019-01-01`; no move-out.
- Payment rows: retain the visible dated payment cells above, including the January 2019 blue-cell payment.
- No resident, house, relationship, payment, invoice, or balance database match has been attempted during review.

---

## L-0004 — OJO.K / House 8 (occupancy-history edge case)

### Source trace and canonical resident translation

- Source: user-supplied legacy-tracker screenshot, received 2026-08-11.
- Confirmed property: **House 8, Ojo Kadiri**.
- Canonical landlord resident: **Eso Mobolaji Agboo**. The source also shows `BOLAJI KAYODE ESO`; retain it as a legacy name/payment-reference variant, not a separate resident.
- Building note: `BUILDING/TERRACE`; compound-rent/other-charge notes are excluded from import interpretation.
- Billing rates: NGN 5,000/month through 2024; NGN 10,000/month from 2025 onward.

### Confirmed occupancy history

| Period | Occupant / status | Role | Move-in | Move-out | First billing | Notes |
|---|---|---|---|---|---|---|
| Jan 2015–Dec 2020 | Eso Mobolaji Agboo | `resident_landlord` | 2015-01-01 | 2020-12-31 | 2015-01-01 | Confirmed landlord/self-occupied period. |
| Jan 2021–Dec 2022 | Ekomobong Uduakobo | `tenant` | 2021-01-01 | 2022-12-31 | 2021-01-01 | Confirmed tenant period; all fees are confirmed paid. |
| 2023 | Vacant | — | — | — | — | No resident-house assignment or billing proposed. |
| Jan 2024–present | Eso Mobolaji Agboo | `resident_landlord` | 2024-01-01 | — | 2024-01-01 | Confirmed landlord return; the March 2024 NGN 60,000 payment does not change the first billing month. |

### Legacy payment history

| Year | Legacy rate | Payments / status visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2026 | NGN 10,000 | None visible | NGN 0 | NGN 80,000 | Preserve as open legacy balance. |
| 2025 | NGN 10,000 | Mar NGN 60,000; Jun NGN 60,000 | NGN 120,000 | `-` | Payment facts captured. |
| 2024 | NGN 5,000 | Mar NGN 60,000 | NGN 60,000 | `-` | Payment facts captured. |
| 2023 | — | `VACANT` | — | — | No billing or payment row proposed. |
| 2022 | NGN 5,000 | Tenant period; all fees confirmed paid | Not itemised | — | Preserve paid status; do not invent individual payment dates. |
| 2021 | NGN 5,000 | Tenant period; all fees confirmed paid | Not itemised | — | Preserve paid status; do not invent individual payment dates. |
| 2020 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve legacy balance under the ending landlord period. |
| 2019 | NGN 5,000 | Jun NGN 150,000 | NGN 150,000 | `(NGN 90,000)` credit | Preserve visible credit. |
| 2018 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2017 | NGN 5,000 | Oct NGN 35,000 | NGN 35,000 | NGN 25,000 | Payment facts captured. |
| 2016 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2015 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| **Sheet total** | — | — | **NGN 365,000** | **NGN 255,000** | Preserve exactly; do not recompute or post. |

### Proposed bulk-file rows (not database actions)

- Primary resident: Eso Mobolaji Agboo, with legacy name/payment-reference variant `Bolaji Kayode Eso`.
- Resident-house history: the three confirmed occupancy periods above, including the 2023 vacancy gap.
- Tenant: Ekomobong Uduakobo, linked only for 2021-01-01 through 2022-12-31. No relationship to the landlord is assumed.
- Payment rows: retain the explicit 2017, 2019, 2024, and 2025 payment cells. Record 2021/2022 as fully settled legacy tenant years, with payment dates left unspecified.
- No database match or database change has been attempted.

---

## L-0008 — OJO.K / House 11 F-2

### Source translation

- Primary resident: **Osa Osahon** (`MR.` retained as title/legacy alias); confirmed role: `tenant`.
- No blue move-in cell is visible. Earliest visible payment is **August 2018**, so move-in and first billing are `2018-08-01`.
- Billing rate: NGN 3,000/month through 2024; NGN 5,000/month in 2025–2026.

### Legacy payment history

| Year | Rate | Visible payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2026 | NGN 5,000 | None | NGN 0 | NGN 40,000 |
| 2025 | NGN 5,000 | Jan 30,000; Jun 5,000; Jul 5,000; Aug 20,000 | NGN 60,000 | Not legible/blank |
| 2024 | NGN 3,000 | Feb 95,000; May 3,000; Jun 6,000; Sep 3,000 | NGN 107,000 | `(NGN 71,000)` credit |
| 2023 | NGN 3,000 | Apr 40,000 | NGN 40,000 | `(NGN 4,000)` credit |
| 2022 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2021 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2020 | NGN 3,000 | Jan 3,000; Aug 21,000 | NGN 24,000 | NGN 12,000 |
| 2019 | NGN 3,000 | Jan–Oct 3,000 each; Dec 6,000 | NGN 36,000 | NGN 0 |
| 2018 | NGN 3,000 | Aug–Dec 3,000 each | NGN 15,000 | NGN 0 |
| **Sheet total** | — | — | **NGN 282,000** | **NGN 49,000** |

### Proposed bulk-file rows (not database actions)

- Osa Osahon → OJO.K-11 F-2; `tenant`; move-in and first billing `2018-08-01`; no move-out supplied.
- Preserve visible payments and annual balances. No database match or database change has been attempted.

---

## L-0009 — OJO.K / House 11 F-3

### Source translation

- Yellow source name: **Ofor Loveth Uche**.
- Additional source name: **Ifodu Loveth Uche**; relationship/role is not stated.
- A blue `NGN 36,000` cell appears in **August 2023**, establishing move-in `2023-08-01`. First billing is provisionally `2023-09-01`; preserve the visible August payment without forcing an allocation.
- Billing rate: NGN 3,000/month in 2023–2024; NGN 5,000/month in 2025–2026.

### Legacy payment history

| Year | Rate | Visible payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2026 | NGN 5,000 | None | NGN 0 | NGN 40,000 |
| 2025 | NGN 5,000 | May 30,000 | NGN 30,000 | NGN 30,000 |
| 2024 | NGN 3,000 | Aug 45,000 | NGN 45,000 | `(NGN 9,000)` credit |
| 2023 | NGN 3,000 | Aug 36,000 (blue) | NGN 36,000 | `(NGN 27,000)` credit |
| **Sheet total** | — | — | **NGN 111,000** | **NGN 34,000** |

### Proposed bulk-file rows (not database actions)

- Primary resident: **Ofor Loveth Uche**; confirmed role: `tenant`.
- Payment alias: `Ifodu Loveth Uche` (same person).
- Proposed assignment: Ofor Loveth Uche → OJO.K-11 F-3; `tenant`; move-in `2023-08-01`, first billing `2023-09-01`; no move-out supplied.
- Preserve the blue-cell move-in evidence and payment totals; no database match or database change has been attempted.

---

## L-0010 — OJO.K / House 11 F-4

### Source translation

- Primary resident: **Omonayajo Elizabeth Abisola**; confirmed role: `tenant`.
- Payment alias: `Olawunmi Elizabeth` (same person).
- A blue cell appears in **March 2020**, establishing move-in `2020-03-01`; first billing is provisionally `2020-04-01`.
- The lower source text begins `LANDLORD STATUS, SELF-...` but is cut off. Do not assume a role from the truncated text.
- Billing rate: NGN 3,000/month in 2020–2024; NGN 5,000/month in 2025.

### Legacy payment history

| Year | Rate | Visible payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Jul 37,000; Sep 10,000 | NGN 47,000 | NGN 13,000 |
| 2024 | NGN 3,000 | Apr 27,000; Sep 47,000 | NGN 74,000 | `(NGN 38,000)` credit |
| 2023 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2022 | NGN 3,000 | Feb 50,000 | NGN 50,000 | `(NGN 14,000)` credit |
| 2021 | NGN 3,000 | Oct 50,000 | NGN 50,000 | `(NGN 14,000)` credit |
| 2020 | NGN 3,000 | None; Mar blue | NGN 0 | NGN 27,000 |
| **Sheet total** | — | — | **NGN 221,000** | **NGN 10,000** |

### Proposed bulk-file rows (not database actions)

- Proposed assignment: Omonayajo Elizabeth Abisola → OJO.K-11 F-4; `tenant`; move-in `2020-03-01`, first billing `2020-04-01`; no move-out supplied.
- Payment alias: Olawunmi Elizabeth.
- Preserve the blue-cell move-in evidence and payment totals; no database match or database change has been attempted.

---

## L-0011 — OJO.K / House 11 F-4b

### Source translation

- Source resident: **Chukwuebuka Christian Izuagba**.
- A blue `NGN 60,000` cell appears in **November 2022**, establishing move-in `2022-11-01`; first billing is provisionally `2022-12-01`, while the November payment is preserved without allocation inference.
- Confirmed role: `tenant`.
- Billing rate: NGN 3,000/month in 2022–2024; NGN 5,000/month in 2025.

### Legacy payment history

| Year | Rate | Visible payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Feb 63,000 | NGN 63,000 | `(NGN 3,000)` credit |
| 2024 | NGN 3,000 | Aug 12,000 | NGN 12,000 | NGN 24,000 |
| 2023 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2022 | NGN 3,000 | Nov 60,000 (blue) | NGN 60,000 | `(NGN 57,000)` credit |
| **Sheet total** | — | — | **NGN 135,000** | `-` |

### Proposed bulk-file rows (not database actions)

- Proposed assignment: Chukwuebuka Christian Izuagba → OJO.K-11 F-4b; `tenant`; move-in `2022-11-01`, first billing `2022-12-01`; no move-out supplied.
- Preserve the blue-cell move-in evidence and payment totals; no database match or database change has been attempted.

---

## L-0012 — OJO.K / House 12

### Source translation

- Primary resident: **Tim Akenroye**; payment alias/title: `Pastor`.
- Source states landlord status, self-occupied; proposed role: `resident_landlord`.
- No blue move-in cell is visible. Earliest visible payment is **January 2015**, so move-in and first billing are `2015-01-01`.
- Building/compound/other-charge notes are excluded from import interpretation.
- Billing rate: NGN 5,000/month through 2024; NGN 10,000/month in 2025.

### Legacy payment history

| Year | Rate | Visible payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | None | NGN 0 | NGN 120,000 |
| 2024 | NGN 5,000 | Sep 54,000 | NGN 54,000 | NGN 6,000 |
| 2023 | NGN 5,000 | Apr 29,000 | NGN 29,000 | NGN 31,000 |
| 2022 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2021 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2020 | NGN 5,000 | Dec 20,000 | NGN 20,000 | NGN 40,000 |
| 2019 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2018 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2017 | NGN 5,000 | Jan 5,000; Feb 5,000; Mar 1,000 | NGN 11,000 | NGN 49,000 |
| 2016 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2015 | NGN 5,000 | Jan–Aug 5,000 each | NGN 40,000 | NGN 20,000 |
| **Sheet total** | — | — | **NGN 154,000** | **NGN 566,000** |

### Proposed bulk-file rows (not database actions)

- Tim Akenroye → OJO.K-12; `resident_landlord`; move-in and first billing `2015-01-01`; no move-out.
- Payment alias: Pastor. Preserve payment cells and annual balances; no database match or database change has been attempted.

---

## L-0022 — OJO.K / House 16A

- Resident: **Covenant Itauma**; user-confirmed role: `resident_landlord`.
- Blue NGN 120,000 cell in September 2025: move-in and first billing `2025-09-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Sep 120,000 (blue) | NGN 120,000 | `(NGN 90,000)` credit |
| **Sheet total** | — | — | **NGN 120,000** | **(NGN 90,000)** |

Account-note text is partially obscured; preserve only the visible source. No database match or change has been attempted.

---

## L-0023 — OJO.K / House 16B

- Resident: **Sonubi Bolanle Prince Richard**; user-confirmed role: `resident_landlord`.
- Blue cell in August 2022 (no amount): move-in and first billing `2022-08-01`.
- Note: `Power Connection -50K`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | None | NGN 0 | NGN 120,000 |
| 2024 | NGN 5,000 | Jul 260,000 | NGN 260,000 | `(NGN 200,000)` credit |
| 2023 | NGN 5,000 | None | NGN 0 | `(NGN 60,000)` credit |
| 2022 | NGN 5,000 | Aug blue/no amount; Sep 120,000 | NGN 120,000 | `(NGN 100,000)` credit |
| **Sheet total** | — | — | **NGN 380,000** | **(NGN 120,000)** |

No database match or change has been attempted.

---

## IBB batch — source-only translations (received 2026-08-11)

The following entries are intentionally grouped because the IBB screenshots were supplied together. IBB is the Ibrahim Babatunde street shortcode. The source contains `LANDLORD STATUS, SELF-OCCUPIED` text, but the user instructed us to ignore it for role classification; roles therefore remain unassigned until explicitly supplied. No database matching or writes were performed.

## L-0038 — IBB / House 1

- Primary resident: **Adegoke Tunde**; role intentionally unassigned (source landlord/self-occupied text ignored per user instruction).
- `Babatunde Oluwafemi Adegoke` is a confirmed alias.
- No blue cell. Earliest paid month January 2015, so move-in and first billing are `2015-01-01`.
- Payments: 2025 Jan NGN120,000; 2024 Jan NGN60,000; 2023 Jan NGN60,000; 2022 Jan NGN60,000; 2021 Jan NGN60,000; 2020 Jan NGN60,000; 2015–2019 monthly NGN5,000 entries (NGN60,000 each year). Sheet total paid NGN720,000; due `-`.
- Preserve source building/compound notes; no additional charges are inferred.

## L-0039 — IBB / House 3A F-3

- **Henry Itoki**; role intentionally unassigned (source landlord/self-occupied text ignored).
- Blue cell August 2022 (no amount): move-in `2022-08-01`; first billing provisionally `2022-09-01`.
- Payments: 2025 Sep NGN36,000 (due NGN24,000); 2024 none (due NGN36,000); 2023 Apr NGN36,000 and Dec NGN60,000 (paid NGN96,000; due `(NGN60,000)`); 2022 blue Aug/no amount. Sheet total paid NGN132,000; due NGN15,000.

## L-0040 — IBB / House 3A F-4

- **Chibueze Nicholas James**; gray `JAMES` is a confirmed alias.
- `Oyedare Gbenga David` appears only in a security-payment note, not as a resident.
- Blue October 2022 (no amount): move-in `2022-10-01`; first billing provisionally `2022-11-01`.
- Payments: 2025 Jul NGN86,000 and Sep NGN10,000 (due `(NGN36,000)`); 2024 none (due NGN36,000); 2023 Apr NGN36,000 (due `-`); 2022 blue Oct/no amount (due NGN15,000). Sheet total paid NGN132,000; due NGN15,000.
- Preserve verbatim security note: `OYEDARE GBENGA DAVID - Paid #36,000 for 1Year security Due (Covering Oct 2022 – Sep 2023), for Mr James. The #36,000 should be deducted from the #66,000 he paid on 5th Apr 2023`.

## L-0041 — IBB / House 3 ? F ?

- **Maxwell Mensah**; role intentionally unassigned (source landlord/self-occupied text ignored).
- Property identifier confirmed by user as **House 3 ? F ?**; retain the question marks as the legacy label.
- Blue September 2023 NGN36,000: move-in and first billing `2023-09-01`.
- Payments: 2025 Jan NGN15,000 + Aug NGN22,000 = NGN37,000 (due NGN23,000); 2024 Aug NGN10,000 (due NGN26,000); 2023 Sep NGN36,000 (blue; due `(NGN24,000)`). Sheet total paid NGN83,000; due NGN25,000.

## L-0042 — IBB / House 5

- **Chike Lawrence Okeke**; role intentionally unassigned. Gray `7, 6 & 10 Interiors Ltd` is a confirmed alias.
- No blue cell. Earliest paid month January 2023 gives move-in/first billing `2023-01-01`. The acquisition/renovation text is ignored for date interpretation and retained only as a note.
- Payments: 2025 none (due NGN120,000); 2024 none (due NGN60,000); 2023 Jan NGN100,000 + May NGN50,000 = NGN150,000 (due `(NGN90,000)`); 2022 none (due NGN60,000). Sheet total paid NGN150,000; due NGN150,000.
- Preserve note: `MR CHIKE LAWRENCE OKEKE - NEW LANDLORD RENOVATION FEE 200,000 PLUS INITIAL DEBT OF THE BUILDING 230,000 = 430,000……100-430=330K BAL`.

## L-0043 — IBB / House 7

- **Uwaya Benjamin Iyapherame**; role intentionally unassigned (source landlord/self-occupied text ignored).
- Blue February 2021 (no amount): move-in `2021-02-01`; first billing provisionally `2021-03-01`.
- Payments: 2025 Apr NGN60,000 + Jul NGN10,000 = NGN70,000 (due NGN50,000); 2024 Apr NGN60,000; 2023 Feb NGN60,000; 2022 Jan NGN60,000; 2021 Apr NGN50,000. Sheet total paid NGN300,000; due NGN50,000.

## L-0044 — IBB / House 10A

- Primary resident: **Chukwuma Bright Unaegbu** (user-corrected canonical name); gray `Golden Chidi` is a confirmed alias.
- Role intentionally unassigned (source landlord/self-occupied text ignored).
- Blue February 2021 NGN3,000: move-in `2021-02-01`; first billing provisionally `2021-03-01`.
- Payments: 2021 Feb NGN3,000 (blue), Oct NGN3,000, Dec NGN3,000 = NGN9,000; 2022 Jan/Apr/May/Jun/Aug/Sep/Oct/Nov NGN3,000 each = NGN21,000; 2023 Jan NGN6,000, Mar NGN3,000, Apr NGN3,000, Jun NGN6,000, Jul NGN3,000, Sep NGN6,000, Oct NGN3,000, Nov NGN3,000 = NGN33,000; 2024 Feb NGN6,000, Mar NGN3,000, Apr NGN3,000, Jun NGN6,000, Jul NGN3,000, Sep NGN6,000, Oct NGN3,000, Nov NGN3,000 = NGN33,000; 2025 none. Sheet total paid NGN63,000; due NGN138,000.

## L-0045 — IBB / House 16 (label shown only as `16`)

- Primary resident: **Odubugwu Justin Chidera** (user-corrected canonical name); gray `Azubuike Justin` is a confirmed alias.
- Role intentionally unassigned (source landlord/self-occupied text ignored).
- Blue December 2024 NGN60,000: move-in `2024-12-01`; first billing provisionally `2025-01-01`.
- Payments: 2024 Dec NGN60,000 (rate NGN3,000; row credit `(NGN60,000)`); 2025 none (rate NGN5,000; due NGN60,000). Sheet paid NGN60,000; displayed net balance is blank/zero. Preserve source arithmetic without recomputation.

## L-0046 — IBB / House 16A

- **Evelyn Christian Okoduva**; role intentionally unassigned (source landlord/self-occupied text ignored).
- Blue January 2025 NGN6,000: move-in `2025-01-01`; first billing provisionally `2025-02-01`.
- Payments: Jan NGN6,000 (blue) and Feb NGN60,000. Sheet total paid NGN66,000; due `(NGN6,000)` credit.
- Preserve note: `Balance from KOA account brought forward`.

### IBB clarification queue

- All gray names/references in this IBB batch are confirmed aliases.
- IBB canonical names and the House 3 ? F ? label are confirmed above.
- House 5 acquisition/renovation text is notes-only and does not override the January 2023 date rule.
- IBB roles remain intentionally unassigned because the source landlord/self-occupied labels were explicitly ignored.

---

## IBB batch — additional source-only translations (received 2026-08-11)

Per the prior instruction, all IBB source landlord/self-occupied labels are ignored for role classification; these entries have no assigned role until supplied. Blue-cell first billing is provisional in the month after the blue move-in month unless the source/user specifies otherwise.

## L-0047 — IBB / House 18E-2
- **Ugvu Emmanuel Udochukwu**; role unassigned. Blue July 2021 (blank): move-in `2021-07-01`, first billing provisional `2021-08-01`.
- Payments: 2023 Mar NGN1,000 + Apr NGN10,000 = NGN11,000; 2021–2022 and 2024–2025 no payments. Sheet paid NGN11,000; due NGN172,000.

## L-0048 — IBB / House 18F-3
- **Lana Anih**; alias **Prince Wowo West** (user-corrected from the initial screenshot transcription); role unassigned. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2025 Apr NGN10,000 + Jun NGN20,000 = NGN30,000; 2024 Feb 50,000 + Apr 35,000 + Jul 21,000 + Aug 15,000 + Dec 15,000 = NGN136,000; 2023 Feb 20,000 + Oct 12,000 + Dec 12,000 = NGN44,000; 2022 Feb 20,000 + Jul 20,000 = NGN40,000; 2021 none; 2020 Jan 12,000 + Jun 9,000 = NGN21,000; 2019 Oct NGN20,000; 2018 and 2017 NGN36,000 each; 2016 NGN33,000; 2015 Jan–Mar NGN9,000. Sheet paid NGN405,000; due NGN15,000.

## L-0049 — IBB / House 18F-4
- **Wilson Tobias Chukwu** (user-confirmed); role unassigned. Blue Nov 2020 (blank): move-in `2020-11-01`, first billing provisional `2020-12-01`.
- Payments: 2025 Jul NGN71,000 + Sep NGN58,000 = NGN129,000 (credit `(NGN69,000)`); 2022 Apr NGN18,000 + Oct NGN12,000 = NGN30,000; 2021 Jan 9,000 + Feb 9,000 + Oct 18,000 = NGN36,000. Sheet paid NGN195,000; due NGN15,000.

## L-0050 — IBB / House 18F-1
- **Osinamma Livinus Chinonye**; role unassigned. Blue Aug 2022 NGN9,000: move-in `2022-08-01`, first billing provisional `2022-09-01`.
- Payments: 2025 Jul NGN100,000 (credit `(NGN40,000)`); 2024 Apr NGN25,000; 2023 Mar NGN6,000; 2022 Aug NGN9,000. Sheet paid NGN140,000; due NGN4,000.

## L-0051 — IBB / House 20
- **Sandra Isioma Mban**; role unassigned. Blue May 2025 NGN30,000: move-in/first billing `2025-05-01` (first billing timing follows explicit payment blue cell here).
- Sheet paid NGN30,000; due `(NGN9,000)` credit.

## L-0052 — IBB / House 21A
- **Shehu Audu**; role unassigned. Blue May 2025 (blank): move-in `2025-05-01`, first billing provisional `2025-06-01`.
- 2025 Sep NGN100,000; displayed row paid NGN160,000 and due `(NGN100,000)` despite visible mismatch; 2026 paid 0, due NGN30,000. Sheet paid NGN160,000; due NGN70,000.
- Note: `Development Levy - #200K paid on 31 July 2025; Balance - #250k`.

## L-0053 — IBB / House 21C
- **Halima Abdullahi**; role unassigned. Blue Sep 2024 (blank): move-in `2024-09-01`, first billing provisional `2024-10-01`.
- 2025 May NGN60,000 + Sep NGN235,000 = NGN295,000 (credit `(NGN175,000)`); development-levy row paid NGN200,000, due NGN190,000; 2024 no rent payment, due NGN15,000. Sheet paid NGN495,000; due NGN30,000.
- Note: `Development Levy - #200K paid on 31, August 2024; Balance #250k`.

## L-0054 — IBB / House 23B
- **Atseyinku Atifan Theodore**; role unassigned. Blue Aug 2024 NGN60,000: move-in `2024-08-01`, first billing provisionally `2024-09-01`.
- 2025 Jul NGN250,000 + Sep NGN100,000 = NGN350,000 (credit `(NGN230,000)`); 2024 Aug NGN60,000 (credit `(NGN40,000)`); development-fees row paid NGN90,000, due NGN300,000. Sheet paid NGN500,000; due NGN30,000.
- Notes: `Total Due = N350K + N60K Security Dues`; `Paid Development Fees - N150K (Aug 30th, Jul 28th 2025)`.

## L-0055 — IBB / House 23C
- **Williams Ayemere Ukokobili**; role unassigned. Blue Mar 2024 NGN60,000: move-in `2024-03-01`, first billing provisional `2024-04-01`.
- 2025 visible Jul NGN30,000 + Sep NGN50,000, but row paid displays NGN30,000/due NGN15,000; 2024 Mar NGN60,000 (credit `(NGN15,000)`). Sheet paid NGN90,000; due `-`. Preserve the source inconsistency.
- Note: `Paid Development Fees - N150K, Power Connection - N50K`.

## L-0056 — IBB / House 25
- **Markson Nembadoon**; alias **Best**; role unassigned. Blue Dec 2022 (blank): move-in `2022-12-01`, first billing provisional `2023-01-01`.
- Payments: 2025 Jul NGN35,000 + Sep NGN50,000 = NGN85,000; 2024 Apr NGN60,000; 2023 Apr NGN45,000 + Jul NGN50,000 = NGN95,000 (credit `(NGN35,000)`); 2022 blue/no amount. Sheet paid NGN240,000; due `-`.
- Notes: Transformer/Electricity Connection NGN50,000; Development House Purchase Fee NGN150,000.

## L-0057 — IBB / House 26 F-1
- **Anyawu Chinenyi**; alias **Olufunke Titilola (F1)**; role unassigned. Blue Oct 2018 NGN6,000: move-in `2018-10-01`, first billing provisional `2018-11-01`.
- Payments: 2025 Jan/Aug NGN60,000 each = NGN120,000 (credit `(NGN60,000)`); 2024 Apr NGN57,000; 2023 Feb NGN12,000 + Apr NGN9,000 + Aug NGN24,000 = NGN45,000; 2022 Feb NGN36,000; 2021 Aug NGN36,000; 2020 Apr NGN9,000 + Aug NGN18,000 = NGN27,000; 2019 Mar/May/Jul/Oct/Dec NGN3,000 each = NGN15,000; 2018 Oct NGN6,000. Sheet paid NGN342,000; due `(NGN60,000)`.

## L-0058 — IBB / House 26 F-2
- **Chuks Mbonu**; alias **Olufunke Titilola (F2)**; role unassigned. Blue Jul 2020 (blank): move-in `2020-07-01`, first billing provisional `2020-08-01`.
- Payments: 2025 Jan/Aug NGN60,000 each = NGN120,000 (credit `(NGN60,000)`); 2024 Apr NGN36,000; 2023 Feb NGN12,000 + Aug NGN24,000 = NGN36,000; 2022 Feb NGN36,000; 2020 blue/no amount. Sheet paid NGN228,000; due `(NGN9,000)`.

## L-0059 — IBB / House 26 F-3
- **Mrs Ikoli**; alias **Olufunke Titilola (F3)**; role unassigned. The Sep 2025 NGN9,000 cell is user-confirmed as the move-in marker: move-in `2025-09-01`, first billing provisionally `2025-10-01`.
- Sheet paid NGN9,000; due NGN51,000. Note: `Outstanding Dues from previous tenant`; previous-tenant row paid 0, due NGN9,000.

## L-0060 — IBB / House 26 F-4
- **Toliluope Ayodele**; alias **Olufunke Titilola (F4)**; role unassigned. No blue cell; earliest paid Feb 2023 gives move-in/first billing `2023-02-01`.
- Payments: 2024 Apr NGN36,000; 2023 Feb NGN12,000 + Aug NGN24,000 = NGN36,000. Sheet paid NGN72,000; due NGN204,000.

## L-0061 — IBB / House 27
- **Christian Philips (Apostle)**; role unassigned per IBB instruction. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2025 Aug NGN475,000 (credit `(NGN355,000)`); 2020 Jun NGN120,000 (credit `(NGN60,000)`); 2016 Jan–Nov NGN5,000 = NGN55,000; 2015 Jan–Dec NGN5,000 = NGN60,000. Sheet paid NGN235,000; due NGN10,000.
- Possible identity overlap with Christian Philips in OJO.K Houses 14/14A is retained as a candidate only; no merge is proposed without later DB review.

### Additional IBB clarification queue

No open name or move-in-highlight clarifications remain for L-0047–L-0061.

---

## IBB batch — source-only translations (received 2026-08-11)

Unless stated otherwise, IBB source landlord/self-occupied labels remain ignored for role classification.

## L-0062 — IBB / House 29A
- **Bobby Itua**; role unassigned. Blue Jul 2019 (no amount): move-in `2019-07-01`, first billing provisionally `2019-08-01`.
- Payments: 2022 Jun NGN30,000; 2023 Sep NGN40,000; 2024 Feb NGN120,000; 2025 Feb NGN310,000. Sheet paid NGN500,000; due `(NGN55,000)` credit.

## L-0063 — IBB / House 29A BQ
- **Barbara Igba**; duplicate gray source name is retained as a self-alias/reference; role unassigned. Blue Oct 2023 (no amount): move-in `2023-10-01`, first billing provisionally `2023-11-01`.
- Payments: 2023 Jun NGN18,000; 2024 none; 2025 Feb NGN18,000 + Sep NGN42,000 = NGN60,000. Sheet paid NGN78,000; final displayed balance `-`.

## L-0064 — IBB / House 29B
- Primary resident: **Ubah Karl Chinedu**; **Villanova Realty** is a payment alias. Role unassigned.
- No blue cell; earliest monthly payment May 2025 gives move-in/first billing `2025-05-01`.
- Payment: 2025 May NGN120,000. Separate `POWER CONN` row paid NGN150,000. Sheet paid NGN270,000; due `-`.

## L-0065 — IBB / House 31 F-1
- **Chigozie Agu**; role unassigned. Confirmed aliases: **Lilian Chinenye** and **Rhemr/Rhemroyce Po POS**.
- Blue Sep 2022 NGN12,000: move-in `2022-09-01`, first billing provisionally `2022-10-01`.
- Payments: 2022 Sep NGN12,000; 2023 Apr NGN12,000; 2024 Apr NGN45,000; 2025 Aug NGN47,000 + Sep NGN10,000 = NGN57,000. Sheet paid NGN126,000; due NGN15,000.

## L-0066 — IBB / House 31 F-3
- **Veronica Inyan**; role unassigned. Payment aliases: **Margaret Akpo** and **Rivers Geena Asuquo**.
- Blue May 2023 NGN18,000: move-in `2023-05-01`, first billing provisionally `2023-06-01`.
- Payments: 2023 May NGN18,000; 2024 Jan NGN9,000 + Oct NGN24,000 = NGN33,000; 2025 none. Sheet paid NGN51,000; due NGN66,000.

## L-0067 — IBB / House 31 F-4
- **Adeola Olajubu**; role unassigned. Blue Dec 2021 (no amount): move-in `2021-12-01`, first billing provisionally `2022-01-01`.
- Payments: 2022 Feb/Apr/May/Jun/Jul NGN3,000 each, Aug NGN6,000, Oct NGN15,000 = NGN36,000; 2023 Feb NGN3,000 + Mar NGN9,000 + May NGN12,000 + Sep NGN12,000 = NGN36,000; 2024 Feb NGN36,000. Sheet paid NGN108,000; due NGN60,000.

## L-0068 — IBB / House 33
- Canonical landlord: **Alphonsus Okoro**, `resident_landlord`; `Chief Okoro` is a legacy alias/reference.
- No blue cell; earliest payment Jul 2023 gives move-in/first billing `2023-07-01`.
- Payments: 2023 Jul NGN50,000; 2024 Apr NGN150,000 + Jun NGN50,000 = NGN200,000; 2025 Jun NGN30,000 + Aug NGN150,000 = NGN180,000. Sheet paid NGN430,000; due NGN290,000.

## L-0069 — IBB / House 32
- Canonical landlord: **Akintayo Olawunmi Elizabeth**, `resident_landlord`; associated corporate entity: **Angel Crest**.
- No blue cell; earliest payment Jun 2015 gives move-in/first billing `2015-06-01`.
- Payments: 2015 Jun NGN20,000; 2016 Feb NGN10,000; 2018 Aug NGN50,000; 2019 Mar NGN30,000; 2020 Jan NGN20,000; 2021 Oct NGN50,000; 2022 Feb NGN50,000 + Dec NGN10,000; 2023 Mar NGN30,000 + Jul NGN40,000; 2024 Feb NGN20,000 + Sep NGN5,000; 2025 Feb NGN50,000 + Jul NGN90,000. Sheet paid NGN475,000; due NGN245,000.

## L-0070 — IBB / House 36A
- **Kemchuta Homes Limited**, corporate entity; role unassigned. Blue May 2023 NGN60,000: move-in `2023-05-01`, first billing provisionally `2023-06-01`.
- Payments: 2023 May NGN60,000 + Jun NGN90,000 = NGN150,000; 2024 Jul NGN150,000; 2025 Sep NGN60,000. Sheet paid NGN360,000; due NGN27,500.
- Note: `SPECIAL ARRANGEMENT WITH EXCO TO PAY N150K ANNUAL AS COMMERCIAL`.

## L-0071 — IBB / House 36B
- **Shakirudeen Olanrewaju (Alahji)**; role unassigned. Payment alias: **Bakre Olarenwaju Ishola**.
- No blue cell; earliest payment Dec 2020 gives move-in/first billing `2020-12-01`.
- Payments: 2020 Dec NGN30,000; 2021 Oct NGN30,000; 2023 May NGN100,000; 2024 Feb NGN120,000 + Oct NGN50,000 = NGN170,000. Sheet paid NGN330,000; due NGN390,000.

## L-0072 — IBB / House 38
- Canonical landlord: **Simeon Kayode Oni**, `resident_landlord`; associated corporate entity: **Debiruss School**.
- Blue Nov 2018 (no amount): move-in `2018-11-01`, first billing provisionally `2018-12-01`.
- Payments: 2019 Feb NGN60,000; 2020 Feb NGN60,000 + Apr NGN36,000 = NGN96,000; 2022 Jan NGN60,000; 2023 Jan NGN60,000; 2024 Jan NGN60,000; 2025 Sep NGN114,000. Sheet paid NGN450,000; due NGN30,000.

### IBB clarification queue

No outstanding name/alias classifications remain in the reviewed IBB records.

---

## GLB batch — source-only translations (received 2026-08-11)

`GLB` maps to Gbolahon Bishi. Roles are intentionally unassigned unless explicitly confirmed. A blue cell establishes move-in; first billing is provisional in the following month unless otherwise stated.

## L-0073 — GLB / House 1A
- **Ife Komolafe Alaba Omo**; role unassigned. Blue Apr 2023: move-in `2023-04-01`, first billing `2023-05-01`.
- Payments: 2023 May NGN60,000; 2024 Jan NGN40,000 + Dec NGN120,000 = NGN160,000; 2025 none. Sheet paid NGN220,000; due `-`.
- Notes: `PAID NEW RESIDENT/BUILDING PURCHASE FEE # 200K (IN MAY)`; `PAID ANNUAL SECURITY DUE # 60K (IN MAY)`.

## L-0074 — GLB / House 1B
- **Ogiefa Barry Dan**; role unassigned. Blue Apr 2024: move-in `2024-04-01`, first billing `2024-05-01`.
- Payment: 2025 Aug NGN270,000; development row paid NGN250,000/due NGN140,000. Sheet paid NGN520,000; due NGN30,000.

## L-0075 — GLB / House 2A
- **Obinwo Oluwatobi Ebenezer**; role unassigned. Blue Jul 2023: move-in `2023-07-01`, first billing `2023-08-01`.
- Payments: 2023 Aug/Dec NGN30,000 each = NGN60,000; 2024 Jul NGN25,000; 2025 Feb NGN20,000, Apr NGN30,000, Jul/Aug NGN20,000 each, Sep/Oct NGN10,000 each = NGN110,000. Source sheet grand paid NGN85,000; due `-`; preserve the source total inconsistency.
- Note: `ADEMESO MODUPE IFEOLUWA MOVED OUT IN JUNE` (year/relationship not supplied).

## L-0076 — GLB / House 2B
- **Njoku Macdonald Egwu**; role unassigned. Blue Dec 2019 (no amount): move-in `2019-12-01`, first billing `2020-01-01`.
- Payments: 2020 Jan–Dec NGN5,000 monthly = NGN60,000; 2021/2022 Feb NGN60,000 each; 2023 Jan NGN60,054; 2024 Jan NGN60,000; 2025 Mar NGN120,000 + Sep NGN30,000 = NGN150,000. Sheet paid NGN450,054; due `(NGN30,054)` credit.

## L-0077 — GLB / House 3A
- **Michael Iwuoha**; payment alias: `Trojans Merchandise`. Role unassigned.
- Blue Feb 2023 (no amount): move-in `2023-02-01`, first billing `2023-03-01`.
- Payment: 2024 Feb NGN60,000. Sheet paid NGN60,000; due NGN170,000.

## L-0078 — GLB / House 3B
- **Ikenna Mbachu**; payment alias: `Alex Igiri Oyom`. Role unassigned.
- Blue Aug 2023 (no amount): move-in `2023-08-01`, first billing `2023-09-01`.
- Payments: 2023 Sep NGN260,000; 2025 Jul NGN140,000. Sheet paid NGN400,000; due `-`.
- Notes: `NEW RESIDENT/BUILDING PURCHASE FEE # 200K`; `ANNUAL SECURITY DUE # 60K`.

## L-0079 — GLB / House 4
- **Paulinus / Isioma Monica Obiajulu**; role unassigned. No blue cell; earliest paid Jan 2018 gives move-in/first billing `2018-01-01`.
- Payments: 2018/2019 NGN60,000 each; 2020–2022 Feb NGN60,000 each; 2023 Apr/Dec NGN60,000 each; 2025 Feb NGN120,000. Sheet paid NGN540,000; due `-`.

## L-0080 — GLB / House 5A
- **Okolie Ozioma Francisca**; payment alias: `Okoli Stephen Ndubueze`. Role unassigned.
- Blue Sep 2025 NGN120,000: move-in `2025-09-01`, first billing provisionally `2025-10-01`.
- Sheet paid NGN120,000; due `(NGN90,000)` credit.

## L-0081 — GLB / House 5B
- **Charles Yemi Farimoyo**; role unassigned. **William Racheal Ti** is the landlord, not an alias; landlord residency/start date are not supplied.
- No blue cell; earliest paid Apr 2019 gives move-in/first billing `2019-04-01`.
- Payments: 2019 Apr NGN10,000 + Jun NGN60,000 + Aug NGN10,000 = NGN80,000; 2020 May NGN5,000; 2021 Mar NGN60,000; 2022 Mar NGN15,000 + Jun NGN30,000 = NGN45,000; 2023 Apr/Jul NGN30,000 each = NGN60,000; 2024 Apr NGN70,000 + Dec NGN40,000 = NGN110,000; 2025 Feb/May NGN40,000 each + Sep NGN20,000 = NGN100,000. Sheet paid NGN460,000; due NGN20,000.

## L-0082 — GLB / House 6
- **Mark Kayode Oshin Otunba**; role unassigned. No blue cell; earliest paid Jan 2016 gives move-in/first billing `2016-01-01`.
- Payments: 2016/2017 NGN60,000 each; 2018 Jan–Jun NGN5,000 = NGN30,000; 2021 May NGN150,000; 2022 Apr NGN60,000; 2023 Feb NGN60,000; 2024 Jan NGN60,000 + Mar NGN120,000 = NGN180,000; 2025 Feb NGN120,000. Sheet paid NGN720,000; due `-`.

## L-0083 — GLB / House 7A
- **Oshodi Adetutu Mrs.**; role unassigned. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Preserve visible payments and row balances: 2015–2019 NGN60,000/year; 2020 NGN30,000; 2021 NGN40,000; 2022 NGN40,000; 2023 NGN120,000; 2024 NGN65,000; 2025 NGN95,000. Sheet total paid NGN530,000/due NGN30,000 does not reconcile to all visible row payments; preserve source totals.

## L-0084 — GLB / House 7B
- **Chalokwu Emmanuel**; role unassigned. No blue cell; earliest paid Jan 2017 gives move-in/first billing `2017-01-01`.
- Payments: 2017/2018 NGN60,000 each; 2019 NGN95,000; 2020 Jan NGN60,000; 2021–2024 Feb NGN60,000 each; 2025 Feb NGN120,000. Sheet paid NGN635,000; due `-`.

## L-0085 — GLB / House 8
- **Okereke James Ukpa**; payment alias: `James & Chidinma Okereke`. Role unassigned.
- No blue cell (Apr 2024 green outline is not a move-in marker); earliest paid May 2021 gives move-in/first billing `2021-05-01`.
- Payments: 2020 Nov NGN60,000; 2021 May NGN60,000; 2022 Aug NGN60,000; 2023/2024 Jan NGN60,000 each; 2025 Apr NGN120,000. Sheet paid NGN420,000; due `-`.

## L-0086 — GLB / House 9A
- **Mene Godwin Tonseju**; payment alias: `Mama Shola`. Role unassigned.
- Blue Sep 2018 (no amount): move-in `2018-09-01`, first billing `2018-10-01`.
- Payments: 2021 Nov NGN15,000; 2024 Apr NGN15,000 + Sep NGN20,000; 2025 Jan NGN15,000 + May NGN25,000. Sheet paid NGN90,000; due NGN399,000.

## L-0087 — GLB / House 9B F-1
- **Obinna Chike Ubachukwu**; payment alias: `Chinedu Ubachukwu`. Role unassigned.
- Blue Apr 2018 (no amount): move-in `2018-04-01`, first billing `2018-05-01`.
- Payments: 2018 May–Nov NGN3,000 each = NGN21,000; 2020 May NGN30,000 + Aug NGN45,000 = NGN75,000; 2021 Oct NGN18,000; 2022 Aug NGN36,000; 2023 Mar NGN36,000; 2024 Feb NGN36,000; 2025 Jul NGN78,000. Sheet paid NGN300,000; due `-`.

## L-0088 — GLB / House 9B F-2
- **Lawrence Ewah**; role unassigned. Blue Jul 2024 (no amount): move-in `2024-07-01`, first billing `2024-08-01`; retain pre-move-in Jun NGN18,000 payment as a source anomaly.
- Payments: 2024 Jun NGN18,000; 2025 Feb NGN25,000 + Jul NGN30,000 = NGN55,000. Sheet paid NGN73,000; due `(NGN33,000)` credit.

## L-0089 — GLB / House 9D
- **Imaeke Ejike Kingsley Pastor**; role unassigned. No blue cell; earliest paid Mar 2018 gives move-in/first billing `2018-03-01`.
- Payments: 2018 Mar–Dec NGN3,000 monthly = NGN30,000; 2019 NGN36,000; 2020 NGN34,000; 2021 NGN36,000; 2022 Aug NGN21,000; 2023 Feb NGN36,000; 2024 Jul NGN20,000; 2025 Jul NGN20,000 + Aug NGN30,000 + Sep NGN28,000 = NGN78,000. Sheet paid NGN291,000; due NGN15,000.

## L-0090 — GLB / House 11
- **Adeyemo Adetokunbo Mrs.**; role unassigned. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Rate NGN2,000. Visible annual paid totals: 2015–2018 NGN24,000 each; 2019 NGN26,000; 2020/2021 NGN24,000 each; 2022 NGN24,000; 2023 NGN24,000; 2024 NGN22,000; 2025 NGN18,000. Sheet paid NGN258,000; due NGN6,000.

## L-0091 — GLB / House 12
- **Micah Sunday Ukaka**; role unassigned. No blue cell; earliest paid Aug 2018 gives move-in/first billing `2018-08-01`.
- Payments: 2018 Aug–Dec NGN3,000 each = NGN15,000; 2019 Jan–Sep NGN3,000 = NGN27,000; 2020 Jan–Aug NGN3,000 plus Sep NGN63,000 = NGN87,000; 2021 Nov NGN24,000; 2022 Apr NGN30,000; 2023 Mar NGN60,000; 2025 Sep NGN180,000. Sheet paid NGN243,000; due NGN30,000.

### GLB clarification queue

No outstanding alias/secondary classifications. GLB 5B landlord residency and start date remain unspecified.

---

## GLB batch — Houses 16–19C (received 2026-08-11)

All `19*` properties below share the user-confirmed landlord **Hassan Ogwe**, `resident_landlord`. The primary residents' roles remain unassigned unless separately stated.

## L-0092 — GLB / House 16

- **Tijani Mufutau Adetoku**; role unassigned. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2018 NGN60,000/year; 2019 NGN88,000 (including Dec NGN33,000); 2020–2024 NGN60,000/year; 2025 Jan NGN120,000. Sheet paid NGN748,000; due `(NGN28,000)` credit.

## L-0093 — GLB / House 16BQ

- **Hamzat Ibrahim Olanrewaju**; role unassigned. Blue Mar 2022 (no amount): move-in `2022-03-01`, first billing `2022-04-01`.
- Payments: 2022 Apr/Jun/Aug NGN6,000 each + Oct NGN9,000 = NGN27,000; 2023 Feb NGN9,000 + Jun NGN6,000 + Aug NGN9,000 + Dec NGN12,000 = NGN36,000; 2024 Feb NGN36,000; 2025 Feb NGN10,000 + May NGN10,000 + Jul NGN15,000 + Sep NGN10,000 = NGN45,000. Sheet paid NGN144,000; due NGN15,000.

## L-0094 — GLB / House 17A Flat 1

- **Christopher Ounorah Okafor**; payment aliases: **Christian Ounorah** and **Ochuagbachris Chinenye**. Role unassigned.
- Blue Jun 2022 (no amount): move-in `2022-06-01`, first billing `2022-07-01`.
- Payments: 2022 May NGN36,000; 2023 Jul/Aug/Nov NGN9,000 each = NGN27,000; 2024 Jan NGN9,000 + Apr NGN9,000 + Oct NGN6,000 = NGN24,000; 2025 Jan NGN18,000 + Apr NGN20,000 + Jun NGN15,000 + Sep NGN10,000 = NGN63,000. Sheet paid NGN150,000; due `-`.

## L-0095 — GLB / House 19

- **Ezinne Leona Egejuru**; landlord **Hassan Ogwe**. Blue Nov 2023 NGN18,000: move-in `2023-11-01`, first billing `2023-12-01`.
- Payments: 2023 Nov NGN18,000; 2025 Sep NGN66,000. Sheet paid NGN84,000; due NGN15,000.

## L-0096 — GLB / House `19?`

- **Okhuelegbe Cletus Omoria**; landlord **Hassan Ogwe**. Blue Nov 2024 (no amount): move-in `2024-11-01`, first billing `2024-12-01`.
- Payments: 2024 Apr NGN36,000 (pre-move-in payment preserved as source anomaly); 2025 Sep NGN50,000. Sheet paid NGN86,000; due NGN13,000.

## L-0097 — GLB / House 19A F-1

- **Tivere Iweta Emmanuel**; landlord **Hassan Ogwe**. Blue Dec 2019 (no amount): move-in `2019-12-01`, first billing `2020-01-01`.
- Payments: 2020 Apr NGN3,000; 2022 Mar NGN10,000 + Jun NGN5,000 + Sep/Oct NGN10,000 each = NGN35,000; 2023 Feb NGN20,000 + Apr NGN16,000 + May NGN13,000 + Jul NGN20,000 + Sep NGN14,000 + Oct NGN47,000 = NGN130,000; 2024 Apr/Nov NGN9,000 each = NGN18,000; 2025 Feb NGN20,000 + Jul NGN12,000 + Sep NGN10,000 = NGN42,000. Sheet paid NGN228,000; due NGN15,000.

## L-0098 — GLB / House 19A F-2

- **Rose Egodi Nnalue**; landlord **Hassan Ogwe**. Blue Dec 2019 (no amount): move-in `2019-12-01`, first billing `2020-01-01`.
- Payments: 2021 May NGN10,000; 2022 Jun NGN15,000; 2023 Apr NGN40,000 + Dec NGN30,000 = NGN70,000; 2024 Mar NGN36,000 + Apr NGN22,000 = NGN58,000; 2025 Jul NGN20,000 + Sep NGN52,000 = NGN72,000. Sheet paid NGN225,000; due NGN15,000.

## L-0099 — GLB / House 19A F-3

- **Ugonma Emeali Innocencia**; landlord **Hassan Ogwe**. Blue Jan 2021 (no amount): move-in `2021-01-01`, first billing `2021-02-01`.
- Payments: 2022 Jun NGN3,000; 2024 Feb NGN108,000 + Jul NGN36,000 = NGN144,000; 2025 Sep NGN42,000. Sheet paid NGN189,000; due NGN15,000.

## L-0100 — GLB / House 19B F-2

- **Anosike Chioma Lilian**; linked secondary resident: **Anosike Ezinne Angela**; landlord **Hassan Ogwe**.
- Blue Jan 2020 (no amount): move-in `2020-01-01`, first billing `2020-02-01`.
- Payments: 2020 Apr NGN5,000; 2022 Jun NGN12,000; 2023 Apr NGN30,000; 2024 Feb NGN40,000 + Apr NGN66,000 + Sep NGN20,000 = NGN126,000; 2025 Jul NGN39,000 + Sep NGN10,000 = NGN49,000. Sheet paid NGN222,000; due NGN15,000.

## L-0101 — GLB / House 19C F-3

- **Ginika Asiegbu Mis**; payment alias: **Asiegbu David**; landlord **Hassan Ogwe**.
- Blue Dec 2015 (no amount): move-in `2015-12-01`, first billing `2016-01-01`.
- Payments: 2017 Jan–Jul NGN3,000 each = NGN21,000; 2019 Jul NGN5,000; 2020 May/Nov NGN10,000 each = NGN20,000; 2021 Feb NGN35,000; 2024 Apr NGN253,000; 2025 Aug NGN35,000. Sheet paid NGN334,000; due NGN15,000.

### GLB clarification queue

No outstanding GLB name/relationship classifications in the reviewed records.

---

## GLB batch — Houses 20 F-1 through F-9 (received 2026-08-11)

All `20*` records below share the user-confirmed landlord **Hassan Ogwe**, `resident_landlord`. Primary-resident roles remain unassigned.

## L-0102 — GLB / House 20 F-1

- **Patricia Iremiren**; landlord **Hassan Ogwe**. Blue Jan 2023 (no amount): move-in `2023-01-01`, first billing `2023-02-01`.
- Payments: 2024 Feb NGN72,000 + Apr NGN15,000 = NGN87,000; 2025 Jul NGN50,000. Sheet paid NGN137,000; due `(NGN5,000)` credit.

## L-0103 — GLB / House 20 F-3

- **Victor Adjei**; landlord **Hassan Ogwe**. Blue Nov 2019 (no amount): move-in `2019-11-01`, first billing `2019-12-01`.
- Payments: 2020 Jan NGN21,000 + Aug NGN15,000 = NGN36,000; 2021 Feb NGN36,000 + May NGN3,000 = NGN39,000; 2022 Jan NGN36,000; 2023 Feb NGN39,000; 2024 Jan NGN36,000; 2025 Feb NGN36,000. Sheet paid NGN222,000; due `(NGN3,000)` credit.

## L-0104 — GLB / House 20 F-4

- **Jovia Ifetobo Jose**; landlord **Hassan Ogwe**. Blue Aug 2024 (no amount): move-in `2024-08-01`, first billing `2024-09-01`.
- Payment: 2025 Jul NGN50,000. Sheet paid NGN50,000; due `(NGN2,000)` credit.

## L-0105 — GLB / House 20 F-5

- **Ken Nwachukwu**; landlord **Hassan Ogwe**. Blue Jun 2024 (no amount): move-in `2024-06-01`, first billing `2024-07-01`.
- No payments visible. Sheet paid `-`; due NGN78,000.
- Preserve source note: `Seperated from the Lawyer` (sic).

## L-0106 — GLB / House 20 F-9

- **Epetuku Goodluck**; landlord **Hassan Ogwe**. Blue Aug 2022 (no amount): confirmed move-in **and first billing** `2022-08-01`.
- Payments: 2022 Apr NGN6,000 pre-move-in payment plus NGN12,000 credit left by the previous tenant for the new tenant = NGN18,000 paid; 2023 Apr NGN30,000 + May NGN6,000 = NGN36,000; 2024 Jan NGN36,000; 2025 May NGN60,000. Sheet paid NGN150,000; due `-`.

## L-0107 — GLB / House 21

- **Hassan Ogwe**; confirmed `resident_landlord`. No blue cell; earliest paid month January 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015 Jan–Dec NGN5,000 each = NGN60,000; 2016 Jan–Mar NGN5,000 each = NGN15,000; 2024 Apr NGN1,100,000. Sheet paid NGN1,175,000; due `(NGN575,000)` credit.
- Note: `Dev levy - 900k (Paid)`.

---

## KOA batch — source-only translations (received 2026-08-11)

`KOA` maps to Kayode Oni Animashaun. Roles are unassigned unless user-confirmed below.

## L-0108 — KOA / House 1A
- **Michael Festus Ihekwuaba**; role unassigned. Blue Nov 2022 NGN30,000: move-in `2022-11-01`, first billing `2022-12-01`.
- Payments: 2022 Nov NGN30,000; 2024 Feb NGN20,000 + Apr NGN10,000 + Sep NGN12,000 = NGN42,000; 2025 Feb NGN30,000 + Sep NGN18,000 = NGN48,000. Sheet paid NGN120,000; due NGN15,000.

## L-0109 — KOA / House 1B
- **Iwuoha Christian Chinonso**; role unassigned. Blue Oct 2022 (no amount): move-in `2022-10-01`, first billing `2022-11-01`.
- Payments: 2022 Sep NGN12,000; 2024 Apr NGN78,000. Sheet paid NGN90,000; final displayed balance NGN160,000; preserve source anomaly.

## L-0110 — KOA / House 2
- **Anthony I Olabisi Oluwakemi Egri-Okwaju**; role unassigned. No blue cell; earliest paid Jan 2018 gives move-in/first billing `2018-01-01`.
- Payments: 2018/2019 NGN60,000 each; 2020 Jan NGN15,000 + Apr NGN15,000 + Jul NGN30,000 = NGN60,000; 2021–2024 NGN60,000 each; 2025 Jan NGN60,000. Sheet paid NGN480,000; due NGN60,000.

## L-0111 — KOA / House 5
- Primary resident: **Oloruntola Abiola**; linked secondary resident: **Oloruntola Temi**. Role unassigned.
- No blue cell; earliest paid Sep 2021 gives move-in/first billing `2021-09-01`.
- Payments: 2021 Sep NGN50,000; 2022 Nov NGN15,000; 2023 Feb NGN10,000 + Apr NGN10,000 + Jul NGN15,000 + Nov NGN20,000 = NGN55,000; 2024 Apr NGN35,000 + Jul NGN15,000 + Sep NGN25,000 = NGN75,000; 2025 Feb NGN120,000. Sheet paid NGN315,000; due `-`.
- Note: `OYAWOYE OLUMIDE paid for his tenants from his bank account`.

## L-0112 — KOA / House 6
- **Uyesanmi Umolade Kehinde Dr.**; payment alias: **Omokehinde Patrick**. Role unassigned.
- Blue Feb 2017 (no amount): move-in `2017-02-01`, first billing `2017-03-01`.
- Payments: 2017 NGN50,000; 2018 NGN60,000; 2019 NGN70,000; 2020 NGN90,000; 2021 NGN60,000; 2022 NGN30,000; 2023 NGN60,000; 2024 NGN60,000; 2025 NGN80,000. Sheet paid NGN560,000; due NGN30,000.

## L-0113 — KOA / House 8
- **John Eriagbon, Sir**; role unassigned. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2019 NGN60,000/year; 2020 Apr NGN60,000; 2021 Jan NGN60,000; 2022 Feb NGN60,000; 2023 Jan NGN60,000; 2024 Jan NGN60,000; 2025 Mar NGN120,000. Sheet paid NGN720,000; due `-`.

## L-0114 — KOA / House 9
- **Engr Erapi Edward**; role unassigned. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2018 NGN60,000/year; 2019 NGN80,000; 2020/2021 Feb NGN60,000 each; 2022/2023/2024 Jan NGN60,000 each; 2025 Feb NGN120,000. Sheet paid NGN740,000; due `(NGN20,000)` credit.

## L-0115 — KOA / House 10 F-6
- **David Olem Lukpata**; landlord **Boniface Obijiaku**, `resident_landlord`. Blue Dec 2022 NGN20,000: move-in `2022-12-01`, first billing `2023-01-01`.
- Payments: 2022 Dec NGN20,000; 2024 Jan NGN21,000; 2025 Jul NGN40,000. Sheet paid NGN81,000; due NGN51,000.

## L-0116 — KOA / House 10 F-5
- **Boniface Obijiaku**; confirmed `resident_landlord`. Explicitly ignore `Palmpay` / `Emmanuel Mmaduabuchuk`.
- No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2018 NGN60,000/year; 2019 NGN70,000; 2020 NGN60,000; 2021 NGN50,000; 2022 NGN60,000; 2023 Jun NGN60,000; 2024 Aug NGN60,000; 2025 NGN60,000. Sheet paid NGN660,000; due `-`.

## L-0117 — KOA / House 10 F-3
- **Lucy Ibimie Benstowe**; landlord **Boniface Obijiaku**, `resident_landlord`. Blue Sep 2020 NGN30,000: move-in `2020-09-01`, first billing `2020-10-01`.
- Payments: 2020 Sep NGN30,000; 2023 Apr NGN15,000; 2024 Feb NGN40,000. Sheet paid NGN85,000; due NGN131,000.

## L-0118 — KOA / House 10 F-?
- **Emmanuel Pelumi Olayinka**; payment alias **Olayinka Victor**; landlord **Boniface Obijiaku**, `resident_landlord`.
- Blue Jun 2025 NGN30,000: move-in and first billing `2025-06-01`. Sheet paid NGN30,000; due `-`.

## L-0119 — KOA / House 10 F-1
- **Samson Idakwu Ugbede**; landlord **Boniface Obijiaku**, `resident_landlord`. Blue Jan 2020 (no amount): move-in `2020-01-01`, first billing `2020-02-01`.
- Payments: 2020 NGN36,000; 2021 NGN30,000; 2022 NGN39,000; 2023 NGN36,000; 2024 NGN48,000; 2025 NGN33,000. Sheet paid NGN222,000; due NGN15,000.

## L-0120 — KOA / House 10 F-2
- **Rabiu Olamide Agboola**; landlord **Boniface Obijiaku**, `resident_landlord`. Blue Nov 2024 NGN15,000: move-in `2024-11-01`, first billing `2024-12-01`.
- Payments: 2024 Nov NGN15,000; 2025 Jul NGN20,000. Sheet paid NGN35,000; due NGN28,000.

## L-0121 — KOA / House 13A
- **Emeka Okafor (Pastor)**; linked secondary resident: **Anwuli Okafor**. `Odera Okafor` is explicitly ignored/skipped. Role unassigned.
- No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2018 NGN60,000/year; 2020 Sep NGN120,000; 2022 Feb NGN40,000 + Mar NGN10,000 + Jun NGN20,000 = NGN70,000; 2023 Apr NGN60,000; 2024 Jan NGN60,000; 2025 Aug NGN140,000. Sheet paid NGN690,000; due NGN30,000.

## L-0122 — KOA / House 13B
- **Asuquo Edet / Edak Inukim**; payment alias: **Escodak Investments**. Role unassigned.
- No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2019 NGN60,000/year; 2020 Jan NGN60,000; 2021 Aug/Dec NGN30,000 each; 2022 Mar NGN60,000; 2024 Feb NGN60,000; 2025 Mar NGN120,000 + Sep NGN30,000. Sheet paid NGN690,000; due NGN30,000.

## L-0123 — KOA / House 15
- **Stella Akintunde** (source spelling `Stella Akintade, CP.`); confirmed `resident_landlord`. Payment alias: **Jomea Investment A**.
- No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Source yearly paid: 2015–2024 NGN60,000 each; 2025 NGN120,000; 2026 Jan NGN10,000. Sheet paid NGN730,000; due NGN70,000.

## L-0124 — KOA / House 15 F-2
- **Martins Awonusi**; landlord **Stella Akintunde**, `resident_landlord`. Blue Nov 2024 (no amount): move-in `2024-11-01`, first billing `2024-12-01`.
- Payment: 2025 Jul NGN30,000. Sheet paid NGN30,000; due NGN9,000.

## L-0125 — KOA / House 16
- **Esther Dike**; confirmed `resident_landlord`. No blue cell; earliest paid Jan 2015 gives move-in/first billing `2015-01-01`.
- Payments: 2015–2018 NGN60,000/year; 2019 NGN65,000; 2020 NGN75,000; 2021 NGN50,000; 2022 NGN60,000; 2023 NGN40,000; 2024 NGN30,000; 2025 NGN160,000. Sheet paid NGN720,000; due `-`.

### KOA clarification queue

No outstanding KOA name/relationship classifications in the reviewed records.

---

## KOA batch — Houses 17–19 (received 2026-08-11)

Primary-resident roles remain unassigned unless later provided.

## L-0126 — KOA / House 17 F-1
- **Osunrinade Ibukunoluwa Oladei** (source spelling retained; verify canonical last name if it differs). No blue cell; earliest paid May 2020 gives move-in/first billing `2020-05-01`.
- Payments: 2020 NGN40,000; 2021 NGN40,000; 2022 NGN80,000; 2023 NGN2,000; 2024 NGN22,500; 2025 NGN58,500. Sheet paid NGN243,000; due `-`.

## L-0127 — KOA / House 17 F-2
- **Nnani Johnson Chudi**. Blue Aug 2021 NGN9,000: move-in `2021-08-01`, first billing `2021-09-01`.
- Payments: 2021 Aug NGN9,000; 2022 Mar NGN27,000 + Oct NGN18,000 = NGN45,000; 2023 Mar NGN18,000; 2024 Jan NGN36,000 + Sep NGN52,000 = NGN88,000; 2025 Sep NGN10,000. Sheet paid NGN170,000; due NGN10,000.

## L-0128 — KOA / House 17 F-3
- **Becky Eloho Patrick**. Blue Dec 2023 NGN60,000: move-in `2023-12-01`, first billing `2024-01-01`.
- Payments: 2023 Dec NGN60,000; 2025 Sep NGN60,000. Sheet paid NGN120,000; due `(NGN24,000)` credit.

## L-0129 — KOA / House 17 F-4
- **Chukwudi Gudday Emmanuel**. Blue Aug 2020 NGN36,000: move-in `2020-08-01`, first billing `2020-09-01`.
- Payments: 2020 Aug NGN36,000; 2021 Sep NGN36,000; 2022 Oct NGN36,000; 2024 Jan NGN36,000; 2025 May NGN52,000. Sheet paid NGN196,000; due NGN20,000.

## L-0130 — KOA / House 17
- **Abodunde Yemi**; payment alias: **Abodunde Olayemi**. No blue cell; earliest paid Apr 2024 gives move-in/first billing `2024-04-01`.
- Payment: 2024 Apr NGN36,000. Sheet paid NGN36,000; due NGN60,000.

## L-0131 — KOA / House 17BQ
- **Oladotun Ayeni**. Blue Mar 2022 (no amount): move-in `2022-03-01`, first billing `2022-04-01`.
- Payments: 2022 Apr/Oct NGN18,000 each = NGN36,000; 2023 Mar NGN36,000; 2024 Mar NGN36,000. Sheet paid NGN108,000; due NGN27,000.

## L-0132 — KOA / House 18A
- **Feyijimi Adewole**. Blue Jul 2020 NGN5,000: move-in `2020-07-01`, first billing `2020-08-01`.
- Payments: 2020 Jul NGN5,000 + Oct NGN25,000 = NGN30,000; 2021 Jan NGN60,000; 2022 Feb NGN60,000; 2023 Apr NGN60,000; 2024 Apr NGN25,000 + Sep NGN20,000 = NGN45,000; 2025 May NGN60,000 + Sep NGN50,000 = NGN110,000. Sheet paid NGN365,000; due NGN100,000.

## L-0133 — KOA / House 18B
- **Ikechukwu Nneka Charity**. Blue Nov 2024 (no amount): move-in `2024-11-01`, first billing `2024-12-01`.
- Payment: 2025 Sep NGN95,000. Sheet paid NGN95,000; due NGN30,000.

## L-0134 — KOA / House 18 F-1
- **Oparah Christian Onyekachi**. Blue Oct 2022 (no amount): move-in `2022-10-01`, first billing `2022-11-01`.
- Payments: 2022 Sep NGN18,000; 2023 Mar NGN6,000 + Jun NGN6,000 + Aug NGN15,000 = NGN27,000; 2024 Jan NGN3,000 + Mar NGN6,000 + Apr NGN6,000 + May NGN3,000 + Jul NGN9,000 = NGN27,000; 2025 Feb NGN9,000 + Apr NGN15,000 + Jun NGN15,000 = NGN39,000. Sheet paid NGN111,000; due NGN3,000.

## L-0135 — KOA / House 18 F-2
- **Ibukun Ganiyat Adefowokan**. Blue Oct 2022 NGN18,000: move-in `2022-10-01`, first billing `2022-11-01`.
- Payments: 2022 Oct NGN18,000; 2024 Jul NGN36,000; 2025 Sep NGN69,000. Sheet paid NGN123,000; due NGN15,000.

## L-0136 — KOA / House 19
- **Ibrahim Junaid Danjuma**; source context `BACK BUILDING APARTMENT`. Blue May 2023 (no amount): move-in `2023-05-01`, first billing `2023-06-01`.
- Payment: 2023 Jun NGN240,000. Separate non-monthly note/amount: `BUILDING RENOVATION FEE #260k`, paid NGN260,000. Sheet paid NGN500,000; due `(NGN25,000)` credit.

### KOA clarification queue

No outstanding KOA name/relationship classifications in the reviewed records.

---

## L-0028 — OJO.K / House 17

- Source names: **Bill Ogbuji** (`Bidiama Ltd – Skymall`), `Samson Onyema Ogbu`, and `Ofurie Paul`.
- Source metadata states landlord/self-occupied; classify Bill Ogbuji as `resident_landlord`.
- `Samson Onyema Ogbu` and `Ofurie Paul` are confirmed secondary residents linked to the landlord; individual move-in dates were not supplied.
- No blue cell. Earliest paid month is January 2017, so move-in and first billing are `2017-01-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Jul 70,000; Aug 60,000; Sep 5,000 | NGN 135,000 | `(NGN 15,000)` credit |
| 2024 | NGN 5,000 | Apr 260,000 | NGN 260,000 | `(NGN 200,000)` credit |
| 2023 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2022 | NGN 5,000 | Jun 150,000 | NGN 150,000 | `(NGN 90,000)` credit |
| 2021 | NGN 5,000 | Aug 45,000 | NGN 45,000 | NGN 15,000 |
| 2020 | NGN 5,000 | Jan 60,000 | NGN 60,000 | NGN 0 |
| 2019 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2018 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2017 | NGN 5,000 | Jan–Aug 5,000 each | NGN 40,000 | NGN 20,000 |
| **Sheet total** | — | — | **NGN 690,000** | **NGN 30,000** |

No database match or change has been attempted.

---

## L-0029 — OJO.K / House 18B

- Resident: **Osage John Ingbedion Mr.** (source spelling visually legible as `OSAGE JOHN INGBEDION MR.`); source states landlord/self-occupied.
- Blue NGN 5,000 cell in April 2019: move-in and first billing `2019-04-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2026 | NGN 10,000 | None | NGN 0 | NGN 80,000 |
| 2025 | NGN 10,000 | None | NGN 0 | NGN 120,000 |
| 2024 | NGN 5,000 | Jan 60,000; Dec 120,000 | NGN 180,000 | `(NGN 120,000)` credit |
| 2023 | NGN 5,000 | Apr 60,000 | NGN 60,000 | `-` |
| 2022 | NGN 5,000 | Feb 60,000 | NGN 60,000 | NGN 0 |
| 2021 | NGN 5,000 | Jan 60,000 | NGN 60,000 | NGN 0 |
| 2020 | NGN 5,000 | Jan–Apr 5,000 each; May 60,000 | NGN 80,000 | `(NGN 20,000)` credit |
| 2019 | NGN 5,000 | Apr–Dec 5,000 each; Apr blue | NGN 45,000 | NGN 0 |
| **Sheet total** | — | — | **NGN 485,000** | **NGN 60,000** |

No database match or change has been attempted.

---

## L-0030 — OJO.K / House 19

- Resident: **Felix Evansinha**; source states landlord/self-occupied.
- Payment alias: `Eghe Osagboigbovo Ralphael` (spelling retained as visually legible; same person).
- No blue cell. Earliest paid month is January 2015, so move-in and first billing are `2015-01-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Sep 120,000 | NGN 120,000 | `-` |
| 2024 | NGN 5,000 | Mar 60,000 | NGN 60,000 | `-` |
| 2023 | NGN 5,000 | Apr 120,000 | NGN 120,000 | `(NGN 60,000)` credit |
| 2022 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2021 | NGN 5,000 | Sep 60,000 | NGN 60,000 | NGN 0 |
| 2020 | NGN 5,000 | May 60,000 | NGN 60,000 | NGN 0 |
| 2019 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| 2018 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| 2017 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| 2016 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| 2015 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| **Sheet total** | — | — | **NGN 720,000** | `-` |

No database match or change has been attempted.

---

## L-0031 — OJO.K / House 20 F-1

- Resident: **Adebowale Olusegun Joshua**; source states landlord/self-occupied.
- No blue cell. Earliest paid month is January 2015, so move-in and first billing are `2015-01-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Jul 100,000 | NGN 100,000 | NGN 20,000 |
| 2024 | NGN 5,000 | Apr 180,000 | NGN 180,000 | `(NGN 120,000)` credit |
| 2023 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2022 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2021 | NGN 5,000 | Oct 18,000 | NGN 18,000 | NGN 42,000 |
| 2020 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2019 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2018 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2017 | NGN 5,000 | Jan–Jul 5,000 each | NGN 35,000 | NGN 25,000 |
| 2016 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2015 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| **Sheet total** | — | — | **NGN 393,000** | **NGN 327,000** |

No database match or change has been attempted.

---

## L-0032 — OJO.K / House 20 F-2

- Resident: **Njoku Victor**; confirmed role: `tenant`.
- Blue NGN 60,000 cell in August 2025: move-in and first billing `2025-08-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Aug 60,000 (blue) | NGN 60,000 | `(NGN 45,000)` credit |
| **Sheet total** | — | — | **NGN 60,000** | **(NGN 45,000)** |

No database match or change has been attempted.

---

## L-0033 — OJO.K / House 21

- Primary resident: **Gbenga Raheem**; confirmed role: `non_resident_landlord`.
- Payment alias: `Adegoke Adeola Mary` (same person).
- Blue cell in June 2022 (no amount): move-in and first billing `2022-06-01`.
- Source note: `SEPT 2022 – PAID ₦180K OUTSTANDING SECURITY DUES`; preserve as a security-dues note, not an inferred rent payment.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2026 | NGN 10,000 | None | NGN 0 | NGN 80,000 |
| 2025 | NGN 10,000 | Sep 130,000 | NGN 130,000 | `(NGN 10,000)` credit |
| 2024 | NGN 5,000 | Apr 60,000 | NGN 60,000 | `-` |
| 2023 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2022 | NGN 5,000 | Sep 60,000; Jun blue/no amount | NGN 60,000 | `(NGN 30,000)` credit |
| **Sheet total** | — | — | **NGN 250,000** | **NGN 100,000** |

No database match or change has been attempted.

---

## L-0034 — OJO.K / House 22 F-1

- Resident: **Onyelukachukwu Ibe** (last token retained as visually legible); confirmed role: `tenant`.
- Blue cell in October 2022 (no amount): move-in and first billing `2022-10-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Aug 35,000; Sep 19,000 | NGN 54,000 | NGN 6,000 |
| 2024 | NGN 3,000 | Apr 36,000 | NGN 36,000 | — |
| 2023 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2022 | NGN 3,000 | Sep 36,000; Oct blue/no amount | NGN 36,000 | `(NGN 27,000)` credit |
| **Sheet total** | — | — | **NGN 126,000** | **NGN 15,000** |

No database match or change has been attempted.

---

## L-0035 — OJO.K / House 22 F-4

- Resident: **Damadon Promise Morgan**; confirmed role: `tenant`.
- Blue cell in February 2020 (no amount): move-in and first billing `2020-02-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Jul 70,000 | NGN 70,000 | `(NGN 10,000)` credit |
| 2024 | NGN 3,000 | Jan 54,000; Sep 18,000 | NGN 72,000 | `(NGN 36,000)` credit |
| 2023 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2022 | NGN 3,000 | Aug 36,000 | NGN 36,000 | NGN 0 |
| 2021 | NGN 3,000 | Feb 18,000; Oct 30,000 | NGN 48,000 | `(NGN 12,000)` credit |
| 2020 | NGN 3,000 | May 18,000 | NGN 18,000 | NGN 12,000 |
| **Sheet total** | — | — | **NGN 244,000** | **(NGN 10,000)** |

No database match or change has been attempted.

---

## L-0036 — OJO.K / House 22 F-1b

- Resident: **Amate Samuel**; confirmed role: `tenant`.
- Blue cell in August 2021 (no amount): move-in and first billing `2021-08-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | May 30,000; Jun 15,000 | NGN 45,000 | NGN 15,000 |
| 2024 | NGN 3,000 | Feb 36,000; Jun 9,000; Sep 12,000 | NGN 57,000 | `(NGN 21,000)` credit |
| 2023 | NGN 3,000 | Feb 9,000; May 21,000 | NGN 30,000 | NGN 6,000 |
| 2022 | NGN 3,000 | Apr 12,000; Aug 12,000 | NGN 24,000 | NGN 12,000 |
| 2021 | NGN 3,000 | Oct 9,000; Aug blue/no amount | NGN 9,000 | NGN 3,000 |
| **Sheet total** | — | — | **NGN 165,000** | **NGN 15,000** |

No database match or change has been attempted.

---

## L-0037 — OJO.K / House 23

- Resident: **Kazeem Yusuf**; confirmed role: `tenant`.
- Blue cell in August 2024 (no amount): move-in and first billing `2024-08-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Jul 70,000 | NGN 70,000 | NGN 50,000 |
| 2024 | NGN 5,000 | Aug blue/no amount | NGN 0 | NGN 25,000 |
| **Sheet total** | — | — | **NGN 70,000** | **NGN 75,000** |

No database match or change has been attempted.

---

## L-0024 — OJO.K / House 16C

- Resident: **Susan Onome Badiru**; user-confirmed role: `resident_landlord`.
- Payment alias: `Susan Onome Opiri`.
- Blue NGN 60,000 cell in September 2023: move-in and first billing `2023-09-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Aug 120,000 | NGN 120,000 | `-` |
| 2024 | NGN 5,000 | Oct 110,000 | NGN 110,000 | `(NGN 50,000)` credit |
| 2023 | NGN 5,000 | Sep 60,000 (blue) | NGN 60,000 | `(NGN 45,000)` credit |
| **Sheet total** | — | — | **NGN 290,000** | **(NGN 95,000)** |

No database match or change has been attempted.

---

## L-0025 — OJO.K / House 16D

- Resident: **Mr Levi & Barr. Love Braide**; user-confirmed role: `resident_landlord`.
- Blue cell in June 2022 (no amount): move-in and first billing `2022-06-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Feb 120,000 | NGN 120,000 | `-` |
| 2024 | NGN 5,000 | Feb 60,000 | NGN 60,000 | — |
| 2023 | NGN 5,000 | Feb 30,000; Oct 20,000 | NGN 50,000 | NGN 10,000 |
| 2022 | NGN 5,000 | Jun blue/no amount; Aug 30,000 | NGN 30,000 | NGN 0 |
| **Sheet total** | — | — | **NGN 260,000** | **NGN 10,000** |

No database match or change has been attempted.

---

## L-0026 — OJO.K / House 16E

- Resident: **Benson Odun Tondea**; user-confirmed role: `resident_landlord`.
- Legacy payment/reference variant: `Tondea Odum`.
- Blue cell in May 2023 (no amount): move-in and first billing `2023-05-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | Jul 60,755; Sep 67,155 | NGN 127,910 | `(NGN 7,910)` credit |
| 2024 | NGN 5,000 | Jun 60,000 | NGN 60,000 | — |
| 2023 | NGN 5,000 | May blue/no amount | NGN 0 | NGN 35,000 |
| **Sheet total** | — | — | **NGN 60,000** | **NGN 27,090** |

The sheet total appears to exclude/currently net the 2025 row; preserve both row-level and displayed grand totals. No database match or change has been attempted.

---

## L-0027 — OJO.K / House 16F

- Resident: **Olosunde James Oluwole**; user-confirmed role: `resident_landlord`.
- Blue cell in March 2025 (no amount): move-in and first billing `2025-03-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2026 | NGN 10,000 | None | NGN 0 | NGN 50,000 |
| 2025 | NGN 10,000 | Mar blue/no amount; Sep 90,000 | NGN 90,000 | `-` |
| 2024 | NGN 5,000 | None | NGN 0 | — |
| 2023 | NGN 5,000 | None | NGN 0 | — |
| **Sheet total** | — | — | **NGN 0** | **NGN 50,000** |

No database match or change has been attempted.

---

## L-0013 — OJO.K / House 12BQ

- Primary resident: **Samuel Oluvaseun Ajala**; confirmed role: `tenant`.
- Landlord: **Tim Akenroye** (12-series landlord; ownership dates not supplied for this flat).
- Note: `Account separated from Landlord (Tim Akenroye)`; preserve as a relationship/account note, not a resident assignment.
- No blue cell. Earliest paid month is April 2024, so default move-in and first billing are `2024-04-01`; the NGN 60,000 lump sum/coverage is not inferred.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2024 | NGN 3,000 | Apr 60,000 | NGN 60,000 | `(NGN 24,000)` credit |
| **Sheet total** | — | — | **NGN 60,000** | **NGN 12,000** |

Proposed roles: Samuel Oluvaseun Ajala → OJO.K-12BQ as `tenant`; Tim Akenroye → OJO.K-12BQ as landlord. No database match or change has been attempted.

---

## L-0014 — OJO.K / House 12 F-1

- Resident: **Eleloye Opeyemi Moses** (source spelling retained); confirmed role: `tenant`.
- Landlord: **Tim Akenroye** (12-series landlord; ownership dates not supplied for this flat).
- Blue cell in March 2025 (no amount): move-in `2025-03-01`; first billing provisionally `2025-04-01` unless the blue-cell billing exception is confirmed.
- Source status begins `LANDLORD STATUS, SELF-` but is truncated; do not infer role.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 3,000 | Feb 36,000; Mar blue/no amount | NGN 36,000 | `(NGN 9,000)` credit |
| **Sheet total** | — | — | **NGN 36,000** | **(NGN 9,000)** |

Proposed roles: Eleloye Opeyemi Moses → OJO.K-12 F-1 as `tenant`; Tim Akenroye → OJO.K-12 F-1 as landlord. No database match or change has been attempted.

---

## L-0015 — OJO.K / House 12 F-2

- Resident: **Godson Uzochukwu Ukachi**.
- Confirmed role: `tenant`.
- Landlord: **Tim Akenroye** (12-series landlord; ownership dates not supplied for this flat).
- Blue cell in January 2025 with NGN 30,000: move-in and first billing `2025-01-01`.
- Source status begins `LANDLORD STATUS, SELF-` but is truncated; do not infer role.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 3,000 | Jan 30,000 (blue) | NGN 30,000 | NGN 3,000 |
| **Sheet total** | — | — | **NGN 30,000** | **NGN 3,000** |

Proposed roles: Godson Uzochukwu Ukachi → OJO.K-12 F-2 as `tenant`; Tim Akenroye → OJO.K-12 F-2 as landlord. No database match or change has been attempted.

---

## L-0016 — OJO.K / House 12 F-4

- Primary resident: **Oyeleye Oyindamola**; confirmed role: `tenant`.
- Payment alias: `Tomisin Uyeleye` (same person).
- Landlord: **Tim Akenroye** (12-series landlord; ownership dates not supplied for this flat).
- No blue cell. Earliest paid month is October 2018, so default move-in and first billing are `2018-10-01`.
- Role is not stated.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 3,000 | Feb 15,000; May 3,000; Jul 9,000 | NGN 27,000 | NGN 9,000 |
| 2024 | NGN 3,000 | Feb 9,000; Apr 9,000; Jul 9,000; Sep 32,000; Nov 20,000 | NGN 79,000 | `(NGN 43,000)` credit |
| 2023 | NGN 1,000 | Jan 3,000 | NGN 3,000 | NGN 9,000 |
| 2022 | NGN 1,000 | Jan 1,000; Jun 3,000; Aug 2,000 | NGN 6,000 | NGN 6,000 |
| 2021 | NGN 1,000 | Mar 3,000 | NGN 3,000 | NGN 9,000 |
| 2020 | NGN 1,000 | None | NGN 0 | NGN 12,000 |
| 2019 | NGN 1,000 | May 5,000; Jun 3,000 | NGN 8,000 | NGN 4,000 |
| 2018 | NGN 1,000 | Oct–Dec 1,000 each | NGN 3,000 | NGN 9,000 |
| **Sheet total** | — | — | **NGN 129,000** | **NGN 9,000** |

Proposed roles: Oyeleye Oyindamola → OJO.K-12 F-4 as `tenant`; Tim Akenroye → OJO.K-12 F-4 as landlord. No database match or change has been attempted.

---

## L-0017 — OJO.K / House 14

- Canonical landlord: **Christian Philips**; source role/status is landlord, self-occupied.
- Source entities/name variants: `House of Mercy Church`; `Philips C (Apostle) Clay Temple`. Retain as legacy payment/name references, not separate residents, unless later directed otherwise.
- No blue cell. Earliest paid month is January 2015, so move-in and first billing are `2015-01-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 10,000 | May 160,000 | NGN 160,000 | `(NGN 40,000)` credit |
| 2024 | NGN 5,000 | Feb 120,000; Apr 150,000 | NGN 270,000 | `(NGN 210,000)` credit |
| 2023 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2022 | NGN 5,000 | Aug 60,000 | NGN 60,000 | NGN 0 |
| 2021 | NGN 5,000 | Oct 60,000 | NGN 60,000 | NGN 0 |
| 2020 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2019 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2018 | NGN 5,000 | None | NGN 0 | NGN 60,000 |
| 2017 | NGN 5,000 | Jan–Oct 5,000 each | NGN 50,000 | NGN 10,000 |
| 2016 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| 2015 | NGN 5,000 | Jan–Dec 5,000 each | NGN 60,000 | NGN 0 |
| **Sheet total** | — | — | **NGN 720,000** | `-` |

Proposed assignment: Christian Philips → OJO.K-14; `resident_landlord`; move-in/first billing `2015-01-01`. No database match or change has been attempted.

---

## L-0018 — OJO.K / House 14A

- Canonical landlord: **Christian Philips**; source status is landlord, self-occupied.
- Source entity/reference: `Shushan Pharmacy`; retain as a legacy payment/name reference, not a separate resident.
- Blue cell in January 2025 with NGN 30,000: move-in and first billing `2025-01-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Jan 30,000 (blue); Sep 25,000 | NGN 55,000 | `-` |
| **Sheet total** | — | — | **NGN 55,000** | `-` |

Proposed assignment: Christian Philips → OJO.K-14A; `resident_landlord`; move-in/first billing `2025-01-01`. No database match or change has been attempted.

---

## L-0019 — OJO.K / House 15 F-2

- Resident: **Peter/Gloria Iloegbunam**; source states landlord, self-occupied.
- Blue cell in February 2017 (no amount): move-in/first billing `2017-02-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Jul 30,000 | NGN 30,000 | NGN 30,000 |
| 2024 | NGN 3,000 | None | NGN 0 | NGN 36,000 |
| 2023 | NGN 3,000 | Apr 18,000; Dec 18,000 | NGN 36,000 | `-` |
| 2022 | NGN 3,000 | Aug 25,000 | NGN 25,000 | NGN 11,000 |
| 2021 | NGN 3,000 | May 12,000; Oct 24,000 | NGN 36,000 | NGN 0 |
| 2020 | NGN 3,000 | May 18,000; Sep 18,000; Dec 18,000 | NGN 54,000 | `(NGN 18,000)` credit |
| 2019 | NGN 3,000 | May 18,000 | NGN 18,000 | NGN 18,000 |
| 2018 | NGN 3,000 | Feb 15,000; Oct 21,000; Dec 10,000 | NGN 46,000 | `(NGN 10,000)` credit |
| 2017 | NGN 3,000 | Feb blue/no amount; Mar 15,000 | NGN 15,000 | NGN 15,000 |
| **Sheet total** | — | — | **NGN 260,000** | **NGN 82,000** |

---

## L-0020 — OJO.K / House 15 F-3

- Resident: **Azeez Toheeb**; source states landlord, self-occupied.
- Blue cell in November 2023 (no amount): move-in/first billing `2023-11-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Sep 55,000 | NGN 55,000 | NGN 5,000 |
| 2024 | NGN 3,000 | Apr 20,000 | NGN 20,000 | NGN 16,000 |
| 2023 | NGN 3,000 | Nov blue/no amount; Dec 9,000 | NGN 9,000 | `(NGN 6,000)` credit |
| **Sheet total** | — | — | **NGN 84,000** | **NGN 15,000** |

---

## L-0021 — OJO.K / House 15 F-4

- Resident: **Olayemi Tugboro Musa** (spelling retained; verify only if source later differs); source states landlord, self-occupied.
- Blue cell in November 2022 (no amount): move-in/first billing `2022-11-01`.

| Year | Rate | Payments | Paid | Due debt |
|---:|---:|---|---:|---:|
| 2025 | NGN 5,000 | Jul 52,000; Sep 30,000 | NGN 82,000 | `(NGN 22,000)` credit |
| 2024 | NGN 3,000 | May 20,000 | NGN 20,000 | NGN 16,000 |
| 2023 | NGN 3,000 | Apr 18,000 | NGN 18,000 | NGN 18,000 |
| 2022 | NGN 3,000 | Nov blue/no amount | NGN 0 | NGN 3,000 |
| **Sheet total** | — | — | **NGN 120,000** | **NGN 15,000** |

### Confirmation status

All occupancy and first-billing dates are confirmed. No database query or database write has been performed for this entry.

---

## L-0005 — OJO.K / House 9A

### Source translation

- Source: user-supplied legacy-tracker screenshot, received 2026-08-11.
- Primary resident: **Taofik Oladele Abass** — confirmed landlord. Proposed role: `resident_landlord` (no non-resident status was supplied).
- Source event: `House purchased by Alh Abass`; `Alh Abass` is a payment alias, not a separate resident.
- A blue `NGN 80,000` cell appears in **December 2024**. Under the agreed rule, this establishes move-in/purchase month as December 2024; first billing is proposed as January 2025 unless the user provides a property-specific override.
- Payment aliases: `Alh Abass`; `Azamid Consult`; `Alfred Adetola`; `Afolabi Bank-Olemoh`. All are confirmed aliases, not separate residents.
- Billing rate: NGN 5,000/month in 2024; NGN 10,000/month in 2025.

### Legacy payment history

| Year | Legacy rate | Payments visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2025 | NGN 10,000 | Jul NGN 120,000 | NGN 120,000 | — | Payment fact captured. |
| 2024 | NGN 5,000 | Dec NGN 80,000 (blue) | NGN 80,000 | `(NGN 75,000)` credit | Preserve exactly; payment/rate/credit arithmetic must not be normalised. |
| **Sheet total / final balance** | — | — | **NGN 200,000** | **NGN 5,000** | Confirmed final balance. Preserve the row-level 2024 credit notation as source history; do not recompute it. |

### Proposed bulk-file rows (not database actions)

- Proposed primary resident/house assignment: Taofik Oladele Abass → OJO.K-9A; `resident_landlord`; move-in December 2024; first billing January 2025.
- Payment aliases: Alh Abass, Azamid Consult, Alfred Adetola, and Afolabi Bank-Olemoh.
- Preserve the December 2024 blue-cell payment and July 2025 payment as source facts.
- No database match or database change has been attempted.

---

## L-0006 — OJO.K / House 9B

### Source translation

- Source: user-supplied legacy-tracker screenshot, received 2026-08-11.
- Primary tenant: **Ernest Obaseki**.
- Secondary resident: **Daisy Obaseki**, linked to Ernest Obaseki as sponsor.
- Owner: **Olumide Olawole Agu**, `non_resident_landlord`; confirmed move-in date `2018-12-01`.
- Payment alias: `Ernest Agho Johnbull` (not a separate resident).
- No blue move-in cell is visible for the tenant. The earliest visible payment is **December 2020**, so the agreed default sets Ernest Obaseki's move-in and first billing to `2020-12-01`; Daisy is linked from that same date.
- Billing rate: NGN 5,000/month through 2024; NGN 10,000/month in 2025.

### Legacy payment history

| Year | Legacy rate | Payments visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2025 | NGN 10,000 | None visible | NGN 0 | NGN 120,000 | Preserve as open legacy balance. |
| 2024 | NGN 5,000 | Apr NGN 40,000 | NGN 40,000 | NGN 20,000 | Payment fact captured. |
| 2023 | NGN 5,000 | Jan NGN 15,000; Feb NGN 15,000; May NGN 30,000; Dec NGN 60,000 | NGN 120,000 | `(NGN 60,000)` credit | Preserve visible credit. |
| 2022 | NGN 5,000 | Jun NGN 30,000 | NGN 30,000 | NGN 30,000 | Payment fact captured. |
| 2021 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2020 | NGN 5,000 | Dec NGN 60,000 | NGN 60,000 | NGN 0 | Earliest visible payment establishes default move-in/first billing. |
| 2019 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve legacy balance; do not infer an earlier occupancy date. |
| **Sheet total** | — | — | **NGN 250,000** | **NGN 230,000** | Preserve exactly; do not recompute or post. |

### Proposed bulk-file rows (not database actions)

- Resident-house history: Olumide Olawole Agu → OJO.K-9B as `non_resident_landlord` from 2018-12-01; Ernest Obaseki → OJO.K-9B as `tenant` from 2020-12-01; Daisy Obaseki → OJO.K-9B as `household_member` from 2020-12-01, sponsored by Ernest Obaseki. No move-out date was supplied for any of the three.
- Payment alias: Ernest Agho Johnbull.
- Preserve the visible dated payment cells and annual balances exactly.
- No database match or database change has been attempted.

---

## L-0007 — OJO.K / House 9C

### Source translation

- Source: user-supplied legacy-tracker screenshot, received 2026-08-11.
- Primary resident/entity: **Praise House**, confirmed corporate entity and `non_resident_landlord`.
- Payment aliases: `Lanyan Kunle`; `PHousey - Ighalo` (visually legible transcription); `Margaret OS`. All are confirmed aliases, not separate residents.
- No blue move-in cell is visible. The earliest visible payment is **February 2022**, so the agreed default sets move-in and first billing to `2022-02-01`. The 2021 due balance is preserved as legacy financial context and does not independently create an occupancy period.
- Billing rate: NGN 5,000/month through 2024; NGN 10,000/month in 2025.

### Legacy payment history

| Year | Legacy rate | Payments visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2025 | NGN 10,000 | May NGN 90,000 | NGN 90,000 | NGN 30,000 | Payment fact captured. |
| 2024 | NGN 5,000 | Apr NGN 100,000 | NGN 100,000 | `(NGN 40,000)` credit | Preserve visible credit. |
| 2023 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2022 | NGN 5,000 | Feb NGN 100,000 | NGN 100,000 | `(NGN 40,000)` credit | Earliest visible payment establishes default move-in/first billing. |
| 2021 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve legacy balance; do not infer an earlier occupancy date. |
| **Sheet total** | — | — | **NGN 290,000** | **NGN 70,000** | Preserve exactly; do not recompute or post. |

### Proposed bulk-file rows (not database actions)

- Proposed primary resident/house assignment: Praise House → OJO.K-9C; corporate `non_resident_landlord`; move-in and first billing `2022-02-01` under the no-blue earliest-payment rule.
- Payment aliases: Lanyan Kunle, PHousey - Ighalo, and Margaret OS.
- Preserve visible dated payment cells and annual balances exactly.
- No database match or database change has been attempted.

---

## L-0003 — OJO.K / House 6

### Source trace and resident translation

- Source: user-supplied legacy-tracker screenshot, received 2026-08-11.
- Confirmed property: **House 6, Ojo Kadiri**.
- Primary resident: **Samaila Aleyideino** — confirmed landlord/self-occupier; proposed role `resident_landlord`.
- Parenthetical source name: `HAMANIYA CALEB`. Proposed as a legacy payment alias for Samaila Aleyideino; no secondary resident is proposed.
- No blue move-in cell is visible. The earliest paid month is **May 2019**, so it establishes move-in month: `2019-05-01`. The confirmed first billing month is **January 2019**.
- Billing rate: NGN 5,000/month through 2024; NGN 10,000/month from 2025 onward.

### Legacy payment history

| Year | Legacy rate | Payments visible in source | Legacy paid total | Legacy due/debt | Translation status |
|---:|---:|---|---:|---:|---|
| 2026 | NGN 10,000 | None visible | NGN 0 | NGN 80,000 | Preserve as open legacy balance. |
| 2025 | NGN 10,000 | Jul NGN 120,000 | NGN 120,000 | `-` | Preserve source dash as no due/debt shown. |
| 2024 | NGN 5,000 | No row visible | — | — | No payment/balance inference. |
| 2023 | NGN 5,000 | None visible | NGN 0 | NGN 60,000 | Preserve as unpaid legacy balance. |
| 2022 | NGN 5,000 | Feb NGN 60,000 | NGN 60,000 | NGN 0 | Payment facts captured. |
| 2021 | NGN 5,000 | Jan NGN 60,000 | NGN 60,000 | NGN 0 | Payment facts captured. |
| 2020 | NGN 5,000 | Jun NGN 60,000 | NGN 60,000 | NGN 0 | Payment facts captured. |
| 2019 | NGN 5,000 | May NGN 60,000 | NGN 60,000 | NGN 0 | Earliest paid month establishes move-in; first billing is confirmed as January 2019. |
| **Sheet total** | — | — | **NGN 360,000** | **NGN 140,000** | Preserve exactly; do not recompute or post. |

### Proposed bulk-file rows (not database actions)

- Resident/house assignment: Samaila Aleyideino → OJO.K-6; `resident_landlord`; move-in `2019-05-01`, first billing `2019-01-01`; no move-out.
- Payment alias: `Hamaniya Caleb` (normalised casing; retain original uppercase source text in provenance).
- Payment rows: retain the visible dated payment cells above.
- No resident, house, relationship, payment, invoice, or balance database match has been attempted during review.
