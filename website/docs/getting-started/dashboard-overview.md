---
id: dashboard-overview
title: Dashboard overview
sidebar_label: Dashboard overview
description: Read the Residio admin dashboard and turn its signals into the next action.
residio_sources:
  - src/app/(dashboard)/dashboard/**
  - src/components/dashboard/**
  - src/actions/dashboard/**
residio_verified_commit: 8bfd82a
residio_verified_at: '2026-10-18'
residio_app_version: '0.4.0'
---

# Dashboard overview

The dashboard is your operating picture for the estate. Start here before opening a module: it shows the most urgent item, three lanes for money, people and security, an estate map, recent activity, and shortcuts into the workflows you use most.

![Residio admin dashboard with a top strip, three lanes for money, people and security, and an estate map](../assets/admin/dashboard-overview.png)

<p className="screenshot-caption">The dashboard is a triage surface: use the strip, the three lanes and the estate map to decide what needs attention, then follow the link into the source record.</p>

![Residio dashboard on a mobile viewport](../assets/admin/dashboard-mobile.png)

<p className="screenshot-caption">On a phone, use the header menu to reach the core admin modules.</p>

## Read the page in this order

1. **Top strip:** the band at the top greets you and shows the single most urgent item, as "Most urgent: ...". It picks the first of overdue Invoices, Payments to verify, Residents awaiting review, and expiring security contacts that has a non-zero count, and links to where you resolve it.
2. **Money lane:** the headline is "Collected on invoices, all time". Under it, a line shows how much was collected of the total invoiced, all time, with the collection rate, and a second line shows "Verified payments this month". Collected is everything paid against invoices, all time. Verified is this month's payments that a person confirmed or that came in through a bank or email statement import. Three queue rows sit under it: Payments to verify, Overdue invoice balance, and Resident wallet credits. The main button is **Verify payments**, with shortcuts to record a Payment, generate Invoices, and import a statement.
3. **People and Houses lane:** the headline is Residents awaiting review. The status lines add "N houses are overdue" when any House is overdue, and "N of M houses paid up", both taken from the estate map. The queue rows show Active residents, Occupied houses, and Overdue houses. When the map is not available, the last row shows Vacant houses instead. The main button is **Review residents**, with shortcuts to add a Resident and add a House.
4. **Security and Access lane:** the headline is Contacts expiring soon. The status line reads "N of M contacts active", followed by a summary of anything that needs attention. The queue rows show Expired access codes, Suspended contacts, and Recent flagged entries. The main button is **Open security contacts**, with a shortcut to add a security contact.
5. **Estate map:** one cell for each House, grouped by street and marked by payment status: Overdue, Outstanding, Paid up, or No invoice. Each status has its own icon as well as a colour. The filter buttons (All, Overdue, Outstanding, Paid up, No invoice) show the count for each status, and choosing one shows only the Houses in that state. Select a cell to open the House. It is gated on the same billing view permission as the Money lane.
6. **Recent activity:** confirm recent changes are expected and traceable. It is limited to Payments, Residents, and security contacts. If your role cannot
   view audit logs, this card says so rather than showing an empty list. Ask an administrator
   for the "view audit logs" permission if you need it.

:::tip[Daily habit]
Use the dashboard as a queue, not a report. Resolve the highest-risk exception first, then refresh before starting the next task.
:::

## Lane buttons

Each lane has one main button and a few smaller shortcuts for common jobs: adding a Resident, recording a Payment, generating Invoices, importing a statement, adding a House, and adding a security contact. These open the same workflows as the sidebar. A button is hidden when your role lacks the permission for it.

## What the numbers mean

- **Unpaid:** an invoice has no settled payment.
- **Partial:** a payment exists but the invoice is not fully settled.
- **Overdue:** the invoice has passed its due date without full settlement.
- **Pending verification:** a submitted payment still needs maker-checker review.
- **Wallet credits:** resident funds available for invoice allocation.

Numbers are permission-filtered. A user with a narrower role may see fewer cards or a different set of navigation links.
