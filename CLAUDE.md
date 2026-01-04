# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Residio is a residential estate access management web application. It automates resident access control by managing payment status, security contact lists, and providing APIs for external systems (e.g., security barriers).

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

## Development Inbox Workflow

This project uses a Notion-based mobile inbox for capturing development tasks. Claude Code processes these **automatically via SessionStart hook**.

### Automatic Session Start (Hook-Based)

A **SessionStart hook** runs automatically at every Claude Code session start. It:
1. Runs NSMA (Notion Sync Manager) to fetch new tasks from mobile inbox
2. Analyzes all prompts in `/prompts/pending/` folder
3. Categorizes prompts by phase alignment
4. Displays summary to user

**Hook location**: `.claude/hooks/session-start.sh`
**Hook config**: `.claude/settings.json`
**NSMA Dashboard**: http://localhost:3100

You do NOT need to manually run sync - it happens automatically.

### Manual Sync (if needed)

```bash
node /home/feyijimiohioma/projects/Nsma/cli/index.js --project residio
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

1. **Read each prompt in `/prompts/pending/`** folder
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

   b. **Update Notion status** using MCP (if available):
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

      Or manage via NSMA dashboard: http://localhost:3100

   c. **Move file to processed folder**:
      ```bash
      mv prompts/pending/<filename> prompts/processed/<filename>
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
| **Defer** | Save for later phase | `mv prompts/pending/X prompts/deferred/X` | "Deferred" |
| **Execute anyway** | Override phase restriction | Process normally | (per completion) |
| **Archive** | Skip permanently | `mv prompts/pending/X prompts/archived/X` | "Archived" |

### Deferring a Prompt

When user chooses "Defer":

1. **Update Notion status** using MCP (if available):
   ```
   mcp__notion__notion-update-page
   data:
     page_id: [notion_page_id from frontmatter]
     command: update_properties
     properties:
       Status: Deferred
       Analysis Notes: "Deferred to [target phase] by user on [date]"
   ```

   Or manage via NSMA dashboard: http://localhost:3100

2. **Move file**:
   ```bash
   mv prompts/pending/<filename> prompts/deferred/<filename>
   ```

**Re-check behavior**: Deferred prompts are automatically re-checked at every session start. If the current phase (from TODO.md) matches the prompt's phase, it will be flagged as `[NOW ALIGNED]` with a suggestion to move it back to `prompts/pending/`.

### Archiving a Prompt

When user chooses "Archive":

1. **Update Notion status** using MCP (if available):
   ```
   mcp__notion__notion-update-page
   data:
     page_id: [notion_page_id from frontmatter]
     command: update_properties
     properties:
       Status: Archived
       Analysis Notes: "Archived by user on [date]. Reason: [if provided]"
   ```

   Or manage via NSMA dashboard: http://localhost:3100

2. **Move file**:
   ```bash
   mv prompts/pending/<filename> prompts/archived/<filename>
   ```

### Folder Structure

```
residio/
├── prompts/                    # NSMA managed prompts directory
│   ├── pending/                # Active prompts (auto-populated by NSMA)
│   │   └── *.md
│   ├── processed/              # Completed prompts
│   │   └── *.md
│   ├── deferred/               # Deferred to later phase
│   │   └── *.md
│   └── archived/               # Permanently skipped
│       └── *.md
├── docs/
│   └── validation/             # QA-Director validation reports
│       └── *.md
├── .nsma-config.md             # NSMA phase/module configuration (auto-imported)
└── .claude/
    ├── settings.json           # Hook configuration
    ├── agents/
    │   └── qa-director.md      # QA-Director agent definition
    ├── commands/
    │   └── qa-director-validate.md  # Manual validation trigger
    └── hooks/
        ├── session-start.sh    # NSMA SessionStart hook
        └── task-complete.sh    # QA-Director PostToolUse hook
```

**NSMA Dashboard**: http://localhost:3100 (when running)

---

## QA-Director Validation System

The QA-Director Agent automatically validates completed work across security, code quality, documentation, and performance domains.

### Automatic Triggers

A **PostToolUse hook** monitors for prompt completion:
- **Prompt Completion**: Triggers when file moves from `prompts/pending/` to `prompts/processed/`
- **Phase Completion**: Triggers when all prompts in a phase are completed (pending count = 0)

**Hook location**: `.claude/hooks/task-complete.sh`

### Manual Trigger

```
/qa-director-validate [scope]
```

**Scope Options:**
| Scope | Example |
|-------|---------|
| `prompt <filename>` | `/qa-director-validate prompt feature-auth.md` |
| `phase <number>` | `/qa-director-validate phase 15` |
| `module <name>` | `/qa-director-validate module auth` |
| `files <paths>` | `/qa-director-validate files src/actions/auth.ts` |
| `all` | `/qa-director-validate all` |
| *(no arg)* | Auto-detect from git diff |

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
| `resume_session` | Read `NEXT_SESSION_HANDOFF_PROMPT.md` and follow as prompt |
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

**Last Verified**: 2026-01-04

All server actions performing write operations (CREATE, UPDATE, DELETE) are successfully integrated with:
- ✅ Roles & Permissions Module (`authorizePermission()`)
- ✅ Audit Log Module (`logAudit()`)

**Integration Coverage**: 100% (19/19 verified files)

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
