---
id: expenditure-and-wallets
title: Expenditure and wallets
sidebar_label: Expenditure and wallets
residio_sources:
  - src/app/(dashboard)/expenditure/**
  - src/actions/expenses/**
  - src/actions/finance/**
  - src/actions/billing/wallet.ts
residio_verified_commit: e24b7386
residio_verified_at: '2026-10-20'
residio_app_version: '0.4.0'
---

# Expenditure and wallets

## Expenditure

Use **Expenditure** to record and review estate costs. Include a clear description, category, date, amount, and supporting document where applicable. Categorize consistently so financial reports remain useful.

The page opens with the petty cash float, this month's spend, and **Pending approval**: how many expenses are still pending and their total. Select that card to list only pending expenses. The ledger filters by status (All, Pending, Paid), category, and a search across description, payee, and category; the filters are kept in the page address, so a filtered view can be bookmarked or shared. The ledger footer shows the total of every expense matching the filters, not just the visible page.

Logging an expense, the **Petty cash** menu (top up, manage accounts), and the row actions on a pending expense need the manage expenditure permission; users who can only view expenditure do not see them. To prefill a new expense from a receipt, choose **Scan a receipt** inside **Log Expense**. **Cancel Expense** asks for confirmation before the expense is marked cancelled. If an expense cannot be saved, for example because it duplicates an existing expense or its amount or date is invalid, **Log Expense** shows the reason and keeps the form open.

## Wallets

Wallet credit represents resident funds that may be allocated against eligible invoices. When a payment is recorded, review the allocation result rather than assuming the amount remains unallocated.

:::warning[Financial control]
Never use an expenditure record to correct a resident payment. Correct the source transaction through the payment workflow so the audit trail stays accurate.
:::

## Reconciliation checklist

- Confirm the source bank reference.
- Confirm the resident and house.
- Confirm the payment date and amount.
- Review invoice allocation and wallet balance.
- Confirm the resulting audit event.
