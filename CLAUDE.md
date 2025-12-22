# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Residio is a residential estate access management web application. It automates resident access control by managing payment status, security contact lists, and providing APIs for external systems (e.g., security barriers).

**Current Status**: See `TODO.md` for current phase (dynamically tracked)

## Development Inbox Workflow

This project uses a Notion-based mobile inbox for capturing development tasks. Claude Code processes these **automatically via SessionStart hook**.

### Automatic Session Start (Hook-Based)

A **SessionStart hook** runs automatically at every Claude Code session start. It:
1. Runs Notion sync to fetch new tasks from mobile inbox
2. Analyzes all prompts in `/prompts/` folder
3. Categorizes prompts by phase alignment
4. Displays summary to user

**Hook location**: `.claude/hooks/session-start.sh`
**Hook config**: `.claude/settings.json`

You do NOT need to manually run sync - it happens automatically.

### Manual Sync (if needed)

```bash
cd /home/feyijimiohioma/mobile-first-notion-workflow && source .env && python3 residio_inbox_processor.py
```

Or type `sync_dev_inbox` to trigger manual sync.

### Workflow Triggers

| Trigger | When | Automatic? |
|---------|------|------------|
| **SessionStart** | Every Claude Code session start | Yes (hook) |
| **Manual** | User types `sync_dev_inbox` | Manual |
| **Resume** | `resume_session` command | Yes (hook) |

### Session Start Procedure

The SessionStart hook displays a summary. After that, Claude should:

1. **Read each prompt in `/prompts/`** folder
2. **Categorize by alignment** (see Prompt Processing Behavior below)
3. **Process ALL prompts** - do not skip any silently

4. **Complete Task & Update Notion (Bidirectional Sync)**:
   After successfully completing a prompt task:

   a. **Extract Notion page ID from YAML frontmatter**:
      ```yaml
      ---
      notion_page_id: 2ca2bfe3ea0c80c68727cbda365dfcd3
      notion_url: https://www.notion.so/...
      ---
      ```

   b. **Update Notion status using direct API utility** (preferred when MCP unavailable):
      ```bash
      cd /home/feyijimiohioma/mobile-first-notion-workflow && source .env && \
      python3 update_notion_prompt.py "/home/feyijimiohioma/projects/Residio/prompts/<filename>.md" "Done" "Completed by Claude Code on [date]"
      ```

      **Alternative: Update Notion status using MCP** (if available):
      ```
      mcp__notion__notion-update-page
      data:
        page_id: [notion_page_id from frontmatter]
        command: update_properties
        properties:
          Status: Done
          Processed Date: [today's date YYYY-MM-DD]
          Analysis Notes: "Completed by Claude Code on [date]. [brief summary of what was done]"
      ```

   c. **Move file to processed folder**:
      ```bash
      mv prompts/<filename> processed/<filename>
      ```

### Prompt File Format

Prompts now include YAML frontmatter with:
- `notion_page_id`: For updating Notion after completion
- `notion_url`: Link back to original Notion item
- Related files section based on affected module
- Explicit completion actions

### Prompt Processing Behavior

**IMPORTANT: Process ALL prompts** - do not skip based on phase alone.

**Phase-Aligned (auto-execute):**
- Matches current phase (as defined in TODO.md)
- Type: Bug Fix, Documentation, Security Fix, or Technical Debt
- Phase: Backlog

Action: Add to task list and execute.

**Non-Aligned (user decision required):**
- Different phase than current (e.g., Phase 3, Phase 6)
- Not a universally-executable type

Action: Present user with THREE options using `AskUserQuestion`:

| Option | Description | File Action | Notion Status |
|--------|-------------|-------------|---------------|
| **Defer** | Save for later phase | `mv prompts/X deferred/X` | "Deferred" |
| **Execute anyway** | Override phase restriction | Process normally | (per completion) |
| **Archive** | Skip permanently | `mv prompts/X archived/X` | "Archived" |

### Deferring a Prompt

When user chooses "Defer":

1. **Update Notion status using direct API utility** (preferred):
   ```bash
   cd /home/feyijimiohioma/mobile-first-notion-workflow && source .env && \
   python3 update_notion_prompt.py "/home/feyijimiohioma/projects/Residio/prompts/<filename>.md" "Deferred" "Deferred to [target phase] by user on [date]"
   ```

   **Alternative (MCP)**:
   ```
   mcp__notion__notion-update-page
   data:
     page_id: [notion_page_id from frontmatter]
     command: update_properties
     properties:
       Status: Deferred
       Analysis Notes: "Deferred to [target phase] by user on [date]"
   ```

2. **Move file**:
   ```bash
   mv prompts/<filename> deferred/<filename>
   ```

**Re-check behavior**: Deferred prompts are automatically re-checked at every session start. If the current phase (from TODO.md) matches the prompt's phase, it will be flagged as `[NOW ALIGNED]` with a suggestion to move it back to `prompts/`.

### Archiving a Prompt

When user chooses "Archive":

1. **Update Notion status using direct API utility** (preferred):
   ```bash
   cd /home/feyijimiohioma/mobile-first-notion-workflow && source .env && \
   python3 update_notion_prompt.py "/home/feyijimiohioma/projects/Residio/prompts/<filename>.md" "Archived" "Archived by user on [date]. Reason: [if provided]"
   ```

   **Alternative (MCP)**:
   ```
   mcp__notion__notion-update-page
   data:
     page_id: [notion_page_id from frontmatter]
     command: update_properties
     properties:
       Status: Archived
       Analysis Notes: "Archived by user on [date]. Reason: [if provided]"
   ```

2. **Move file**:
   ```bash
   mv prompts/<filename> archived/<filename>
   ```

### Folder Structure

```
residio/
├── prompts/          # Pending prompts (auto-populated from Notion)
│   └── *.md          # Auto-generated prompt files
├── processed/        # Successfully completed prompts
│   └── *.md          # Moved here after task completion
├── deferred/         # Prompts deferred to later phase
│   └── *.md          # Moved here when user chooses "Defer"
├── archived/         # Permanently skipped prompts
│   └── *.md          # Moved here when user chooses "Archive"
└── .claude/
    ├── settings.json      # Hook configuration
    └── hooks/
        └── session-start.sh  # SessionStart hook script
```

## Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint

# Testing
npm run test             # Run Vitest tests
npm run test:ui          # Vitest with UI

# Database (Cloud Supabase via MCP)
# This project uses CLOUD Supabase - always use MCP tools for database operations
npm run db:types         # Generate TypeScript types from cloud schema
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

**IMPORTANT**: This project uses **CLOUD Supabase** exclusively. The MCP server is connected to the cloud instance. Always use `mcp__supabase__*` tools for database operations.

`NEXT_PUBLIC_ENV_MODE=cloud` is set in `.env` to use cloud credentials.

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
# Mode selector - ALWAYS use 'cloud' for this project
NEXT_PUBLIC_ENV_MODE=cloud

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
| Generate types | `mcp__supabase__generate_typescript_types` | `npm run db:types` |

**Note**: This project uses CLOUD Supabase. Do NOT use local Supabase CLI commands like `npx supabase start/stop/reset`.

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
   npm run dev  # Start Next.js dev server
   # Cloud Supabase is always available - no need to start local instance
   ```

2. **Database Changes** (via MCP):
   - Apply migrations: `mcp__supabase__apply_migration`
   - Run queries: `mcp__supabase__execute_sql`
   - Update types: `npm run db:types` or `mcp__supabase__generate_typescript_types`

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
1. **Session Start**: First, execute the Development Inbox Workflow (run Notion sync, check prompts folder, process prompts). Then run `date` command to confirm current date/time. Also revalidate last known state as there are concurrent Claude Code sessions
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
| `sync_dev_inbox` | Run Notion sync command, check prompts folder, process prompts per Development Inbox Workflow |
| `sync_up` | Execute sync-up procedure below |

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

**Sync-Up Procedure**:
When triggered by `sync_up`, perform the following:

1. **Update Internal Documentation**:
   - Update `TODO.md` with current state
   - Update `CLAUDE.md` if any new patterns/conventions were established
   - Run `date` to confirm current timestamp

2. **Git Commit & Push**:
   - Run `git status` to review changes
   - Run `git diff --stat` to summarize modifications
   - Stage all relevant changes: `git add .`
   - Create commit with descriptive message following format:

     ```text
     chore(sync): [brief description of session work]

     - [Key change 1]
     - [Key change 2]

     🤖 Generated with [Claude Code](https://claude.com/claude-code)

     Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
     ```

   - Push to remote: `git push`

3. **Evaluate Pending Work**:
   a. **Check `/prompts/` folder** for pending development tasks
   b. **Check `/deferred/` folder** for deferred tasks that may now be aligned
   c. **Read current phase from `TODO.md`** to understand project state
   d. **Identify next phase** from TODO.md roadmap

4. **Present Options to User**:
   Display a structured summary with recommendations:

   ```
   ═══════════════════════════════════════════════════════
   SYNC-UP COMPLETE
   ═══════════════════════════════════════════════════════
   📁 Git Status: [X files changed, pushed to origin/master]
   📅 Current Phase: Phase N - [Name] [STATUS]
   📋 Next Phase: Phase N+1 - [Name]

   PENDING WORK:
   ┌─────────────────────────────────────────────────────┐
   │ Prompts: X pending, Y deferred (Z now aligned)     │
   │ Backlog items: X                                    │
   └─────────────────────────────────────────────────────┘

   RECOMMENDED NEXT ACTIONS:
   (a) Continue current phase work [if incomplete]
   (b) Start next phase [if current complete]
   (c) Process aligned prompts [if any now aligned]
   (d) Review deferred items [if phase changed]
   (e) End session [if stopping work]

   What would you like to do?
   ═══════════════════════════════════════════════════════
   ```

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
