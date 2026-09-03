---
id: billing-and-notifications
title: Billing and notifications settings
sidebar_label: Billing and notifications
residio_sources:
  - src/app/(dashboard)/settings/billing/**
  - src/app/(dashboard)/settings/notifications/**
  - src/app/(dashboard)/settings/message-templates/**
residio_verified_commit: 8b49d5d
residio_verified_at: '2026-09-03'
residio_app_version: '0.4.0'
---

# Billing and notifications settings

## Billing

Review billing settings before changing rates or periods. For a rate change, confirm the effective date, affected profile, and whether existing invoices should remain unchanged.

Use **Late Fees** for grace periods, fee rules, and waivers. Use **Invoice Generation** for recurring generation controls and run history.

## Notifications

Use **Settings → Notifications** to review reminders, schedules, and templates. Keep templates clear and test them before enabling a new automated message.

Sent-notification history and the outgoing queue are system state rather than configuration, so they live under **System → Notification History** and **System → Notification Queue** instead. From the queue you can cancel a pending item or retry one that failed.

## Email and WhatsApp

Email configuration and WhatsApp operations are separate controls. Confirm provider status and rollout mode before enabling an operational communication path.

:::warning[Production communication]
Test recipient scope, template content, and daily caps before enabling automated outbound messages.
:::

## Related

- [Email and SMS channels](../integrations/email-and-sms) for provider status, templates, and the notification queue.
- [WhatsApp operations](../integrations/whatsapp-operations) for rollout modes, consent, and caps.
