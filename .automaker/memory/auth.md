---
tags: [auth]
summary: auth implementation decisions and patterns
relevantTo: [auth]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# auth

### Cron job uses admin supabase client (service role key) instead of user context, but late_fee_waivers RLS still applies to waiver checks via regular client calls. (2026-01-11)
- **Context:** Cron must bypass row-level security to apply fees to all tenants, but individual waiver lookups should respect RLS
- **Why:** Admin client allows cross-tenant fee application (needed for scheduled job). Waiver checks still use regular client with RLS to prevent data leakage between organizations.
- **Rejected:** All admin client (loses RLS protection), or all regular client (can't apply cross-tenant)
- **Trade-offs:** Mixed client approach adds complexity but maintains security boundary. Must be explicit about when each is used.
- **Breaking if changed:** If admin client is used for waiver queries, RLS bypass defeats multi-tenant isolation