# TODO.md - Residio Project Status

**Last Updated:** 2025-12-21 (Phase Roadmap Reorganization - Phases 10-22, 25-28)

## Current Phase: Phase 10 - Flexible RBAC System (NEXT UP)

> **📋 Prompts Check**: Always check `/prompts` folder for pending development tasks:
> - **Session start**: Automated via SessionStart hook
> - **Between phases**: Check before starting new phase work
> - **When asked "what's next?"**: Review prompts alongside TODO items
>
> **⚠️ MANDATORY: After completing any prompt from Notion inbox:**
> 1. Move prompt file: `mv prompts/<filename> processed/`
> 2. Update Notion status to "Done" using `mcp__notion__notion-update-page`
> 3. If Notion MCP times out, retry up to 3 times before documenting in Troubleshooting section

---

## Phase 0: Project Setup & Infrastructure ✅ COMPLETE
- [x] Initialize Next.js 16 with TypeScript, Tailwind CSS, App Router
- [x] Install core dependencies (Supabase, React Query, React Hook Form, Zod)
- [x] Setup shadcn/ui with 15 components
- [x] Configure environment variables
- [x] Create Supabase client utilities (browser, server, admin)
- [x] Create database type definitions
- [x] Implement auth middleware
- [x] Migrate from Docker Compose to Supabase CLI
- [x] Connect to GitHub (https://github.com/meggarmind/RESIDIO)
- [x] Connect to staging Supabase cloud instance
- [x] Configure MCP servers (Supabase, GitHub, Memory, TestSprite)

---

## Phase 1: Authentication & RBAC ✅ COMPLETE
- [x] Create database migration for profiles table with RLS
- [x] Set up Supabase Auth trigger (auto-create profile on signup)
- [x] Create login page (`src/app/(auth)/login/page.tsx`)
- [x] Implement auth callback route (`src/app/api/auth/callback/route.ts`)
- [x] Create auth context/provider for client-side auth state
- [x] Add role-based route protection (extend middleware)
- [x] Create basic dashboard page with role-based navigation
- [x] Fix RLS recursion issue with `get_my_role()` SECURITY DEFINER function
- [x] Add auth.identities seed records for test users

---

## Phase 2: Dashboard Shell ✅ COMPLETE
- [x] Create dashboard layout (`src/app/(dashboard)/layout.tsx`)
- [x] Build sidebar navigation component with role filtering
- [x] Build header with user menu and sign out
- [x] Create dashboard home page with stats overview
- [x] Implement responsive design (mobile sidebar with sheet)

---

## Phase 3: Resident & House Management ✅ COMPLETE
- [x] Create 8 database migrations (enums, streets, house_types, houses, residents, resident_houses)
- [x] Add auto-generated 6-digit resident codes via trigger
- [x] Add house occupancy tracking trigger
- [x] Seed data: 4 streets, 5 house types, 18 sample houses
- [x] Create Zod validators for residents and houses
- [x] Add 16 server actions for CRUD operations
- [x] Create React Query hooks for data fetching
- [x] Build house UI: table, form, list/new/detail pages
- [x] Build resident UI: table, form, status badges, list/new/detail pages
- [x] Update sidebar with Houses link
- [x] Add form, select, textarea shadcn components

### Key Implementation Notes:
- Use `ALL_VALUE = '_all'` constant for Select "all" options (shadcn doesn't allow empty strings)
- Resident roles: owner, tenant, occupier, domestic_staff
- Resident codes: 6-digit numeric auto-generated

---

## Phase 4: Resident & House Enhancements ✅ COMPLETE
- [x] Create reference management (Streets/House Types)
- [x] Implement flexible emergency contacts (Link existing resident)
- [x] Update resident roles (Household Member)
- [x] Implement multiple house linking for residents
- [x] Update DB schema (enums, FKs)

### Key Implementation Notes:
- Reference Admin Page restricted to Admin/Chairman/FinSec
- Emergency contacts can be manual or linked to existing resident ID

---

## Phase 5: Payment & Billing System ✅ COMPLETE

### 5.1 Payment Records ✅ COMPLETE
- [x] Create payment_records table migration
- [x] Build payments list page with table (`/payments`)
- [x] Create payment recording form (`/payments/new`)
- [x] Add payment detail page (`/payments/[id]`)
- [x] Add payment history view per resident (ResidentPayments component)
- [x] Pre-fill resident when navigating from resident detail page

### 5.2 Wallet System ✅ COMPLETE
- [x] Create wallets table migration
- [x] Create wallet_transactions table migration
- [x] Auto-create wallet on resident creation
- [x] Credit wallet on payment recording
- [x] Auto-allocate wallet balance to unpaid invoices (FIFO)
- [x] Wallet balance display on resident detail page
- [x] Wallet transactions history component
- [x] Manual wallet adjustment dialog

### 5.3 Billing & Invoices ✅ COMPLETE
- [x] Create billing_profiles table migration
- [x] Create invoices table migration
- [x] Create invoice_items table migration
- [x] Build billing profiles management UI
- [x] Implement invoice generation logic
- [x] Owner vs tenant billing distinction (only bill primary resident)
- [x] Pro-rata calculation for move-in month
- [x] Billing page with pagination, filters, search
- [x] Invoice detail page

### 5.4 Payment Enhancements ✅ COMPLETE
- [x] Implement bulk payment status update (dropdown in floating action bar)
- [x] Create overdue invoice detection logic (`check-overdue-invoices.ts`)
- [x] Add Check Overdue button to billing page with alert banner
- [x] Payment receipts with print functionality (popup window)

### Key Implementation Notes:
- Billing logic: Only bill tenants OR owner-occupiers (not non-resident owners)
- `findBillableResident()` function determines who to bill per property
- CurrencyInput component for all monetary fields (comma-separated formatting)
- Wallet auto-allocation uses FIFO (oldest invoices first)

---

## UI Enhancements (2025-12-12) ✅ COMPLETE

### House Ownership History Tracking
- [x] Added `house_added` event type to track when houses are added to portal
- [x] Created migration with backfill for existing houses
- [x] Display ownership/occupancy timeline on house detail page

### Property Registry Filters
- [x] Added House Status filter (Occupied/Vacant) to houses table

### Resident Registry Filters
- [x] Added multi-select Role filter with checkboxes
- [x] Clear button inside dropdown to reset selections
- [x] Visual indicator badges below filter bar showing selected roles
- [x] Clickable badges to remove individual role filters

---

## Phase 5.5: Billing Profile Enhancements ✅ COMPLETE

### One-Time Levies Configuration ✅ COMPLETE
- [x] Created one-time billing profiles:
  - Development Levy: ₦500,000 (flat fee per house)
  - Transformer Levy: ₦30,000 (house-targeted)
  - Registration Fee: ₦10,000 (resident-targeted: tenant, resident_landlord)
  - Renovation Fee: ₦500,000 (manual only, not auto-generated)

### Database Migrations ✅ COMPLETE
- [x] Add `number_of_plots` to houses table (default: 1)
- [x] Add `effective_date` to billing_profiles table
- [x] Add `is_development_levy` to billing_profiles table
- [x] Add `current_development_levy_profile_id` system setting
- [x] Create `approval_requests` table for maker-checker workflow

### Development Levy Enhancement ✅ COMPLETE (2025-12-13)
- [x] Added `is_development_levy` boolean flag to billing_profiles
- [x] **Fixed critical bug**: Removed incorrect plot multiplication - Development Levy is FLAT FEE per house
- [x] Added `getDevelopmentLevyProfiles()` server action
- [x] Added `getCurrentDevelopmentLevyProfileId()` / `setCurrentDevelopmentLevyProfileId()` settings helpers
- [x] Added `useDevelopmentLevyProfiles()` hook
- [x] Added `useCurrentDevelopmentLevyProfileId()` / `useSetCurrentDevelopmentLevyProfileId()` hooks
- [x] Added Development Levy checkbox to billing profile form (conditional on one-time)
- [x] Added Current Development Levy selector in billing settings
- [x] Profile cards show "Development Levy" badge (blue) and "Current" badge (green)

### Key Implementation Notes:
- Development Levy is a **flat fee per house** (NOT multiplied by plots)
- Detection now uses `is_development_levy` flag (with fallback to name-based)
- Current Development Levy profile tracked in `system_settings`
- Create new profile records for rate changes (versioning via new profiles)

---

## Phase 5.6: UI & Reference Enhancements ✅ COMPLETE

### 5.6.1 Billing Profile Duplicate Function ✅
- [x] Add `duplicateBillingProfile()` server action
- [x] Add `useDuplicateBillingProfile()` hook
- [x] Add Duplicate (Copy) button to billing profile cards

### 5.6.2 Streets Reference Enhancement ✅
- [x] Database migration: Add `short_name` column to streets table
- [x] Run `db:types` to regenerate TypeScript types
- [x] Update `streetFormSchema` with short_name field
- [x] Add `updateStreet()` server action
- [x] Add `duplicateStreet()` server action
- [x] Add `useUpdateStreet()` and `useDuplicateStreet()` hooks
- [x] Rewrite `streets-list.tsx`:
  - Added Short Name column to table
  - Added Edit button with form dialog
  - Added Duplicate button
  - Form fields: Long Name*, Short Name, Description

### Key Implementation Notes:
- Streets now have `name` (Long Name) and `short_name` fields
- Edit mode uses same dialog as create, with form state tracking `editingId`
- Duplicate creates copy with "Copy of {original}" prefix
- Billing profile duplicate copies profile and all billing items

### Maker-Checker Workflow (Deferred to Phase 5.7)
- **Maker**: financial_secretary creates change requests
- **Checker**: chairman approves/rejects requests
- **Auto-approve**: admin role auto-approves all changes
- Applies to: effective_date changes (affecting invoices), plots changes (affecting levies)

---

## Phase 5.7: Payment Page UX Fix ✅ COMPLETE (2025-12-15)

### Problem Fixed
Payment page was refreshing and jumping to top after any action (delete, update, filter, pagination), creating terrible UX.

### Root Cause
- Payment page was a server component using `revalidatePath('/payments')` in all mutation actions
- This forced full server-side re-renders, causing scroll position reset and loss of local state
- Architecture mismatch: Residents/Houses pages use client components (no issues), Payment page used server component

### Solution Implemented
**Converted payment page to client component pattern** (following residents/houses pattern):

1. **Removed `revalidatePath()` from 4 server action files**:
   - `src/actions/payments/delete-payment.ts` - Removed line 18
   - `src/actions/payments/update-payment.ts` - Removed line 28
   - `src/actions/payments/create-payment.ts` - Removed 3 calls
   - `src/actions/payments/bulk-update-payments.ts` - Removed line 46

2. **Converted payments page to client component**:
   - Added `'use client'` directive
   - Wrapped in `Suspense` boundary (required for `useSearchParams()`)
   - Replaced server data fetching with React Query hooks
   - Added loading states with `<Skeleton>` components
   - Created reusable `StatCard` component
   - Maintained URL-based filter persistence via `useSearchParams()`

### Files Modified (5 total)
- `src/actions/payments/delete-payment.ts`
- `src/actions/payments/update-payment.ts`
- `src/actions/payments/create-payment.ts`
- `src/actions/payments/bulk-update-payments.ts`
- `src/app/(dashboard)/payments/page.tsx`

### How It Works Now
**Before**: Delete payment → Server action → `revalidatePath()` → Full SSR re-render → Scroll resets ❌
**After**: Delete payment → Server action (no revalidatePath) → React Query invalidates → Client refetch → Smooth update, scroll preserved ✅

### Benefits
- ✅ No more scroll jumps
- ✅ Maintains URL-based filter state (bookmarkable)
- ✅ Follows proven pattern (consistent with residents/houses)
- ✅ Better UX with loading states
- ✅ Build passes successfully

---

## Phase 5.8: Settings Pages Scroll Fix ✅ COMPLETE (2025-12-19)

### Problem Fixed
Settings pages (streets, house-types, bank-accounts, transaction-tags) had scroll jump issues similar to the payment page fix.

### Solution Implemented
Extended the Phase 5.7 pattern to 4 additional settings pages:

1. **Removed `revalidatePath()` from 7 server action files**:
   - `src/actions/reference/create-street.ts`
   - `src/actions/reference/update-street.ts`
   - `src/actions/reference/delete-street.ts`
   - `src/actions/reference/duplicate-street.ts`
   - `src/actions/reference/create-house-type.ts`
   - `src/actions/reference/update-house-type.ts`
   - `src/actions/reference/transaction-tags.ts` (3 functions)

2. **Added 3 missing React Query hooks** to `src/hooks/use-reference.ts`:
   - `useCreateStreet()`
   - `useCreateHouseType()`
   - `useUpdateHouseType()`

3. **Updated 3 components to use hooks**:
   - `src/components/admin/streets-list.tsx` - Uses `useCreateStreet` hook
   - `src/components/admin/house-types-list.tsx` - Uses mutation hooks
   - `src/components/admin/transaction-tags-list.tsx` - Removed `refetch()` call

4. **Converted 4 pages to client components**:
   - `src/app/(dashboard)/settings/streets/page.tsx`
   - `src/app/(dashboard)/settings/house-types/page.tsx`
   - `src/app/(dashboard)/settings/bank-accounts/page.tsx`
   - `src/app/(dashboard)/settings/transaction-tags/page.tsx`

### Files Modified (15 total)
- 7 server actions
- 1 hooks file
- 3 components
- 4 pages

---

## Development Workflow: Notion Inbox Integration ✅ COMPLETE (2025-12-19)

### Problem
The mobile-first development inbox lacked bidirectional sync - tasks captured in Notion weren't automatically marked complete after processing.

### Solution Implemented
Enhanced the Notion inbox processor with three key improvements:

1. **YAML Frontmatter with Notion Page ID**:
   - Prompts now include `notion_page_id` and `notion_url` in frontmatter
   - Enables bidirectional sync back to Notion after task completion

2. **Module-to-File Mapping**:
   - Added comprehensive mapping for 9 modules in config
   - Related files automatically included in prompts based on affected module
   - Helps Claude Code find relevant code faster

3. **Bidirectional Sync Workflow**:
   - CLAUDE.md updated with MCP commands for updating Notion status
   - After completing a task, update Notion to "Done" using `mcp__notion__notion-update-page`

### Files Modified (3)
- `/home/feyijimiohioma/mobile-first-notion-workflow/residio_inbox_processor.py`
- `/home/feyijimiohioma/mobile-first-notion-workflow/inbox_processor_config.json`
- `/home/feyijimiohioma/projects/Residio/CLAUDE.md`

### Key Implementation Notes
- Prompts saved to `/home/feyijimiohioma/projects/Residio/prompts/`
- After processing, move to `/home/feyijimiohioma/projects/Residio/processed/`
- Use `mcp__notion__notion-update-page` to mark Notion tasks as Done

### SessionStart Hook Automation ✅ COMPLETE (2025-12-19)
Automated the Notion inbox workflow with Claude Code hooks:

**Files Created**:
- `.claude/hooks/session-start.sh` - SessionStart hook script
- `.claude/settings.json` - Hook configuration

**Dynamic Phase Detection**:
- Hook reads current phase from TODO.md automatically
- No hardcoded phase references - parses `## Current Phase: Phase X - Name` format
- Displays phase alignment summary at session start

**Prompt Processing Workflow**:
- **Auto-execute**: Bug Fix, Documentation, Security Fix, Tech Debt (regardless of phase)
- **Auto-execute**: Prompts matching current phase or Backlog
- **User decision**: Non-aligned prompts → options: Defer, Execute anyway, Archive

**Folder Structure**:
```
prompts/     # Incoming prompts (auto-synced from Notion)
processed/   # Completed prompts (after task done)
deferred/    # User chose to defer
archived/    # User chose to archive
```

---

## Phase 6: Security Contact List ✅ COMPLETE

### Database Migrations ✅
- [x] Create `security_contact_categories` table with configurable settings
- [x] Create `security_contacts` table with full contact schema
- [x] Create `access_codes` table for code management
- [x] Create `access_logs` table for check-in/check-out tracking
- [x] Add security module settings to `system_settings`
- [x] Create `security_settings_view` and `has_security_permission()` function
- [x] Define enums: `security_contact_status`, `id_document_type`, `access_code_type`

### Server Actions ✅
- [x] Full CRUD for security contacts (`src/actions/security/contacts.ts`)
- [x] Access code generation and management (`src/actions/security/codes.ts`)
- [x] Category management (`src/actions/security/categories.ts`)
- [x] Security settings management (`src/actions/security/settings.ts`)
- [x] Access logging and check-in/out (`src/actions/security/access-logs.ts`)
- [x] CSV export functionality (`src/actions/security/export.ts`)
- [x] Audit logging integrated on all mutations

### React Query Hooks ✅
- [x] Complete hook library in `src/hooks/use-security.ts`
- [x] Contact hooks: useSecurityContacts, useCreateSecurityContact, useUpdateSecurityContact, etc.
- [x] Access code hooks: useGenerateAccessCode, useRevokeAccessCode, useVerifyAccessCode
- [x] Access log hooks: useRecordCheckIn, useRecordCheckOut, useAccessLogs
- [x] Settings hooks: useSecuritySettings, useSecurityRolePermissions
- [x] Export hooks: useExportSecurityContactsCSV, useExportAccessLogsCSV

### UI Components ✅
- [x] SecurityContactForm - Create/edit contacts with validation
- [x] SecurityContactsTable - Data table with filters and pagination
- [x] SecurityContactStatusBadge - Status display with icons
- [x] AccessCodeDisplay - Formatted code display with copy
- [x] CodeVerification - Verification form for security officers
- [x] ResidentSecurityContacts - Resident detail page integration

### Pages ✅
- [x] `/security` - Dashboard with stats and tabs
- [x] `/security/contacts` - Contact list with search/filter
- [x] `/security/contacts/new` - Register new contact
- [x] `/security/contacts/[id]` - View/edit contact
- [x] `/security/verify` - Code verification interface
- [x] `/security/logs` - Access log viewer
- [x] `/settings/security` - Security module configuration

### Key Features ✅
- [x] 11-permission role-based access control system
- [x] Contact status lifecycle (active → suspended/expired/revoked)
- [x] Access codes: permanent and one-time with max uses
- [x] Validity tracking with configurable expiry
- [x] Check-in/check-out recording with timestamps
- [x] Flag suspicious activity system
- [x] CSV export for contacts and access logs
- [x] Per-resident contact limits
- [x] Dynamic category configuration

---

## Phase 7: Audit Logging ✅ COMPLETE
- [x] Create audit_logs table migration (immutable, append-only)
- [x] Add AuditAction enum and AuditEntityType types
- [x] Create `logAudit()` utility for easy integration from server actions
- [x] Create audit query server actions with filtering
- [x] Create React Query hooks for audit logs
- [x] Build audit log viewer UI at `/settings/audit-logs`
- [x] Add filtering by actor, action, entity, date range, search
- [x] Create audit detail dialog with old/new value comparison
- [x] Add integration documentation (`src/lib/audit/README.md`)

### Key Implementation Notes:
- Audit logs are immutable (no UPDATE/DELETE policies)
- Only admin/chairman can view audit logs
- `logAudit()` is fail-safe - won't break main operations if logging fails
- Helper functions: `getChangedFields()`, `getChangedValues()` for UPDATE tracking
- New entity types can be added by extending `AuditEntityType` in `database.ts`

---

## Phase 8: Application Settings & Configuration ✅ COMPLETE
Centralized management for all system parameters.

### Settings Infrastructure ✅
- [x] Unified Settings Layout (`/settings/layout.tsx`) with sidebar navigation
- [x] 9 navigation items: General, Billing Profiles, Bank Accounts, Security, Streets, House Types, Transaction Tags, Audit Logs, System

### General Settings ✅
- [x] Estate Information form (name, email, address, phone, website)
- [x] Social Links (Facebook, Twitter, Instagram URLs)
- [x] Database migration for general estate settings

### Payment Configuration ✅
- [x] Late Fee Configuration section in Billing Settings:
  - Enable/disable late fees toggle
  - Fee type selector (percentage/fixed)
  - Fee amount input
  - Grace period days setting
- [x] Payment Reminders configuration (config only - email in Phase 9)
- [x] "Apply Late Fees Now" manual trigger button
- [x] `apply-late-fees.ts` server action with audit logging
- [x] Database migration for payment configuration settings

### System Settings ✅
- [x] System Settings page (`/settings/system`) - admin-only
- [x] Maintenance Mode with toggle and custom message
- [x] Maintenance page (`/maintenance`) for locked-out users
- [x] Middleware-based maintenance mode lockout (non-admin users blocked)
- [x] Data Retention settings (audit log retention days)
- [x] Session Settings (timeout minutes - config only)
- [x] Database migration for system admin settings

### Reference Pages ✅
- [x] Security Settings (`/settings/security`) - Code validity, contact limits, role permissions
- [x] Audit Logs viewer (`/settings/audit-logs`)
- [x] Billing Settings (`/settings/billing`) - Billing profiles, development levy config, late fees
- [x] Bank Accounts (`/settings/bank-accounts`)
- [x] Transaction Tags (`/settings/transaction-tags`)
- [x] Streets reference (`/settings/streets`)
- [x] House Types reference (`/settings/house-types`)

### Key Implementation Notes:
- Late fees: Manual trigger via "Apply Late Fees Now" button (admin/chairman/finsec)
- Payment reminders: Config saved but email implementation deferred to Phase 9
- Maintenance mode: Full lockout - non-admin users redirected to `/maintenance`
- System settings use React Query hooks pattern (`useSystemSettings`, `useGeneralSettings`)
- Late fee calculation supports both percentage and fixed amount types

---

## Phase 9: Polish ✅ COMPLETE
- [x] Add loading states and skeletons (all tables and pages have skeleton loaders)
- [x] Implement error boundaries (4 files: error.tsx, (dashboard)/error.tsx, global-error.tsx, not-found.tsx)
- [x] Add toast notifications for actions (payment-form already uses toast.error)
- [x] Fix 'use server' export violations (ACTION_ROLES separated to action-roles.ts)
- [x] Implement email integration (Resend API, payment reminders, invoice notifications, welcome emails)

---

## Current Phase: Phase 10 - Flexible RBAC System (NEXT UP)

---

## Phase 10: Flexible RBAC System
Transform hardcoded 4-role system to 7+ configurable roles:
- [ ] Database migration for roles table with permissions
- [ ] Define 7 roles: Super Admin, Chairman, Vice Chairman, Financial Officer, Security Officer, Secretary, Project Manager
- [ ] EXCO/BOT organizational structure support
- [ ] Granular module-level permissions (per-feature access control)
- [ ] Role assignment restricted to residents only
- [ ] Update middleware for dynamic role checking
- [ ] Update auth context and all role checks throughout app
- [ ] Role management UI in settings
- [ ] Audit logging for role changes

---

## Phase 11: Alert Management Module
Centralized notification system (Email-only for now):
- [ ] Notification templates database table
- [ ] Multi-channel architecture (Email primary, SMS/WhatsApp hooks for later)
- [ ] Configurable timing rules and schedules
- [ ] Automatic escalation workflows
- [ ] Smart deduplication (prevent duplicate alerts)
- [ ] Notification preferences per resident
- [ ] Notification history/log viewer
- [ ] Comprehensive audit trails

---

## Phase 12: Resident View Portal
Self-service portal for residents:
- [ ] Resident authentication (separate from admin login)
- [ ] Read-only dashboard with property info
- [ ] View invoices and payment history
- [ ] Download payment receipts (PDF)
- [ ] Manage security contacts (add/edit/remove within limits)
- [ ] Notification preferences management
- [ ] Profile management (update contact info)
- [ ] Mobile-responsive design

---

## Phase 13: Dashboard & Analytics
Enhanced analytics and reporting:
- [ ] Financial dashboard with revenue/expense charts
- [ ] Occupancy analytics and trends
- [ ] Payment compliance rates
- [ ] Overdue invoice aging reports
- [ ] Resident demographics
- [ ] Key performance indicators (KPIs)
- [ ] Exportable reports (PDF/Excel)
- [ ] Date range filters

---

## Phase 14: Document Management
Central document repository:
- [ ] Documents database table with categories
- [ ] File upload to Supabase Storage
- [ ] Document library UI with search/filter
- [ ] Document templates (notices, letters)
- [ ] Resident document access (invoices, receipts)
- [ ] Version control for policies
- [ ] Compliance certificate storage
- [ ] Access control per document type

---

## Phase 15: Community Communication
Enhanced communication tools:
- [ ] Announcements database table
- [ ] Community announcements/bulletin board
- [ ] Scheduled announcements (future publish date)
- [ ] Message templates library
- [ ] In-app notification center
- [ ] Read receipts tracking
- [ ] Emergency broadcast system
- [ ] Announcement categories

---

## Phase 16: Legacy App Migration
Data migration from existing system:
- [ ] Define legacy data mapping schema
- [ ] Create data import scripts/tools
- [ ] Resident data migration
- [ ] House data migration
- [ ] Payment history migration
- [ ] Validate data integrity
- [ ] Migration testing procedures
- [ ] Rollback procedures documentation

---

## Phase 17: UI Enhancement & Polish
Pre-deployment UI improvements:
- [ ] Responsive design review (all breakpoints)
- [ ] Accessibility improvements (WCAG compliance)
- [ ] Performance optimization (lazy loading, code splitting)
- [ ] UI consistency review
- [ ] Loading state improvements
- [ ] Error message improvements
- [ ] Mobile responsiveness testing
- [ ] Cross-browser testing

---

## Phase 18: Deployment & Production
Production deployment:
- [ ] Vercel deployment configuration
- [ ] Production Supabase setup
- [ ] Environment variables configuration
- [ ] SSL/domain setup (residio.estate or similar)
- [ ] Performance optimization
- [ ] Final testing
- [ ] Monitoring setup
- [ ] Backup procedures

---

## Phase 19: External API - Security Barrier Integration
API for external systems:
- [ ] Create API route for access verification (`/api/v1/access/verify`)
- [ ] API key authentication system
- [ ] Rate limiting
- [ ] Webhook support for events
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Developer settings page (API Keys management)
- [ ] Test with mock security barrier requests

---

## POST-DEPLOYMENT PRIORITY PHASES

---

## Phase 20: WhatsApp Integration
WhatsApp Business API:
- [ ] WhatsApp Business account setup
- [ ] Message templates approval (Meta requirement)
- [ ] Opt-out by default (regulatory compliance)
- [ ] Two-way messaging support
- [ ] Media message support
- [ ] Integration with Alert Management module

---

## Phase 21: SMS Integration
SMS notification channel:
- [ ] SMS gateway integration (Termii, Africa's Talking, or similar)
- [ ] Opt-in/opt-out management
- [ ] SMS templates
- [ ] Delivery tracking
- [ ] Cost tracking per message
- [ ] Integration with Alert Management module

---

## Phase 22: Mobile Application
Native mobile experience:
- [ ] React Native or Flutter app setup
- [ ] Push notifications
- [ ] Offline capability
- [ ] Biometric authentication
- [ ] QR code scanning for access verification
- [ ] Resident portal features (mobile-optimized)

---

## DEFERRED PHASES (Phase 25+)

---

## Phase 25: Payment Gateway Integration
Online payment processing:
- [ ] Paystack/Flutterwave integration
- [ ] Online invoice payment
- [ ] Payment confirmation automation
- [ ] Wallet top-up online
- [ ] Transaction reconciliation
- [ ] Payment webhook handlers

---

## Phase 26: Advanced Billing Features
Enhanced billing capabilities:
- [ ] Recurring payment scheduling
- [ ] Early payment discounts
- [ ] Payment plans for delinquent accounts
- [ ] Utility metering (water/electric sub-metering)
- [ ] Surcharge rules engine
- [ ] Multi-currency support (optional)

---

## Phase 27: Violation & Compliance Tracking
Rule enforcement system:
- [ ] Violation categories and rules database
- [ ] Violation reporting and tracking
- [ ] Warning/fine escalation workflow
- [ ] Violation history per resident
- [ ] Appeal process
- [ ] Compliance reports

---

## Phase 28: Committee & Meeting Management
Association governance:
- [ ] Committee creation and membership
- [ ] Meeting scheduling and invitations
- [ ] Agenda management
- [ ] Meeting minutes recording
- [ ] Voting/polling system
- [ ] AGM management

---

## Project Structure
```
residio/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (auth)/       # Auth pages (login)
│   │   ├── (dashboard)/  # Dashboard pages
│   │   │   ├── houses/   # House management
│   │   │   └── residents/# Resident management
│   │   └── api/          # API routes
│   ├── actions/          # Server actions
│   │   ├── houses/       # House CRUD
│   │   ├── residents/    # Resident CRUD
│   │   └── reference/    # Streets, house types
│   ├── components/
│   │   ├── ui/           # 18 shadcn/ui components
│   │   ├── dashboard/    # Sidebar, header
│   │   ├── houses/       # House table, form
│   │   └── residents/    # Resident table, form, badges
│   ├── hooks/            # React Query hooks
│   ├── lib/
│   │   ├── supabase/     # Supabase clients
│   │   └── validators/   # Zod schemas
│   └── types/            # TypeScript types
├── supabase/
│   ├── config.toml       # Supabase CLI config
│   ├── migrations/       # 10 DB migrations
│   └── seed.sql          # Test user seed data
└── package.json
```

## Troubleshooting

No pending issues.

---

## Recent Updates (2025-12-19)

### Transaction Tags: Keyword Auto-Tagging System ✅
- Added `keywords` text[] column to `transaction_tags` table
- Updated TypeScript types for TransactionTag interfaces
- Added `autoTagTransaction()` server action for keyword-based auto-tagging
- Added `suggestKeywordsFromDescription()` for learning suggestions
- Updated UI with keywords input (add/remove chips) in tag form
- Added Keywords column to tags table showing keyword count

**Files Modified:**
- `supabase/migrations/20251219115958_add_keywords_to_transaction_tags.sql`
- `src/types/database.ts`
- `src/lib/validators/import.ts`
- `src/actions/reference/transaction-tags.ts`
- `src/components/admin/transaction-tags-list.tsx`

### Import Flow Auto-Tagging Integration ✅
Integrated `autoTagTransaction()` into the bank statement import workflow:

- Added `auto_tagged` boolean column to `bank_statement_rows` table
- Auto-tagging runs during `createImportRows()` after row insertion
- Rows are matched against tag keywords and auto-tagged with `auto_tagged: true`
- Manual tagging via `tagImportRow()` clears the `auto_tagged` flag
- UI shows purple "Auto" badge with sparkles icon for auto-tagged rows
- Build passes successfully

**Files Modified:**
- `supabase/migrations/20251219_add_auto_tagged_to_bank_statement_rows.sql`
- `src/types/database.ts` - Added `auto_tagged` to `BankStatementRow`
- `src/actions/imports/create-import.ts` - Auto-tag logic after row insert
- `src/actions/reference/transaction-tags.ts` - Clear auto_tagged on manual tag
- `src/components/imports/import-preview.tsx` - Auto-tag indicator badge

---

## Recent Updates (2025-12-21)

### Phase 9 Polish: 'use server' Export Fix ✅
Fixed critical runtime error "A 'use server' file can only export async functions, found object":

**Problem**: Next.js 15/16 enforces strict rules that 'use server' files can only export async functions. The file `src/lib/auth/authorize.ts` was exporting:
- `AuthorizationResult` interface (invalid)
- `ACTION_ROLES` const object (invalid)

**Solution**:
1. Created `src/lib/auth/action-roles.ts` - new file containing interface and const (no 'use server')
2. Updated `src/lib/auth/authorize.ts` - removed exports, only exports `authorizeAction` function
3. Updated 9 consumer files to import `ACTION_ROLES` from new location

**Files Modified:**
- `src/lib/auth/action-roles.ts` (NEW)
- `src/lib/auth/authorize.ts`
- `src/actions/residents/update-resident.ts`
- `src/actions/residents/delete-resident.ts`
- `src/actions/reference/update-street.ts`
- `src/actions/reference/update-house-type.ts`
- `src/actions/reference/delete-street.ts`
- `src/actions/houses/update-house.ts`
- `src/actions/houses/delete-house.ts`
- `src/actions/payments/update-payment.ts`
- `src/actions/payments/delete-payment.ts`

### Phase 9 Polish Verification ✅
Verified all Phase 9 items were already implemented:
- Error boundaries: All 4 files exist and are properly implemented
- Table skeleton loaders: houses-table, residents-table, security-contacts-table all have Skeleton states
- Page loading states: dashboard, security, billing pages have skeleton loaders
- Toast notifications: payment-form uses toast.error for error handling

---

## Recent Updates (2025-12-20)

### Security Contacts: Expired Visibility Controls ✅
Enhanced visibility controls for expired security contacts:

- Added `getExpiredContactCount()` and `getExpiringContactCount()` server actions
- Added `useExpiredContactCount()` and `useExpiringContactCount()` hooks
- Security dashboard now shows 6 stat cards: Active, Expiring Soon, Expired, Check-ins, Currently Inside, Flagged
- Added "Show Expired" toggle button with badge count
- Expired rows have: red left border, reduced opacity, strikethrough on name
- Expired badge shows "Xd ago" with tooltip showing exact date
- By default, expired contacts are hidden; toggle shows only expired

**Files Modified:**
- `src/actions/security/contacts.ts` - Added expired/expiring count functions
- `src/hooks/use-security.ts` - Added count hooks
- `src/components/security/security-contacts-table.tsx` - Enhanced filtering and styling
- `src/app/(dashboard)/security/page.tsx` - Added new stat cards

### Bank Statement Import: Visual Polish & Workflow Separation ✅
Comprehensive enhancement of import flow with credit/debit differentiation:

- Added transaction type filter toggle (All/Credits/Debits) with counts
- Summary stats now show CR/DR breakdown with colored cards
- Table rows have colored left border (green=credit, red=debit)
- Added `transactionCounts` computed values for filtering
- Enhanced summary cards with icons and border colors

**Files Modified:**
- `src/components/imports/import-preview.tsx` - Transaction type filter, enhanced stats

### Bank Statement Import: Expense Breakdown Enhancements ✅
Added export functionality, interactive charts, and additional metrics:

- Added "Export CSV" button for breakdown data
- Added interactive horizontal bar chart with hover effects
- Added tooltips showing tag details on hover
- Added average transaction metrics per type
- Added top credit/debit category cards
- Added clickable tag cards for drill-down (optional callback)
- Enhanced tag cards show average amount per category

**Files Modified:**
- `src/components/imports/import-breakdown.tsx` - Full enhancement

### Cloud Supabase Configuration Update ✅
Updated CLAUDE.md to reflect cloud-only Supabase usage:

- Removed local Supabase CLI references
- Updated Development Workflow section
- Updated MCP vs CLI guidance
- Updated environment variables section

**Files Modified:**
- `CLAUDE.md` - Updated Supabase configuration guidance
