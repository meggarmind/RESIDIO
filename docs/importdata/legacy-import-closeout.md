# Legacy Tracker Import Closeout

**Closed:** 2026-08-12  
**Scope:** The 136 tracker records reviewed from OJO.K, IBB, GLB, and KOA. Later tracker additions and manually entered houses are outside this closeout.

## Final result

- Every ledger label maps to exactly one existing house: **136/136**.
- The scoped cloud snapshot contains **178 houses**, **223 resident-house assignments**, **193 residents**, **53 payment aliases**, and **2,259 payment records**.
- All comparable legacy payment totals reconcile: **203/203 house-year rows matched**.
- Confirmed aliases, linked secondary residents, ownership/occupancy histories, and corporate-tenant cases were reconciled in the database.

## Data-safety verification

- No active house assignment matches a payment-only alias.
- No house has multiple active primary assignments.
- No active house has contradictory live-in tenant and resident-landlord roles.
- All `LEGACY-NO-PHONE-*` placeholder residents are documented; the one inactive, unassigned duplicate Ubah Karl Chinedu record is intentionally retained for audit history.

## Deferred / manual houses

The following existing houses have no active assignment but were not part of the reviewed tracker ledger, so they were intentionally left unchanged:

- OJO.K: `24 BLK1` through `24 BLK11`
- IBB: `16`, `34`
- KOA: `17B`, `20A`, `20B`

## Ongoing import rule

Use [legacy-record-ledger.md](legacy-record-ledger.md) for any future legacy records. New identities without verified contact details must use a conspicuous `LEGACY-NO-PHONE-*` placeholder. Payment aliases must be stored in `resident_payment_aliases`, never as active residents or active house assignments.
