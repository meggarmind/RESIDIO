# WhatsApp adds WAHA, a self-hosted gateway, as a fourth provider, with Chatmaid kept as a fallback

Residio now has four WhatsApp providers behind the registry that ADR-0003 introduced: Meta Cloud API, Twilio, Chatmaid and WAHA. The owner decided on 27 October 2026 to run WAHA (`devlikeapro/waha`, NOWEB engine) as a second Coolify application beside the Stage app, and to add `waha` as a selectable provider. The first delivery is Stage only.

Each existing provider has a cost the owner wants to remove. Chatmaid is unstable (#1076, #839, #842, #941). Meta needs business verification and approved templates. Twilio adds a per-message fee. A self-hosted gateway removes all three, at the price of running one more container.

## Why WAHA

WAHA is Apache-2.0, has a recent release (2026.9.2, 2 October 2026), and uses the Baileys library (WhatsApp Web protocol) without a browser. It gives the estate an API key, a QR pairing dashboard, webhooks signed with HMAC-SHA512 and retried on failure, and `sendFile` by URL. Every feature is free since 2026.6.1. Those are the same capabilities the Chatmaid adapter already relies on (text, PDF by URL, signed webhooks, delivery acks), so the `waha` adapter mirrors `providers/chatmaid.ts` and shares its inbound handler, human-takeover pause and reconciliation design (#511).

## Why not the reviewed repository

The owner first asked whether `navneetyadav-code/whatsapp-api` could run as a Residio service. The review of 27 October 2026 found it not adoptable. It is three weeks old, has one author, and bundles a PHP dashboard, a Node worker and MySQL in one root-user image. Its CI runs only syntax checks. Its phone normalisation is fixed to India. The only useful part is the Baileys library, which is open and does not need that repository. Writing an own Baileys worker was also rejected, because WAHA already covers the same ground and is maintained.

## Risk accepted

WAHA, Chatmaid and every WhatsApp Web bridge use the unofficial protocol. Meta's terms do not permit it, and a number can be banned. The owner accepts this risk. The send policy stays on and is the main control: opt-in only, a daily cap of 100 and a burst cap of 20 per 10 minutes.

A WhatsApp Web bridge also has no delivery guarantee while the paired handset or the session is down. The same limits that ADR-0003 and the operations guide describe for Chatmaid apply to WAHA. Residio reports session loss to admins (the `session.status` webhook), refuses to send while the session is not `WORKING`, and replays inbound messages WAHA recorded but could not deliver (the reconciliation cron). A message sent while the session is down is still lost.

## What stays the same

Exactly one provider is active at a time (owner decision, 2026-09-22). `replace_whatsapp_credentials` retires the active row of any other provider in the same transaction, so Chatmaid stays one click away as a fallback: save its credentials again and WAHA is retired. Credentials stay encrypted in `whatsapp_provider_credentials`. The WAHA address and session name are stored beside them in clear, because they are not secrets. There are no new environment variables.

Inbound is still one route per provider (`/api/whatsapp/webhook/waha`), for the reasons in ADR-0003: the signature scheme and the payload shape are provider-specific. WAHA signs the raw body with HMAC-SHA512 (`X-Webhook-Hmac`). That signature covers the body only, so there is no replay window. The processed-message dedupe stops a replay instead.

## Known limits

- WAHA reports a hidden `@lid` id for some linked-device contacts, with no phone number. The adapter counts these as ignored. Resolving them is a later slice, only if Stage shows them.
- The shapes of WAHA's responses are read from its documentation, not measured against a live container. The first Stage run confirms them.
- WAHA has no idempotency key. The Chatmaid identical-text drop (#842) does not exist, so a retried send can reach the resident twice.
