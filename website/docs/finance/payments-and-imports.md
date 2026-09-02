---
id: payments-and-imports
title: Payments and statement imports
sidebar_label: Payments and imports
description: Record, import, verify, and reconcile estate payments.
residio_sources:
  - src/app/(dashboard)/payments/**
  - src/actions/payments/**
  - src/actions/imports/**
  - src/lib/parsers/**
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---

# Payments and statement imports

Use **Transactions** for individual payment records and **Import Statement** for bank statement workflows.

![Residio transactions page](../assets/admin/payments-directory.png)

## Record a payment manually

1. Select **Record Payment**.
2. Identify the resident or house before entering the amount.
3. Enter the payment date, reference, account, and source details.
4. Review the allocation preview.
5. Save the payment and confirm the success notification.

## Import a statement

1. Open **Transactions → Import Statement**.
2. Upload the approved statement file.
3. Review parsed rows and duplicate warnings.
4. Correct categorization or matching issues in the preview.
5. Commit only after the total and row count match the source statement.

## Verify pending payments

Open **Approvals** for transactions awaiting maker-checker verification. The reviewer should compare the submitted evidence with the transaction before approving or rejecting it.

## Related

- [Gmail import and bank feeds](../integrations/bank-feeds-and-email-import) for the automated mailbox connection and supported statement formats.
- [Payment gateway](../integrations/payment-gateway) for online card payments and their reconciliation.
