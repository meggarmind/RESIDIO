---
id: audit-logs-and-data-management
title: Audit logs and data management
sidebar_label: Audit logs and data management
residio_sources:
  - src/lib/audit/**
  - src/actions/audit/**
  - src/app/(dashboard)/system/data-tools/**
  - src/app/(dashboard)/settings/system/data/**
residio_verified_commit: 8b49d5d
residio_verified_at: '2026-09-03'
residio_app_version: '0.4.0'
---

# Audit logs and data management

Auditability is part of every administrative workflow. After a successful write, confirm the success notification and use **Audit Logs** when the operation needs evidence.

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
