# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is the active instruction file for **Claude Code** sessions.

> **Setup, commands, stack, architecture, and design system are canonical in `AGENTS.md`** — it is the shared single source of truth used by both Claude Code and OpenCode. This `CLAUDE.md` holds only what is Claude-specific or additive (integration contract, MCP tools, session workflow). If something exists in both, `AGENTS.md` wins; don't duplicate.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `meggarmind/RESIDIO`, accessed via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Project board ("Jazrmann Dashboard")

RESIDIO issues also live on a GitHub Projects (v2) board with a `Status` field (Backlog → Ready → In progress → In review → Done). New issues are auto-added to it by `.github/workflows/add-issues-to-project.yml`, but nothing moves them across columns automatically — that's a standing instruction for Claude, not a background process. See `docs/agents/project-board.md` for the board/field/option IDs and the exact `gh project item-edit` commands.

Move an issue's Status at exactly these two points, without being asked:

1. When starting work on a `ready-for-agent`/`ready-for-human` issue → set Status to `In progress`.
2. When the issue (or its PR) is closed or merged → set Status to `Done`.

Don't set `In review` automatically, and don't move things back to Backlog/Ready on your own — those stay manual.

### Planning work → GitHub issues (`to-issues`)

The `to-issues` skill (`~/.claude/skills/to-issues`) has `disable-model-invocation: true`, so it will never trigger automatically off its description. This is a standing instruction that overrides that gate: whenever a plan, spec, or PRD for this project is finalized (e.g. after `superpowers:writing-plans`, `superpowers:brainstorming`, or any planning discussion converges on a concrete set of next steps), invoke the `to-issues` skill directly to break it into vertical-slice issues on the tracker described in `docs/agents/issue-tracker.md`. Do not just describe the plan back to the user and stop — file it.

### Admin guide drift

The wiki in `website/docs` is pinned to the app: each page declares the source globs it documents and the commit it was last verified against. `npm run docs:drift` reports pages whose sources have moved on; `npm run docs:verify -- <path>` re-stamps one after review. See `docs/agents/doc-drift.md`.

Standing instruction: when a change under `src/**` alters something a page describes — a renamed control, a new or removed setting, a changed rule or sequence of steps — update the page in the same piece of work and re-stamp it. Run `npm run docs:drift` before wrapping up any session that touched `src/**`. Never run `docs:verify -- --all` to clear a report you have not read.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

Shared coordination file: `SESSION_STATE.md` — read/update it at session start/end.

### Session roles (Rex / Quinn)

A standing two-role split across two sessions, for when work runs as coordinator + reviewer. See `docs/agents/session-roles.md` for the full definition; invoke the `session-roles` skill to activate it in a fresh session.

- **Rex** (coordinator) decomposes, dispatches sub-agents, consolidates and interprets — it does not implement, beyond trivia it discloses.
- **Quinn** (QA peer) reviews as a non-technical power user: functionality, boundaries, edge cases, unnecessary complexity, and whether Rex's assumptions hold.

While the roles are active, Rex's sub-agent defaults are **`haiku`, max 5**, overriding the general tier guidance in `## Delegating to sub-agents` below. Everything else there still binds — set `model` explicitly on every call, and never use `fable`.

### Commit hygiene

If a task touches multiple concerns, prefer splitting into smaller sequential commits.

## Delegating to sub-agents

Model tiers for ANY delegated work – Agent-tool calls and Workflow-script `agent()` calls alike. Set the `model` parameter explicitly on every call; never omit it (omission silently inherits the session model):

- `haiku` – mechanical bulk work: renames, boilerplate, format conversion, log triage
- `sonnet` – default for well-specified implementation with clear acceptance criteria
- `opus` – genuinely tricky work: concurrency, subtle algorithms, adversarial verify/judge panels, gnarly debugging
- `fable` – NEVER use. Not a valid tier; do not spawn Fable sub-agents under any circumstances, prompted or not.

When unsure between tiers, pick the cheaper and escalate on failure.

## Dynamic workflows (Workflow tool)

Applies to ALL sessions, any model. Dynamic workflows do not need to be avoided – reach for the Workflow tool when a task has 3+ independent parallelizable subtasks or would benefit from a pipeline/judge panel. Standing rule on opt-in: if ultracode is NOT on for the session (no "ultracode" keyword, toggle, or an orchestration request in my own words), check with me first – propose the workflow in one or two sentences with the rough shape and cost, and wait for my reply; my "yes" is the opt-in. If ultracode IS on, invoke directly.

**Agent models inside workflow scripts:** every `agent()` call MUST set the `model` parameter explicitly, chosen per "Delegating to sub-agents" above – `haiku`, `sonnet`, or `opus` only. `fable` is banned everywhere (see above), so it never appears as a workflow stage.

## Coordinating sub-agent work

Beyond model-tier selection (above), when a task is actually split across agents:

- **Split by independence, not by file.** Fan out to parallel agents or workflow stages only when subtasks don't depend on each other's output; sequence dependent steps instead of racing them.
- **Brief each fresh agent like a stranger.** A non-fork agent starts with zero context — the dispatch prompt must carry the specific files, line numbers, and acceptance criteria itself, never "based on the plan above." A `fork` inherits full context, so use it when the sub-task needs continuity (extending an investigation); use a fresh agent when independence from your own framing is the point (a second opinion, an adversarial review).
- **Verify before relaying.** Don't pass a sub-agent's summary straight through to me — check its claims against the actual diff or files, then report the verified result.

## Learning from feedback

Two mechanisms capture what I teach you during a session — different scopes, use both where they apply:

- **Memory** (the account-level memory system already in effect) — persistent, cross-session record of project facts and how I want this project run. Save a `feedback` memory whenever I correct your approach or confirm a non-obvious one worked; that's how you avoid re-litigating the same guidance next session.
- **`task-observer` skill** — session-scoped pattern-watching that can graduate a repeated correction or workflow into a documented, reusable skill. Invoke it at the start of any multi-step, tool-using task in this repo, per its own description.

Memory answers "what should I do differently next time"; `task-observer` answers "should this become a skill." A one-off preference belongs in memory only — don't reach for skill-writing on the first occurrence.

## Project Overview

Residio is a residential estate access management web application. It automates resident access control by managing payment status, security contact lists, and providing APIs for external systems (e.g., security barriers).

> **🎯 Product focus — READ FIRST:** All forward work is on the **Admin Dashboard**. Resident Portal / self-service (`src/app/(resident)/**`, `src/components/resident-portal/**`) is **NOT planned for rollout** in the foreseeable future. Do not invest in portal/self-service work (portal wallet, resident payments, announcements/documents/profile, impersonation UX, onboarding). Keep that code stable/local only, and always prioritize admin value. See `AGENTS.md` (the canonical source of this direction).

**Current Status**: See `TODO.md` for current phase (dynamically tracked)

---

## Documentation

For detailed technical information, see the `docs/` folder:

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Master index, project overview, quick start |
| [docs/architecture/database-schema.md](docs/architecture/database-schema.md) | Database entities, triggers, enums, relationships |
| [docs/api/supabase-integration.md](docs/api/supabase-integration.md) | Data layer patterns, MCP tools, form handling, UI patterns |
| [docs/setup/development-environment.md](docs/setup/development-environment.md) | Prerequisites, commands, environment variables, conventions |
| [docs/setup/project-management.md](docs/setup/project-management.md) | Git workflow, session commands, handoff procedures |
| [docs/security/access-control.md](docs/security/access-control.md) | Authentication, RBAC, RLS, audit logging |

---

### Validation Domains

| Domain | Focus Areas |
|--------|-------------|
| **Security** | RLS policies, auth checks, OWASP, secrets detection |
| **Code Quality** | TypeScript types, React patterns, tech debt |
| **Documentation** | JSDoc coverage, docs completeness |
| **Performance** | N+1 queries, memoization, caching |

### Severity Levels

| Level | Action Required | Examples |
|-------|-----------------|----------|
| **CRITICAL** | Immediate | RLS violations, exposed secrets |
| **HIGH** | Before release | Missing auth, N+1 queries |
| **MEDIUM** | Current phase | Code duplication, missing JSDoc |
| **LOW** | Backlog | Style issues, suggestions |

### Reports

Reports are generated in `docs/validation/validation-YYYYMMDD-HHMMSS.md` with:
- Executive summary
- Findings ranked by severity
- Action items (prioritized)
- Notion sync status

### Configuration Files

| File | Purpose |
|------|---------|
| `.claude/agents/qa-director.md` | Agent definition |
| `.claude/commands/qa-director-validate.md` | Slash command |
| `.claude/hooks/task-complete.sh` | Auto-trigger hook |
| `docs/validation/README.md` | System documentation |

---

## Quick Reference

### Commands
```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Run Vitest tests
npm run db:types         # Generate TypeScript types from cloud schema
```

### Session Commands
| Keyphrase | Action |
|-----------|--------|
| `pause_session` | Execute session handoff procedure |
| `end_session` | Execute session handoff procedure |
| `resume_session` | Read `SESSION_STATE.md`, then continue from its current snapshot and next steps |
| `sync_dev_inbox` | Run Notion sync, check prompts folder, process prompts |
| `sync_up` | Git commit & push, evaluate pending work |

See [docs/setup/project-management.md](docs/setup/project-management.md) for full session procedures.

### Test Users

| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | super_admin |

Note: Additional test accounts can be created via registration. The chairman role should be assigned to a real resident account.

### Key Patterns
- **Path aliases**: `@/*` maps to `src/*`
- **Database**: Cloud Supabase only, use MCP tools
- **Forms**: React Hook Form + Zod
- **State**: TanStack React Query

See [docs/api/supabase-integration.md](docs/api/supabase-integration.md) for detailed patterns.

---

## Supabase MCP

**IMPORTANT**: Always use the Supabase MCP tools for database operations.

| Tool | Purpose |
|------|---------|
| `mcp__supabase__execute_sql` | Execute raw SQL (DML) |
| `mcp__supabase__apply_migration` | Apply DDL migrations |
| `mcp__supabase__list_tables` | List tables |
| `mcp__supabase__get_logs` | Get service logs |
| `mcp__supabase__generate_typescript_types` | Generate types |

**Note**: This project uses CLOUD Supabase. Do NOT use local CLI commands.

---

## MCP Testing Tools

Two MCP servers provide AI-powered testing capabilities for this project:

### Playwright MCP (Browser Automation)

Browser automation for visual testing and E2E test execution.

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Navigate to URLs |
| `browser_snapshot` | Capture accessibility tree snapshot |
| `browser_click` | Click elements |
| `browser_fill` | Fill form inputs |
| `browser_hover` | Hover over elements |
| `browser_press_key` | Press keyboard keys |

**Usage Examples:**
```
"Navigate to http://localhost:3000 and take a snapshot"
"Click the login button and fill the email field with admin@residio.test"
"Take a snapshot of the dashboard after login"
```

### AI Testing MCP (Test Generation & Analysis)

AI-powered test generation, execution, and analysis.

| Tool | Purpose |
|------|---------|
| `analyze_codebase` | Scan project, identify testable components |
| `generate_unit_tests` | Create unit tests for functions/components |
| `generate_integration_tests` | Create API endpoint tests |
| `run_tests` | Execute tests with framework auto-detection |
| `analyze_test_results` | AI insights on test failures |
| `suggest_fixes` | Generate solutions for failing tests |
| `setup_testing_framework` | Initialize testing in new projects |

**Usage Examples:**
```
"Analyze the codebase and identify testable components"
"Generate unit tests for src/actions/residents/ using Vitest"
"Run all tests in the e2e/ directory and analyze any failures"
"Suggest fixes for these test failures: [paste output]"
```

### Existing Playwright Test Infrastructure

The project has existing Playwright E2E tests:

| Directory | Description |
|-----------|-------------|
| `e2e/` | Test spec files |
| `e2e/fixtures.ts` | Test utilities and login helpers |
| `playwright.config.ts` | Playwright configuration |

**Test Commands:**
```bash
npm run test:e2e          # Run tests headless
npm run test:e2e:ui       # Interactive UI mode
npm run test:e2e:headed   # Run with visible browser
```

### MCP Server Locations

| Server | Location |
|--------|----------|
| Playwright MCP | `npx @playwright/mcp@latest` (npm) |
| AI Testing MCP | `~/tools/mcp-servers/ai-testing-mcp/dist/index.js` |

---

## Module Integration Requirements

**CRITICAL**: All server actions that perform write operations (CREATE, UPDATE, DELETE) MUST integrate with:

1. **Roles & Permissions Module** - Authorization checks
2. **Audit Log Module** - Activity logging

### 1. Permission Integration

Every server action that modifies data must check permissions:

**Required Pattern:**

```typescript
'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export async function createSomething(input: Input) {
  // Step 1: Check permission FIRST
  const auth = await authorizePermission(PERMISSIONS.MODULE_CREATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Step 2: Perform the operation
  // ... database operations
}
```

**Adding New Permissions:**

1. Add constant to `src/lib/auth/action-roles.ts`:

   ```typescript
   // New Module (Phase X)
   NEW_MODULE_VIEW: 'new_module.view',
   NEW_MODULE_CREATE: 'new_module.create',
   NEW_MODULE_UPDATE: 'new_module.update',
   NEW_MODULE_DELETE: 'new_module.delete',
   ```

2. Create migration to add permission category enum:

   ```sql
   -- Migration: add_new_module_permission_category_enum
   ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'new_module';
   ```

3. Create migration to seed permissions and role assignments:

   ```sql
   -- Migration: add_new_module_permissions_data
   INSERT INTO app_permissions (name, display_name, description, category, is_active)
   VALUES
     ('new_module.view', 'View New Module', 'Can view new module', 'new_module', true),
     ('new_module.create', 'Create New Module', 'Can create items', 'new_module', true)
   ON CONFLICT (name) DO NOTHING;

   -- Assign to roles
   INSERT INTO role_permissions (role_id, permission_id)
   SELECT r.id, p.id FROM app_roles r CROSS JOIN app_permissions p
   WHERE r.name IN ('super_admin', 'chairman') AND p.category = 'new_module'
   ON CONFLICT DO NOTHING;
   ```

### 2. Audit Log Integration

Every server action that modifies data must log the activity:

**Required Pattern:**

```typescript
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';

export async function updateSomething(id: string, input: Input) {
  const auth = await authorizePermission(PERMISSIONS.MODULE_UPDATE);
  if (!auth.authorized) return { error: 'Unauthorized' };

  // Get old values for comparison
  const { data: oldRecord } = await supabase.from('table').select('*').eq('id', id).single();

  // Perform update
  const { data, error } = await supabase.from('table').update(input).eq('id', id).select().single();

  if (!error && data) {
    const changes = getChangedValues(oldRecord, data);
    await logAudit({
      action: 'UPDATE',
      entityType: 'table_name',        // Must be in AuditEntityType
      entityId: id,
      entityDisplay: data.name,        // Human-readable identifier
      oldValues: changes.old,
      newValues: changes.new,
    });
  }

  return { data, error };
}
```

**Adding New Entity Types:**

Add to `src/types/database.ts` in the `AuditEntityType` type:

```typescript
export type AuditEntityType =
  | 'existing_types'
  | 'new_entity_type';  // Add new entity
```

**Audit Actions Available:**

- `CREATE` / `UPDATE` / `DELETE` - Basic CRUD
- `VERIFY` / `APPROVE` / `REJECT` - Workflow actions
- `ASSIGN` / `UNASSIGN` - Role/relationship changes
- `ACTIVATE` / `DEACTIVATE` - Status changes
- `GENERATE` / `ALLOCATE` - Financial operations

### 3. Integration Checklist

Before marking a feature complete, verify:

- [ ] All write actions have `authorizePermission()` check
- [ ] Permission constants added to `src/lib/auth/action-roles.ts`
- [ ] Permission category enum migration created
- [ ] Permissions seeded in database with role assignments
- [ ] All write actions call `logAudit()` after success
- [ ] Entity type added to `AuditEntityType` if new
- [ ] Route added to `ROUTE_PERMISSIONS` if new page

### Module Integration Status

**Last Compiled**: 2026-08-06

Integration is enforced by the structural test `src/__tests__/integration/module-integration.test.ts` (not a static "100%" declaration). It scans all write actions under `src/actions/**` and fails if any lack `authorizePermission()` or `logAudit()`, unless they are listed in that file's `PERMISSION_ALLOWLIST` / `AUDIT_ALLOWLIST`.

✅ **Current status (2026-08-06): `npm test` green** — the integration module passes. Real gaps were fixed (permission+audit) for `system/prune-data`, `personnel/actions`, `projects/create-project`, `expenses/create+update`, `finance/petty-cash`, `finance/manual-verification`. Recipient-facing / cron / webhook / pre-auth flows (`payments/*`, `billing/pay-*-with-wallet`, `paystack/init+verify+webhook`, `email-imports/*`, `two-factor/verify`) are **intentionally allowlisted** because they cannot take an admin RBAC `authorizePermission` guard (resident-self-service auth, `CRON_SECRET` automation, or signature verification). Don't re-add hard permission checks there. Re-run `npm test` after any new write action.

#### Integration Patterns

**1. Standard Pattern** (18 files):
```typescript
export async function someAction(...) {
  // Permission check
  const auth = await authorizePermission(PERMISSIONS.MODULE_ACTION);
  if (!auth.authorized) return { error: 'Unauthorized' };

  // Perform operation
  const result = await operation();

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'table_name',
    entityId: result.id,
    oldValues: {...},
    newValues: {...},
  });

  return { success: true };
}
```

**2. Conditional Permission Pattern** (2 files):
- Used in: `generate-invoices.ts`, `generate-levies.ts`
- Permission checks only for manual triggers
- Cron/API triggers use admin client for automation

**3. Business Logic Pattern** (1 file):
- Used in: `add-household-member.ts`
- Validates caller is primary resident (business rules)
- Still includes audit logging
- Intentional: Household management is resident-scoped

#### Verified Modules

All files below have complete integration:

**Residents**: `create-resident`, `delete-resident`, `add-household-member`*, `assign-house`, `unassign-house`, `transfer-ownership`

**Billing**: `generate-invoices`*, `generate-levies`*, `wallet` (credit/debit)

**Payments**: `create-payment`, `create-split-payment`, `bulk-update-payments`

**Houses**: `create-house`, `property-transition`

**Documents**: `upload-document`, `update-document`, `delete-document`

**Security & Settings**: `security/settings`, `settings/update-setting`

*Uses conditional permission checks or business logic validation

#### Adding New Server Actions

Follow this pattern for all new write operations:

1. Import authorization:
   ```typescript
   import { authorizePermission } from '@/lib/auth/authorize';
   import { PERMISSIONS } from '@/lib/auth/action-roles';
   import { logAudit } from '@/lib/audit/logger';
   ```

2. Check permissions:
   ```typescript
   const auth = await authorizePermission(PERMISSIONS.MODULE_ACTION);
   if (!auth.authorized) return { error: 'Unauthorized' };
   ```

3. Log audit trail:
   ```typescript
   await logAudit({
     action: 'CREATE' | 'UPDATE' | 'DELETE',
     entityType: 'table_name',
     entityId: id,
     oldValues: {...},
     newValues: {...},
   });
   ```

