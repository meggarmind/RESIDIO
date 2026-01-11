---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# architecture

#### [Pattern] Glass morphism effect centralized in single .glass utility class with CSS custom properties for reusability (2026-01-11)
- **Problem solved:** Multiple components needed semi-transparent blurred backgrounds with consistent appearance across light/dark modes
- **Why this works:** Single source of truth for glass effect prevents style drift across components. CSS custom properties allow theme-aware color values. Easier to update effect globally than hunting through component files
- **Trade-offs:** Requires pre-defining glass effect parameters upfront; changes affect all usages. But makes new components instantly consistent without additional effort

### Debtor aggregation model instead of individual invoice listing (2026-01-11)
- **Context:** Report shows residents with total outstanding amounts + aging bucket breakdown per debtor, not individual invoices
- **Why:** Debt collection workflows target people for follow-up, not invoices. Contact info (phone, email) is per-debtor. Enables mail merge, SMS campaigns, CRM import. Finance team needs to know 'who owes what' in age buckets, not 'which invoices are old'
- **Rejected:** Invoice-centric aging report (which already existed) - would require deduplication and contact lookup for each follow-up action
- **Trade-offs:** Lost invoice-level detail but gained aggregation clarity; simpler export for bulk follow-up; contact info stays consistent per debtor
- **Breaking if changed:** If changed to invoice-level detail, contact info would repeat and multi-invoice debtors become harder to prioritize by age severity

### Per-debtor aging bucket breakdown in addition to summary totals (2026-01-11)
- **Context:** Each debtor record includes `current`, `days31to60`, `days61to90`, `over90Days` amounts separately
- **Why:** Finance needs to triage: a debtor with $50k in 90+ days is higher priority than $50k all current. Without per-debtor buckets, staff would need to recalculate from invoice details during follow-up
- **Rejected:** Aggregate aging only (total debt age) - loses visibility into which debtors have the most severe overdue amounts
- **Trade-offs:** More computation upfront to bucket invoices by debtor, but eliminates ad-hoc calculation during collections; export becomes richer
- **Breaking if changed:** Removing per-debtor breakdown forces return to invoice-level drill-down for prioritization, defeating the aggregation purpose

### Report type configuration duplicated across multiple files (report-wizard, reports-page-client, hooks) instead of centralized (2026-01-11)
- **Context:** debtors_report type defined separately in: report-request-wizard.tsx (color: red, label), reports-page-client.tsx (type config), use-reports.ts (label), lib/validators/reports.ts (schema)
- **Why:** Each component layer has different concerns: wizard needs UI config (color), client needs type mapping, validator needs schema enforcement
- **Rejected:** Single config file - would require prop drilling or context to reach all layers; tight coupling between concerns
- **Trade-offs:** Config duplication for independence; harder to keep labels/colors sync'd across UI but easier to modify per-layer concerns
- **Breaking if changed:** Renaming debtors_report type breaks in 4 places silently if one location missed; adding new report type requires updates in 4 files

#### [Pattern] Fire-and-aggregate pattern for multi-channel notifications: Create announcement first, then send to all channels in parallel, collecting per-channel results rather than aborting on first failure (2026-01-11)
- **Problem solved:** Emergency broadcasts need to reach users via multiple channels (in-app, email, SMS) with maximum delivery reliability
- **Why this works:** Decouples announcement creation from delivery. If email fails, SMS and in-app still send. Admins get visibility into exactly which channels succeeded/failed per user, enabling recovery workflows. Parallel execution minimizes broadcast latency.
- **Trade-offs:** Added complexity of aggregating results from multiple async operations, but gained fault isolation and detailed diagnostics. Admins can't assume 'sent' means all channels - must read per-channel results.

#### [Pattern] Channel abstraction layer where each notification type (in-app, email, SMS) has independent send functions handling batching and rate limiting separately (2026-01-11)
- **Problem solved:** Adding new notification channels (WhatsApp marked as 'Coming Soon') and managing rate limits across different providers with different constraints
- **Why this works:** Each channel has different rate limits (Termii SMS has provider quotas, email has server limits, in-app is instant). Separate functions allow per-channel optimization without touching core broadcast logic. New channels can be added by creating new send function without modifying broadcast orchestration.
- **Trade-offs:** More code duplication in send functions, but easier to understand and modify individual channels. Adding WhatsApp just requires implementing new send function, not refactoring existing channels.

#### [Gotcha] WhatsApp integration marked 'Coming Soon' but architecture already built for it - checkbox present and disabled, channel abstraction ready, but requires separate WhatsApp Business API setup (2026-01-11)
- **Situation:** Implementation shows WhatsApp as fourth channel option but without actual send implementation
- **Root cause:** Allows UI/UX to be future-proof without requiring API credentials today. Users see what's coming. Reduces migration cost when WhatsApp is enabled - UI already handles it.
- **How to avoid:** UI complexity increased with disabled option that doesn't work, but UX is clearer about roadmap. Admins won't accidentally try to use WhatsApp and get silent failures.

#### [Pattern] Late fee application uses 'configured application day' pattern - fees only apply on specific day of month (e.g., always on day 7), not on invoice due date. (2026-01-11)
- **Problem solved:** Business requirement to batch late fee applications for operational efficiency
- **Why this works:** Daily cron job that applies fees to all eligible invoices only on specific day prevents multiple applications and allows bulk processing. Simpler than per-invoice scheduling.
- **Trade-offs:** Simpler operational model (one cron, one query) but fees apply same day regardless of when invoice became overdue. May require grace period configuration.

### Multi-step reminder scheduler uses relative timing (days before due date) rather than absolute timestamps in configuration. (2026-01-11)
- **Context:** Invoice reminders must trigger at different intervals (7 days, 3 days, 1 day before, on due date) for flexible business logic.
- **Why:** Relative timing decouples reminder configuration from specific invoice dates. New invoices automatically inherit the same schedule without recalculation. Schedule changes apply retroactively to pending invoices.
- **Rejected:** Absolute timestamp scheduling - would require recalculating all pending reminders when schedule changes, creating state synchronization complexity.
- **Trade-offs:** Requires runtime calculation of trigger times (current_date + days_before) but eliminates batch recalculation operations and simplifies configuration semantics.
- **Breaking if changed:** Switching to absolute timestamps would require migration script for existing reminder schedules and introduce dependency between configuration changes and pending invoice state.

#### [Pattern] Client-server separation with server action for data aggregation, API route for PDF generation, and UI dialog for interaction (2026-01-11)
- **Problem solved:** Building a statement generator that needs authorization checks, data aggregation from multiple sources, PDF rendering, and smooth UX
- **Why this works:** Server actions handle data security and authorization before PDF generation. API route converts React PDF to bytes server-side, keeping rendering logic server-side (smaller client bundle, better security). UI dialog manages only presentation state and user interaction.
- **Trade-offs:** Extra network call for PDF generation (acceptable for admin/billing operations), but gains security by keeping authorization and sensitive data aggregation server-side. Cleaner separation of concerns at cost of additional abstraction layer.

### Separate paystack_transactions table from payment_records, with paystack transactions linking to invoices before payment verification (2026-01-11)
- **Context:** Payment flow requires tracking abandoned/failed Paystack transactions separately from actual payments credited to residents
- **Why:** Allows reconciliation and retry logic without polluting payment history. Failed transactions remain as audit trail. Only verified payments create payment_records
- **Rejected:** Storing pending transactions in payment_records with status flags would require cleanup logic and complicate payment allocation queries
- **Trade-offs:** Easier: audit trail and retry logic. Harder: dual-table joins for payment reporting, requires migration coordination
- **Breaking if changed:** Removing this separation would lose transaction history for abandoned payments and complicate webhook reconciliation logic

#### [Pattern] Dual verification: callback URL + webhook processing for same payment event (2026-01-11)
- **Problem solved:** User might close browser after payment but before callback redirect, causing payment to complete unrecorded
- **Why this works:** Webhook is authoritative source of truth (server-to-server). Callback is user-experience handler (redirect). Together they guarantee payment recording even if either fails
- **Trade-offs:** More reliable: handles all failure modes. More complex: must handle duplicate payment verification (webhook + callback for same transaction)

#### [Pattern] Paystack payment feeds into existing wallet system (credit wallet → FIFO invoice allocation) instead of direct invoice payment (2026-01-11)
- **Problem solved:** Resident portal supports wallet-based payment model where funds are credited first, then automatically allocated
- **Why this works:** Reuses existing payment allocation logic. Single code path for all payment methods (manual + online). Resident gets wallet balance visibility
- **Trade-offs:** Easier: one allocation mechanism. Harder: user must understand wallet concept (though already established in system)