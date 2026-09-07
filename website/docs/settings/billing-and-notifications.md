---
id: billing-and-notifications
title: Billing and notifications settings
sidebar_label: Billing and notifications
residio_sources:
  - src/app/(dashboard)/settings/billing/**
  - src/app/(dashboard)/settings/notifications/**
  - src/app/(dashboard)/settings/message-templates/**
residio_verified_commit: 7a95615
residio_verified_at: '2026-09-07'
residio_app_version: '0.4.0'
---

# Billing and notifications settings

## Billing

Review billing settings before changing rates or periods. For a rate change, confirm the effective date, affected profile, and whether existing invoices should remain unchanged.

Each billing profile carries a **rate schedule**: a list of versions, each with the month its rates started applying. A billing period is priced by the newest version effective on or before it, so a period earlier than every version is priced by the earliest one — invoice generation reports that as a warning in its preview rather than failing. Open **Rate versions** on a profile in **Settings → Billing → Profiles** to see the schedule, and to add a version for a past month when a historical rate needs recording. A version that is locked or approved cannot be edited; record a rate change by adding a new version with a later effective month.

Use **Late Fees** for grace periods, fee rules, and waivers. Use **Invoice Generation** for recurring generation controls and run history.

## Notifications

Use **Settings → Notifications** to review reminders, schedules, and templates. Keep templates clear and test them before enabling a new automated message.

Sent-notification history and the outgoing queue are system state rather than configuration, so they live under **System → Notification History** and **System → Notification Queue** instead. From the queue you can cancel a pending item or retry one that failed.

## Email and WhatsApp

Email configuration and WhatsApp operations are separate controls, and live in different Settings groups. **Settings → Communications → Email Notifications** configures outbound email; **Settings → Integrations → WhatsApp** holds WhatsApp's provider credentials, rollout mode, consent, and pending contacts together — WhatsApp is grouped with the other external-service integrations rather than with Communications. Confirm provider status and rollout mode before enabling an operational communication path.

:::warning[Production communication]
Test recipient scope, template content, and daily caps before enabling automated outbound messages.
:::

## Related

- [Email and SMS channels](../integrations/email-and-sms) for provider status, templates, and the notification queue.
- [WhatsApp operations](../integrations/whatsapp-operations) for rollout modes, consent, and caps.
