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

### Audit Logging Integration

**IMPORTANT**: After completing any feature that creates, updates, or deletes data, integrate with the audit logging system.

**Documentation**: See `src/lib/audit/README.md` for full integration guide and examples.

**Quick Start**:
```typescript
import { logAudit } from '@/lib/audit/logger';

// After CREATE operations
await logAudit({
  action: 'CREATE',
  entityType: 'residents',  // Use appropriate AuditEntityType
  entityId: newRecord.id,
  entityDisplay: 'Human-readable name',
  newValues: newRecord,
});

// After UPDATE operations (track changes)
import { logAudit, getChangedValues } from '@/lib/audit/logger';

const changes = getChangedValues(oldRecord, updatedRecord);
await logAudit({
  action: 'UPDATE',
  entityType: 'houses',
  entityId: id,
  entityDisplay: house.house_number,
  oldValues: changes.old,
  newValues: changes.new,
});

// After DELETE operations
await logAudit({
  action: 'DELETE',
  entityType: 'invoices',
  entityId: deletedId,
  entityDisplay: invoice.invoice_number,
  oldValues: deletedRecord,
});
```

**Available Actions**: `CREATE`, `UPDATE`, `DELETE`, `VERIFY`, `APPROVE`, `REJECT`, `ASSIGN`, `UNASSIGN`, `ACTIVATE`, `DEACTIVATE`, `GENERATE`, `ALLOCATE`

**Available Entity Types**: `residents`, `houses`, `resident_houses`, `invoices`, `payments`, `billing_profiles`, `wallets`, `approval_requests`, `streets`, `house_types`, `security_contacts`, `profiles`

**Adding New Entity Types**: Update `AuditEntityType` in `src/types/database.ts` and add label in `AUDIT_ENTITY_LABELS`.

**Key Points**:
- Call `logAudit()` AFTER successful operations (not before)
- Audit logging is fail-safe - won't break main operations if logging fails
- Only admin/chairman can view audit logs at `/settings/audit-logs`

**Null Actor Handling**:
- Audit logs use `ON DELETE SET NULL` for `actor_id`, so deleted profiles don't break audit trail
- The `AuditLogWithActor` type has `actor` as nullable: `actor: {...} | null`
- Always use optional chaining when displaying actor details:
  ```typescript
  log.actor?.full_name || 'Unknown'
  log.actor?.email || 'N/A'
  ```
- UI displays "Unknown" for entries where the actor profile was deleted

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

**Currency Input Fields**:
All monetary input fields MUST use `CurrencyInput` (`src/components/ui/currency-input.tsx`):
- Formats with commas as user types (1000 → 1,000)
- Supports decimals up to 2 places (1234.56 → 1,234.56)
- Handles paste intelligently (strips ₦ symbols)
- Returns clean numeric value to form state
- Compatible with Zod `.number()` validation

Usage with React Hook Form:
```typescript
<FormField
    control={form.control}
    name="amount"
    render={({ field }) => (
        <FormItem>
            <FormLabel>Amount (₦)</FormLabel>
            <FormControl>
                <CurrencyInput
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="0.00"
                />
            </FormControl>
            <FormMessage />
        </FormItem>
    )}
/>
```

DO NOT use `<Input type="number" />` for currency fields - browsers don't allow comma formatting.

Currently implemented in:
- Payment Form (`/src/components/payments/payment-form.tsx`)
- Wallet Adjustment Dialog (`/src/components/residents/wallet-adjustment-dialog.tsx`)
- Billing Profile Form (`/src/components/billing/billing-profile-form.tsx`)

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

## Supabase MCP (Model Context Protocol)

**IMPORTANT**: Always use the Supabase MCP tools as the primary method for database operations before falling back to CLI commands or bash alternatives.

**Available MCP Tools**:
- `mcp__supabase__execute_sql` - Execute raw SQL queries (for DML operations)
- `mcp__supabase__apply_migration` - Apply DDL migrations with automatic versioning
- `mcp__supabase__list_tables` - List all tables in schemas
- `mcp__supabase__list_migrations` - List applied migrations
- `mcp__supabase__get_logs` - Get service logs (api, postgres, auth, etc.)
- `mcp__supabase__get_advisors` - Check security/performance issues
- `mcp__supabase__search_docs` - Search Supabase documentation via GraphQL
- `mcp__supabase__generate_typescript_types` - Generate TypeScript types from schema

**When to use MCP vs CLI**:
| Task | Use MCP | Use CLI |
|------|---------|---------|
| Apply migrations | `mcp__supabase__apply_migration` | - |
| Run SQL queries | `mcp__supabase__execute_sql` | - |
| Check logs | `mcp__supabase__get_logs` | - |
| Start/stop local Supabase | - | `npx supabase start/stop` |
| Reset database | - | `npx supabase db reset` |
| Generate types (local) | - | `npm run db:types` |

**Example - Applying a migration**:
```
mcp__supabase__apply_migration(
  name: "add_user_preferences",
  query: "CREATE TABLE user_preferences (...)"
)
```

## Development Workflow

1. **Session Start**:
   ```bash
   npm run supabase:start
   npm run dev
   ```

2. **Database Changes**:
   - Create migration: Use `mcp__supabase__apply_migration` (preferred) or `npx supabase migration new <name>`
   - Apply migrations: Use `mcp__supabase__apply_migration` (preferred) or `npm run db:migrate`
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
- User: `meggarmind`
- Email: `feyijimiohioma@gmail.com`
- Do not include Claude Code references in commits

**Documentation Updates**:
- `TODO.md` - Update at least every 30 minutes with current state, including any troubleshooting
- `HANDOFF_SUMMARY.md` - Update when:
  - User requests to close the session
  - Context remaining before compression hits ~10%
- `README.md` - Update hourly or at session end

**Session Workflow**:
1. **Session Start**: Always run `date` command first to confirm current date/time. Also revalidate last known state as there are concurrent Claude Code sessions
2. **Problem Analysis**: Do NOT immediately change code when user explains a problem - analyze first and present options
3. **GitHub Sync**:
   - If connected: Check that pushes are done within 10 mins of writing new files
   - If not connected: Prompt user to connect every 30 mins until they agree or deny

**Session Commands**:
When the user types any of these keyphrases, execute the associated action:

| Keyphrase | Action |
|-----------|--------|
| `pause_session` | Execute session handoff procedure below |
| `end_session` | Execute session handoff procedure below |
| `resume_session` | Read `NEXT_SESSION_HANDOFF_PROMPT.md` and follow its instructions as your prompt |

**Session Handoff Procedure**:
When triggered by the above keyphrases, perform the following:

1. Update `TODO.md` with current state and any troubleshooting in progress
2. Update `CLAUDE.md` if any new patterns or conventions were established
3. Update `HANDOFF_SUMMARY.md` with:
   - Overall goal for this session (what were we trying to accomplish?)
   - Key decisions made or approaches discussed/attempted
   - Specific code changes or edits made (brief descriptions, no large code blocks)
   - Current state of any in-progress tasks or unfinished code
   - Next steps or remaining tasks (primary focus when resuming)
4. Create/update `NEXT_SESSION_HANDOFF_PROMPT.md` with a complete prompt that provides 100% of the information necessary for the next Claude Code session to pick up exactly where we left off
5. Update Notion project review page using `mcp__notion__notion-update-page`:
   - Page ID: `2c92bfe3-ea0c-81df-b05f-ffcef90414fa`
   - URL: https://www.notion.so/2c92bfe3ea0c81dfb05fffcef90414fa
   - Update with current project status, completed phases, and in-progress work

The handoff must ensure a seamless transition to the next session.

**Phase Completion Git Push Workflow**:
At the end of each phase after all TODOs have been successfully implemented:

1. **Ask user for git push confirmation**:
   - "Phase X is complete. Would you like me to push to both master and origin?"
   - If user says YES → Execute git push with relevant commit message
   - If user says NO → Continue to next task

2. **Follow-up prompts**:
   - After each subsequent task completion, ask again if previous answer was NO
   - Example: "Task Y complete. Ready to push Phase X changes?"

3. **Auto-push after 30 minutes**:
   - If no positive confirmation received within 30 minutes of phase completion
   - Auto-push with commit message: "feat: Complete Phase X - [brief description]"
   - Notify user: "Auto-pushing Phase X changes after 30 min timeout"

4. **Commit message format**:
   ```
   feat: [Phase description]

   - [Key change 1]
   - [Key change 2]
   - [Key change 3]
   ```

## Test Users

Test users seeded in `supabase/seed.sql`:

| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |
