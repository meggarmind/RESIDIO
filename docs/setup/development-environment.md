# Development Environment

This guide covers setting up and working with the Residio development environment.

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** (included with Node.js)
- **Git** for version control
- **Supabase account** (cloud instance)

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) with TypeScript |
| **Database/Auth** | Supabase (PostgreSQL + Auth) |
| **UI** | Tailwind CSS v4 + shadcn/ui components |
| **State** | TanStack React Query for server state |
| **Forms** | React Hook Form + Zod validation |
| **Toast** | Sonner for notifications |
| **Icons** | Lucide React |

---

## Project Structure

```
residio/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (auth)/       # Auth pages (login)
│   │   ├── (dashboard)/  # Dashboard pages
│   │   │   ├── houses/   # House management
│   │   │   ├── residents/# Resident management
│   │   │   ├── payments/ # Payment records
│   │   │   ├── billing/  # Billing & invoices
│   │   │   ├── security/ # Security contacts
│   │   │   └── settings/ # Application settings
│   │   └── api/          # API routes
│   ├── actions/          # Server actions
│   │   ├── billing/      # Invoice generation, wallet
│   │   ├── dashboard/    # Dashboard stats
│   │   ├── houses/       # House CRUD
│   │   ├── payments/     # Payment CRUD
│   │   ├── reference/    # Streets, house types
│   │   ├── residents/    # Resident CRUD
│   │   ├── security/     # Security contacts
│   │   └── notifications/# Alert management
│   ├── components/
│   │   ├── ui/           # 18+ shadcn/ui components
│   │   ├── admin/        # Reference management
│   │   ├── billing/      # Billing forms
│   │   ├── dashboard/    # Sidebar, header
│   │   ├── houses/       # House table, form
│   │   ├── payments/     # Payment table, form
│   │   ├── residents/    # Resident table, form
│   │   └── security/     # Security contacts
│   ├── hooks/            # React Query hooks
│   ├── lib/
│   │   ├── auth/         # Auth provider
│   │   ├── audit/        # Audit logging
│   │   ├── notifications/# Notification system
│   │   ├── supabase/     # Supabase clients
│   │   └── validators/   # Zod schemas
│   └── types/            # TypeScript types
├── supabase/
│   ├── config.toml       # Supabase CLI config
│   ├── migrations/       # SQL migration files
│   └── seed.sql          # Test user seed data
├── docs/                 # Documentation
├── prompts/              # Pending development prompts
├── processed/            # Completed prompts
├── deferred/             # Deferred prompts
└── archived/             # Archived prompts
```

---

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

### Required Variables

```bash
# Mode selector - ALWAYS use 'cloud' for this project
NEXT_PUBLIC_ENV_MODE=cloud

# Cloud Supabase (from Supabase dashboard)
NEXT_PUBLIC_SUPABASE_URL_CLOUD=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY_CLOUD=eyJhbGciOiJIUzI1NiIs...

# Email (Resend)
RESEND_API_KEY=re_...
```

**Important**: This project uses **Cloud Supabase** exclusively. Do not use local Supabase CLI commands.

---

## Development Commands

```bash
# Start development server
npm run dev              # http://localhost:3000

# Production build
npm run build

# Linting
npm run lint

# Testing
npm run test             # Run Vitest tests
npm run test:ui          # Vitest with UI

# Database
npm run db:types         # Generate TypeScript types from cloud schema
```

---

## Development Workflow

### 1. Session Start

```bash
cd /home/feyijimiohioma/projects/Residio
npm run dev
# Cloud Supabase is always available - no need to start local instance
```

### 2. Database Changes (via MCP)

All database operations use Supabase MCP tools:
- Apply migrations: `mcp__supabase__apply_migration`
- Run queries: `mcp__supabase__execute_sql`
- Update types: `npm run db:types` or `mcp__supabase__generate_typescript_types`

### 3. Adding Features

1. Create server action in `src/actions/`
2. Add React Query hook in `src/hooks/`
3. Create/update UI component
4. Update types if needed
5. Integrate audit logging (see [Access Control](../security/access-control.md#audit-logging))

### 4. Testing

- Login with test users (see below)
- Verify role-based access
- Test forms with validation

---

## Test Users

Seeded in `supabase/seed.sql`:

| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |

---

## Coding Conventions

### Path Aliases

`@/*` maps to `src/*` - use for all imports:

```typescript
// Good
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

// Avoid
import { Button } from '../../components/ui/button';
```

### Styling

- Use Tailwind classes and shadcn/ui components
- Theme uses CSS variables with oklch color space
- Dark mode handled automatically via `next-themes`
- Mobile-first responsive design

```typescript
// Good - Tailwind + shadcn
<Button variant="default" className="w-full md:w-auto">
  Submit
</Button>

// Avoid - inline styles
<button style={{ width: '100%' }}>Submit</button>
```

### Type Safety

- Database types defined in `src/types/database.ts`
- Auto-generated types via `npm run db:types` → `src/types/database.generated.ts`
- Always use typed responses from server actions
- Use convenience type aliases:

```typescript
import type { Resident, House, ResidentWithHouses } from '@/types/database';
```

### Component Organization

- Use `'use client'` directive only when needed (hooks, event handlers)
- Prefer server components for data fetching
- Split complex components into smaller, focused ones

---

## Troubleshooting

### Types Out of Sync

If TypeScript errors appear after database changes:

```bash
npm run db:types
```

### Build Failures

Common issues:
- Missing `'use client'` directive on components using hooks
- Importing server-only code in client components
- Missing environment variables

### Authentication Issues

Ensure test users are properly seeded with `auth.identities` records. Check `supabase/seed.sql`.
