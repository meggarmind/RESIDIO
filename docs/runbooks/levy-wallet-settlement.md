# Runbook: Development Levy and Transformer Fee on Residio_Stage (#1193)

Slice 5 of #1188. For the seeding thread. This runbook does not seed data itself.

Run every step on Stage as an admin through the app. Stage data is written by the seeding thread, not by the feature work.

## 1. Create the two profiles (Settings > Billing > Billing Profiles)

Amounts come from the owner. Both profiles are one-time and landlord-paid, so each house is billed once, to its current landlord (`house_levy_history`, owner decision 5).

| Field | Development Levy | Transformer Fee |
| --- | --- | --- |
| Charge category | Development Levy | Transformer Fee |
| One-Time Levy | on | on |
| Payer | Owner | Owner |
| Development Levy flag | on | off |
| Billing target | Property (House) | Property (House) |
| Item amount | owner's amount | owner's amount |

## 2. Dry run

Settings > Billing > Levies > Generate Retroactive Levies. The dialog is the dry run: it creates nothing until confirmed. Check:

- invoices and naira total per category match the owner's amounts times the houses expected;
- houses with no landlord on record are listed as warnings, and are not billed to a tenant;
- "already charged" counts houses billed before.

## 3. Re-tag the levy payments

For each payment that is really a Development Levy or Transformer Fee payment, open the payment page and use the retag button (`retagPayment`, slice 2). This moves the credit from the Dues wallet to the wallet of the new category.

## 4. Generate levies

Confirm the dialog from step 2. Each invoice takes the profile's charge category and goes to the landlord only. Running again is safe: charged houses are skipped.

## 5. Settle each category

Settle the Development Levy wallet against Development Levy invoices, then the Transformer Fee wallet against Transformer Fee invoices. A wallet pays invoices of its own category only. Date each debit by the backfill rule: the invoice month, or the date of the later funding payment.

## 6. Verify

- Every levy invoice belongs to a landlord, one per house per profile.
- No Dues invoice was paid from a levy wallet, and no levy invoice from the Dues wallet.
- Landlords' Dues balances did not fall because of levy invoices.
