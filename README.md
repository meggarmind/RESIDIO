# Residio

Residential estate access management platform built with **Next.js 16 (App Router)**, **TypeScript**, and **Supabase (PostgreSQL)**. Designed for Owners and Property-holders Residents Estate Associations (OPREA) to manage residents, payments, billing, security contacts, expenses, and reporting from a single admin dashboard.

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) + TypeScript |
| **Database / Auth** | Supabase (Cloud PostgreSQL + Auth) |
| **UI** | Tailwind CSS v4 + shadcn/ui (New-York style) |
| **State** | TanStack React Query |
| **Forms** | React Hook Form + Zod validation |
| **Animations** | Framer Motion |
| **Email** | Resend + React Email templates |
| **PDF** | pdfjs-dist, qpdf (encrypted PDF decryption) |
| **Testing** | Vitest (unit/integration) + Playwright (e2e) |

## Quick Start

```bash
git clone https://github.com/meggarmind/RESIDIO.git
cd RESIDIO
npm install
```

### Environment Variables

Create a `.env.local` file with the following variables (see `docs/setup/development-environment.md` for full reference):

```bash
# Mode selector - always use 'cloud'
NEXT_PUBLIC_ENV_MODE=cloud

# Cloud Supabase credentials (from Supabase dashboard)
NEXT_PUBLIC_SUPABASE_URL_CLOUD=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD=your-anon-key
SUPABASE_SERVICE_ROLE_KEY_CLOUD=your-service-role-key

# Email (Resend)
RESEND_API_KEY=re_...
```

### Development

```bash
npm run dev              # Dev server at http://localhost:3000
npm run build            # Production build
npm run lint             # ESLint v9
npm test                 # Vitest (unit/integration tests)
npm run test:e2e         # Playwright (e2e tests)
```

### Additional Commands

```bash
npm run db:types         # Regenerate TypeScript types from cloud schema
npx tsx scripts/test-pdf-import.ts   # PDF import infrastructure test CLI
```

### Prerequisites

- **Node.js** 20+ (LTS recommended; tested on Node v24.7.0)
- **npm** (bundled with Node.js)
- **qpdf** CLI installed for encrypted PDF statement decryption
- A **Supabase** cloud project

## Architecture

```
RESIDIO/
├── src/
│   ├── app/              # App Router routes
│   │   ├── (auth)/       # Authentication pages (login, 2FA)
│   │   ├── (dashboard)/  # Admin dashboard pages
│   │   ├── (resident)/  # Resident portal (not scheduled for rollout)
│   │   └── api/          # API routes (cron, webhooks, search)
│   ├── actions/          # Server actions (grouped by domain)
│   ├── components/       # UI components (shadcn/ui + domain components)
│   ├── hooks/            # TanStack React Query hooks
│   ├── lib/              # Supabase clients, auth, audit, email, PDF, SMS
│   └── types/            # TypeScript types (database.generated.ts is auto-generated)
├── scripts/              # One-off test/utility scripts (not in build)
├── supabase/             # Migrations + seed data
├── docs/                 # Feature documentation, architecture, setup guides
└── e2e/                  # Playwright e2e test specs
```

## Key Features

- **Resident Management** — Track residents, properties, roles, and occupancy history
- **Payment & Billing** — Invoice generation, wallet system, payment recording, split payments
- **Bank Statement Import** — CSV, Excel, and PDF (First Bank Nigeria) parsing with duplicate detection
- **Email Import** — Gmail integration for automatic bank alert processing
- **Security Contacts** — Access codes, visitor management, check-in/out logging
- **Expense Tracking** — Petty cash management, expense ledger, automated reconciliation
- **Analytics Dashboard** — Revenue trends, collection rates, payment compliance
- **Financial Reports** — PDF report generation with multiple template styles and scheduling
- **Audit Logging** — Immutable activity trail for compliance
- **RBAC** — Granular permissions with configurable roles (admin, chairman, financial_secretary, etc.)

## Testing

- **Unit/Integration**: Vitest under `src/__tests__` — run with `npm test`
- **E2E**: Playwright specs under `e2e/` — run with `npm run test:e2e` (requires Cloud Supabase + seeded test users per `supabase/seed.sql`)
- **Test admin**: `admin@residio.test` / `password123` (super_admin role)

## Documentation

See [`docs/README.md`](docs/README.md) for the full documentation index, including:

- [Development Environment](docs/setup/development-environment.md) — Full setup, env vars, conventions
- [Supabase Integration](docs/api/supabase-integration.md) — Data layer patterns and MCP tools
- [Access Control](docs/security/access-control.md) — Auth, RBAC, RLS, audit logging
- [Database Schema](docs/architecture/database-schema.md) — Core entities and relationships

## Conventions

- **Path alias**: `@/*` maps to `src/*` — always import via `@/...`
- **Supabase is Cloud-only** — do not run local Supabase CLI commands
- **Server actions** must call `authorizePermission()` first and `logAudit()` after successful writes
- **Design system** — Follow `DESIGN_AGENTS.md` for OKLCH colors, shadcn New-York style, Lucide icons, and tactile micro-animations

## Repository

- **GitHub**: [meggarmind/RESIDIO](https://github.com/meggarmind/RESIDIO)
- **License**: Private