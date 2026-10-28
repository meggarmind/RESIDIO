---
id: access-and-system-health
title: Access and system health
sidebar_label: Access and system health
residio_sources:
  - src/app/(dashboard)/settings/maintenance/**
  - src/app/(dashboard)/settings/data-retention/**
  - src/app/(dashboard)/settings/system/**
  - src/components/settings/system/**
  - src/app/(dashboard)/system/audit-logs/**
  - src/app/(dashboard)/system/action-log/**
  - src/app/(dashboard)/settings/access/**
  - src/app/(dashboard)/settings/roles/**
  - src/app/(dashboard)/settings/groups/**
  - src/actions/groups/**
  - src/app/(dashboard)/system/accounts/**
  - src/app/(dashboard)/system/page.tsx
  - src/components/system/**
  - src/actions/system/**
residio_verified_commit: 6eff3279
residio_verified_at: '2026-10-22'
residio_app_version: '0.4.0'
---

# Access and system health

## System dashboard

Open **Oversight** in the sidebar — or the status indicator next to the menu button in the header — to land on the **Oversight overview** at `/system`. Oversight has its own left menu with every report and monitoring page. It answers "is anything wrong?" at a glance: cards for cron health, notification queue depth, recent audit activity, accounts awaiting approval, and data tools, each showing enough to tell a healthy state from one that needs attention without opening it. A card only appears if your role can open the page it links to, so this page shows a different set of cards to different roles, same as the sections below. Use it as the entry point before working through the detail pages this guide covers next.

## Roles and permissions

Defining a role and giving it to a person are one task, so both live on one page. Open **Settings → People & Access → Roles & Access** (`/settings/access`). Old links to `/system/accounts`, `/settings/roles` and `/settings/user-roles` still land here, on the same tab. Make changes only with an approved access request, and record the reason.

| Tab | Use it for | Needs |
| --- | --- | --- |
| Administrators | Who currently holds an admin role and under which title, assigning one, and Change role or Remove role on each row | Assign roles |
| Pending sign-ups | Sign-ups waiting to be approved or rejected | Assign roles |
| Unlinked logins | Logins that are not linked to any resident. A login that already holds a role carries a *Holds role* badge | Assign roles |
| Roles | Roles, the modules and privileges each one carries, how many people hold each, and the titles under each role with their seats | Manage roles |
| Who can hold each role | Which resident types are eligible for each executive role | Manage roles |

The tab is kept in the address (?tab=), so a link opens the tab you were on. The holder count on the Roles tab opens the Administrators tab filtered to that role; clear the filter from the *Showing* line.

## Recipient groups

Open **Settings → Groups** to keep named lists of residents, such as the estate officials,
that the estate sends copies to. Define a group once and select it wherever a copy is sent;
after an election or handover, change the members in one place. Members are residents only:
an admin login with no resident record cannot be added.

- **Add members** searches residents by name. A member's badge shows a warning when they
  cannot receive a WhatsApp copy (`no WhatsApp number`, `not opted in`), or when they have
  `moved out` or are `deactivated`. Moved-out and deactivated members stay listed but are
  skipped when sending.
- **Estate officials** is created empty and is the default group for clearance certificate
  copies.
- A group in use cannot be deleted. The delete dialog names what uses it, for example
  `Used by: Clearance certificate copies`; select another group there first.
- Viewing needs the View recipient groups permission and changes need Manage recipient groups;
  both are granted to Super Admin and Chairman. Every create, rename, member change and delete
  is written to the audit log.

The **Access** column on the Roles tab shows how many modules and privileges a role holds, and opens the picker where you grant or revoke them. [Roles and permissions](../getting-started/roles-and-permissions) covers creating a role.

Deleting a role states how many users hold it. A role that anyone still holds cannot be deleted: reassign those users first. Defining roles needs the Manage roles permission; an admin who can only assign roles sees the first three tabs and never the Roles or Who can hold each role tabs.

**Resident portal access per account.** On the **Administrators** tab, each administrator row and the account you select under *Assign Roles* carries a *Resident portal* control with three choices: **Inherit** (follow the estate-wide switch in Settings → Estate & Property → Estate Profile), **Enabled** and **Disabled**. The text beside it shows the effective result, for example "Inherit (currently off)". On a wide screen the list shows the control in a *Resident portal* column whose header states the estate-wide default, and the repeated label and effective text are left out of the rows. *Enabled* works while the estate-wide switch is off, so you can open the portal links to a pilot group first. Changing it needs the permission to assign roles; without it you see the effective state read-only. Every change is recorded in the audit log. This setting only controls whether links are shown: *My Portal* and *Resident Portal* also require the account to be linked to a resident, so an administrator with no resident record never sees them, and *View as Resident* additionally needs the impersonation permission.

Work the **Pending sign-ups** queue, under Settings → Roles & Access, as part of routine access review. A new sign-up has no access to anything until it is approved there, so a queue left unattended is a person locked out rather than a person with access they should not have. [Roles and permissions](../getting-started/roles-and-permissions) covers the approval and rejection steps.

## Audit logs

Open **Oversight → Audit logs** to trace creates, updates, approvals, and administrative changes. Filter by entity, actor, action, or date range. Audit logs are something you watch, not something you configure, so the page lives under System rather than Settings.

## Action log

Open **Oversight → Action log** to see what automated processes, such as scheduled jobs and incoming webhooks, did and whether it worked. Audit logs record what a signed-in person changed; the action log covers runs with nobody signed in. Each entry shows when it ran, its source, the action, an outcome (success, partial or failure), how long it took, any error message, and a collapsible summary of counts and ids. Filter by source, outcome, or date range; newest entries come first. Only super administrators see this page and its sidebar link. It is read-only. Entries older than 90 days are removed when someone runs **Prune Data** under **Settings → Maintenance & Data → Data retention**; nothing prunes them automatically.

## System health

Maintenance mode and data retention (the two sections of **Settings → Maintenance & Data**; the duplicate transaction threshold sits under **Settings → Money → Banking**) are configuration, so they stay under **Settings**. The things you only watch have moved to **System**: **Oversight → Scheduled jobs** for scheduled jobs, and **Oversight → Notification queue** for messages waiting to go out. A health warning is a prompt to investigate, not a reason to delete data.

Turning maintenance mode on asks first and lists how many active accounts, by role, would be sent to the maintenance page: everyone without the super admin role. It shows the saved maintenance message; unsaved edits to the message are not used until you save them. Turning it off takes effect at once. While it is on, admins who can manage maintenance see a banner on every dashboard page saying non-admin users are locked out, so it is hard to leave on by mistake. The maintenance message is saved with the **Save Maintenance mode** button at the foot of the section, which lights up when the message has changed, and the page warns before you leave with unsaved changes. The section is marked **Needs attention** while maintenance mode is on. The switch and the message both need the manage maintenance permission.

**Session timeout** is under **Settings → People & Access → Security rules**, in its own *Session timeout* section (it moved there from the Maintenance page). It sets how many minutes of inactivity sign a user out, from 5 to 1,440; 60 if never saved. The section has its own **Save** and **Discard**, and still needs the manage maintenance permission.

**Prune Data** sits in the **Data retention** section of **Settings → Maintenance & Data**, which starts collapsed. It shows how many audit log entries, notifications, search entries and system action log entries it would delete, and runs only after you type PRUNE. It deletes audit logs older than the saved **Audit Log Retention** setting in the same section (30 to 3650 days; 365 if never saved; saved with **Save Data retention**), and the other data by fixed ages. Changing the retention setting and running **Prune Data** both need the manage data retention permission.

The collapsed **Duplicate matching** section sets the confidence threshold (1 to 100; 90 if never saved) above which a transaction is flagged as a duplicate. It has its own **Save** and **Discard** and needs the manage maintenance permission.

## Safe maintenance sequence

1. Confirm the maintenance window.
2. Communicate expected impact.
3. Enable maintenance mode only when necessary.
4. Perform the smallest approved operation.
5. Verify health checks and notification queue state.
6. Disable maintenance mode and record the result.

## Related

- [Scheduled jobs](../integrations/scheduled-jobs) for the job schedule and what each status means.
