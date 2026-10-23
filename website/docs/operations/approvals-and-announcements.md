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
residio_verified_commit: 13cbd359
residio_verified_at: '2026-10-21'
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
4. Add the message, audience, and schedule.
5. Preview the result before publishing.
6. Publish immediately only for time-sensitive communication.

:::tip[Clear communication]
Put the action and deadline in the first two lines. Use emergency priority only when the message needs immediate attention.
:::
