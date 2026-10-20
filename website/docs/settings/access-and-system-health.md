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
residio_verified_commit: c6a1556e
residio_verified_at: '2026-10-19'
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

Deleting a role states how many users hold it. A role that anyone still holds cannot be deleted: reassign those users first. Defining roles needs the Manage roles permission; an admin who can only assign roles is sent to **System → Accounts** instead.

**Resident portal access per account.** On the **Role Assignments** tab, each administrator row and the account you select under *Assign Roles* carries a *Resident portal* control with three choices: **Inherit** (follow the estate-wide switch in Settings → Estate Information), **Enabled** and **Disabled**. The text beside it shows the effective result, for example "Inherit (currently off)". *Enabled* works while the estate-wide switch is off, so you can open the portal links to a pilot group first. Changing it needs the permission to assign roles; without it you see the effective state read-only. Every change is recorded in the audit log. This setting only controls whether links are shown: *My Portal* and *Resident Portal* also require the account to be linked to a resident, so an administrator with no resident record never sees them, and *View as Resident* additionally needs the impersonation permission.

Work the **Pending Accounts** queue, under System, as part of routine access review. A new sign-up has no access to anything until it is approved there, so a queue left unattended is a person locked out rather than a person with access they should not have. [Roles and permissions](../getting-started/roles-and-permissions) covers the approval and rejection steps.

## Audit logs

Open **System → Audit Logs** to trace creates, updates, approvals, and administrative changes. Filter by entity, actor, action, or date range. Audit logs are something you watch, not something you configure, so the page lives under System rather than Settings.

## Action log

Open **System → Action Log** to see what automated processes, such as scheduled jobs and incoming webhooks, did and whether it worked. Audit logs record what a signed-in person changed; the action log covers runs with nobody signed in. Each entry shows when it ran, its source, the action, an outcome (success, partial or failure), how long it took, any error message, and a collapsible summary of counts and ids. Filter by source, outcome, or date range; newest entries come first. Only super administrators see this page and its sidebar link. It is read-only. Entries older than 90 days are removed when someone runs **Prune Data** under **Settings → Data Retention**; nothing prunes them automatically.

## System health

Maintenance mode (on the **Settings → System Behaviour** page, which also holds session timeout and the duplicate transaction threshold) and data retention are configuration, so they stay under **Settings**. The things you only watch have moved to **System**: **System → Cron Status** for scheduled jobs, and **System → Notification Queue** for messages waiting to go out. A health warning is a prompt to investigate, not a reason to delete data.

Turning maintenance mode on asks first and lists how many active accounts, by role, would be sent to the maintenance page: everyone without the super admin role. It shows the saved maintenance message; unsaved edits to the message are not used until you save them. Turning it off takes effect at once. While it is on, admins who can manage maintenance see a banner on every dashboard page saying non-admin users are locked out, so it is hard to leave on by mistake. The other fields on the page (message, session timeout, duplicate threshold) are saved together from the save bar that appears when something has changed, and the page warns before you leave with unsaved changes.

**Prune Data** under **Settings → Data Retention** shows how many audit log entries, notifications, search entries and system action log entries it would delete, and runs only after you type PRUNE. It deletes audit logs older than the saved **Audit Log Retention** setting on the same page (30 to 3650 days; 365 if never saved), and the other data by fixed ages.

## Safe maintenance sequence

1. Confirm the maintenance window.
2. Communicate expected impact.
3. Enable maintenance mode only when necessary.
4. Perform the smallest approved operation.
5. Verify health checks and notification queue state.
6. Disable maintenance mode and record the result.

## Related

- [Scheduled jobs](../integrations/scheduled-jobs) for the job schedule and what each status means.
