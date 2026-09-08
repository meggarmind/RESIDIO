---
id: security-contacts
title: Security contacts
sidebar_label: Security contacts
description: Maintain the contacts and access information used by gate operations.
residio_sources:
  - src/app/(dashboard)/security/**
  - src/actions/security/**
  - src/lib/security/**
residio_verified_commit: 294726f9
residio_verified_at: '2026-09-07'
residio_app_version: '0.4.0'
---

# Security contacts

Open **Security** to review active contacts, access information, and security activity.

![Residio security contacts page](../assets/admin/security-contacts.png)

## Add a contact

1. Select **Add Security Contact**.
2. Enter the contact identity and phone details.
3. Link the contact to the correct resident or property where required.
4. Set the validity period and access category.
5. Review the details and save.

## Maintain the list

Filter by active status, category, resident, or expiration. End or update a contact when the underlying authorization changes. Avoid deleting historical records when the workflow provides an end or deactivate action.

## Generate an access code

Open an active contact and select **Generate Code**, or use the **Code** menu on a resident's security contacts card. **Multi-use Code** creates a code that can be used repeatedly until its displayed validity window ends. The menu shows that window before generation; it uses the contact category's default or 30 days when no category default is set. **One-Time Code** remains available for a single use and follows the same configured expiry window.

:::warning[Access data]
Treat contact details and access codes as sensitive operational data. Do not copy them into chat, screenshots, or external spreadsheets.
:::
