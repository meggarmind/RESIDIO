---
id: reports-and-analytics
title: Reports and analytics
sidebar_label: Reports and analytics
residio_sources:
  - src/app/(dashboard)/(oversight)/analytics/**
  - src/app/(dashboard)/(oversight)/reports/**
  - src/actions/analytics/**
  - src/actions/reports/**
residio_verified_commit: fe2c42a
residio_verified_at: '2026-10-30'
residio_app_version: '0.4.0'
---

# Reports and analytics

Both live under **Oversight** in the sidebar. Its left menu has four groups: **Dashboard** (Oversight overview, Collections dashboard, Announcement engagement), **Reports** (Income & expenses, Generate reports), **Messages** and **System**. The left menu scrolls when it is taller than the screen. Use **Collections dashboard** for trends, **Income & expenses** for the income and expense breakdown, **Generate reports** for generated operational or financial outputs, and **Announcement engagement** for announcement reach.

![Residio analytics dashboard](../assets/admin/analytics-dashboard.png)

## Collections dashboard workflow

**Oversight → Collections dashboard** shows: collection rate, outstanding balance, overdue invoices and portfolio value at the top, a revenue against expenses trend for the last 12 months, **Houses by debt status and street**, **Invoice Aging** (how many overdue invoices are overdue by each number of days), **Invoice Status** (paid, unpaid, partially paid, overdue and void), and **Quick Stats** for houses, occupancy and residents. The page has no period filter. Jump tabs at the top (**Totals**, **Trends**, **Debt status**, **Invoice aging**) scroll to each part.

**Houses by debt status and street** is a stacked bar chart with one bar for each street. Each bar shows how many houses are in **Arrears**, **Outstanding**, **Paid in Full** and **Credit**. The subtitle gives the estate totals, and the title gives the "as at" date. It counts the same houses and uses the same rule as the debt status report: active, verified, lived-in houses that have an active primary resident. The labels come from **Settings > Debt Status**. The chart refreshes every minute, and when you return to the browser tab. Only users who can view financial reports see this section.

1. Read the summary cards first.
2. Use the trend and aging charts to locate the problem.
3. Open the source module, such as **Billing** or **Transactions**, for record-level action.

If the aging figures cannot be loaded, the card says *Invoice aging unavailable* rather than showing no overdue invoices, so an empty card is never mistaken for a clean ledger.

## Income and expenses

**Oversight → Income & expenses** shows the financial summary and the transaction breakdown by category, from imported bank statements. It needs the view financial reports permission.

## Report workflow

**Oversight → Generate reports** needs the view financial reports permission; without it you are returned to the dashboard. The page has five tabs: **New Report**, **History**, **Schedules**, **Archive** and **Wallet Check**.

1. Open **Oversight → Generate reports → New Report**.
2. Select the report type and period.
3. Review the preview or parameters.
4. Generate and download the report only after confirming the scope.

Scheduled reports are set up on the **Schedules** tab; creating or changing a schedule needs the manage report schedules permission. They are generated and delivered by a scheduled job, without anyone signed in. Each scheduled email carries the report as a PDF attachment, with a short message naming the report and the period it covers. Report PDFs, the on-screen report and these emails all show the estate name from **Settings > Estate**.

Reports are snapshots. If a number looks wrong, trace it back to residents, invoices, payments, or expenditure instead of editing the report output.
