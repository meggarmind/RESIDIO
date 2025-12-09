# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Residio is a residential estate access management web application. It automates resident access control by managing payment status, security contact lists, and providing APIs for external systems (e.g., security barriers).

**Current Status**: Phase 5 (Payment Status Management) in progress

## Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint

# Testing
npm run test             # Run Vitest tests
npm run test:ui          # Vitest with UI

# Local Supabase (via Supabase CLI - requires Docker)
npm run supabase:start   # Start local Supabase (npx supabase start)
npm run supabase:stop    # Stop local Supabase
npm run supabase:reset   # Reset database (npx supabase db reset)
npm run supabase:status  # Show status and API keys

# Database
npm run db:migrate       # Push migrations to local DB
npm run db:types         # Generate TypeScript types from schema
```

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **UI**: Tailwind CSS v4 + shadcn/ui components
- **State**: TanStack React Query for server state
- **Forms**: React Hook Form + Zod validation
- **Toast**: Sonner for notifications
- **Icons**: Lucide React

## Architecture

### Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login)
│   ├── (dashboard)/       # Dashboard protected routes
│   │   ├── dashboard/     # Dashboard home
│   │   ├── houses/        # House management
│   │   ├── residents/     # Resident management
│   │   ├── payments/      # Payment records
│   │   ├── billing/       # Billing & invoices
│   │   ├── security/      # Security contacts
│   │   └── settings/      # Application settings
│   └── api/               # API routes
├── actions/               # Server actions (data layer)
│   ├── billing/          # Invoice generation, wallet
│   ├── dashboard/        # Dashboard stats
│   ├── houses/           # House CRUD
│   ├── payments/         # Payment CRUD
│   ├── reference/        # Streets, house types
│   └── residents/        # Resident CRUD
├── components/
│   ├── ui/               # shadcn/ui base components
│   ├── admin/            # Reference management
│   ├── billing/          # Billing forms
│   ├── dashboard/        # Sidebar, header, navigation
│   ├── houses/           # House table, form
│   ├── payments/         # Payment table, form, filters
│   └── residents/        # Resident table, form
├── hooks/                # React Query hooks
│   ├── use-billing.ts
│   ├── use-dashboard.ts
│   ├── use-houses.ts
│   ├── use-payments.ts
│   ├── use-reference.ts
│   └── use-residents.ts
├── lib/
│   ├── auth/             # Auth provider
│   ├── supabase/         # Supabase clients
│   ├── validators/       # Zod schemas
│   └── utils.ts          # Utility functions
└── types/
    ├── database.ts       # Database type definitions
    └── database.generated.ts  # Auto-generated from schema

supabase/
├── config.toml           # Supabase CLI config
├── migrations/           # SQL migration files
└── seed.sql             # Test user seed data
```

### Authentication & Authorization

**Middleware** (`src/middleware.ts`) protects routes based on user roles:
- Protected routes: `/dashboard`, `/residents`, `/payments`, `/security`, `/admin`
- Unauthenticated users → redirected to `/login`
- Authenticated users on `/login` → redirected to `/dashboard`

**User Roles** (defined in `src/types/database.ts`):
- `admin` - Full system access
- `chairman` - Resident, house, payment management
- `financial_secretary` - Resident, house, payment management
- `security_officer` - Read-only access to security contacts

**Route Access Control**:
```typescript
const routeRoleConfig = {
  '/admin': ['admin'],
  '/residents': ['admin', 'chairman', 'financial_secretary'],
  '/payments': ['admin', 'chairman', 'financial_secretary'],
  '/security': ['admin', 'chairman', 'security_officer'],
  '/dashboard': [], // All authenticated users
};
```

### Database Schema

**Core Entities**:
- `profiles` - User accounts with roles (linked to Supabase Auth)
- `streets` - Street reference data
- `house_types` - House type reference data (with billing profiles)
- `houses` - Properties in the estate
- `residents` - Community members
- `resident_houses` - Junction table (many-to-many)
- `payment_records` - Payment history
- `security_contacts` - Access codes with validity periods
- `audit_logs` - Immutable activity logs

**Key Features**:
- Resident codes: 6-digit numeric, auto-generated via trigger
- House occupancy: Auto-updated via trigger when residents assigned/removed
- Primary residence: One primary residence per resident enforced by trigger
- Emergency contacts: Can link to existing resident or manual entry
- Billing profiles: Attached to house types for invoice generation

### Data Layer Architecture

**Three-tier pattern** for all data operations:

1. **Server Actions** (`src/actions/`) - Server-side data mutations
   - Uses `createServerSupabaseClient()` from `src/lib/supabase/server.ts`
   - Performs authorization checks
   - Returns typed responses with error handling

2. **React Query Hooks** (`src/hooks/`) - Client-side data fetching
   - Uses `createClient()` from `src/lib/supabase/client.ts`
   - Provides caching, optimistic updates, and refetching
   - Example: `useResidents()`, `useCreateResident()`, `useUpdateResident()`

3. **UI Components** (`src/components/`) - Presentation layer
   - Consumes hooks for data
   - Uses shadcn/ui components
   - Form validation with Zod schemas

### Supabase Client Configuration

The app supports local and cloud Supabase via `NEXT_PUBLIC_ENV_MODE`:
- `local` - Uses `*_LOCAL` env vars (Supabase CLI on ports 54321-54327)
- `cloud` - Uses `*_CLOUD` env vars

**Three client types**:
- `createClient()` - Browser client for React Query hooks
- `createServerSupabaseClient()` - Server components/actions
- `createAdminClient()` - Elevated privileges, bypasses RLS (use sparingly)

Configuration: `src/lib/supabase/config.ts`

### Form Handling Pattern

All forms use React Hook Form + Zod validation:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Define schema
const schema = z.object({
  first_name: z.string().min(2),
  // ...
});

// Use in component
const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { ... },
});
```

Validators are located in `src/lib/validators/`.

### Important UI Patterns

**Select "All" Option**:
shadcn/ui Select doesn't allow empty string values. Use this pattern:
```typescript
const ALL_VALUE = '_all';
const [filter, setFilter] = useState<string>(ALL_VALUE);

// Convert to undefined for API
const params = {
  filter: filter === ALL_VALUE ? undefined : filter,
};

// In JSX
<SelectItem value={ALL_VALUE}>All Items</SelectItem>
```

**Status Badges**:
Use consistent badge components for status display:
- `status-badge.tsx` - Resident account/verification status
- `payment-status-badge.tsx` - Payment status

### Environment Variables

Required env vars (see `.env.example`):
```
# Mode selector
NEXT_PUBLIC_ENV_MODE=local  # or 'cloud'

# Local Supabase (from npx supabase status)
NEXT_PUBLIC_SUPABASE_URL_LOCAL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=...
SUPABASE_SERVICE_ROLE_KEY_LOCAL=...

# Cloud Supabase (from Supabase dashboard)
NEXT_PUBLIC_SUPABASE_URL_CLOUD=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD=...
SUPABASE_SERVICE_ROLE_KEY_CLOUD=...
```

## Conventions

### Path Aliases
`@/*` maps to `src/*` - use for all imports.

### Styling
- Use Tailwind classes and shadcn/ui components
- Theme uses CSS variables with oklch color space
- Dark mode handled automatically via `next-themes`
- Mobile-first responsive design

### Type Safety
- Database types defined in `src/types/database.ts`
- Auto-generated types via `npm run db:types` → `src/types/database.generated.ts`
- Always use typed responses from server actions
- Use convenience type aliases (e.g., `Resident`, `House`, `ResidentWithHouses`)

### Row-Level Security (RLS)
- All tables have RLS enabled
- Policies use `get_my_role()` SECURITY DEFINER function to avoid recursion
- Test users seeded with proper `auth.identities` records

## Development Workflow

1. **Session Start**:
   ```bash
   npm run supabase:start
   npm run dev
   ```

2. **Database Changes**:
   - Create migration: `npx supabase migration new <name>`
   - Apply migrations: `npm run db:migrate` or `npm run supabase:reset`
   - Update types: `npm run db:types`

3. **Adding Features**:
   - Create server action in `src/actions/`
   - Add React Query hook in `src/hooks/`
   - Create/update UI component
   - Update types if needed

4. **Testing**:
   - Login with test users (see seed.sql)
   - Verify role-based access
   - Test forms with validation

## Project Management

**Git Configuration**:
- Repository: https://github.com/meggarmind/RESIDIO
- User: meggarmind (feyijimiohioma@gmail.com)
- Do not include Claude Code references in commits

**Documentation**:
- `TODO.md` - Project status, phase tracking (update every 30 mins)
- `HANDOFF_SUMMARY.md` - Session handoff notes (update before session end)
- `README.md` - User-facing documentation (update hourly or at session end)

**Workflow Guidelines**:
- Run `date` command at session start to confirm current date/time
- Analyze problems and present options before making changes
- Ensure GitHub sync: check pushes every 10 mins if new files written
- Prompt to connect to GitHub every 30 mins if not connected (until user agrees/denies)

## Test Users

Test users seeded in `supabase/seed.sql`:

| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |
