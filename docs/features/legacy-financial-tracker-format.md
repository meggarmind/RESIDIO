# Legacy Financial Tracker Format

## Purpose

This specification defines the canonical tracker format for importing legacy estate service-charge history into Residio. It replaces the ambiguous annual wide-sheet layout with explicit occupancy, monthly charge, and payment records.

The conversion workbook is a source-of-truth handoff to the import agent. Do not derive import records from annual totals alone.

## Snapshot Boundary

The first converted tracker is a snapshot **as at 31 August 2026**.

- Include all charges whose service period ends on or before `2026-08-31`.
- Include all payments received on or before `2026-08-31`.
- Do not create September-December 2026 charges unless they were already billed before the snapshot and that fact is explicitly recorded as an exception.
- Future tracker versions must set their own `snapshot_as_of` date in the metadata sheet and apply the same rule.

## Business Rules

### Occupancy Determines Responsibility

- Every billable month must have exactly one responsible resident or organization.
- Responsibility comes from an occupancy period, not from the house's current occupant or current billing profile.
- A house may change responsible residents over time. Payments and invoices must remain isolated to the responsible resident's wallet.
- A vacant, under-construction, or otherwise non-billable period has no monthly charge unless an explicit exception says otherwise.

### Starting and Ending Years

- The tracker must state the first and last billable month for every occupancy period.
- Starting-year charges begin in the month defined by `billing_start_date`, which may differ from the physical move-in date if the estate has a documented billing rule.
- Ending-year charges stop after `billing_end_date`.
- Never assume a full 12-month annual charge for a partial occupancy year.
- A payment before the first billed month is valid as a prepayment and must retain its actual payment date.

### Charges and Rates

- Record one charge row for every billable month.
- Each charge row stores its own monthly rate. Historical charges must not use a house's current rate card.
- A rate change starts a new charge amount in its effective month. Do not backfill or average the rate across a year.
- The annual amount due is a derived value: the sum of that year's monthly charge rows.

### Payments and FIFO

- Record each payment at its actual received date and actual amount, including lump sums.
- Do not spread an annual payment evenly across twelve months.
- A payment is credited to the responsible resident's wallet, then allocated FIFO to that resident's oldest outstanding charge/invoice.
- An annual overpayment is not an error. It is a payment received in that year that may settle prior arrears or create a carry-forward credit.
- A payment for one resident must never settle another resident's charges, even when both occupied the same house at different times.

### Annual Reporting

The converted workbook may include a derived annual summary, but it is not an import source.

- `annual_due` = sum of monthly charges with a service period in that year.
- `payments_received` = sum of payments whose payment date is in that year.
- `annual_balance` = `annual_due - payments_received`.
- This annual balance is a tracker reporting metric. It is not the same as the final paid amount on invoices for that calendar year after FIFO allocation.

## Required Workbook Tabs

Use one Excel workbook with these exact tabs. Column names are case-sensitive and use `snake_case`.

### `metadata`

Exactly one row.

| Column | Required | Rules |
|---|---|---|
| `tracker_version` | Yes | Unique version label, for example `opera_legacy_2026_08`. |
| `snapshot_as_of` | Yes | ISO date, for example `2026-08-31`. |
| `currency` | Yes | `NGN`. |
| `source_file` | Yes | Original workbook/file name or source identifier. |
| `prepared_by` | Yes | Person or system that performed the conversion. |
| `prepared_at` | Yes | ISO date-time with timezone. |
| `notes` | No | Conversion-wide caveats. |

### `houses`

One row per physical billable unit. It provides stable matching, not financial history.

| Column | Required | Rules |
|---|---|---|
| `house_key` | Yes | Stable unique key, for example `OJO.K|8` or `GLB|14 F3`. |
| `street_code` | Yes | Must match the Residio street short name exactly. |
| `house_number` | Yes | Must match the Residio house number exactly after approved normalization. |
| `property_status_as_of` | Yes | `occupied`, `vacant`, `under_renovation`, or `under_construction`. |
| `source_house_number` | No | Original source value when it differs from normalized `house_number`. |
| `notes` | No | Non-financial mapping explanation. |

### `occupancies`

One row per responsible resident or organization period. Consecutive periods may not overlap for the same `house_key`.

| Column | Required | Rules |
|---|---|---|
| `occupancy_key` | Yes | Stable unique key used by `monthly_charges` and `payments`. |
| `house_key` | Yes | Must exist in `houses`. |
| `resident_key` | Yes | Stable source resident identifier. Do not use a name as the identifier. |
| `resident_name` | Yes | Display name for matching and review. |
| `resident_role` | Yes | `tenant`, `resident_landlord`, or approved Residio role. |
| `move_in_date` | Yes | ISO date. |
| `move_out_date` | No | ISO date; blank only for a current occupancy. |
| `billing_start_date` | Yes | First date from which the occupancy is billable. |
| `billing_end_date` | No | Last billable date; cannot be later than `snapshot_as_of`. |
| `source_confidence` | Yes | `tracker`, `estate_confirmation`, or `inferred`. |
| `notes` | No | Required when dates or responsibility were inferred. |

### `monthly_charges`

This is the mandatory import source for invoices. One row per billable calendar month.

| Column | Required | Rules |
|---|---|---|
| `charge_key` | Yes | Stable unique row key. |
| `occupancy_key` | Yes | Must exist in `occupancies`. |
| `service_month` | Yes | First day of month in ISO format, for example `2026-08-01`. |
| `period_start` | Yes | First billable day in the service month. |
| `period_end` | Yes | Last billable day in the service month. |
| `amount_due` | Yes | Positive NGN decimal amount, for example `5000.00`. |
| `rate_card_name` | Yes | Human-readable historical rate card, for example `5k per month`. |
| `rate_effective_from` | Yes | ISO date from which this rate applies. |
| `source_confidence` | Yes | `tracker`, `estate_confirmation`, or `inferred`. |
| `notes` | No | Required for partial months, inferred rates, or exceptions. |

Rules:

- `service_month` may not be after `snapshot_as_of`'s month unless explicitly flagged as pre-billed.
- There must be no duplicate `(occupancy_key, service_month)` pair.
- A partial first or last month must use the actual approved charge amount and explain the rule in `notes`.
- Months outside the occupancy's billing range must not appear.

### `payments`

This is the mandatory import source for payment records and wallet credits. One row per actual payment event.

| Column | Required | Rules |
|---|---|---|
| `payment_key` | Yes | Stable unique row key. |
| `occupancy_key` | Yes | Must exist in `occupancies`; establishes payment responsibility. |
| `payment_date` | Yes | Actual received date in ISO format. |
| `amount` | Yes | Positive NGN decimal amount. Never split or annualize a lump sum. |
| `payment_method` | Yes | `bank_transfer`, `cash`, `cheque`, `card`, `paystack`, or `unknown`. |
| `reference_number` | No | Bank, receipt, or source reference when available. |
| `source_confidence` | Yes | `tracker`, `estate_confirmation`, or `inferred`. |
| `is_date_inferred` | Yes | `true` only when the exact date is unavailable. |
| `period_start` | No | Informational source period, not allocation instruction. |
| `period_end` | No | Informational source period, not allocation instruction. |
| `notes` | No | Required when `is_date_inferred` is `true`, or when the payment was confirmed outside the tracker. |

Rules:

- `payment_date` may not be later than `snapshot_as_of`.
- Duplicate payment keys are invalid.
- Payments with an unknown exact date may use an agreed inferred date only when documented in `notes`; never silently substitute a date.
- Do not include payment allocations in this tab. Residio performs FIFO allocation after import.

### `exceptions`

One row per decision that cannot be inferred from the raw tracker.

| Column | Required | Rules |
|---|---|---|
| `exception_key` | Yes | Stable unique key. |
| `house_key` | Yes | Must exist in `houses`. |
| `effective_start` | Yes | ISO date. |
| `effective_end` | No | ISO date. |
| `exception_type` | Yes | `vacancy`, `occupancy_correction`, `name_correction`, `rate_correction`, `payment_date_inferred`, `pre_billed_period`, or `other`. |
| `decision` | Yes | Explicit import decision. |
| `evidence` | Yes | Source document, tracker reference, or estate confirmation. |
| `approved_by` | Yes | Person who approved the decision. |
| `notes` | No | Additional context. |

## Source Name and House Matching

- Do not match residents by display name alone. Supply a stable `resident_key` and retain the source name for review.
- Record source-name corrections as an `exceptions` row. Example: a tracker label may be corrected to an existing Residio resident rather than creating a duplicate resident.
- Preserve a source house number in `source_house_number` whenever it needs normalization, such as `GLB 14F-3` to `GLB 14 F3`.
- Any house or resident that cannot be matched must be reported as an import blocker, not silently skipped or newly created.

## Required Pre-Import Validation

The conversion agent must produce a validation report containing:

1. Row counts for every workbook tab.
2. Houses and residents that do not map uniquely to Residio.
3. Overlapping occupancy or billing periods.
4. Missing billable months within an occupancy's billing range.
5. Charge rows or payment dates after `snapshot_as_of`.
6. Duplicate charge keys, duplicate payment keys, and duplicate monthly charge periods.
7. Annual summary by house and resident: due, payments received, annual balance.
8. Overall totals: charges, payments, expected invoice count, and expected payment count.
9. Every row with `source_confidence = inferred` or `is_date_inferred = true`.
10. Every exception requiring estate approval.

## Import Sequence

1. Load and validate `metadata`, `houses`, and `occupancies`.
2. Resolve house and resident identifiers; stop on unmatched or ambiguous records.
3. Create monthly invoices from `monthly_charges`, initially unpaid, using each row's historical rate card.
4. Import every `payments` row as a payment record and credit to the responsible resident's wallet.
5. Allocate each wallet credit FIFO to that resident's oldest unpaid invoices.
6. Reconcile imported charge totals, payment totals, invoice statuses, wallet balances, and the annual summary.

## Explicit Non-Requirements

- Do not include a resident portal view or resident self-service workflow.
- Do not fabricate payments to make annual totals balance.
- Do not use the house's current billing profile for historical invoices.
- Do not use `annual_paid / 12` to populate monthly invoice payments.
- Do not import 2026 months after the August 2026 snapshot boundary without a documented pre-billing exception.
