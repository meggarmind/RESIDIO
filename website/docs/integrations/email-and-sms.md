---
id: email-and-sms
title: Email and SMS channels
sidebar_label: Email and SMS
description: Outbound email and SMS delivery, templates, the notification queue, and how to test safely.
residio_sources:
  - src/lib/email/**
  - src/lib/sms/**
  - src/lib/notifications/**
  - src/actions/notifications/**
  - src/app/(dashboard)/settings/email/**
  - src/app/(dashboard)/settings/notifications/**
residio_verified_commit: 270ccb64
residio_verified_at: '2026-10-20'
residio_app_version: '0.4.0'
---

# Email and SMS channels

Residio sends resident communication over three channels: email, SMS, and in-app notification. Email and SMS both depend on an external provider, so both can be configured correctly in the dashboard and still fail at the provider.

![Residio email settings showing provider status and per-category toggles](../assets/admin/email-settings.png)

## Email

Open **Settings → Messages & Reminders → Email Delivery → Email Settings**. The page reports whether email is configured on the server before it shows any toggles — read that banner first. If it says email is not configured, no toggle on the page will produce a delivered message, and the fix is a server credential change by an engineer.

**Enable Email Notifications** switches email on or off as a whole. Below it, **Invoice Notifications** and **Welcome Emails** turn off one class of message without disabling the channel. **Payment Reminders** on this page turns reminder emails on or off for both the automatic daily reminders and the manual run from **Send a Test**; the automatic reminders as a whole are switched on or off under **Reminders** (see below). Changing these switches needs the manage general settings permission; without it they are shown disabled.

**Settings → Messages & Reminders → Redirect Messages (test mode)** holds Debug Mode. While it is on, every email, SMS and WhatsApp message goes to the override contacts instead of the real recipient, so you can watch the system work without messaging residents. Choose a duration from 5 to 480 minutes when you turn it on; it switches itself off when the time is up, and it cannot be turned on while the override email or phone is blank. It replaces the old email-only debug switch, which skipped sending altogether.

**Settings → Messages & Reminders → Email Delivery → Send a Test** is where you send a test email to an address of your choosing and trigger payment reminders by hand. Outside production these are redirected to the override contacts, and blocked if the override email is blank; in production they go to the real recipients unless Debug Mode is on.

## SMS

SMS is used for a narrower set of messages: two-factor codes, plus contact verification codes once the SMS provider is connected. SMS is currently switched off for emergency broadcasts, reminders, contact verification codes, and the WhatsApp fallback below until the SMS provider (Termii) is connected. It is more expensive and more intrusive than email, so it should not be the default channel for routine billing communication.

Until then, SMS has no settings of its own: **Settings → Messages & Reminders → Notifications Overview** lists only email and WhatsApp as active channels.

### SMS fallback for urgent WhatsApp messages

:::note[Currently off]
While SMS is switched off, this fallback does not run. A failed urgent WhatsApp send is reported as failed, with the WhatsApp error only.
:::

If the estate's active WhatsApp provider is Chatmaid and a WhatsApp send fails for an **urgent** notification, Residio sends that notification by SMS instead. Chatmaid depends on a phone staying connected, and a message that does not arrive has no other way of being recovered.

- History records one entry for the message, on the **SMS** channel and marked as a fallback from WhatsApp. It will not also appear as a failed or successful WhatsApp send.
- If the SMS also fails, the message is reported as failed with both errors.
- Normal-priority messages, such as invoice reminders and receipts, are not sent by SMS in this case. They stay in the queue and are retried.
- Meta and Twilio never fall back to SMS.

:::warning[Emergency broadcasts reach everyone immediately]
A multi-channel emergency announcement bypasses the normal reminder cadence. While SMS is off, the SMS option is unavailable in the emergency dialog, and if SMS is somehow requested the results list shows SMS as failed with nothing sent. Confirm the message text and the recipient scope with the estate lead before sending.
:::

## Templates

**Settings → Messages & Reminders → Message Wording → Notification Messages** holds the system notification templates, which are read-only and sent by name. **Settings → Messages & Reminders → Message Wording → Announcement Templates** holds reusable announcement text. A template change takes effect on the next send, including sends already sitting in the queue.

Before saving a template change:

1. Read the rendered preview, not just the source.
2. Confirm every placeholder resolves — an unresolved placeholder reaches the resident verbatim.
3. Check the message reads correctly in the shortest channel it will be sent on. SMS truncates.
4. Send one test message to yourself.

## Reminders and schedules

**Settings → Messages & Reminders → Reminders** turns automatic reminders on or off, and **Reminder Schedule** defines the steps. Reminders are dispatched by a scheduled job rather than at the moment you save them, so a saved reminder that has not arrived yet is usually waiting for its next run, not broken. The Billing reminder days and the Email **Payment Reminders** switch also limit what it sends; see [Billing and notifications](../settings/billing-and-notifications.md).

Invoice reminders go out by email and WhatsApp only. SMS is switched off for reminders until the SMS provider (Termii) is connected, so an SMS step in a reminder schedule is skipped without an error. The default schedule is email only, and the schedule editor offers Email only: it does not offer SMS, and WhatsApp cannot be selected for a step yet.

## The notification queue

**System → Notification Queue** shows messages that Residio has created but not yet delivered. A healthy queue drains on each scheduled run.

| Queue state | Meaning |
|---|---|
| Small, draining | Normal |
| Growing steadily | The processing job is not running — check **System → Cron Status** |
| Stuck with failures | The provider is rejecting sends — check **System → Notification History** for the error |

The processing job runs every 15 minutes. A send that fails for a temporary reason, such as a provider timeout or rate limit, goes back into the queue and is tried again after 15 minutes, then 1 hour, 6 hours and 24 hours, up to 5 attempts in all. Each failed attempt is still written to history as failed. A failure that is not known to be temporary is not retried, so a message is never sent twice by mistake.

Do not clear the queue to make a warning disappear. Clearing it discards messages residents were owed and destroys the evidence needed to diagnose the failure.

## History

**System → Notification History** is the record of what was actually sent, to whom, and when. Use it to answer a resident who says they were never notified, before assuming a delivery fault.
