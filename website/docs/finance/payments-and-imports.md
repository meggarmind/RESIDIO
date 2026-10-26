---
id: payments-and-imports
title: Payments and statement imports
sidebar_label: Payments and imports
description: Record, import, verify, and reconcile estate payments.
residio_sources:
  - src/app/(dashboard)/payments/**
  - src/actions/payments/**
  - src/actions/finance/manual-verification.ts
  - src/components/payments/payment-table.tsx
  - src/actions/imports/**
  - src/components/imports/**
  - src/lib/parsers/**
residio_verified_commit: ad2bd9eb
residio_verified_at: '2026-10-26'
residio_app_version: '0.4.0'
---

# Payments and statement imports

Use **Transactions** for individual payment records and **Import Statement** for bank statement workflows.

![Residio transactions page](../assets/admin/payments-directory.png)

## Record a payment manually

1. Select **Record Payment**.
2. Identify the resident or house before entering the amount.
3. Enter the payment date, reference, account, and source details.
4. Choose what the payment is for in **Payment for** (Dues unless you change it). The payment credits the resident's wallet of that charge category and pays only invoices of that category.
5. If someone else paid, choose them in **Paid by**, or type the name on the transfer in **Payer name**. The money still goes to the wallet of the resident chosen above.
6. Review the allocation preview.
7. Save the payment and confirm the success notification.

A payment for a house pays only that house's invoices. Any amount left over stays as wallet credit; it is never moved to another house.

### Split a payment between billing and a collection

When a resident pays one sum for dues and a collection (for example dues and the End of Year Party), turn on **Part of this payment is for a collection** before saving. Enter the full amount received in **Amount**, then add one or more collection parts: the collection and the amount, or the quantity for an item purchase. The form shows how much goes to the wallet. Saving records each collection part as a payment into its collection, with its own `COL-` receipt, and the rest as a billing payment in the **Payment for** category. The parts always add up to the amount received. If the billing payment cannot be saved (for example it is a duplicate), the collection parts are reversed. A split where the collection parts take the whole amount is refused: record that payment in **Collections** instead. Splitting needs `payments.create` and `collections.manage`.

Payments from a bank statement or email import are recorded as Dues, paid by the matched resident, unless the review marked the line as a collection (see below). A Paystack payment takes the category of the invoice it was started from.

## Change what a payment is for

Open the payment and choose **Change category**, then pick the new category. The amount moves from the resident's wallet of the old category to the wallet of the new one and stays there as credit; settle invoices from the wallet afterwards. The change is recorded in the audit log and needs the `billing.manage_wallets` permission.

It is refused when the payment has already paid invoices ("This payment has already paid invoices. Reverse its settlement before changing its category"), or when the old wallet no longer holds the payment's amount. **Payment for** cannot be changed with **Edit Details**.

### Move a payment to a collection

When a payment was recorded as billing but was money for a collection, open it and choose **Move to collection**. Pick the collection, the quantity for an item purchase, and give a reason. In one step, anything the payment paid is unpaid again, its credit leaves the wallet, the money is recorded in the collection with its own receipt, and the payment record is removed. The move is refused when the credit has already been spent, and for an item purchase when quantity × price is not the payment amount. It needs `payments.delete` and `collections.manage`, and both sides are recorded in the audit log. To move it back, use **Move to billing** on the collection payment (see [Collections](./collections)).

To delete a payment, open it and choose **Delete** on its page. This needs the `payments.delete` permission and asks for confirmation first. Afterwards you return to the resident's page, or to **Transactions** when the payment has no resident.

## Import a statement

An uploaded statement never posts payments on its own. It is submitted, approved by a user with approval rights, and only then processed.

1. Open **Transactions → Import Statement**.
2. Upload the approved statement file. Lines already stored by an earlier import (for example an overlapping statement period), and a repeat of an identical line in the same file, are skipped rather than failing the upload; a notice says how many lines were skipped as already imported.
3. Review parsed rows and duplicate warnings.
4. Correct categorization or matching issues in the preview. For money that is for a collection, open the line's assignment and choose the **Collection** tab (credits only): choose the payer (a resident or a non-resident) and one or more collections with their amounts or quantities. The parts must add up to the bank amount. To split the line, for example dues and a party contribution from one resident, turn on **Rest of the amount is a billing payment** and choose its category: the rest goes to that resident's wallet as an ordinary payment. The line shows **Collection** or **Split** in the preview. Marking a line needs `imports.review` and `collections.manage`. A new assignment or **Unmatch** clears the collection marking.
5. Check that the total and row count match the source statement, then choose **Submit for approval**. This needs the `imports.review` permission and opens the import's page. An import with no matched rows cannot be submitted: the button is disabled on the import's page and the server refuses it with "No matched rows to process, so there is nothing to submit."
6. An approver opens the import (from the **Import History** page, using the **Needs approval** filter, or from the "Bank Import Awaiting Approval" notification) and chooses **Approve**, or **Reject** with a required reason. Approve needs `imports.approve`; Reject needs `imports.reject`. The person who submitted an import cannot approve it: a different approver is required, and the page shows "You submitted this import, so a different approver is required" if they try. The submitter can still reject their own submission to withdraw it.
7. Only an approved import can be processed. Once approved, anyone with `imports.review` (including the submitter) opens the import, picks the processing options (mode, skip duplicates, skip unmatched) and chooses **Process payments**. Payments are created and wallets credited only at this step. A line marked **Collection** creates a collection payment, linked to the bank line, and never credits a wallet; a split line creates its collection payments and a billing payment for the rest. If the billing part of a split line fails, its collection payments are reversed and the line shows the error.

Once an import is submitted, its rows are locked: matching, unmatching, skipping or re-running the auto-match is refused with "This import's rows can no longer be changed" for an import that is awaiting approval, approved, posting, completed, failed or rejected. Rows can only be edited while the import is pending or processing. To change a submitted import, reject it and upload the statement again.

While payments are being created the import shows **Posting**. Only one run can post an import: a second **Process payments** started at the same time is refused with "Import is already being processed by another run" and creates nothing. If an import stays in Posting, the run stopped part way (for example the server restarted). It is not retried automatically: a super admin checks which of its rows were already posted, then moves the import to Failed by hand. From Failed it can then be reset for review as described below.

A failed import can be reset by a super admin (the `imports.reset` permission). On the failed import's page, choose **Reset for review**. The confirmation states how many rows were already created; those rows keep their payments and are not processed again. Rows that errored in the failed run return to unmatched, so re-match them before resubmitting. The reset is audited and sends the import back to review, clearing its submitter and approver, so it must be submitted and approved again by two different people before it can be processed. It is a manual reset, not an automatic retry.

A rejected import keeps its reason on the import page and creates no payments. Approvers and reviewers can open the import pages without `imports.create`.

On the **Import History** page, click anywhere on a row to open that import. To remove an import that was never submitted or was turned down, choose **Delete** from the row menu or on the import page. Delete is offered only for imports that are pending, failed or rejected, needs `imports.create`, and asks for confirmation first. This also clears a pending import that never finished uploading.

## Verify pending payments

Open **Approvals** for transactions awaiting maker-checker verification. The reviewer should compare the submitted evidence with the transaction before approving or rejecting it.

A payment a resident reports through the WhatsApp assistant arrives the same way, as an unverified payment with a request in Approvals. See [WhatsApp operations](../integrations/whatsapp-operations).

Payments created by a bank statement or email import are verified automatically. To verify payments entered by hand, select them on **Transactions** and choose **Mark Verified** in the bar that appears. The confirmation states how many payments are selected. Payments that are already verified are skipped, and the result says how many. Each verified payment gets its own audit entry. This needs the `payments.verify` permission, which also governs **Un-verify** on a payment's page.

A verified payment's amount, resident, property and status are locked. To correct one, open it and choose **Un-verify**, then edit it and verify it again.

## Related

- [Gmail import and bank feeds](../integrations/bank-feeds-and-email-import) for the automated mailbox connection and supported statement formats.
- [Payment gateway](../integrations/payment-gateway) for online card payments and their reconciliation.
