---
id: troubleshooting
title: Troubleshooting the admin dashboard
sidebar_label: Troubleshooting
description: A short recovery guide for common admin dashboard problems.
residio_sources:
  - src/app/(dashboard)/settings/maintenance/**
  - src/app/(dashboard)/settings/data-retention/**
  - src/app/(dashboard)/system/cron-status/**
  - src/app/api/health/**
  - src/actions/system/**
  - src/lib/system/**
residio_verified_commit: 872584c
residio_verified_at: '2026-09-03'
residio_app_version: '0.4.0'
---

# Troubleshooting

## A menu item is missing

Check the user's role and view permission. Sign out and back in after an access change. If the item remains missing, ask a super administrator to review the role matrix.

## A list is empty

Clear filters, check the date range, and confirm the user has access to the relevant records. Empty data is not automatically an application failure.

## A save fails

Read the validation message, confirm required fields, and retry once. If the problem persists, capture the page, time, user role, and non-sensitive error text for support.

## A number looks wrong

Trace it from dashboard to module to source records. For finance, verify period, status, resident, house, allocation, and audit history before making a correction.

## A page is stuck loading

Refresh once, confirm network access, and check **System → Cron Status** if you have permission. Do not repeatedly submit a write action while the first request may still be running.
