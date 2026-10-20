---
id: audit-logs-and-data-management
title: Audit logs and data management
sidebar_label: Audit logs and data management
residio_sources:
  - src/lib/audit/**
  - src/actions/audit/**
  - src/app/(dashboard)/system/data-tools/**
  - src/app/(dashboard)/settings/data-retention/**
residio_verified_commit: b59d58f5
residio_verified_at: '2026-10-20'
residio_app_version: '0.4.0'
---

# Audit logs and data management

Auditability is part of every administrative workflow. After a successful write, confirm the success notification and use **Audit Logs** when the operation needs evidence.

:::note[Who can read the audit log]
Audit Logs are open only to roles holding **View audit logs** — the super administrator and the vice chairman. The chairman does **not** have it, deliberately: the audit trail records what administrators did, so the people it records do not control who reads it.

This is enforced in the database as well as the interface, so it holds however the data is reached. If you need evidence from the log and cannot open it, ask a super administrator rather than looking for another route to the same records.
:::

## How long entries are kept

Audit log entries are kept until someone runs **Prune Data** under **Settings → System → Data Retention**, which deletes entries older than the saved **Audit Log Retention** setting (365 days if it was never saved). Nothing prunes them automatically. The prune shows how many entries it would delete and runs only after you type PRUNE; deleted entries remove the record of who changed what. See [Access and system health](../settings/access-and-system-health.md).

## Data management

Use **System → Data Tools** for approved reconciliation or backfill tools. Read the preview and scope carefully before running any operation.

:::warning[Irreversible work]
If a tool changes many records, stop at the preview stage when the count or warning is unexpected. Ask a super administrator to confirm the intended scope.
:::

## Evidence checklist

- Who performed the action?
  - Changes a resident makes through the WhatsApp assistant (reminders, email, reported payments, clearance requests) show no administrator; the resident is named in the entry's metadata.
- What records were affected?
- What was the old and new state?
- What source document or approval authorized it?
- Can the operation be safely repeated or reversed?
