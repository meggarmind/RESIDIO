# TODO.md - Residio Project Status

**Last Updated:** 2025-12-10 (Phase 5.4 Complete)

## Current Phase: Phase 5 ✅ COMPLETE

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

## Phase 6: Security Contact List
- [ ] Create security_contacts table migration
- [ ] Build security contacts management UI
- [ ] Implement access code generation
- [ ] Create validity period management
- [ ] Build security contact list export

---

## Phase 7: External API (Security Barrier Integration)
- [ ] Create API route for access verification (`/api/v1/access/verify`)
- [ ] Implement API key authentication
- [ ] Add rate limiting
- [ ] Create API documentation
- [ ] Test with mock security barrier requests

---

## Phase 8: Audit Logging
- [ ] Create audit_logs table migration (immutable)
- [ ] Implement audit log triggers/functions
- [ ] Build audit log viewer UI
- [ ] Add filtering by actor, action, entity

---

## Phase 9: Polish & Deployment
- [ ] Add loading states and skeletons
- [ ] Implement error boundaries
- [ ] Add toast notifications for actions
- [ ] Configure Vercel deployment
- [ ] Set up cloud Supabase project
- [ ] Configure production environment variables
- [ ] Final testing and bug fixes

---

## Phase 10: Application Settings & Configuration
Centralized management for all system parameters.
- [ ] Create Settings Layout (`/settings/layout.tsx`) with tabbed navigation
- [ ] Move Reference Management (Streets/House Types) to `/settings/references`
- [ ] Improve References UI: Allow toggling items active/inactive
- [ ] Implement redirects from old `/admin/references` routes
- [ ] Add General Settings (Estate Name, Branding)
- [ ] Add Security Settings (Code validity, Contact limits) - *aligned with Phase 6*
- [ ] Add Payment Configuration (Categories, Late fees) - *aligned with Phase 5*
- [ ] Add API/Developer Settings (API Keys, Webhooks) - *aligned with Phase 7*
- [ ] Add System/Audit Settings (Log retention) - *aligned with Phase 8*

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
*No current issues*
