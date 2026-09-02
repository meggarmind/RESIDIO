---
id: payment-gateway
title: Payment gateway
sidebar_label: Payment gateway
description: How online card payments reach Residio, how they are confirmed, and what to check when one is missing.
residio_sources:
  - src/lib/paystack/**
  - src/actions/paystack/**
  - src/app/api/payments/paystack/**
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---

# Payment gateway

Residio integrates with **Paystack** to collect card payments online. The gateway handles the card details; Residio never sees or stores them.

:::info[Current scope]
Online card collection is driven from the resident-facing payment screens, which are not part of the current admin rollout. The integration still matters to administrators, because gateway payments land in the same transaction ledger you reconcile. Estates collecting only by bank transfer will see this path unused.
:::

## How a gateway payment completes

1. The payer starts a payment and is sent to Paystack.
2. The payer completes or abandons the card transaction.
3. Paystack notifies Residio of the outcome directly, server to server.
4. Residio records the result against the transaction.

Step 3 is the authoritative one. It happens whether or not the payer returns to Residio afterwards, which is why a payment can be correctly recorded even though the payer closed the browser mid-flow.

Residio acts on two outcomes: a successful charge and a failed charge. Anything else is acknowledged and ignored.

## Verifying a payment

Every gateway notification is cryptographically signed, and Residio rejects any notification whose signature does not verify. A payment that never appears was therefore either never completed at the gateway, or was sent to the wrong destination — it was not silently dropped.

To confirm a specific payment:

1. Find the transaction in **Transactions** by reference.
2. If it is present but unconfirmed, check **Approvals** for a pending verification.
3. If it is absent, ask the payer for the gateway receipt and its reference.
4. Confirm the reference against the gateway dashboard before recording anything manually.

## Recording a gateway payment manually

Only do this when the gateway confirms a successful charge that Residio did not record.

1. Confirm the charge succeeded at the gateway, with its reference and amount.
2. Record the payment against the correct resident and house.
3. Enter the gateway reference in the reference field so the two records tie together.
4. Note in the payment why it was entered manually.

Never record a manual payment from a screenshot alone. See [Payments and statement imports](../finance/payments-and-imports).

:::warning[Do not resolve a duplicate by deleting]
If the same charge is recorded twice, reverse or reallocate the duplicate through the normal correction path so the audit trail survives. Deleting removes the evidence that the duplicate existed.
:::

## Test and live credentials

The gateway has separate test and live keys. A deployment configured with test keys will accept test cards and reject real ones, and vice versa.

Administrators cannot see which key is in use from the dashboard. If real payments are failing at the card step for everyone, this is the first thing for an engineer to check.

## Troubleshooting

| Symptom | Check |
|---|---|
| Payer says they paid, no transaction in Residio | Gateway dashboard for the reference — confirm the charge actually succeeded |
| Transaction present but not applied | **Approvals** for a pending verification |
| All card payments failing | Gateway credentials or account status — escalate to an engineer |
| Payment recorded twice | One arrived from the gateway and one was entered manually — correct, do not delete |
