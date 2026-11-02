---
id: expenditure-and-wallets
title: Expenditure and wallets
sidebar_label: Expenditure and wallets
residio_sources:
  - src/app/(dashboard)/expenditure/**
  - src/actions/expenses/**
  - src/actions/finance/**
  - src/actions/billing/wallet.ts
  - src/actions/billing/wallet-transfers.ts
residio_verified_commit: 1bc49d1c
residio_verified_at: '2026-11-02'
residio_app_version: '0.4.0'
---

# Expenditure and wallets

## Expenditure

Use **Expenditure** to record and review estate costs. Include a clear description, category, date, amount, and supporting document where applicable. Categorize consistently so financial reports remain useful.

The page opens with the petty cash float, this month's spend, and **Pending approval**: how many expenses are still pending and their total. Select that card to list only pending expenses. The ledger filters by status (All, Pending, Paid), category, and a search across description, payee, and category; the filters are kept in the page address, so a filtered view can be bookmarked or shared. The ledger footer shows the total of every expense matching the filters, not just the visible page.

Logging an expense, the **Petty cash** menu (top up, manage accounts), and the row actions on a pending expense need the manage expenditure permission; users who can only view expenditure do not see them. To prefill a new expense from a receipt, choose **Scan a receipt** inside **Log Expense**. **Cancel Expense** asks for confirmation before the expense is marked cancelled. If an expense cannot be saved, for example because it duplicates an existing expense or its amount or date is invalid, **Log Expense** shows the reason and keeps the form open.

## Budgets

**Expenditure → Budgets** sets a budget for each expense category, for one year. Choose the year at the top. Each category shows its **Yearly amount**, a bar with the percent of the budget used so far (expenses marked paid in that year), and the amount paid.

The months start as an even split of the yearly amount: 11 equal months, and December takes the remainder, so the months always add up to the year. To give a category different months (for example, more electricity in the dry season), select **Adjust months** and change the months. A badge on each category shows **Even split**, **Custom months** or **Months do not add up**. When the months do not add up, a message gives the months total and the yearly amount, and the amount to add or remove. **Reset to even split** puts the months back to the even split. If you change the yearly amount while the months are an even split, the months follow it; custom months stay as they are.

**Save budgets** saves all the changed categories together, or none of them. It stays off while any category has months that do not add up. While you have unsaved changes, the year cannot be changed; save, or select **Discard changes**. Editing needs the manage expenditure permission. Users who can only view expenditure see the amounts and can open **Show months**, but they cannot change them.

The **Budget against actual** report compares these budgets with what was paid (see **Reports and analytics**).

## Wallets

Wallet credit represents resident funds that may be allocated against eligible invoices. When a payment is recorded, review the allocation result rather than assuming the amount remains unallocated.

Each resident has one wallet per **charge category**: Dues, Development Levy and Transformer Fee. An invoice takes the category of its billing profile, and a wallet pays only invoices of its own category, so Development Levy money is never spent on dues. A recorded payment goes to the wallet of its category (**Payment for**); a payment that names none is Dues and pays Dues invoices only. A payment for a house pays only that house's invoices, and the rest stays as credit. A manual wallet adjustment changes the Dues wallet.

**Transfer credit** moves money from one wallet to another: between the wallets of one resident (for example, Development Levy credit to the Dues wallet), or to a wallet of a different resident linked to the same house (for example, a landlord's credit to the tenant's Dues wallet). Choose the house, the receiving resident and wallet, the amount and a reason; the amount cannot be more than the source wallet holds, and a resident with no shared active house link cannot receive it. After the transfer, the receiving wallet pays its owner's unpaid invoices of that category for the chosen house, oldest first. Each transfer and each reversal is audited with its reason. To undo a transfer, choose **Reverse** on the transfer line in the wallet ledger and give a reason; this is refused once the receiving wallet no longer holds the amount. Transfer credit needs the `billing.transfer_wallet_credit` permission (super admin and chairman by default).

:::warning[Financial control]
Never use an expenditure record to correct a resident payment. Correct the source transaction through the payment workflow so the audit trail stays accurate.
:::

## Reconciliation checklist

- Confirm the source bank reference.
- Confirm the resident and house.
- Confirm the payment date and amount.
- Review invoice allocation and wallet balance.
- Confirm the resulting audit event.
