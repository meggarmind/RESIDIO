# Next Session Handoff Prompt

**Date:** 2025-12-22
**Current Phase:** Phase 12 - Resident View Portal

---

## Context

Phase 11 (Alert Management Module) and Phase 10 (RBAC) are complete. The next work is Phase 12: Resident View Portal.

### Completed This Session

1. **Phase 11 Alert Management Module** - Full notification system with:
   - Database tables: notification_templates, notification_schedules, notification_queue, notification_history, notification_preferences
   - Core library: templates, deduplication, queue management, escalation, channel dispatcher
   - Server actions and React Query hooks
   - Admin UI: templates, schedules, history viewer, preferences
   - Cron job for queue processing (every 5 minutes)
   - Bridge to legacy email system

2. **sync_up Command** - Added to CLAUDE.md for session consolidation

3. **Template Form Optimization** - Backlog task, reorganized into Card sections

4. **Notion Cleanup** - Updated 11 processed prompts to "Done" status

---

## Immediate Action When Resuming

1. **SessionStart hook will run automatically** - syncs Notion and shows prompt summary

2. **Process Phase 12 prompt**: `/prompts/20251221_phase_12_resident_view_portal.md`

3. **Phase 12 Tasks** (from TODO.md):
   - [ ] Resident authentication (separate from admin login)
   - [ ] Read-only dashboard with property info
   - [ ] View invoices and payment history
   - [ ] Download payment receipts (PDF)
   - [ ] Manage security contacts (add/edit/remove within limits)
   - [ ] Notification preferences management
   - [ ] Profile management (update contact info)
   - [ ] Mobile-responsive design

---

## Pending Prompts

### Aligned (Ready to Execute)

- **Phase 12**: `20251221_phase_12_resident_view_portal.md`

### Not Aligned (User Decision Required)

- **Phase 1** (4 items): Payment improvements
- **Phase 4** (7 items): Financial reports, dashboard overhaul

---

## Key Technical Decisions for Phase 12

1. **Separate Authentication**: Residents should have their own login flow, distinct from admin
2. **Existing RBAC**: Phase 10 already has "resident" role - leverage this
3. **Notification Preferences**: Phase 11 PreferencesForm already on resident detail page
4. **Read-Only Access**: Residents view their data but limited write capabilities

---

## Key Patterns Established

### Zod Schema with Default Values

```typescript
type FormData = { field: number };
const schema = z.object({ field: z.number() }) satisfies z.ZodType<FormData>;
```

### Form Section Pattern

Use shadcn/ui Card components to group related fields.

### Notification System

- Channel dispatcher in `src/lib/notifications/send.ts`
- Template variables: `{{variable_name}}` syntax
- Priority queue: 1=Urgent, 3=High, 5=Normal, 7=Low, 9=Bulk

---

## Commands

```bash
cd /home/feyijimiohioma/projects/Residio
npm run dev
```

---

## Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | super_admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |

---

## Repository

GitHub: https://github.com/meggarmind/RESIDIO
