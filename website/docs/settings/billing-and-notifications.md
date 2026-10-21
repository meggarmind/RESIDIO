---
id: billing-and-notifications
title: Billing and notifications settings
sidebar_label: Billing and notifications
residio_sources:
  - src/app/(dashboard)/settings/billing/**
  - src/app/(dashboard)/settings/notifications/**
  - src/app/(dashboard)/settings/message-templates/**
residio_verified_commit: 10297b79
residio_verified_at: '2026-10-21'
residio_app_version: '0.4.0'
---

# Billing and notifications settings

## Billing

Review billing settings before changing rates or periods. For a rate change, confirm the effective date, affected profile, and whether existing invoices should remain unchanged.

Each billing profile carries a **rate schedule**: a list of versions, each with the month its rates started applying. A billing period is priced by the newest version effective on or before it, so a period earlier than every version is priced by the earliest one — invoice generation reports that as a warning in its preview rather than failing. Open **Rate versions** on a profile in **Settings → Money → Rate Cards** to see the schedule, and to add a version for a past month when a historical rate needs recording. A version that is locked or approved cannot be edited; record a rate change by adding a new version with a later effective month.

Two separate permissions govern this. **Manage Billing Profiles** shows the **Rate versions** control and the schedule inside it — a Secretary has neither. **Manage Billing Rate Versions** is what allows a version to be added or edited, and is held by the Super Admin, Chairman and Financial Officer only, because a version with a past effective month decides what a backfilled invoice charges and those invoice numbers are permanent.

**Clearance Certificate Copies** at the bottom of **Billing Settings** chooses which recipient group receives a WhatsApp copy of every issued clearance certificate: the move-out screens and approved WhatsApp requests alike. The default is *Estate officials*, and *No copies* turns copies off. Members are managed in **Settings → Groups**; the card lists the chosen group's members and warns for anyone who cannot receive a copy (no WhatsApp number, or not opted in). Changing it needs the manage billing settings or manage billing profiles permission and is written to the audit log; it affects certificates issued afterwards.

Use **Late Fees** for grace periods, fee rules, and waivers. Use **Invoices & Due Dates** for recurring generation controls and run history.

Set billing up in this order, which the note at the top of every billing page repeats: **Billing Profiles** (**Rate Cards** in the menu) first, then **Billing Settings** (**Billing Rules → General**), then **Development Levies** (**Levies**), which picks one of the rate cards.

Number fields such as the grace period, the late fee amount and the invoice due window save when you leave the field or press Enter, not while you type. A value outside the allowed range shows a message and is not saved; clearing a field never saves a default. The grace period runs from 1 to 30 days, because the late fee run treats 0 as 7. Changing the general billing rules needs the manage billing settings or manage billing profiles permission; without either, the fields are shown disabled.

Each billing setting carries an **Affects** line saying whether a change reaches invoices already issued. Late fee rules (on or off, type, amount, grace period) reach existing overdue invoices at the next run, manual or automatic, unless an invoice already carries a late fee. Due window, vacant and under-renovation or under-construction billing, and the invoice generation controls reach future invoices only.

**Apply Late Fees Now** and **Generate Retroactive Levies** open a confirmation first. It shows how many invoices (or houses) would be charged and the naira total, says the charges cannot be undone from that screen, and confirms that a second run skips what is already charged. Nothing is charged until you press the confirm button.

## Notifications

Use **Settings → Messages & Reminders → Notifications Overview** to review reminders and email wording. **Email Wording** changes the wording of the five emails residents receive; anything left empty uses the built-in text (see [Email and SMS](../integrations/email-and-sms.md)). The **Sending** switch on the payment receipt, welcome and new invoice rows turns that message off or on for that channel; the receipt also has one on the WhatsApp tab, and WhatsApp still needs the resident's opt-in. Reminder rows link to **Reminder Schedule**, where channels are set per step. Announcement text lives in **Announcement Templates**. Notification Schedules is hidden, because nothing sent what it configured; automatic reminders follow **Reminder Schedule**.

Three controls affect payment reminders. **Enable Reminders** on the Reminders page turns the automatic daily reminders on or off. **Payment Reminders** under **Email Notifications** turns reminder emails off for both the automatic reminders and the manual run; automatic WhatsApp reminders still send. The reminder days set in **Billing** apply to both: an automatic reminder before the due date sends only on a day that is ticked in **Billing** and is a step in **Reminder Schedule**. **Send Payment Reminders Now** on **Email Delivery → Send a Test** (headed *Debug & Testing*) sends one email-only run on those days.

The **Enable Reminders** switch saves the state you set it to. **Reset to Default** on the reminder schedule asks before it replaces your steps, and **Send Reminders** on **Send a Test** shows how many reminders would go to how many residents before it sends.

Sent-notification history and the outgoing queue are system state rather than configuration, so they live under **System → Notification History** and **System → Notification Queue** instead. From the queue you can cancel a pending item or retry one that failed.

## Email and WhatsApp

Email configuration and WhatsApp operations are separate controls, and live in different Settings groups. **Settings → Messages & Reminders → Email Delivery** configures outbound email; **Settings → Connections → WhatsApp** holds WhatsApp's provider credentials, rollout mode, consent, and pending contacts together — WhatsApp is grouped with the other external-service integrations rather than with Messages & Reminders. Confirm provider status and rollout mode before enabling an operational communication path.

:::warning[Production communication]
Test recipient scope, template content, and daily caps before enabling automated outbound messages.
:::

## Related

- [Email and SMS channels](../integrations/email-and-sms) for provider status, templates, and the notification queue.
- [WhatsApp operations](../integrations/whatsapp-operations) for rollout modes, consent, and caps.
