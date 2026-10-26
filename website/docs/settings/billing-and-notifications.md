---
id: billing-and-notifications
title: Billing and notifications settings
sidebar_label: Billing and notifications
residio_sources:
  - src/app/(dashboard)/settings/billing/**
  - src/app/(dashboard)/settings/banking/**
  - src/components/settings/billing/**
  - src/components/settings/banking/**
  - src/app/(dashboard)/settings/notifications/**
  - src/app/(dashboard)/settings/message-templates/**
  - src/app/(dashboard)/settings/reminders/**
  - src/app/(dashboard)/settings/wording/**
  - src/app/(dashboard)/settings/sending/**
  - src/app/(dashboard)/settings/announcements/**
  - src/components/settings/messages/**
residio_verified_commit: 0228a6e4
residio_verified_at: '2026-10-26'
residio_app_version: '0.4.0'
---

# Billing and notifications settings

## Billing

**Settings → Money → Billing rules** is one page with four sections: **General**, **Invoices & due dates**, **Late fees** and **Levies**. The row of section names under the page title jumps to a section and stays in view as you scroll. The old addresses (Late Fees, Invoices and Development Levies) still work and open the matching section. **Rate cards** stays a separate page. Billing rules save as you change them: a switch, a choice or a number takes effect when you set it, so these sections have no Save button.

Review billing settings before changing rates or periods. For a rate change, confirm the effective date, affected profile, and whether existing invoices should remain unchanged.

Each billing profile carries a **rate schedule**: a list of versions, each with the month its rates started applying. A billing period is priced by the newest version effective on or before it, so a period earlier than every version is priced by the earliest one — invoice generation reports that as a warning in its preview rather than failing. Open **Rate versions** on a profile in **Settings → Money → Rate Cards** to see the schedule, and to add a version for a past month when a historical rate needs recording. A version that is locked or approved cannot be edited; record a rate change by adding a new version with a later effective month.

Each billing profile has a **Charge category** (Dues, Development Levy or Transformer Fee), set on the profile form; new profiles start as Dues. Invoices from the profile take its category, and each resident has one wallet per category, so an invoice is paid only from the wallet of the same category.

Each billing profile also names its **Payer**, set on the profile form. **Occupier** profiles, such as security dues, bill the Renter, else the Owner-Occupier. **Owner** profiles, such as the Development Fee or Transformer Fee, bill the Owner-Occupier, else the Property Owner, else the Developer, and never a Renter. Whether a profile is monthly or one-time is a separate setting. Ticking **One-Time Levy** on a new profile sets the payer to *Owner*; you can change it. On a profile whose **Billing Target** is *Resident (Role-Based)*, the role boxes can narrow the payer but never add a Renter to an Owner profile; a *Property (House)* profile ignores roles. If an Owner profile applies to a house with no owner on record, no invoice is raised and the Levies preview and the generation result name the house. The Levies preview also splits the invoices and total by charge category, so a Development Levy and a Transformer Fee profile each show their own line.

Two separate permissions govern this. **Manage Billing Profiles** shows the **Rate versions** control and the schedule inside it — a Secretary has neither. **Manage Billing Rate Versions** is what allows a version to be added or edited, and is held by the Super Admin, Chairman and Financial Officer only, because a version with a past effective month decides what a backfilled invoice charges and those invoice numbers are permanent.

**Clearance certificate copies** at the bottom of **General** chooses which recipient group receives a WhatsApp copy of every issued clearance certificate: the move-out screens and approved WhatsApp requests alike. The default is *Estate officials*, and *No copies* turns copies off. Members are managed in **Settings → Groups**; the row lists the chosen group's members and warns for anyone who cannot receive a copy (no WhatsApp number, or not opted in). Changing it needs the manage billing settings or manage billing profiles permission and is written to the audit log; it affects certificates issued afterwards.

Use **Late fees** for grace periods, fee rules, and waivers; waiver requests that are waiting appear at the foot of that section. Use **Invoices & due dates** for recurring generation controls.

Set billing up in this order, which the note at the top of every billing page repeats: **Billing Profiles** (**Rate Cards** in the menu) first, then **Billing rules → General**, then **Billing rules → Levies**, which picks one of the rate cards.

Number fields such as the grace period, the late fee amount and the invoice due window save when you leave the field or press Enter, not while you type. A value outside the allowed range shows a message and is not saved; clearing a field never saves a default. The grace period runs from 1 to 30 days, because the late fee run treats 0 as 7. Changing the general billing rules needs the manage billing settings or manage billing profiles permission; without either, the fields are shown disabled.

Each billing setting carries an **Affects** line saying whether a change reaches invoices already issued. Late fee rules (on or off, type, amount, grace period) reach existing overdue invoices at the next run, manual or automatic, unless an invoice already carries a late fee. Due window, vacant and under-renovation or under-construction billing, and the invoice generation controls reach future invoices only.

**Apply Late Fees Now** (in **Late fees**) and **Generate Retroactive Levies** (in **Levies**) open a confirmation first. It shows how many invoices (or houses) would be charged and the naira total, says the charges cannot be undone from that screen, and confirms that a second run skips what is already charged. Nothing is charged until you press the confirm button.

## Banking

**Settings → Money → Banking** holds three sections. **Bank accounts** lists the estate's accounts used for statement imports, with the **PDF statement passwords** for protected statements beneath it. **Transaction tags** classify imported credits and debits for reporting, and start collapsed. **Duplicate matching** sets the confidence threshold, a percentage: a transaction that scores above it is flagged as a likely duplicate. Bank accounts and tags need the manage reference data permission; duplicate matching needs the manage maintenance permission, as it did when it sat on the Maintenance page. An admin who holds only one of them sees only that section. The old Bank Accounts and Transaction Tags addresses open the matching section. The tables become stacked cards on a phone.

Bank accounts and tags save through their own dialogs. The duplicate threshold is a draft until you press **Save Duplicate matching** at the foot of its section; **Discard** puts the saved value back, and the page warns before you leave with it unsaved.

## Notifications

Use **Settings → Messages → Message wording** to change email wording. Its **Email** section changes the wording of the five emails residents receive; anything left empty uses the built-in text (see [Email and SMS](../integrations/email-and-sms.md)). The **Sending** switch on the payment receipt, welcome and new invoice rows turns that message off or on for that channel; the receipt also has one on the WhatsApp tab, and WhatsApp still needs the resident's opt-in. Reminder rows link to the **Schedule** section of **Reminders**, where channels are set per step. Announcement text lives in **Settings → Messages → Announcements**. Notification Schedules is hidden, because nothing sent what it configured; automatic reminders follow the reminder **Schedule**.

Three controls affect payment reminders. **Send payment reminders** under **Reminders → On or off** turns the automatic daily reminders on or off. **Payment reminders** under **Email & sending → Email types** turns reminder emails off for both the automatic reminders and the manual run; automatic WhatsApp reminders still send. The reminder days set in **Billing rules → General** apply to both: an automatic reminder before the due date sends only on a day that is ticked there and is a step in the reminder **Schedule**. **Send payment reminders now** under **Reminders → Send now** sends one email-only run on those days.

The **Send payment reminders** switch saves the state you set it to. **Reset to Default** on the reminder schedule asks before it replaces your steps, and **Send Reminders** under **Send now** shows how many reminders would go to how many residents before it sends.

Sent-notification history and the outgoing queue are system state rather than configuration, so they live under **System → Notification History** and **System → Notification Queue** instead; **Reminders → On or off** links to both and no longer shows live counts. From the queue you can cancel a pending item or retry one that failed.

## Email and WhatsApp

Email configuration and WhatsApp operations are separate controls, and live in different Settings groups. **Settings → Messages → Email & sending** configures outbound email; **Settings → Connections → WhatsApp** holds WhatsApp's provider credentials, rollout mode, consent, and pending contacts together — WhatsApp is grouped with the other external-service integrations rather than with Messages. Confirm provider status and rollout mode before enabling an operational communication path.

:::warning[Production communication]
Test recipient scope, template content, and daily caps before enabling automated outbound messages.
:::

## Related

- [Email and SMS channels](../integrations/email-and-sms) for provider status, templates, and the notification queue.
- [WhatsApp operations](../integrations/whatsapp-operations) for rollout modes, consent, and caps.
