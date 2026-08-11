# PRD: WhatsApp Assistant for Residents

## Problem Statement

Residents miss estate information and reminders because they live on WhatsApp, not on the estate's web surfaces. Exco needs a channel where they can actually reach residents, and residents increasingly expect to transact and check things in chat rather than in a portal. Financially, arrears go uncollected because reminders land in inboxes nobody opens. When a resident does want to know their financial standing, they must call or email the exco — no self-serve path exists.

## Solution

A dedicated WhatsApp Business number operates the estate's **WhatsApp Assistant**: it proactively delivers approved estate information (invoice reminders, payment confirmations, announcements) and, on demand, lets eligible residents peruse their financial standing through a structured menu — balance, last payment, statement, next due, and wallet — in private one-to-one chat, gated by opt-in and an optional PIN.

## User Stories

1. As an eligible resident, I want to message the estate's WhatsApp number and be recognized from my registered phone number, so that I can start using the Assistant without any setup.
2. As an eligible resident with an unrecognized number, I want to link my number via a one-time PIN, so that I can use the Assistant from a phone number not on file.
3. As an eligible resident, I want to consent to WhatsApp alerts during linking, so that I only receive estate broadcasts if I opted in.
4. As a billable resident, I want to see my balance (outstanding across open invoices with an arrears flag), so that I know what I owe at a glance.
5. As a billable resident, I want to see my last payment (amount, date, what it covered), so that I can confirm receipts quickly.
6. As a billable resident, I want to view my statement for a fixed period (this month / this year / last six months), so that I can review my full ledger.
7. As a billable resident, I want to see my next due invoice (amount, due date, line items), so that I can plan payments.
8. As a billable resident, I want to see my wallet balance, so that I know my prepaid position.
9. As a resident holding billable roles on multiple houses, I want to pick which property a financial answer refers to, so that I get per-property truth rather than a mixed answer.
10. As a multi-house resident, I want an all-properties aggregation for my statement, so that I can see my consolidated position in one view.
11. As a resident who opted in, I want my set PIN to gate financial answers, so that a lost or borrowed phone can't read my financial position.
12. As a resident without a PIN, I want financial answers to still work and a gentle nudge offering to set a PIN, so that low-friction access is preserved for non-technical residents.
13. As a resident with a billable role who has NOT opted in, I want identity and consent flow to work but financial answers withheld until I consent, so that the estate stays WhatsApp-compliant.
14. As a resident with a non-billable role (household member, caretaker, staff, contractor), I want estate information (announcements, notices, security updates) but no financial answers, so that I get community value without ledger exposure.
15. As an opted-in resident, I want to text STOP to unsubscribe from broadcasts and START to re-subscribe, so that I control the channel.
16. As an unrostered person, I want a guarded intro that offers onboarding or STOP, so that I'm neither turned away abruptly nor able to guess financial data.
17. As a resident, I want my financial answers to arrive as deterministic menu replies, so that answers are predictable and readable on WhatsApp.
18. As a resident, I want a short PIN-link flow and a 15-minute conversation session, so that interrupted queries resume rather than restarting.
19. As a resident, I want the Assistant to never expose another resident's financial data, so that privacy is preserved in a shared-chat environment.
20. As exco, I want the estate's WhatsApp number to send approved invoice reminders, so that collections improve.
21. As exco, I want a payment-received confirmation on WhatsApp, so that residents see receipts immediately.
22. As exco, I want announcements mirrored to WhatsApp, so that estate news reaches residents where they live.
23. As exco, I want all proactive WhatsApp messages to use pre-approved Meta templates, so that the channel stays compliant.
24. As exco, I want an operational console to view the opt-in registry and bulk-import launch consent, so that I can onboard residents efficiently.
25. As exco, I want a force-PIN toggle, so that I can require PINs estate-wide if security posture tightens.
26. As exco, I want a disclosure-log viewer (searchable by resident/number/date), so that I can audit who saw financial answers.
27. As exco, I want bot health metrics (inbound/outbound counts, delivery failures, template errors), so that I can spot problems early.
28. As exco, I want to inspect and reset stuck sessions, so that a bot loop doesn't wedge a resident.
29. As exco, I want a pending-contacts view, so that I can attach unclaimed numbers to residents.
30. As exco, I want software outbound/lookup caps in system settings, so that a defect can't cause bill shock or a broadcast storm.
31. As an admin, I want every admin write action on the WhatsApp module to require permission and be audited, so that the module follows the estate's security contract.
32. As a developer, I want a WhatsApp simulator harness, so that I can develop the menu without live Meta traffic.
33. As exco, I want a pilot phase (exco/one street) before estate-wide enablement, so that the module is proven on a small base first.

## Implementation Decisions

- **Guardrail exception (ADR-0001):** the WhatsApp Assistant is a deliberate resident-facing surface despite the admin-first guardrail; the web portal remains out of scope.
- **Channel shape (ADR-0002):** Meta WhatsApp Cloud API directly, provider-agnostic behind `src/lib/whatsapp/`; no BSP.
- **Dedicated 1:1 number:** a separate WhatsApp Business number; the existing organic group is untouched.
- **Outbound seam:** implement `sendViaWhatsApp` in the existing notification dispatcher (`src/lib/notifications/send.ts`) and add `whatsapp` to `IMPLEMENTED_CHANNELS`. All existing producers (invoice reminders, announcements, payment events, queue, history, preferences) are reused unchanged. Note: SMS is currently listed in `IMPLEMENTED_CHANNELS` but is NOT actually implemented — correct this discrepancy (either implement or remove) while touching this file.
- **Inbound seam:** single new module `src/lib/whatsapp/`. Public API: `sendWhatsAppMessage()` (used by the dispatcher stub) and `handleInboundMessage()` (called by the webhook route). Everything conversational lives inside: identity resolution, opt-in/PIN gates, menu engine, session, dedup, disclosure logging. Provider SDK and the `/api/whatsapp/webhook` route stay thin.
- **Webhook:** new Next.js route `/api/whatsapp/webhook`; verify Meta `X-Hub-Signature-256` with the app secret; support the `hub.challenge` handshake. A server route (not a server action) — the mandatory permission/audit contract applies to admin write actions, not the inbound handler.
- **Identity resolution:** match inbound number against `phone_primary` / `phone_secondary`; PIN-link flow as fallback for unrostered numbers; unclaimed numbers become pending contacts surfaced in the console.
- **Access model:** identity open to all; financial disclosure gated on opt-in + PIN-if-set; community tier (announcements/notices) for non-billable roles; financial answers only for billable roles.
- **Menu (v1):** Balance, Last payment, Statement, Next due, Wallet. Statement: fixed periods (this month / this year / last six months) with a rolling cap; property-selection step for multi-house residents; optional all-properties aggregation for statements.
- **PIN:** optional per resident; stored hashed; admin force-PIN toggle as a system setting; PIN-less residents get a one-line nudge.
- **Opt-in:** in-chat capture during PIN-link; `whatsapp_optins` registry; STOP/START self-serve; admin bulk-import for launch.
- **Outbound content (v1):** 3 Meta-approved templates — `invoice_reminder`, `payment_received`, `announcement`. Ad-hoc admin blast is post-v1 once templates exist.
- **State & retention:** `whatsapp_sessions` (15-min TTL), `whatsapp_processed_messages` (dedup via wamid, ~24h window), disclosure log (permanent, immutable, entity type `whatsapp_assistant`), pending contacts. Operational state ephemeral; audit permanent.
- **Admin console:** opt-in registry + bulk import, force-PIN toggle, disclosure-log viewer, bot health, session inspector, pending contacts. Admin writes follow `authorizePermission` + `logAudit`; new permission constants; `AuditEntityType` extended.
- **Cost/limits:** per-conversation costs; outbound burst cap + daily lookup cap in `system_settings`.
- **Rollout:** WhatsApp simulator harness in dev → pilot (exco/one street) → estate-wide toggle.

## Testing Decisions

- Good tests assert external behavior through the module's two public entry points (`sendWhatsAppMessage`, `handleInboundMessage`): given an inbound message, the expected reply/state transition occurs — not implementation details of the menu internals.
- **Module tested:** `src/lib/whatsapp/` — identity resolution, opt-in/PIN gating, menu routing, statement composition (fixed periods, property selection, all-properties), session advance/idempotency, dedup, disclosure-log writes, STOP/START, unrostered handling.
- **Dispatcher:** `src/lib/notifications/send.ts` — WhatsApp channel dispatches through `sendViaWhatsApp` when `IMPLEMENTED_CHANNELS` includes `whatsapp`.
- **Admin writes:** module-integration test coverage for new write actions (permission + audit present), following the existing `module-integration.test.ts` pattern with allowlist entries.
- **Prior art:** `src/lib/notifications/__tests__/admin-notifier.test.ts` (unit tests over a notification lib), `src/__tests__/integration/module-integration.test.ts` (structural server-action compliance). E2E harness uses the existing `e2e/` Playwright setup; the WhatsApp simulator replaces live Meta traffic in automated runs.

## Out of Scope

- Ad-hoc admin broadcast composer (post-template add-on).
- Free-text/NLU conversation parsing; LLM assistant.
- Resident web-portal changes (guardrail intact).
- SMS implementation (listed-but-dormant channel; only the `IMPLEMENTED_CHANNELS` discrepancy is fixed here).
- Group-chat integration with the existing WhatsApp group.
- Payment initiation inside the chat (view-only; payments remain on existing paths).
- i18n/localization beyond initial template copy.

## Further Notes

- All proactive messages require pre-approved Meta templates; variable fills go through placeholders. Template copy needs an exco sign-off pass before Meta approval.
- SMS is recorded in `IMPLEMENTED_CHANNELS` but not implemented — resolve this contradiction during the outbound work.
- Financial answers over WhatsApp are not end-to-end encrypted; the PIN layer and disclosure log are the mitigations, and this trade-off is deliberate (ADR-0002 context).
- `CONTEXT.md` glossary defines the canonical terms used here (WhatsApp Assistant, WhatsApp Opt-in, Financial Standing, Billable Role, Eligible Resident, Property Selection, Statement, Community Tier, WhatsApp Session, Disclosure Log, Pending Contact, WhatsApp Template).
