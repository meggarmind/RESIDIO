# Global wallet chronology closeout

Date: 2026-08-12

The production wallet allocator now accepts the payment date and will not allocate a wallet payment to an invoice in a later calendar year. Same-year prepayment remains allowed.

The cloud backfill was applied with `scripts/reconcile-global-wallet-chronology.ts` and is idempotent. It reconciled five imported legacy residents, corrected legacy invoice allocations and timestamps, removed one duplicate KOA-18A debit, and left the affected wallets balanced to their credits. Final read-back: 61 wallets, 581 invoices, 832 wallet transactions, and zero invoice debits posted before the invoice’s calendar year.

The cloud-wide balance read-back also found 19 pre-existing wallet balance mismatches outside the targeted chronology set. Those are separate wallet-ledger reconciliation work and were not changed by this closeout.
