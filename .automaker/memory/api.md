---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 84
  referenced: 0
  successfulFeatures: 0
---
# api

#### [Pattern] CSV export includes all contact fields (phone primary/secondary, email) in addition to financial data (2026-01-11)
- **Problem solved:** Export format designed to be directly imported into CRM, mail merge, or SMS campaign tools
- **Why this works:** CSV becomes an integration boundary: tool doesn't require staff to cross-reference contact systems. Enables 'download → import to Salesforce' workflows for debt collection campaigns. Contact fields must be export-first, not display-first
- **Trade-offs:** Export file larger but data self-contained; compliance/privacy must handle contact export explicitly

#### [Pattern] Emergency contacts directory returns both estate-specific and national emergency numbers in single structure, with service type metadata (2026-01-11)
- **Problem solved:** Admin needs to display emergency contacts in broadcast UI and in email template sent to users
- **Why this works:** Centralizing contact definitions prevents duplication. Single source of truth that works in email template (server-side) and UI component (client-side). Service type metadata (fire, police, medical) allows filtering and icons in UI.
- **Trade-offs:** Returns data that email template doesn't need (UI-specific metadata), but avoids multiple API definitions. Could optimize by having separate queries, but maintenance cost is higher.

#### [Gotcha] Next.js cron routes require explicit header validation (x-vercel-cron) AND secret validation. Vercel sends both but either could be missing in local/test environments. (2026-01-11)
- **Situation:** Cron job verification tests would fail if only checking one validation method
- **Root cause:** Vercel cron is specific to their platform. Header alone isn't cryptographic proof. Secret alone could be guessable. Need both for defense-in-depth.
- **How to avoid:** More validation code but prevents accidental invocations and unauthorized triggering

#### [Pattern] Escalation level configuration uses per-step toggles rather than a global enable/disable with levels. (2026-01-11)
- **Problem solved:** Users need fine-grained control over which reminder stages to send, not just on/off for entire feature.
- **Why this works:** Per-step toggles allow disabling high-friction reminders (e.g., skip final notice if not needed) while keeping others active. Reflects real business workflows where escalation intensity varies.
- **Trade-offs:** Slightly more complex state management (array of step configs vs single escalation level), but vastly more flexible for diverse business models. Adds ~2 bytes per step in storage but eliminates feature requests.

#### [Pattern] Opening balance calculated from all transactions before selected period rather than stored as point-in-time value (2026-01-11)
- **Problem solved:** Statement needs to show opening balance at period start, but storing snapshots for every possible period is impractical
- **Why this works:** Calculated opening balance from transaction history is audit-friendly (can verify by recomputing) and requires no maintenance. One source of truth: transaction ledger. Works for any arbitrary date range without pre-computation.
- **Trade-offs:** Slight performance cost (querying all transactions before period) acceptable for billing operations that aren't high-frequency. Gains flexibility and audit trail.

### Webhook signature verification using Web Crypto API instead of external library (no additional dependencies) (2026-01-11)
- **Context:** Paystack webhook payload authenticity must be verified to prevent spoofed payments
- **Why:** Web Crypto API is native to Node.js runtime, no npm dependency overhead. HMAC-SHA512 is standard Paystack requirement
- **Rejected:** crypto-js or tweetnacl libraries would add dependency surface area without benefit for single use case
- **Trade-offs:** Easier: no dependencies. Harder: requires understanding of Web Crypto API surface (not intuitive)
- **Breaking if changed:** Removing signature verification would allow spoofed webhook calls to create fake payments

#### [Gotcha] Client-side Paystack library initialization requires BOTH public key (from env) AND amount/email at initialization time, not at redirect (2026-01-11)
- **Situation:** Paystack.inline.pay() expects complete payment details before user interacts, unlike some payment gateways
- **Root cause:** Paystack embeds amount in the checkout page for transparency. Cannot be changed after user opens payment modal
- **How to avoid:** Easier: fixed amount prevents accidental overpayment. Harder: must validate amount before opening modal