# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Residio is a residential estate access management web application. It automates resident access control by managing payment status, security contact lists, and providing APIs for external systems (e.g., security barriers).

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

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router) with TypeScript
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **UI**: Tailwind CSS v4 + shadcn/ui components
- **State**: TanStack React Query for server state
- **Forms**: React Hook Form + Zod validation

### Key Directories
- `src/app/` - Next.js App Router pages and layouts
- `src/components/ui/` - shadcn/ui components (pre-installed)
- `src/components/[feature]/` - Feature-specific components
- `src/lib/supabase/` - Supabase client configuration (supports local/cloud switching)
- `src/types/database.ts` - Database type definitions
- `supabase/migrations/` - SQL migration files

### Authentication Flow
Middleware (`src/middleware.ts`) protects routes:
- Protected: `/dashboard`, `/residents`, `/payments`, `/security`
- Unauthenticated → redirected to `/login`
- Authenticated on `/login` → redirected to `/dashboard`

### User Roles
Defined in `src/types/database.ts`:
- `chairman`, `financial_secretary`, `security_officer`, `admin`

### Database Entities
- **profiles** - User accounts with roles
- **residents** - Community members (payment_status, security_access_enabled)
- **payment_records** - Payment history
- **security_contacts** - Access codes with validity periods
- **audit_logs** - Immutable activity logs

### Environment Switching
The app supports local and cloud Supabase via `NEXT_PUBLIC_ENV_MODE`:
- `local` - Uses `*_LOCAL` env vars (Supabase CLI on ports 54321-54327)
- `cloud` - Uses `*_CLOUD` env vars

Supabase CLI configuration: `supabase/config.toml`

## Conventions

### Path Aliases
`@/*` maps to `src/*` - use for all imports.

### Styling
Use Tailwind classes and shadcn/ui components. The theme uses CSS variables with oklch color space. Dark mode is handled automatically via `next-themes`.

### Forms
All user input should use React Hook Form with Zod schemas:
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
```

### Supabase Clients
- `createClient()` - Browser client (`src/lib/supabase/client.ts`)
- `createServerSupabaseClient()` - Server components/actions (`src/lib/supabase/server.ts`)
- `createAdminClient()` - Elevated privileges, bypasses RLS

### Other general info/guidance
- Always run the `date` command at the start of every session to confirm the current date and time
- Do not immediately start changing code when I explain a problem - instead analyze the problem and present me with options first
- Ensure the folder is synced to github. if already connected, check that push is been done once new files have been written in the last 10 mins. if not connected, prompt to connect every 30 mins until I agree or deny. Readme should be updated at the end of every session and/or hourly
- TODO.md should be updated at least once every 30 minutes with current state including any troubleshooting under way.
- HANDOFF_SUMMARY.md should be updated when I need to close the chat session or when context remaining before compression hits about 10%. 
- git user.name is meggarmind and git user.email "feyijimiohioma@gmail.com" git repo url is https://github.com/meggarmind/RESIDIO
- do not reference claude code in github commits (🤖 Generated with [Claude Code](https://claude.ai/code), Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")