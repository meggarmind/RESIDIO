---
tags: [database]
summary: database implementation decisions and patterns
relevantTo: [database]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# database

#### [Pattern] Emergency broadcasts stored as regular announcements with emergency_broadcast email type and 'emergency' SMS type, pinned and prioritized at database level (2026-01-11)
- **Problem solved:** Need to distinguish emergency broadcasts from regular announcements for display and audit purposes
- **Why this works:** Reuses existing announcement infrastructure (schema, queries, permissions) rather than creating separate table. Type field allows filtering and formatting without schema changes. Pinning at data level ensures it always appears first regardless of sort order.
- **Trade-offs:** Must remember to check email type and SMS type across the codebase when querying announcements. Easier to accidentally treat emergency broadcasts as regular ones if type checking is missed.

### Created separate late_fee_log table for audit trail instead of storing all state in late_fee_waivers table. Waiver table tracks current state, log table tracks history. (2026-01-11)
- **Context:** Need to track both current waiver status (for business logic) and complete history (for auditing and compliance)
- **Why:** Separating current state from history prevents query complexity and enables efficient waiver lookups without scanning audit trail. Also enables archiving historical data independently.
- **Rejected:** Single table with versioning or audit triggers - creates bloated table and slow queries when checking active waivers
- **Trade-offs:** More tables to manage but cleaner queries and explicit audit capability. Requires careful synchronization between tables.
- **Breaking if changed:** If audit requirements change to need intermediate states, would require redesign. log table is append-only safe assumption.

### Reminder schedule configuration is stored as JSON schema in database rather than normalized relational schema. (2026-01-11)
- **Context:** Reminder steps have variable structure (timing, channels, escalation level, enabled flag) and configuration needs to be atomic.
- **Why:** JSON storage allows flexible step schemas without schema migrations. Atomic updates to entire schedule prevent partial failures. Simpler to version configuration snapshots for audit.
- **Rejected:** Normalized schema with separate steps table - would require joins on every read, multi-statement transactions for updates, and schema migrations when step fields change.
- **Trade-offs:** JSON requires runtime parsing and validation, but eliminates complex migration tooling and enables feature flags for new step properties without database changes. Query filtering is harder but configuration reads are infrequent.
- **Breaking if changed:** Switching to relational schema would require comprehensive data migration, multi-part transaction handling in reminder processor, and slower reads due to JOIN operations.

#### [Gotcha] Wallet transactions for invoice payments are deduplicated - wallet entries exist alongside payment records but both represent the same transaction (2026-01-11)
- **Situation:** Statement data aggregates invoices, payments, and wallet transactions. Initial implementation double-counted payments because wallet had transaction records for invoice payments.
- **Root cause:** Wallet tracks all fund movements for reconciliation. Payments table tracks payment applications to invoices. Both record the same event. Must deduplicate to show accurate statement.
- **How to avoid:** Requires careful data aggregation logic and documentation. Alternative of normalizing wallet/payments data into single table would break existing wallet reporting features.

### Store authorization_code in paystack_transactions table for future recurring payment support (2026-01-11)
- **Context:** Paystack returns authorization code that enables charging without redirect for repeat customers
- **Why:** Enables future implementation of subscription/recurring payments without schema migration. Authorization code never expires if not revoked
- **Rejected:** Not storing it would require schema migration later when subscription feature added
- **Trade-offs:** Easier: future-proof. Harder: unused field until feature implemented
- **Breaking if changed:** Removing this field would block future subscription payment implementation