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
| admin@residio.test | password123 | admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |

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
