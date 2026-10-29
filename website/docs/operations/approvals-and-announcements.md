---
id: approvals-and-announcements
title: Approvals and announcements
sidebar_label: Approvals and announcements
description: Review pending work and communicate clearly with the estate.
residio_sources:
  - src/app/(dashboard)/approvals/**
  - src/app/(dashboard)/announcements/**
  - src/actions/approvals/**
  - src/actions/announcements/**
residio_verified_commit: 6da75484
residio_verified_at: '2026-10-29'
residio_app_version: '0.4.0'
---

# Approvals and announcements

## Approvals

![Residio approvals queue](../assets/admin/approvals-queue.png)

Open **Approvals** from the dashboard or sidebar. Review the source record, evidence, submitter, amount, and history before approving or rejecting an item. On a phone, each request is shown as a card with the same status, details and **Approve** / **Reject** buttons as the table row.

Use the approval decision that matches the evidence. If the record is incomplete, reject it with a useful reason or leave it pending according to the estate process.

Two kinds of request come from residents over WhatsApp, with *Resident (WhatsApp)* as the requester. **Payment Reported on WhatsApp** is a transfer the resident says they made: check it against the bank statement, then approve it, which verifies the payment, credits the resident's wallet and pays their invoices (you need the verify payments permission as well), or reject it. **Clearance Certificate Request** is a resident who owes nothing asking for a certificate: approving it issues the certificate and sends it to them, and approval is refused if they owe money by then. These residents are told the outcome by WhatsApp; if that message cannot be sent (WhatsApp switched off, a daily cap reached, no opt-in), you see a warning with the reason after deciding; a message held back by a cap is sent automatically the next day; an unanswered request is rejected after 72 hours like any other. A payment reported this way cannot be verified from the Payments page: it is settled here.

When a request is approved (and its change has been applied) or rejected, the person who submitted it receives an in-app notification with the outcome and, for a rejection, your reason. Nobody is notified for a decision you make on your own request.

A request that nobody decides within 72 hours of being submitted is rejected automatically (the review note reads Auto-rejected: No response within 72 hours), and the person who submitted it receives an in-app notification that it expired. Requests that were already pending before this was introduced do not expire.

## Announcements

1. Open **Announcements → New Announcement**.
2. Choose the category and priority.
3. Write a short, action-oriented title.
4. Add the message, audience, and schedule. Besides **All**, **Residents Only**, **Owners Only**, **Renters Only** and **Staff Only**, the audience list offers resident groups: **Landlords**, **Non-Resident Landlords**, **Owner-Occupiers** and **Tenants**. A person in more than one group role (for example a landlord who also lives in the estate) receives the message once.
5. Preview the result before publishing. When a resident group is the audience, the form and the announcement page show **Will reach N, M have WhatsApp opt-in** before you publish. N is the active residents in the group. M is how many of them have a WhatsApp opt-in; only they get the WhatsApp message.
6. Publish immediately only for time-sensitive communication.

### Post to the estate WhatsApp group

When WAHA is the active WhatsApp provider and an estate group is chosen in **Settings → WhatsApp**, an announcement for **All** shows **Post to estate group**. Turn it on to also post the announcement to the estate group as one message when it is published. The form shows the exact text: the title, then the summary (or the start of the message when there is no summary). The message is text only. The one-to-one WhatsApp messages still go out as before.

- Anyone who can create or edit announcements can turn it on and save the draft.
- Only Super Admin, Chairman or Secretary can publish an announcement with it on. Other users see "Only Super Admin, Chairman or Secretary can post to the estate group." in place of **Publish Now**; to publish without the group post, turn it off.
- Other audiences (a resident group, a role, or specific houses) cannot post to the group.
- The group post counts toward the WhatsApp daily and burst limits. If WhatsApp is switched off, a limit is reached, or the estate group is not set, the announcement is not published and you see why.
- Outside production (Stage), only a group listed in the `whatsapp_test_group_ids` setting can receive the post; any other group is refused and nothing is sent.

:::tip[Clear communication]
Put the action and deadline in the first two lines. Use emergency priority only when the message needs immediate attention.
:::
