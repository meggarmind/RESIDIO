---
id: reports-and-analytics
title: Reports and analytics
sidebar_label: Reports and analytics
residio_sources:
  - src/app/(dashboard)/(oversight)/analytics/**
  - src/app/(dashboard)/(oversight)/reports/**
  - src/app/(dashboard)/reports/**
  - src/actions/analytics/**
  - src/actions/reports/**
residio_verified_commit: 321fa88e
residio_verified_at: '2026-11-02'
residio_app_version: '0.4.0'
---

# Reports and analytics

Analytics live under **Oversight** in the sidebar. Its left menu has four groups: **Dashboard** (Oversight overview, Collections dashboard, Announcement engagement), **Reports** (Income & expenses), **Messages** and **System**. The left menu scrolls when it is taller than the screen. Use **Collections dashboard** for trends, **Income & expenses** for the income and expense breakdown, and **Announcement engagement** for announcement reach. Generated operational and financial reports have their own **Reports** entry in the main sidebar, directly under **Dashboard**, with the links **New report**, **History** and **Schedules**.

![Residio analytics dashboard](../assets/admin/analytics-dashboard.png)

## Collections dashboard workflow

**Oversight → Collections dashboard** shows: collection rate, outstanding balance, overdue invoices and portfolio value at the top, a revenue against expenses trend for the last 12 months, **Houses by debt status and street**, **Invoice Aging** (how many overdue invoices are overdue by each number of days), **Invoice Status** (paid, unpaid, partially paid, overdue and void), and **Quick Stats** for houses, occupancy and residents. The page has no period filter. Tabs at the top show one part at a time: **Summary** (one card for each part, with its key number), **Totals**, **Trends**, **Debt status**, **Invoice aging** and **Invoices & houses**. The open tab is part of the page address (`?section=debt-status`), so a link can open one tab.

**Houses by debt status and street** is a stacked bar chart with one bar for each street. Each bar shows how many houses are in **Arrears**, **Outstanding**, **Paid in Full** and **Credit**. The subtitle gives the estate totals, and the title gives the "as at" date. It counts the same houses and uses the same rule as the debt status report: active, verified, lived-in houses that have an active primary resident. The labels come from **Settings > Debt Status**. The chart refreshes every minute, and when you return to the browser tab. Only users who can view financial reports see this section.

1. Read the summary cards first.
2. Use the trend and aging charts to locate the problem.
3. Open the source module, such as **Billing** or **Transactions**, for record-level action.

If the aging figures cannot be loaded, the card says *Invoice aging unavailable* rather than showing no overdue invoices, so an empty card is never mistaken for a clean ledger.

## Income and expenses

**Oversight → Income & expenses** shows the financial summary and the transaction breakdown by category, from imported bank statements. It needs the view financial reports permission.

## Report workflow

Each report type has its own view permission. Today every report type needs the view financial reports permission. **Reports** in the main sidebar opens when you have the permission of at least one report type; without one, you are returned to the dashboard. The page has five tabs: **New Report**, **History**, **Schedules**, **Archive** and **Wallet Check**. Step 1 of **New Report**, **History**, **Archive** and **Schedules** show only the report types you have the permission for.

1. Open **Reports → New report** in the sidebar.
2. On step 1, select the report type. The list on the left has a search field and groups (**Money in and out**, **Debts**, **Levies**); select a group name to close or open it. The right side shows what the report asks for (a date range or "as of today", and bank accounts or none), the next step, and an **Example layout** of the report. Then select the period, if the report asks for one.
3. Review the preview or parameters.
4. Generate and download the report only after confirming the scope. If the report cannot be generated, a message tells you why.

Scheduled reports are set up on the **Schedules** tab; creating or changing a schedule needs the manage report schedules permission. Without it, the tab shows the schedules and a line that tells you this. You cannot schedule a report that cannot be generated yet: on the last step of **New Report**, the schedule switch is not shown for it, and a line tells you why. They are generated and delivered by a scheduled job, without anyone signed in. Each scheduled email carries the report as a PDF attachment, with a short message naming the report and the period it covers. Report PDFs, the on-screen report and these emails all show the estate name from **Settings > Estate**.

## Debtors and aging

**Debtors and aging** is in the **Debts** group. It replaces the **Debtors Report** and the **Invoice Aging Report**. The report is always as of today, so it has no time period step and no bank account step.

The report shows four figures at the top: **Total owed**, **Debtors**, **Owed over 90 days** and **Oldest debt**. A bar chart shows the amount owed in each age bucket: **Current** (not yet due), **1-30 days**, **31-60 days**, **61-90 days** and **Over 90 days**. The age is the number of days after the due date. The table has one row for each debtor, with the house, the street, the phone numbers and the email address. It shows the amount for each bucket and the total. The last row gives the totals. An unpaid invoice that has no resident is shown on a row called **No resident linked**, one row for each house. Its money is in the totals, but it is not counted in **Debtors**.

On the **Options** step, the switch **Show invoice lines** adds one row for each unpaid invoice under its debtor. The switch is off unless you turn it on.

Reports that were made before this change stay in **History** and **Archive**, and you can open them. You cannot make a new **Debtors Report** or **Invoice Aging Report**. A schedule that was set up for one of them now runs **Debtors and aging**.

## Dues, levies and collection status

**Dues, levies and collection status** is in the **Debts** group. It replaces the **Indebtedness Report** and the **Indebtedness Detail Report**. It shows one sheet for the estate, with one row for each house. This report asks for a time period, which sets the months of the grid, but not for bank accounts. The report is as of one day: its title reads "Dues, levies and collection status - Security Dues - As of 02 November 2026", and no period is printed.

On step 1, the card of this report shows the **Charge** buttons: **Security Dues** (the default), **Development Levy** and **Transformer Fee**. The list comes from the charge categories of the estate. The report counts only the invoices of the charge you choose, for the months, for **Owed** and for the invoice lines. The debt status and the wallet credit use the same charge. A line under the buttons says who the **Primary Resident** is. For **Security Dues**, it is the tenant, else the owner-occupier (if the billing profile of the house says the landlord pays, it is the landlord). For **Development Levy** and **Transformer Fee**, it is the landlord: the owner-occupier, else the landlord, else the developer. A schedule keeps the charge you chose.

The report shows four figures at the top: **Houses fully paid**, **Houses part paid**, **Houses not paid** and **Total owed**. A house is fully paid when it owes nothing. A house is part paid when it owes money and has paid at least one month in the period. A house is not paid when it owes money and has paid no month in the period. A bar chart shows the amount owed on each street.

The table has these columns for each house: **House**, **Street**, **Primary Resident**, **Months paid** (for example "3 of 4", the months in the period that are paid, out of the months that have an invoice), **Months owed**, **Levy**, **Owed** and **Status**. **Levy** shows **Paid**, **Part paid**, **Not paid** or **No levy** for the development levy. **Owed** is all the money that is still unpaid on the house for the chosen charge, with earlier months. It is the same amount as the **Indebtedness Report** gave. **Status** is the debt status from **Settings > Debt Status**. The last row gives the totals. A house that has paid more than it owes shows 0.00 and is not subtracted from the total.

The report shows at most 24 months, the latest ones. Void invoices are not counted. Invoices of other charges are not counted. A development levy that is billed under Security Dues shows only in **Levy**, not in the months.

On the **Options** step, the switch **Show invoice lines** adds one row for each unpaid invoice under its house. It is off until you turn it on. The switch **Unoccupied Properties** adds the houses that have no active resident.

When you open the report, you can switch between **Sheet** and **Grid of months**. The grid has one row for each house and one column for each month. Each cell shows **Paid up**, **Outstanding**, **Overdue** or **No invoice**, with the same colours as the estate map. The two columns at the end show the levy and the amount owed. The grid is for the screen only. **Export PDF**, **Export CSV** and the scheduled email carry the sheet.

Reports that were made before this change stay in **History** and **Archive**, and you can open them. You cannot make a new **Indebtedness Report** or **Indebtedness Detail Report**. A schedule that was set up for one of them now runs **Dues, levies and collection status** for **Security Dues**.

## Statement of account

**Statement of account** is in the **Money in and out** group. It shows every charge and every payment of one house or one resident in the period, line by line, with a running balance. It asks for a time period, but not for bank accounts. On the **Options** step, choose **A house** or **A resident**, then choose the house or the resident from the list. You can search the list. You see **A house** only if you can view houses, and **A resident** only if you can view residents. You cannot go to the next step until you choose one. The title gives the house or the resident and the period, for example "Statement of account - 12, Palm Close, 01 August 2026 to 31 October 2026".

The report shows four figures at the top: **Opening balance** (on the first day of the period), **Charged**, **Paid** and **Owed now** (on the last day of the period; for a period that ended before today it is **Owed at end of period**). A negative balance is credit. A bar chart shows the amount charged and the amount paid in each month.

The table has these columns: **Date**, **Item**, **Charge type**, **Charge**, **Payment** and **Balance**. The first row is the opening balance. Each invoice shows one row for each of its invoice lines. Each payment shows one row. The last row gives the totals. **Charge type** is the charge of the line, for example **Security Dues** or **Transformer Fee**. All charges are in one balance, so the closing balance is the balance of the whole account.

The balance is the same balance as the **Account Statement**: all invoices that are not void, less all verified payments. An invoice is dated by the first day of the period it bills. A payment that is not verified yet is not in the balance; a note gives its amount.

- On the statement of a resident, wallet movements are lines too, for example a credit or an adjustment. A wallet movement that only moves a payment into the wallet, or pays an invoice from the wallet, is not shown, because that payment and that invoice are lines already. Thus no money is counted two times.
- On the statement of a house, there are no wallet lines, because a wallet belongs to a resident and not to a house. A payment for the house counts on the day it is paid, also when the money is still in the wallet and not yet used for an invoice. Each line gives the name of the resident.

A note gives the unpaid amount on invoices today, as the house page or the resident page shows it. That figure changes only when money is used for an invoice. Thus it is different from the balance when money is in the wallet and not yet used, when a payment that is not verified was used for an invoice, or when an invoice is dated after the period.

A schedule of this report keeps the house or the resident that you chose. In **History**, open the report with **View** to print it; the card has no **PDF** button for this report.

Reports are snapshots. If a number looks wrong, trace it back to residents, invoices, payments, or expenditure instead of editing the report output.
