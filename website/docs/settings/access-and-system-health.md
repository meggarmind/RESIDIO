---
id: access-and-system-health
title: Access and system health
sidebar_label: Access and system health
residio_sources:
  - src/app/(dashboard)/settings/maintenance/**
  - src/app/(dashboard)/settings/data-retention/**
  - src/app/(dashboard)/system/audit-logs/**
  - src/app/(dashboard)/system/action-log/**
  - src/app/(dashboard)/settings/roles/**
  - src/app/(dashboard)/system/accounts/**
  - src/app/(dashboard)/system/page.tsx
  - src/components/system/**
  - src/actions/system/**
residio_verified_commit: 895a6ea
residio_verified_at: '2026-10-16'
residio_app_version: '0.4.0'
---

# Access and system health

## System dashboard

Open **System** in the sidebar — or the status indicator next to the menu button in the header — to land on the System dashboard at `/system`. It answers "is anything wrong?" at a glance: cards for cron health, notification queue depth, recent audit activity, accounts awaiting approval, and data tools, each showing enough to tell a healthy state from one that needs attention without opening it. A card only appears if your role can open the page it links to, so this page shows a different set of cards to different roles, same as the sections below. Use it as the entry point before working through the detail pages this guide covers next.

## Roles and permissions

This work is split across two places, because defining what a role *is* and
working through who holds it are different jobs. Make changes only with an
approved access request, and record the reason.

Open **Settings → Roles & Permissions** to define roles:

| Tab | Use it for |
| --- | --- |
| Role Definitions | Roles, and the modules and privileges each one carries |
| Assignment Rules | Which resident types are eligible for each executive role |

Open **System → Accounts** for the day-to-day account work:

| Tab | Use it for |
| --- | --- |
| Role Assignments | Who currently holds an admin role |
| Pending Accounts | Sign-ups waiting to be approved or rejected |
| Orphaned Accounts | Logins that are not linked to any resident |

The **Access** column on Role Definitions shows how many modules and privileges a role holds, and opens the picker where you grant or revoke them. [Roles and permissions](../getting-started/roles-and-permissions) covers creating a role.

**Resident portal access per account.** On the **Role Assignments** tab, each administrator row and the account you select under *Assign Roles* carries a *Resident portal* control with three choices: **Inherit** (follow the estate-wide switch in Settings → Estate Information), **Enabled** and **Disabled**. The text beside it shows the effective result, for example "Inherit (currently off)". *Enabled* works while the estate-wide switch is off, so you can open the portal links to a pilot group first. Changing it needs the permission to assign roles; without it you see the effective state read-only. Every change is recorded in the audit log. This setting only controls whether links are shown: *My Portal* and *Resident Portal* also require the account to be linked to a resident, so an administrator with no resident record never sees them, and *View as Resident* additionally needs the impersonation permission.

Work the **Pending Accounts** queue, under System, as part of routine access review. A new sign-up has no access to anything until it is approved there, so a queue left unattended is a person locked out rather than a person with access they should not have. [Roles and permissions](../getting-started/roles-and-permissions) covers the approval and rejection steps.

## Audit logs

Open **System → Audit Logs** to trace creates, updates, approvals, and administrative changes. Filter by entity, actor, action, or date range. Audit logs are something you watch, not something you configure, so the page lives under System rather than Settings.

## Action log

Open **System → Action Log** to see what automated processes, such as scheduled jobs and incoming webhooks, did and whether it worked. Audit logs record what a signed-in person changed; the action log covers runs with nobody signed in. Each entry shows when it ran, its source, the action, an outcome (success, partial or failure), how long it took, any error message, and a collapsible summary of counts and ids. Filter by source, outcome, or date range; newest entries come first. Only super administrators see this page and its sidebar link. It is read-only, and entries are not yet pruned automatically.

## System health

Maintenance mode and data retention are configuration, so they stay under **Settings**. The things you only watch have moved to **System**: **System → Cron Status** for scheduled jobs, and **System → Notification Queue** for messages waiting to go out. A health warning is a prompt to investigate, not a reason to delete data.

## Safe maintenance sequence

1. Confirm the maintenance window.
2. Communicate expected impact.
3. Enable maintenance mode only when necessary.
4. Perform the smallest approved operation.
5. Verify health checks and notification queue state.
6. Disable maintenance mode and record the result.

## Related

- [Scheduled jobs](../integrations/scheduled-jobs) for the job schedule and what each status means.
