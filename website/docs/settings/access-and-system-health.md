---
id: access-and-system-health
title: Access and system health
sidebar_label: Access and system health
residio_sources:
  - src/app/(dashboard)/settings/system/**
  - src/app/(dashboard)/system/audit-logs/**
  - src/app/(dashboard)/settings/roles/**
  - src/app/(dashboard)/system/accounts/**
  - src/actions/system/**
residio_verified_commit: 4c18817
residio_verified_at: '2026-09-03'
residio_app_version: '0.4.0'
---

# Access and system health

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

Work the **Pending Accounts** queue, under System, as part of routine access review. A new sign-up has no access to anything until it is approved there, so a queue left unattended is a person locked out rather than a person with access they should not have. [Roles and permissions](../getting-started/roles-and-permissions) covers the approval and rejection steps.

## Audit logs

Open **System → Audit Logs** to trace creates, updates, approvals, and administrative changes. Filter by entity, actor, action, or date range. Audit logs are something you watch, not something you configure, so the page lives under System rather than Settings.

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
