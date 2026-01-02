# TODO.md - Residio Project Status

**Last Updated:** 2026-01-02 (Admin Impersonation System & Phase 16 Complete)

## Current Phase: Phase 16 - Community Communication ✅ COMPLETE

### Recent Session Work (2026-01-02):

#### Admin Impersonation System (DEV-74, DEV-75, DEV-76) ✅
- **Core System**: Admins can view resident portal as any resident in read-only mode
  - `impersonation_sessions` table with RLS policies
  - Server actions: start/end/search impersonation
  - React Query hooks with sessionStorage persistence
  - ImpersonationBanner component (amber, fixed top)
  - ResidentImpersonationSelector modal
- **Approval Workflow**: Non-super admins require approval
  - `impersonation_enabled` column on profiles
  - Approval request/approve/deny flow
  - In-app notifications for approvers
- **Settings**: Configurable approval modes
  - Hierarchical settings: approval_mode, timeouts
  - Support for any_admin, specific_admins, permission_based

#### Phase 16: Community Communication ✅
- **Announcements System**: Full CRUD with scheduling
  - Database: 3 migrations (tables, permissions, categories)
  - Actions: create, update, delete, publish, get
  - Components: form, table, status badges
  - Admin page: /announcements
  - Portal page: /portal/announcements
- **Message Templates**: Reusable notification templates
- **In-App Notifications**: Complete notification center
- **Read Receipts**: Tracking with stats component
- **Emergency Broadcast**: Priority announcement system
- **Announcement Categories**: Settings page for management

### Recent Session Work (2025-12-31):

#### Bug Fixes & UX Enhancements ✅

- **Portal Logout Button**: Added Sign Out button to desktop sidebar (was only in mobile header)
- **Property Shortnames**: System-wide display of property shortnames (e.g., `PALM-10`)
  - Created `formatPropertyDisplay()` and `getPropertyShortname()` utilities in `src/lib/utils.ts`
  - Updated 8 components to display shortnames consistently:
    - `houses-table.tsx` - Added "Property ID" column with shortname badge
    - `linked-houses.tsx` - Updated dropdown and card displays
    - `property-hero-card.tsx` - Shortname as primary identifier
    - `property-carousel.tsx` - Uses shortname in cards
    - `portal/invoices/page.tsx` - Updated table and detail views
    - `payment-receipt.tsx` - Updated receipt display
    - `invoice-receipt.tsx` (PDF) - Updated property display
  - Updated `InvoiceWithDetails` type to include `short_name`
  - Updated `get-invoices.ts` queries to select `short_name`

#### RLS Security Fix ✅

- **Infinite Recursion Fix**: Fixed "infinite recursion detected in policy for relation 'resident_houses'"
  - Created `get_my_house_ids()` SECURITY DEFINER function to bypass RLS
  - Updated "Residents can view housemates house assignments" policy to use helper function
  - Migration: `fix_resident_houses_rls_recursion`

### Recent Session Work (2025-12-28):

#### Phase 15: Document Management ✅
- **Database Migration**: Created document_categories, documents, document_access_logs tables
- **Storage**: Configured Supabase Storage bucket (50MB limit, document MIME types only)
- **RLS Policies**: Secure access control with category-based resident visibility
- **Permissions**: Added 5 new RBAC permissions (view, upload, update, delete, manage_categories)
- **Server Actions**: 7 files - CRUD for documents and categories, signed URL generation
- **React Query Hooks**: Complete hook library for documents and categories
- **UI Components**: DocumentsTable, DocumentUploadForm, DocumentPreview, CategoryBadge
- **Admin Pages**: /documents (library), /documents/[id] (detail), /settings/document-categories
- **Resident Portal**: /portal/documents for resident document access
- **Version Control**: Full version history with parent document linking
- **Sidebar**: Added Documents to admin and portal navigation

#### Security Hardening ✅
- **XSS Prevention**: Fixed innerHTML vulnerability in payment print function
  - Uses sandboxed iframe with `cloneNode()` instead of innerHTML injection
- **Authorization Bypass**: Fixed receipt API to use RBAC permissions
  - Updated from legacy role check to `manage_payments`/`view_payments` permissions
- **CRON Authentication**: Created centralized timing-safe auth module
  - `src/lib/auth/cron-auth.ts` with `crypto.timingSafeEqual()`
  - Updated all 4 CRON endpoints to use `verifyCronAuth()`
- **Password Policy**: Implemented strong password requirements
  - 12+ characters, uppercase, lowercase, number, special character
  - Common password blocklist with real-time UI feedback
  - Created shared validator: `src/lib/validators/password.ts`

#### Week 2 Performance Optimizations ✅
- **React.memo**: Memoized table row components (ResidentRow, PaymentRow)
- **Badge Memoization**: Wrapped status badge components with `memo()`
- **useCallback**: Added memoized event handlers to table components
- **Auth Provider**: Parallelized role and permissions fetching

#### Week 1 Performance Optimizations ✅
- Created `get-resident-stats.ts` with parallel COUNT queries (~1000x faster)
- Parallelized `fetchMonthlyTrends()`, `fetchInvoiceDistribution()`, `fetchSecurityAlerts()`
- Optimized middleware permission queries (2 queries → 1 with nested select)
- Tuned React Query polling intervals (50% fewer server requests)

#### Portal & Self-Service Enhancements ✅
- Household member self-service for primary residents
- Responsive portal layout (mobile + desktop sidebar)
- Admin-resident cross-navigation
- Color-coded role badges

### Recent Session Work (2025-12-27):
- ✅ Completed Phase 13: Analytics Dashboard MVP
  - Installed Recharts v2.15.0 for interactive charts
  - Created `/analytics` route with RBAC (admin/chairman/financial_secretary only)
  - Implemented 6 interactive charts: Revenue Trend, Collection Rate, Occupancy Gauge, Payment Compliance, Payment Methods Pie, Category Breakdown
  - Added date range filtering with presets (This Month, Last Month, Last Quarter, YTD, Last Year, Custom)
  - URL-based state for shareable analytics links
  - Auto-refresh every 2 minutes via React Query
  - Full skeleton loading states and error handling
  - Mobile-responsive grid layout

### Recent Session Work (2025-12-23):
- ✅ Fixed sidebar navigation - Reports now shows both "Generate Reports" wizard and "Financial Overview" as children
- ✅ Fixed hydration error - nested `<button>` elements in AccountSelectionStep (changed to `<div role="button">`)
- ✅ Fixed "Maximum update depth exceeded" infinite loop on Select All in report wizard
  - Root cause: `watch()` returns new object refs, non-memoized handlers caused re-render cascade
  - Solution: Used `getValues()` in handlers, `useCallback` for memoization, `React.memo` for component

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

### Migration to NSMA ✅ (2025-12-27)
Migrated from Python inbox processor to NSMA (Notion Sync Manager):

| Aspect | Old (Python) | New (NSMA) |
|--------|--------------|------------|
| **Database ID** | `0f46cdeb58f64ee5b419a4dcd145752d` | `2d22bfe3-ea0c-8105-9ebe-f821673358c3` |
| **Directory** | Flat: `prompts/`, `deferred/`, `processed/` | Nested: `prompts/{pending,deferred,processed,archived}` |
| **Hook** | Python script | NSMA CLI (Node.js) |
| **Config** | `inbox_processor_config.json` | `.nsma-config.md` (7 phases, 17 modules) |
| **Dashboard** | None | http://localhost:3100 |

**New Workflow**:
- Prompts written to: `/home/feyijimiohioma/projects/Residio/prompts/pending/`
- After completion: `mv prompts/pending/<file> prompts/processed/`
- To defer: `mv prompts/pending/<file> prompts/deferred/`
- Manual sync: `node /home/feyijimiohioma/projects/Nsma/cli/index.js --project residio`

**Old processor preserved** at `/home/feyijimiohioma/mobile-first-notion-workflow/` for reference.

### Original Implementation (2025-12-19)
Enhanced the Notion inbox processor with:

1. **YAML Frontmatter with Notion Page ID**:
   - Prompts include `notion_page_id` and `notion_url` in frontmatter
   - Enables bidirectional sync back to Notion after task completion

2. **Module-to-File Mapping**:
   - Comprehensive mapping for modules (now auto-imported from `.nsma-config.md`)
   - Related files automatically included in prompts based on affected module

3. **Bidirectional Sync Workflow**:
   - CLAUDE.md updated with MCP commands for updating Notion status
   - Use `mcp__notion__notion-update-page` or NSMA dashboard

### SessionStart Hook (Updated 2025-12-27)
**Files**:
- `.claude/hooks/session-start.sh` - NSMA universal hook
- `.claude/settings.json` - Hook configuration

**Features**:
- Dynamic phase detection from TODO.md
- Prompt categorization (aligned vs decision-required)
- Deferred prompt re-check for phase alignment
- Inbox item notification (for unassigned items)

**Folder Structure** (NSMA):
```
prompts/
├── pending/     # Active prompts (auto-synced from Notion)
├── processed/   # Completed prompts
├── deferred/    # User chose to defer
└── archived/    # User chose to archive
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

## Phase 10: Flexible RBAC System ✅ COMPLETE
Transform hardcoded 4-role system to 7+ configurable roles:
- [x] Database migration for roles table with permissions (20251222000000_create_rbac_system.sql)
- [x] Define 7 system roles: Super Admin, Chairman, Financial Officer, Security Officer, Resident, and custom roles
- [x] EXCO/BOT organizational structure support (role categories)
- [x] Granular module-level permissions (42 permissions across 10 categories)
- [x] Role assignment restricted to residents only
- [x] Update middleware for dynamic role checking
- [x] Update auth context with hasPermission/hasAnyPermission helpers
- [x] Role management UI in settings (/settings/roles)
- [x] Audit logging for role changes
- [x] Fixed RLS infinite recursion with is_super_admin() SECURITY DEFINER function
- [x] Permission-based sidebar navigation (replaced hardcoded roles)
- [x] Nested navigation support (Imports under Payments)
- [x] Permission dialog with category grouping and bulk select

---

## Phase 11: Alert Management Module ✅ COMPLETE
Centralized notification system (Email-only for now, SMS/WhatsApp future-proofed):

### Phase 11.1: Database Foundation ✅
- [x] Create notification_templates table with variables JSON field
- [x] Create notification_schedules table for trigger rules
- [x] Create notification_queue table for pending notifications
- [x] Create notification_history table for sent notifications
- [x] Create notification_preferences table per resident
- [x] Create escalation_states table for escalation tracking
- [x] Add notification entity types to AuditEntityType

### Phase 11.2: Core Notification Library ✅
- [x] `src/lib/notifications/types.ts` - Channel-agnostic type definitions
- [x] `src/lib/notifications/templates.ts` - Template rendering with {{variable}} interpolation
- [x] `src/lib/notifications/deduplication.ts` - Composite key deduplication strategy
- [x] `src/lib/notifications/send.ts` - Channel dispatcher pattern (email implemented, SMS/WhatsApp stubs)
- [x] `src/lib/notifications/queue.ts` - Priority queue management
- [x] `src/lib/notifications/escalation.ts` - Escalation state machine
- [x] `src/lib/notifications/preferences.ts` - Per-resident notification preferences

### Phase 11.3: Server Actions ✅
- [x] Template CRUD actions (`src/actions/notifications/templates.ts`)
- [x] Schedule CRUD actions (`src/actions/notifications/schedules.ts`)
- [x] Queue management actions (`src/actions/notifications/queue.ts`)
- [x] History query actions (`src/actions/notifications/history.ts`)
- [x] Preference management actions (`src/actions/notifications/preferences.ts`)
- [x] High-level send actions (`src/actions/notifications/send.ts`)

### Phase 11.4: React Query Hooks ✅
- [x] Complete hook library in `src/hooks/use-notifications.ts`
- [x] Template hooks: useNotificationTemplates, useCreateTemplate, useUpdateTemplate, etc.
- [x] Schedule hooks: useNotificationSchedules, useCreateSchedule, etc.
- [x] Queue hooks: useNotificationQueue, useCancelNotification, useRetryNotification
- [x] History hooks: useNotificationHistory, useNotificationStats
- [x] Preference hooks: useResidentPreferences, useUpdateResidentPreference

### Phase 11.5: Admin UI - Templates & Schedules ✅
- [x] Notifications dashboard page (`/settings/notifications`)
- [x] Template list component with actions (edit, preview, duplicate, toggle, delete)
- [x] Template form with variable management UI
- [x] Schedule list component with trigger type display
- [x] Schedule form with trigger type configuration
- [x] Templates page (`/settings/notifications/templates`)
- [x] Schedules page (`/settings/notifications/schedules`)

### Phase 11.6: Notification History Viewer ✅
- [x] History page with tabs (`/settings/notifications/history`)
- [x] NotificationHistory component with filters (channel, status, search)
- [x] QueueViewer component for pending queue items
- [x] Detail dialogs for history entries and queue items
- [x] Pagination support for history

### Phase 11.7: Resident Preferences ✅
- [x] PreferencesForm component with per-category, per-channel toggles
- [x] Added Notifications tab to resident detail page
- [x] Email enabled by default, SMS/WhatsApp shown as "Coming soon"
- [x] Frequency settings (immediate, daily digest, weekly digest, none)
- [x] Pending changes pattern for batch saving

### Phase 11.8: Cron Job & Queue Processing ✅
- [x] Created `/api/cron/process-notifications` route
- [x] Updated `vercel.json` with 5-minute cron schedule
- [x] Queue processing with priority ordering
- [x] Daily purge of old sent/cancelled items (30-day retention)

### Phase 11.9: Migrate Existing Email Flows ✅
- [x] Updated `logEmail()` to also write to notification_history
- [x] Legacy emails now appear in unified notification history
- [x] Marked with `legacy_email: true` metadata for identification

### Key Implementation Notes:
- **Channel Dispatcher Pattern**: `send.ts` dispatches to channel-specific senders
- **Template Variables**: Handlebars-style `{{variable}}` interpolation
- **Deduplication Key**: `{channel}:{category}:{entity_type}:{entity_id}:{resident_id}`
- **Priority Queue**: 1=Urgent, 3=High, 5=Normal, 7=Low, 9=Bulk
- **Bridge Pattern**: Legacy emails write to both `email_logs` and `notification_history`
- **Future SMS/WhatsApp**: Just implement sender functions and update IMPLEMENTED_CHANNELS

---

## Phase 12: Resident View Portal ✅ COMPLETE
Self-service portal for residents:
- [x] Resident authentication (uses existing auth with resident_id check)
- [x] Read-only dashboard with property info (/portal - wallet balance, outstanding, properties)
- [x] View invoices and payment history (/portal/invoices - filter tabs, detail sheets)
- [x] Download payment receipts (PDF) - Uses @react-pdf/renderer with API route
- [x] Manage security contacts (add/edit/remove within limits) (/portal/security-contacts)
- [x] Notification preferences management (/portal/profile - email toggles)
- [x] Profile management (update contact info) (/portal/profile - read-only for now)
- [x] Mobile-responsive design (mobile-first layout with bottom nav)

---

## Phase 13: Dashboard & Analytics ✅ COMPLETE (2025-12-27)

### MVP Implementation (Core Charts)
- [x] Recharts library integration (v2.15.0)
- [x] Analytics types (`src/types/analytics.ts`)
- [x] Server action with parallel data fetching (`src/actions/analytics/get-analytics-data.ts`)
- [x] React Query hook with 2-minute auto-refresh (`src/hooks/use-analytics.ts`)
- [x] URL-based date range state (`src/hooks/use-date-range.ts`)
- [x] Date range filter with 5 presets + custom picker
- [x] KPI Summary Cards (revenue, net income, collection rate, occupancy)
- [x] Revenue Trend Line Chart (monthly revenue over time)
- [x] Collection Rate Area Chart (with 80% target reference line)
- [x] Occupancy Gauge (progress bar with stats)
- [x] Payment Compliance Card (on-time vs late stacked bar)
- [x] Payment Method Pie Chart (bank transfer, cash, wallet, etc.)
- [x] Category Breakdown Bar Chart (invoice amounts by billing profile)
- [x] RBAC: admin/chairman/financial_secretary only
- [x] Sidebar navigation link with BarChart3 icon
- [x] Full skeleton loading states
- [x] Mobile-responsive grid layout

### Key Files Created (14 new files)
- `src/types/analytics.ts` - TypeScript interfaces
- `src/actions/analytics/get-analytics-data.ts` - Server action
- `src/hooks/use-analytics.ts` - React Query hook
- `src/hooks/use-date-range.ts` - URL state management
- `src/components/analytics/date-range-filter.tsx`
- `src/components/analytics/analytics-header.tsx`
- `src/components/analytics/kpi-summary-cards.tsx`
- `src/components/analytics/revenue-trend-chart.tsx`
- `src/components/analytics/collection-rate-chart.tsx`
- `src/components/analytics/occupancy-gauge.tsx`
- `src/components/analytics/payment-compliance-card.tsx`
- `src/components/analytics/payment-method-breakdown.tsx`
- `src/components/analytics/category-breakdown-chart.tsx`
- `src/app/(dashboard)/analytics/page.tsx` - Server component with RBAC
- `src/app/(dashboard)/analytics/analytics-page-client.tsx` - Client dashboard

### Files Modified
- `src/components/dashboard/sidebar.tsx` - Added Analytics nav item
- `package.json` - Added recharts dependency

### Future Enhancements (Phase 13.2+)
- [ ] PDF export (using @react-pdf/renderer)
- [ ] Excel export (using xlsx library)
- [ ] Invoice aging reports
- [ ] Resident demographics
- [ ] YoY/MoM comparative analytics

---

## Phase 14: Performance & Security ✅ COMPLETE

### Week 1: Database Query Optimizations ✅
- [x] Residents page stats optimization (parallel COUNT queries)
- [x] Dashboard stats parallelization (Promise.all)
- [x] Middleware query consolidation (nested select)
- [x] React Query polling interval tuning

### Week 2: React Component Optimizations ✅
- [x] Auth provider query parallelization
- [x] React.memo for table row components
- [x] Badge component memoization
- [x] useCallback for event handlers

### Security Hardening ✅
- [x] XSS prevention (sandboxed iframe + cloneNode)
- [x] Authorization bypass fix (RBAC permissions)
- [x] CRON timing-safe authentication (crypto.timingSafeEqual)
- [x] Strong password requirements (12+ chars, complexity)

### Key Files Created
- `src/lib/auth/cron-auth.ts` - Centralized CRON authentication
- `src/lib/validators/password.ts` - Shared password validation
- `src/actions/residents/get-resident-stats.ts` - Optimized stats

---

## Phase 15: Document Management ✅ COMPLETE
Central document repository:
- [x] Documents database table with categories (document_categories, documents, document_access_logs)
- [x] File upload to Supabase Storage (50MB limit, PDF/DOCX/XLSX/TXT)
- [x] Document library UI with search/filter (list/grid view, category filter)
- [x] Resident document access (category-based access control)
- [x] Version control for policies (parent_document_id linking, version history)
- [x] Access control per document type (is_resident_accessible per category)
- [x] RBAC permissions (documents.view/upload/update/delete/manage_categories)
- [x] Signed URL generation for secure downloads
- [x] Admin pages (/documents, /documents/[id], /settings/document-categories)
- [x] Resident portal (/portal/documents)

---

## Phase 16: Community Communication ✅ COMPLETE
Enhanced communication tools:
- [x] Announcements database table
- [x] Community announcements/bulletin board
- [x] Scheduled announcements (future publish date)
- [x] Message templates library
- [x] In-app notification center
- [x] Read receipts tracking
- [x] Emergency broadcast system
- [x] Announcement categories

---

## Phase 17: Legacy App Migration
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

## Future Ideas / Backlog

Ideas for future phases (not yet scheduled):

### Admin-Created Theme System
Full-fledged theme system supporting multiple admin-created themes:
- [ ] Database table for themes (name, colors, typography, spacing config)
- [ ] Theme editor UI for admins (color pickers, live preview)
- [ ] Theme assignment (estate-wide default, user preference)
- [ ] Export/import themes as JSON
- [ ] Built-in theme presets (light, dark, high contrast, etc.)
- [ ] CSS variable injection from database-stored themes
- [ ] Theme scheduling (seasonal themes, events)

> **Context**: Current layout theme system (compact/expanded) provides the foundation.
> This extends it to full visual theming with admin control over colors, fonts, etc.

---

## Phase 17: UI Enhancement & Polish ✅ COMPLETE
Comprehensive UI/UX improvements:

### 17.1 Dark Mode Activation ✅
- [x] Add ThemeProvider to providers.tsx (next-themes)
- [x] Update layout.tsx with suppressHydrationWarning
- [x] Create theme-switcher.tsx component (Sun/Moon/Monitor icons)
- [x] Add theme switcher to sidebar footer (desktop)
- [x] Add compact theme switcher to header (mobile)

### 17.2 Semantic Colors System ✅
- [x] Add success/warning/info CSS variables (oklch, light + dark modes)
- [x] Add semantic variants to Badge component (success, warning, info)
- [x] Add semantic variants to Alert component (success, warning, info)

### 17.3 Loading & Feedback Polish ✅
- [x] Create skeleton variants (SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonTableRow)
- [x] Enhance Sonner toast styling with semantic colors
- [x] Add toast icons for success/error/warning/info

### 17.4 Component Refinements ✅
- [x] Add isLoading prop to Button with spinner and preserved width
- [x] Add loadingText prop for custom loading messages
- [x] Add interactive prop to Card for hover lift effect
- [x] Add button press feedback (scale animation)

### 17.5 Micro-interactions & Polish ✅
- [x] Add shake animation keyframe (for form errors)
- [x] Add fade-in-up animation keyframe
- [x] Add scale-in animation keyframe
- [x] Add card-interactive and table-row-interactive utility classes

### Key Implementation Notes:
- Theme switcher uses next-themes with attribute="class" for Tailwind dark mode
- Semantic colors use oklch color space for perceptual uniformity
- Button isLoading auto-disables and shows spinner while preserving children text
- All new components follow existing shadcn/ui patterns

### Files Modified:
- `src/components/providers.tsx` - ThemeProvider wrapper
- `src/app/layout.tsx` - suppressHydrationWarning
- `src/components/ui/theme-switcher.tsx` - NEW
- `src/components/dashboard/sidebar.tsx` - Theme switcher added
- `src/components/dashboard/header.tsx` - Mobile theme switcher
- `src/app/globals.css` - Semantic colors + animations
- `src/components/ui/badge.tsx` - success/warning/info variants
- `src/components/ui/alert.tsx` - success/warning/info variants
- `src/components/ui/skeleton.tsx` - New skeleton variants
- `src/components/ui/sonner.tsx` - Enhanced toast styling
- `src/components/ui/button.tsx` - isLoading prop + press feedback
- `src/components/ui/card.tsx` - interactive prop

---

## Phase 19: Deployment & Production
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

## Phase 20: External API - Security Barrier Integration
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

## Phase 21: WhatsApp Integration
WhatsApp Business API:
- [ ] WhatsApp Business account setup
- [ ] Message templates approval (Meta requirement)
- [ ] Opt-out by default (regulatory compliance)
- [ ] Two-way messaging support
- [ ] Media message support
- [ ] Integration with Alert Management module

---

## Phase 22: SMS Integration
SMS notification channel:
- [ ] SMS gateway integration (Termii, Africa's Talking, or similar)
- [ ] Opt-in/opt-out management
- [ ] SMS templates
- [ ] Delivery tracking
- [ ] Cost tracking per message
- [ ] Integration with Alert Management module

---

## Phase 23: Mobile Application
Native mobile experience:
- [ ] React Native or Flutter app setup
- [ ] Push notifications
- [ ] Offline capability
- [ ] Biometric authentication
- [ ] QR code scanning for access verification
- [ ] Resident portal features (mobile-optimized)

---

## DEFERRED PHASES (Phase 26+)

---

## Phase 26: Payment Gateway Integration
Online payment processing:
- [ ] Paystack/Flutterwave integration
- [ ] Online invoice payment
- [ ] Payment confirmation automation
- [ ] Wallet top-up online
- [ ] Transaction reconciliation
- [ ] Payment webhook handlers

---

## Phase 27: Advanced Billing Features
Enhanced billing capabilities:
- [ ] Recurring payment scheduling
- [ ] Early payment discounts
- [ ] Payment plans for delinquent accounts
- [ ] Utility metering (water/electric sub-metering)
- [ ] Surcharge rules engine
- [ ] Multi-currency support (optional)

---

## Phase 28: Violation & Compliance Tracking
Rule enforcement system:
- [ ] Violation categories and rules database
- [ ] Violation reporting and tracking
- [ ] Warning/fine escalation workflow
- [ ] Violation history per resident
- [ ] Appeal process
- [ ] Compliance reports

---

## Phase 29: Committee & Meeting Management
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

## Recent Updates (2025-12-22)

### Phase 17: UI Enhancement & Polish ✅ COMPLETE
Comprehensive UI/UX overhaul implementing dark mode, semantic colors, and micro-interactions:

**Dark Mode Implementation:**
- Added `ThemeProvider` from next-themes wrapping the app
- Created `ThemeSwitcher` component with Light/Dark/System options
- Theme toggle appears in sidebar footer (desktop) and header (mobile)
- All existing dark mode CSS is now accessible via theme switcher

**Semantic Colors (oklch):**
- Added success (green), warning (amber), info (blue) color variables
- Both light and dark mode variants using oklch color space
- New Badge variants: `success`, `warning`, `info`
- New Alert variants: `success`, `warning`, `info`
- Toast notifications styled with semantic colors and icons

**Enhanced Components:**
- `Button`: Added `isLoading` prop with spinner, `loadingText` prop, press feedback animation
- `Card`: Added `interactive` prop for hover lift effect
- `Skeleton`: Added SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonTableRow variants

**Micro-interactions:**
- Shake animation for form errors
- Fade-in-up and scale-in animations
- Card hover lift effect utility class
- Table row hover effect utility class

**Files Created:**
- `src/components/ui/theme-switcher.tsx`

**Files Modified (11):**
- `src/components/providers.tsx`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/dashboard/sidebar.tsx`
- `src/components/dashboard/header.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/sonner.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`

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

---

## Recent Updates (2025-12-27)

### Phase 12 Completion: PDF Receipt Downloads ✅
Implemented PDF receipt generation for the resident portal:

**Package Added:**
- `@react-pdf/renderer` - Server-side PDF generation from React components

**Files Created:**
- `src/lib/pdf/invoice-receipt.tsx` - PDF template component with styled receipt layout
- `src/app/api/receipts/[id]/route.ts` - API route for authenticated PDF generation

**Files Modified:**
- `src/app/(resident)/portal/invoices/page.tsx` - Enabled download button with loading state

**Key Features:**
- Professional receipt layout with estate branding
- Displays invoice items, amounts, and payment status
- Authorization check: residents can only download their own receipts
- Admin/chairman/financial_secretary can download any receipt
- Loading state with spinner during PDF generation
- Toast notifications for success/error feedback

**Technical Notes:**
- Uses `renderToBuffer()` for server-side PDF generation
- Converts Buffer to Uint8Array for NextResponse compatibility
- Filename derived from invoice number (e.g., `RCP-202312-0001.pdf`)
- Estate name fetched from system settings

### Portal & Self-Service Enhancements ✅ (2025-12-27 - Parallel Session)
Comprehensive portal improvements from development inbox prompts:

**Task 1: Currency Standardization** ✅ No changes needed
- Verified all 26 files use Nigerian Naira (₦) via `formatCurrency()` with NGN locale

**Task 2: Portal Dashboard Empty States** ✅
- Added empty state messaging when properties = 0 or contacts = 0
- Clear guidance to contact admin when no properties assigned

**Task 3: Admin-Resident Portal Cross-Navigation** ✅
- Admin sidebar: "View as Resident" link (visible when user has resident_id)
- Admin header dropdown: "Resident Portal" menu item
- Portal header/sidebar: "Admin Dashboard" link (visible when user has RESIDENTS_VIEW permission)

**Task 4: Color-Coded Role Badges** ✅
- Added `roleColors` mapping with distinct colors per role type
- Supports dark mode with appropriate color variants
- Roles: landlord (blue), non-resident landlord (purple), tenant (green), household member (gray), domestic staff (teal), contractor (amber), caretaker (indigo), co-resident (cyan), developer (rose)

**Task 5: Household Member Self-Service** ✅
- **Server Action**: `src/actions/residents/add-household-member.ts`
  - `addHouseholdMember()` - Create new secondary resident (household_member, domestic_staff, caretaker)
  - `getHouseholdMembers()` - Fetch household members for a house
  - `removeHouseholdMember()` - Soft delete (deactivate) household member
  - Security: Only primary residents (is_primary=true) can manage household
- **Form Component**: `src/components/resident-portal/household-member-form.tsx`
  - Dialog-based form with role selection
  - Relationship field for household members
  - React Hook Form + Zod validation
- **Profile Integration**: Added HouseholdMembersCard to profile page
  - Shows only when user is primary resident
  - List members with role badges and phone
  - Add/remove functionality with confirmation dialog

**Task 6: Responsive Portal Layout** ✅
- **Desktop Sidebar**: `src/components/resident-portal/portal-sidebar.tsx`
  - Fixed sidebar (256px) on md+ screens
  - Navigation items: Home, Payments, Security Contacts, Profile
  - Theme switcher in footer
  - Admin Dashboard link (permission-based)
- **Responsive Layout**: Updated `src/app/(resident)/layout.tsx`
  - Mobile: Header + bottom nav (existing)
  - Desktop: Sidebar + expanded content area (new)
  - Content area: max-w-lg mobile → max-w-4xl tablet → max-w-6xl desktop
- **Responsive Grids**: Portal dashboard uses `md:grid-cols-2/3/4` patterns

**Task 7: Complete Portal Features** ✅
- Covered by Tasks 2-6 above

**Type Updates:**
- Added `is_primary` to `resident_houses` type in `src/types/database.ts`

**Files Created (3):**
- `src/actions/residents/add-household-member.ts`
- `src/components/resident-portal/household-member-form.tsx`
- `src/components/resident-portal/portal-sidebar.tsx`

**Files Modified (9):**
- `src/app/(resident)/portal/page.tsx` - Empty states, responsive grids
- `src/app/(resident)/portal/profile/page.tsx` - Household management, role colors
- `src/app/(resident)/layout.tsx` - Responsive layout with sidebar
- `src/components/dashboard/sidebar.tsx` - "View as Resident" link
- `src/components/dashboard/header.tsx` - "Resident Portal" dropdown item
- `src/components/resident-portal/portal-header.tsx` - Admin Dashboard link
- `src/components/resident-portal/portal-sidebar.tsx` - Admin Dashboard link
- `src/types/database.ts` - Added is_primary to resident_houses

---

## Recent Updates (2025-12-28)

### Portal Desktop Layout Enhancements ✅
Implemented 7 desktop-optimized layouts for the resident portal:

**Foundation Components Created:**
- `src/hooks/use-media-query.ts` - Viewport detection with `useIsDesktop`, `useIsMobile`, `useMediaQuery`
- `src/components/ui/responsive-sheet.tsx` - Auto-switching Sheet/Drawer/Modal based on viewport
  - Mobile: Bottom sheet (existing behavior)
  - Desktop: Right-side drawer OR centered dialog (per variant prop)
  - Variants: `drawer` (detail views), `modal` (forms), `sheet` (always bottom)

**Pages Enhanced:**

| Page | Enhancement |
|------|-------------|
| **Invoices** (`portal/invoices`) | Desktop table with sortable columns; invoice detail in right-side drawer |
| **Security Contacts** (`portal/security-contacts`) | 2-3 column card grid; hover actions; ResponsiveSheet modals for forms |
| **Documents** (`portal/documents`) | Desktop table with file type icons (color-coded); category badges; hover actions |
| **Profile** (`portal/profile`) | Two-column layout (1/3 identity + 2/3 content); grid-based cards for properties/notifications |

**Key Patterns Applied:**
- **Conditional rendering**: `isDesktop ? <Table/> : <CardList/>`
- **Hover-reveal actions**: `opacity-0 group-hover:opacity-100 transition-opacity`
- **Grid layouts within cards**: Properties, household members, notifications use grid on desktop
- **ResponsiveSheet variants**: `drawer` for detail views, `modal` for form dialogs

**Files Created (2):**
- `src/hooks/use-media-query.ts`
- `src/components/ui/responsive-sheet.tsx`

**Files Modified (4):**
- `src/app/(resident)/portal/invoices/page.tsx` - Desktop table + ResponsiveSheet drawer
- `src/app/(resident)/portal/security-contacts/page.tsx` - Grid layout + ResponsiveSheet modals
- `src/app/(resident)/portal/documents/page.tsx` - Desktop table with file icons
- `src/app/(resident)/portal/profile/page.tsx` - Two-column layout + ResponsiveSheet drawer

**Prompts Processed (7):**
All moved to `prompts/processed/`:
- `20251228_portal_&_self-service_global_sheet_modal_desktop_variants.md`
- `20251228_portal_&_self-service_payments_page_desktop_list_layout.md`
- `20251228_portal_&_self-service_invoice_detail_desktop_drawer_layout.md`
- `20251228_portal_&_self-service_security_contacts_desktop_grid_layout.md`
- `20251228_portal_&_self-service_security_contact_form_desktop_modal.md`
- `20251228_portal_&_self-service_documents_page_desktop_file_browser.md`
- `20251228_portal_&_self-service_profile_page_desktop_two_column_layout.md`
