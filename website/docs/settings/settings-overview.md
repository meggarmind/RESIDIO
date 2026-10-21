---
id: settings-overview
title: Settings overview
sidebar_label: Settings overview
description: Navigate the admin configuration areas without losing control of dependencies.
residio_sources:
  - src/app/(dashboard)/settings/page.tsx
  - src/app/(dashboard)/settings/estate-info/**
  - src/app/(dashboard)/settings/branding/**
  - src/app/(dashboard)/settings/reminders/**
  - src/app/(dashboard)/settings/wording/**
  - src/app/(dashboard)/settings/sending/**
  - src/app/(dashboard)/settings/announcements/**
residio_verified_commit: 5ed0365a
residio_verified_at: '2026-10-21'
residio_app_version: '0.4.0'
---

# Settings overview

Settings are grouped by the decision they control.

![Residio settings hub](../assets/admin/settings-overview.png)

- **Setup:** this overview page, with the setup checklist.
- **Estate & Property:** estate details, logo and branding, theme, streets, and house types.
- **Money:** billing rules (general, late fees, invoices and due dates, levies), rate cards (billing profiles), bank accounts, and transaction tags.
- **Messages:** four task pages, each made of sections on one page. **Reminders** (on or off, schedule, send now), **Message wording** (email, WhatsApp), **Email & sending** (channels, email types, and a collapsed *Testing* section for the test-mode redirect and the test email) and **Announcements** (templates, categories). The old addresses for these pages still work and open the right section. The row of section names under the page title stays in view as you scroll and jumps to a section; sections that control a message start collapsed when they are rarely used.
- **Documents:** document categories, and tags and custom fields.
- **People & Access:** role and permission definitions, recipient groups (named lists of residents the estate sends copies to), and security rules (security settings and contact categories).
- **Connections:** external services — WhatsApp and Gmail import today, with Paystack and SMS planned. Each keeps its credentials and its day-to-day console (consent, sync status, manual actions) together, rather than splitting configuration from operations the way the other groups do.
- **System:** maintenance mode (with session timeout and duplicate matching), data retention, and **Monitoring**, which links to the audit logs, scheduled jobs, notification queue and notification history. The Monitoring links are marked **Opens System** because those pages live under **System** in the main sidebar.

**Search from any settings page.** The search box at the top of the Settings menu (the menu button on a phone) finds a page by name and lists matches in place of the menu. Press Enter to open the first match, or Escape to clear the box. It lists only pages your role can open.

**This page.** Every settings page your role can open has a card here, grouped as in the sidebar. Type in the search box to narrow the cards to matching pages, for example `late fee` or `logo`. A card for a setup step reads **Set up** or **Not set up**. Until the estate is fully set up, a **Setup checklist** above the cards shows how many of the nine first-time steps are done (estate name and address, a street, a house type, a bank account, a billing profile, billing settings changed from their defaults, a notification channel, payment reminders, and a custom role given to someone). Email is switched on by default, so a new estate starts with the notification channel step already done. Each step links to its page, and the checklist disappears once every step is done.

**States that affect everyone.** While maintenance mode or the communications override is on, a banner that cannot be dismissed sits above the header on every dashboard page, the **Settings** item in the main menu carries an amber dot, and the matching card on this page reads **ON**. Each banner links to its settings page. You see a state only if your role can open its page: the maintenance permission for maintenance mode, the general settings permission for the override. Debug Mode also counts as the override being on while it is running, since it redirects every message too. Outside production the override is always on, so on Stage the override banner is always shown.

**Resident portal switch.** **Settings → Estate & Property → Estate Details** has a *Resident portal* card with one switch. It decides whether the resident portal links (*My Portal*, *Resident Portal* in the profile menu, and *View as Resident*) appear in the admin dashboard. It is off by default and needs the general settings permission to change. The switch only hides or shows links: it does not block the `/portal` address, so anyone who opens `/portal` directly still reaches it. An individual account can override the switch under **System → Roles & Access**.

**Estate office hours.** The same page sets the estate office hours per day (closed, all day, or from and to times, in Lagos time). The WhatsApp Assistant shows them with the estate phone and email whenever it tells a resident to contact the estate office, and adds when the office is next open if it is closed. Leave every day closed to show no hours.

The rest of **Settings → Estate & Property → Estate Details**, including the AI assistant switches and office hours, saves together from the save bar that appears when something has changed; email and web addresses must be valid before it saves, and the page warns before you leave with unsaved changes. Removing the logo under **Branding** asks first.

Day-to-day account work — assigning roles, watching cron jobs, the notification queue and history, audit logs — lives under **System** in the main sidebar, not Settings: Settings holds configuration, System holds live state and account operations.

:::info[You see only what you can open]
Both this page and the Settings sidebar show only the sections your role can actually reach, so two admins will see different menus. If a colleague cannot find a page described in this guide, their role does not hold the permission for it — see [Roles and permissions](../getting-started/roles-and-permissions.md). The Chairman role can open Settings and navigate to the areas their permissions allow — announcements, documents, billing profiles, email imports, notifications, security categories, and WhatsApp — but does not see configuration pages or system maintenance.

Inside a page, each button and field is shown for the permission its save needs, not the permission that opened the page. An admin who can open a page without being allowed to change it sees the current values with the fields disabled, and no Add, Edit, Delete or Save buttons. For example, an admin who only assigns roles does not see the Roles tabs on **System → Roles & Access** (opened by **Roles & Permissions**), because defining roles needs the Manage roles permission.
:::

Change one setting at a time, save, and verify the affected workflow. Configuration changes can alter what other admins see or what automated jobs do.
