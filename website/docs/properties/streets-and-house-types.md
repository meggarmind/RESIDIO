---
id: streets-and-house-types
title: Streets and house types
sidebar_label: Streets and house types
residio_sources:
  - src/app/(dashboard)/settings/property/**
  - src/components/settings/property/**
residio_verified_commit: 35bc9f01
residio_verified_at: '2026-10-21'
residio_app_version: '0.4.0'
---

# Streets and house types

Estate configuration keeps property data consistent across residents, billing, security, and reports.

## Streets

Use the *Streets* section of **Settings → Streets & Houses** to add or maintain the street list. Choose a stable name that matches the estate's official records. Avoid abbreviations that will make imports or searches ambiguous.

## House types

Use the *House types* section of the same page to define the categories used by property and billing workflows. Review the type before assigning a house because it may influence reporting or rate selection.

:::tip[Configuration order]
Create streets and house types before adding houses. This avoids incomplete property records and reduces cleanup later.
:::
