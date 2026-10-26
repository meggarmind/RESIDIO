---
id: collections
title: Collections
sidebar_label: Collections
residio_sources:
  - src/app/(dashboard)/collections/**
  - src/actions/collections/**
  - src/components/collections/**
  - src/lib/collections/**
residio_verified_commit: 4039bd1b
residio_verified_at: '2026-10-26'
residio_app_version: '0.4.0'
---

# Collections

Use **Collections** for money the estate collects outside billing: money that is not a debt. A collection payment never creates an invoice and never goes into a wallet, so it can never pay dues. Residents and non-residents can pay into a collection.

There are two types. The type is fixed once the collection is made.

| Type | Amount | Examples |
|---|---|---|
| Contribution | The payer chooses the amount. The collection can have an optional target. | End of Year Party, Streetlights, CCTV |
| Item purchase | The estate sets a price per item, with an optional lower or higher price for non-residents. The payer gives a quantity. | Estate Constitution Pocket Book, Vehicle Sticker |

## Make a collection

Choose **New collection**, give it a name, a type, an open date and an optional close date, and either a target (Contribution) or a price per item (Item purchase). **Edit** changes these details later and can close the collection to new payments.

## Record a payment

On the collection, choose **Record payment**.

- **Payer**: a resident, or a non-resident with a name, phone and email. A non-resident is saved and offered again next time; the same phone or email reuses the earlier record.
- **House**: optional.
- **Amount**: for a Contribution, the amount paid. For an Item purchase, enter the quantity; the amount is always quantity × price per item.
- **Date, method, reference** and optional notes. For an Item purchase, an optional **item reference**, for example a plate number.

A payment cannot be dated before the collection opens or after it closes. Each payment gets its own receipt number, for example `COL-2026-000001`; the counter starts again at 1 each year.

The payer gets a receipt by email when the system has their email, and by WhatsApp when their number has opted in to WhatsApp messages.

## Payments from the bank import and split payments

A collection payment can also come in from a bank statement import, when the review marks the line as **Collection**, or from a resident payment split between billing and a collection. See [Payments and statement imports](./payments-and-imports). Each part is an ordinary collection payment with its own receipt.

## Notified parties (Item purchase only)

A notified party is someone told about a payment, such as the security supervisor for vehicle stickers. It is optional: with none, no extra message is sent. Add one:

- **On the collection** (the **Notified parties** card): told about every payment into the collection.
- **On one payment** (**Tell someone about this payment only** when recording it): told about that payment only.

Each party has a name and the channels to use: email, WhatsApp or SMS. The message gives the payer's name, the item, quantity, amount, date, receipt number and reference. It never gives the payer's phone number or email. The party does not need a login.

WhatsApp reaches a party only when that number has opted in to WhatsApp messages, the same rule as every other WhatsApp message. SMS is not available yet. When a channel cannot be used, the confirmation after recording says so. A message that fails later shows in **System → Notification History**.

## Correct a payment

A payment's amount, quantity, payer and date cannot be changed. From the row menu:

- **Mark items given** (Item purchase): records when the estate handed the items to the payer. **Mark not given** takes it back.
- **Move to billing**: for a payment that was really dues or another charge. Choose the resident, an optional house, the category and a reason. In one step the collection payment is reversed and the money is recorded as a payment that credits the resident's wallet and pays their invoices, like any new payment. Needs `payments.create` as well as **Manage Collections**.
- **Reverse payment**: asks for a reason. The payment stays on the list as **Reversed** and leaves every total. Record it again if it was wrong.

## Report and export

The collection page shows the total received and the number of payers. A Contribution also shows the percent of its target; an Item purchase shows items sold and items not yet given. The payment list filters by payer type, method and status (received, reversed, not yet given) and searches payer, receipt number and reference. **Export** downloads the filtered list as a CSV file.

## Permissions

Viewing needs **View Collections** (`collections.view`). Making and editing collections, recording, reversing, marking items given and managing notified parties need **Manage Collections** (`collections.manage`). Both are granted to super admin and chairman. Every change is recorded in the audit log.
