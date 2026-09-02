---
id: streets-and-house-types
title: Streets and house types
sidebar_label: Streets and house types
residio_sources:
  - src/app/(dashboard)/settings/streets/**
  - src/app/(dashboard)/settings/house-types/**
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---

# Streets and house types

Estate configuration keeps property data consistent across residents, billing, security, and reports.

## Streets

Use **Settings → Streets** to add or maintain the street list. Choose a stable name that matches the estate's official records. Avoid abbreviations that will make imports or searches ambiguous.

## House types

Use **Settings → House Types** to define the categories used by property and billing workflows. Review the type before assigning a house because it may influence reporting or rate selection.

:::tip[Configuration order]
Create streets and house types before adding houses. This avoids incomplete property records and reduces cleanup later.
:::
