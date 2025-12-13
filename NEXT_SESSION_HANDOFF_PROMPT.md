# Next Session Handoff Prompt

Copy and paste this prompt to start the next Claude Code session:

---

Continue building the Residio residential estate access management application.

## First Steps
1. Run `date` to confirm current date/time
2. Read the following files to understand project state:
   - `CLAUDE.md` - Project conventions and architecture
   - `TODO.md` - Current phase status and task list
   - `HANDOFF_SUMMARY.md` - Last session summary
   - `/home/feyijimiohioma/.claude/plans/lucky-kindling-mitten.md` - Full implementation plan

## Current State

**Project:** Residio - Residential estate access management web app
**Current Phase:** Phase 5.5 - Billing Profile Enhancements (In Progress)

### What's Been Completed
- Database migrations applied:
  - `number_of_plots` added to houses table
  - `effective_date` added to billing_profiles table
  - `approval_requests` table created for maker-checker workflow
- Types updated in `src/types/database.ts`
- Validators updated (house, billing - partial)
- One-time levies configured (Development Levy, Transformer Levy, Registration Fee, Renovation Fee)

### What Needs to Be Done (In Order)

1. **Create approval validator** - `src/lib/validators/approval.ts`
   ```typescript
   export const approvalActionSchema = z.object({
     request_id: z.string().uuid(),
     action: z.enum(['approve', 'reject']),
     notes: z.string().optional(),
   });
   ```

2. **Create approval server actions** - `src/actions/approvals/index.ts`
   - `getApprovalRequests()` - List pending/all requests
   - `approveRequest()` - Apply changes and update status
   - `rejectRequest()` - Mark as rejected with notes
   - `getPendingApprovalsCount()` - For sidebar badge

3. **Update billing profile actions** - `src/actions/billing/profiles.ts`
   - Add `updateBillingProfile()` function
   - Add `checkEffectiveDateImpact()` to check if date affects invoices

4. **Update house actions** - `src/actions/houses/update-house.ts`
   - Handle `number_of_plots` field
   - Check if plots change affects existing Development Levy
   - Create approval request if needed (for non-admin/chairman)

5. **Update levy generation** - `src/actions/billing/generate-levies.ts`
   - Multiply Development Levy amount by `number_of_plots`
   - Only apply to landlord/developer (not tenants)
   - Store plots count in rate_snapshot

6. **Create approval hooks** - `src/hooks/use-approvals.ts`

7. **Update billing/house hooks** - Add update mutations

8. **Create UI components**:
   - `src/components/billing/billing-profile-edit-dialog.tsx`
   - `src/components/approvals/approval-detail-dialog.tsx`
   - `src/app/(dashboard)/approvals/page.tsx`

9. **Update house form** - Add `number_of_plots` field

10. **Update sidebar** - Add approvals link for admin/chairman

## Maker-Checker Workflow Rules

| Role | Billing Profile Edit | Effective Date Change | Plots Change |
|------|---------------------|----------------------|--------------|
| admin | Auto-approve | Auto-approve | Auto-approve |
| chairman | Auto-approve | Auto-approve (is checker) | Auto-approve (is checker) |
| financial_secretary | Auto-approve | Creates approval request | Creates approval request |

## Key Files to Reference

- Plan file: `/home/feyijimiohioma/.claude/plans/lucky-kindling-mitten.md`
- Billing profiles: `src/actions/billing/profiles.ts`
- Levy generation: `src/actions/billing/generate-levies.ts`
- House form: `src/components/houses/house-form.tsx`
- Billing settings: `src/app/(dashboard)/settings/billing/page.tsx`
- Sidebar: `src/components/dashboard/sidebar.tsx`

## Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |

## Commands

```bash
cd /home/feyijimiohioma/projects/Residio/residio
npm run supabase:start   # Start local Supabase
npm run dev              # Start dev server
```

---

**START by creating the approval validator, then proceed with server actions.**
