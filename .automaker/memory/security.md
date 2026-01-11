---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# security

### Require admins to type 'SEND' confirmation string before emergency broadcast executes - not just clicking a button (2026-01-11)
- **Context:** Emergency broadcasts can reach all residents; need to prevent accidental triggers
- **Why:** Typing 'SEND' creates cognitive friction that prevents muscle-memory accidents. Button clicks are too easy to trigger unintentionally when navigating dialogs. String confirmation is harder to execute via script injections.
- **Rejected:** Single confirmation button (easily misclicked), checkbox + button (still too fast)
- **Trade-offs:** Added UX friction - admins must type 3 characters, but this is worth it for irreversible broadcast action. Slightly slower workflow for legitimate broadcasts.
- **Breaking if changed:** If confirmation requirement is removed, no technical barrier to accidental broadcast. Testing becomes harder because manual broadcasts now require string input.

#### [Pattern] Cron endpoint uses timing-safe comparison (crypto.timingSafeEqual) for CRON_SECRET validation instead of simple string comparison. (2026-01-11)
- **Problem solved:** Cron job needs authentication but must resist timing attacks on the secret
- **Why this works:** Simple string comparison (===) takes variable time based on where strings differ, leaking information about valid secrets. Timing-safe comparison always takes same time.
- **Trade-offs:** Minimal performance impact (microseconds) but prevents theoretical timing attack vectors. Critical for externally-triggered operations.

#### [Gotcha] Reminder configuration changes require audit logging but initial implementation missed capturing which steps were modified and what the previous values were. (2026-01-11)
- **Situation:** Admin configuration UI allows adding/removing steps and toggling channels, but without granular audit data, compliance teams can't trace specific configuration evolution.
- **Root cause:** Audit logs must capture before/after state of each step, not just the fact that configuration changed. Enables answering 'was SMS enabled for final notices on date X?' for compliance.
- **How to avoid:** Requires serializing full config snapshots on each change (larger log entries, ~500 bytes per change) but enables precise compliance auditing and debugging of reminder failures.

### Authorization checks at multiple layers: server action scopes data per user role, API route validates permissions again before PDF generation (2026-01-11)
- **Context:** Admins and residents both need statement access but with different scoping rules - admins can view any resident's statement, residents only their own
- **Why:** Dual authorization prevents privilege escalation. Server action enforces data scope (what data is fetched), API route enforces action scope (who can call the PDF generation). If either check fails, request is rejected.
- **Rejected:** Single authorization point at API route would require server action to fetch unrestricted data and API to filter - violates principle of least privilege and increases attack surface.
- **Trade-offs:** Code duplication of authorization logic vs. defense in depth. Additional guard clause in API route catches logic errors in server action.
- **Breaking if changed:** Removing API route validation would allow server action authorization bypass if front-end logic is compromised. Removing server action authorization would leak data to billing page rendering layer.

#### [Gotcha] Webhook endpoint is unauthenticated (no auth header check) but uses signature verification instead (2026-01-11)
- **Situation:** Paystack webhook calls cannot include bearer tokens (external service integration), but must still be authenticated
- **Root cause:** HMAC signature verification is cryptographically equivalent to auth token - only Paystack has the secret key. This is industry standard for webhooks
- **How to avoid:** Easier: works with Paystack. Harder: must validate signature on every request (computational cost)