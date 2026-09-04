---
id: audit-logs-and-data-management
title: Audit logs and data management
sidebar_label: Audit logs and data management
residio_sources:
  - src/lib/audit/**
  - src/actions/audit/**
  - src/app/(dashboard)/system/data-tools/**
  - src/app/(dashboard)/settings/data-retention/**
residio_verified_commit: 66ded86
residio_verified_at: '2026-09-04'
residio_app_version: '0.4.0'
---

# Audit logs and data management

Auditability is part of every administrative workflow. After a successful write, confirm the success notification and use **Audit Logs** when the operation needs evidence.

:::note[Who can read the audit log]
Audit Logs are open only to roles holding **View audit logs** — the super administrator and the vice chairman. The chairman does **not** have it, deliberately: the audit trail records what administrators did, so the people it records do not control who reads it.

This is enforced in the database as well as the interface, so it holds however the data is reached. If you need evidence from the log and cannot open it, ask a super administrator rather than looking for another route to the same records.
:::

## Data management

Use **System → Data Tools** for approved reconciliation or backfill tools. Read the preview and scope carefully before running any operation.

:::warning[Irreversible work]
If a tool changes many records, stop at the preview stage when the count or warning is unexpected. Ask a super administrator to confirm the intended scope.
:::

## Evidence checklist

- Who performed the action?
- What records were affected?
- What was the old and new state?
- What source document or approval authorized it?
- Can the operation be safely repeated or reversed?
