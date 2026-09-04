---
id: navigation-and-search
title: Navigation and search
sidebar_label: Navigation and search
residio_sources:
  - src/components/layout/**
  - src/components/dashboard/global-search-command.tsx
  - src/app/api/search/**
  - src/lib/search/**
  - src/lib/auth/action-roles.ts
  - src/config/navigation.ts
  - src/config/settings-nav.ts
residio_verified_commit: 00ea115
residio_verified_at: '2026-09-04'
residio_app_version: '0.4.0'
---

# Navigation and search

Residio groups work by responsibility rather than by database table.

![Residio admin navigation showing grouped modules](../assets/admin/navigation-desktop.png)

## Sidebar groups

- **Core:** dashboard and analytics.
- **People & Property:** residents, houses, and contractors or staff.
- **Financial:** transactions, imports, invoices, and expenditure.
- **Operations:** security, reports, documents, announcements, approvals, and capital projects.
- **System:** the System dashboard (an at-a-glance read on cron health, the notification queue, audit activity and account approvals), Settings, and the individual pages behind each of those cards — audit logs, accounts, notification queue and history, data tools, and cron status.

On desktop, hover over the collapsed sidebar to reveal labels. On mobile, use **Toggle menu** in the header.

## Search

Select **Search** in the header to search the records available to your role. Use a resident code, name, house label, transaction reference, or announcement title. Search results are permission-filtered: a category you cannot view — residents, houses, payments, security contacts or documents — is not searched at all, so two admins searching the same term can see different results.

Search also finds **settings and system pages** by name, so you can jump straight to a page instead of walking the menus — type `email import` to reach Gmail Import, or `late fees` to reach the billing rule. Pages are matched on their own name plus the group they sit in, which is what lets a page called simply "Configuration" be found by searching `email`. These need at least two characters, and you are only offered a page your role can actually open — the same permission check the menus use, so search never hands back a page the sidebar hides.

Search also offers **Quick Actions**, and lists only those your role can both reach and complete. Add New Resident and Add House need the create permission for that record as well as the view permission, so an admin who can view houses but not add one is not offered **Add House**.

## Navigation rules

- If a module is not visible, your role likely does not have its view permission. The same applies inside **Settings**: its sidebar lists only the pages your role can open, so two admins will see different menus there.
- In Settings, the group holding the page you are on stays expanded, and exactly one entry is highlighted — the page itself, not its section.
- A page can be reachable by a direct link but still deny actions without the required create, update, or delete permission.
- Use the breadcrumb or module link to return to the list rather than using browser history after a successful write.
