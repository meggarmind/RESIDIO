---
id: integrations-overview
title: Integrations overview
sidebar_label: Integrations overview
description: The external services Residio connects to, who configures them, and how to check that they are working.
residio_sources:
  - vercel.json
  - src/lib/whatsapp/index.ts
  - src/lib/email/index.ts
  - src/lib/sms/index.ts
  - src/lib/paystack/index.ts
  - src/lib/email-imports/gmail-client.ts
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---

# Integrations overview

Residio talks to a small set of external services. Each one is configured with server credentials by an engineer, then operated day to day from the dashboard. This section explains the operating side: what each connection does, where its controls live, and how to tell whether it is healthy.

## The connection map

| Connection | What it does | Where you operate it |
|---|---|---|
| WhatsApp Cloud API | Resident messaging, identity checks, and balance lookups | **Settings → WhatsApp** |
| Email (Resend) | Outbound notifications, reminders, receipts | **Settings → Email** |
| SMS (Termii) | Emergency broadcasts, verification codes, two-factor codes | **Settings → Notifications** |
| Gmail import | Pulls bank alerts and statements into the payment queue | **Settings → Email Integration** |
| Bank statement files | CSV, Excel, and PDF statement parsing | **Transactions → Import Statement** |
| Paystack | Online card payment collection and reconciliation | **Transactions**, **Approvals** |
| Scheduled jobs | Invoice generation, reminders, report delivery, cleanups | **Settings → Cron Status** |

## Two layers of configuration

Every integration is configured in two places, and both must be right before it works.

1. **Server credentials.** API keys, webhook secrets, and OAuth client details live in environment variables on the deployment. Admins do not see or edit these from the dashboard. If a page reports "not configured", this is the layer to escalate.
2. **Operating settings.** Toggles, templates, rollout modes, caps, and schedules live in the database and are edited from **Settings**. These are yours to change, and changes are recorded in the audit log.

:::warning[Credentials are never entered in the dashboard]
No Residio settings page asks for an API key or secret. If a screen appears to request one, stop and report it to the security lead.
:::

## Before enabling any outbound channel

Follow the same sequence for email, SMS, and WhatsApp alike.

1. Confirm the provider reports as configured on its settings page.
2. Review the message template that will be sent.
3. Confirm the recipient scope — one test recipient, a pilot group, or the whole estate.
4. Confirm the daily and burst caps.
5. Send to the test recipient first and read the delivered message.
6. Widen the scope only after the test message is correct.

## Checking that an integration is healthy

| Symptom | First place to look |
|---|---|
| Residents report no messages | The channel's settings page, then **Settings → Notification Queue** |
| Messages queued but never sent | **Settings → Cron Status** for the notification job |
| Bank alerts not appearing | **Settings → Email Integration** connection status and last sync time |
| Online payments missing | **Approvals** for unverified transactions, then the payment gateway logs |
| A job has not run | **Settings → Cron Status** |

A failed integration is an investigation, not a cleanup. Do not delete queued messages, imported rows, or transactions to clear a warning — the record of the failure is what makes the fix verifiable.

## Where to go next

- [WhatsApp operations](./whatsapp-operations)
- [Email and SMS channels](./email-and-sms)
- [Gmail import and bank feeds](./bank-feeds-and-email-import)
- [Payment gateway](./payment-gateway)
- [Scheduled jobs](./scheduled-jobs)
