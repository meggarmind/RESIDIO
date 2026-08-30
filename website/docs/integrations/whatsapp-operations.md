---
id: whatsapp-operations
title: WhatsApp operations
sidebar_label: WhatsApp
description: Rollout modes, consent, PIN policy, caps, and the operations console for the WhatsApp channel.
residio_sources:
  - src/lib/whatsapp/**
  - src/actions/whatsapp/**
  - src/app/(dashboard)/settings/whatsapp/**
  - src/app/api/whatsapp/**
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---

# WhatsApp operations

Residio connects to the WhatsApp Cloud API so residents can message the estate and receive answers, including balance and payment questions. Because the channel reaches residents directly and can disclose financial information, it ships **disabled** and is promoted deliberately.

All controls are on **Settings → WhatsApp**, and every promotion is audited.

![Residio WhatsApp operations settings showing PIN policy, opt-in import, and rollout controls](../assets/admin/whatsapp-operations.png)

## Rollout modes

| Mode | Who receives messages |
|---|---|
| `Disabled` | Nobody. Outbound is blocked entirely. This is the default. |
| `Pilot` | Only named residents, plus every resident on one nominated street. |
| `Estate` | All residents. |

Use **Rollout and pilot controls** to set the mode. In pilot mode you supply a list of resident IDs, a pilot street, or both — a resident matching either rule is included.

### Promote a pilot to the estate

1. Confirm the pilot has run long enough to see a full billing cycle.
2. Review the operations console for delivery failures and template errors.
3. Confirm the daily and burst caps are sized for the full estate, not the pilot.
4. Change the mode to `Estate`.
5. Record who approved the promotion. The change is written to the audit log.

:::warning[Do not skip the pilot]
Moving straight from `Disabled` to `Estate` sends the first real message to every resident at once. A template error at that point is not recoverable.
:::

## Consent and opt-ins

A resident only receives WhatsApp messages after an approved consent record exists.

- **Import opt-ins** loads approved consent records from CSV in bulk.
- The operations console lists current opt-ins and any pending contacts awaiting confirmation.

Pending contacts are people who have messaged the number but are not yet matched to a resident record. Resolve them by confirming identity against the resident directory — never by guessing from the phone number alone.

## Financial PIN policy

**Financial PIN policy** controls whether a PIN is required before Residio answers any financial question over WhatsApp.

- When the policy is **on**, every resident must enter a PIN before a balance, invoice, or payment answer is returned.
- When it is **off**, residents may still set a personal PIN for themselves.

Leave the policy on for estates where phones are commonly shared.

## Rate caps

Caps protect residents from a runaway loop and protect the estate from provider throttling.

| Cap | Purpose |
|---|---|
| Outbound daily cap | Maximum messages sent in a day |
| Outbound burst cap | Maximum messages within the burst window |
| Burst window (minutes) | The window the burst cap is measured over |
| Financial lookup daily cap | Maximum financial answers returned in a day |

When a cap is reached, further sends are blocked and the event is counted in the console as a cap limit event. Repeated cap events mean the cap is wrong for the estate size or something is sending in a loop — investigate before raising the number.

## The operations console

The console on the same page shows today's activity: inbound messages, outbound messages, delivery failures, template errors, and cap limit events. It also lists active sessions and the disclosure log.

The **disclosure log** records every occasion on which financial information was released over WhatsApp. Treat it as an audit surface: it is the evidence that a disclosure was authorised, and it should never be cleared to tidy a screen.

## Data retention

WhatsApp operational state is short-lived by design and purged on a daily schedule.

- Sessions are removed after they expire, by default the next day.
- Processed message records are removed after their expiry, by default two days.

The cleanup runs automatically shortly after midnight. See [Scheduled jobs](./scheduled-jobs).

## Troubleshooting

| Symptom | Check |
|---|---|
| Nothing sends | Rollout mode is `Disabled`, or the recipient is outside the pilot scope |
| One resident receives nothing | No approved opt-in record for that resident |
| Sends stop partway through a day | A daily or burst cap has been reached |
| Financial questions go unanswered | The resident has no PIN set while the PIN policy is on |
| Delivery failures climbing | Provider credentials or template approval — escalate to an engineer |
| Inbound messages ignored | Webhook verification is failing at the provider — escalate to an engineer |
