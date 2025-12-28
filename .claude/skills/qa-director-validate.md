---
name: qa-director-validate
description: Comprehensive QA validation across security, code quality, documentation, and performance. Use when you need to validate completed work, check security, verify documentation quality, or audit the codebase for issues.
---

# QA Director Validate

Perform comprehensive validation when tasks are completed or on-demand.

## Scope Options

When invoked, determine the scope from arguments or context:

| Scope | Description |
|-------|-------------|
| `prompt <filename>` | Validate files related to a specific completed prompt |
| `phase <number>` | Validate all files modified in a phase |
| `module <name>` | Validate a specific module (auth, residents, payments, etc.) |
| `files <paths>` | Validate specific files (comma-separated) |
| `all` | Full codebase validation |
| *(no argument)* | Auto-detect from `git diff` |

## Validation Process

### Step 1: Identify Target Files

Based on scope:
- **prompt**: Read prompt's `Related Files` section from YAML frontmatter
- **phase**: Find files modified in phase commits via `git log`
- **module**: Map module name to `src/` paths (e.g., auth → `src/actions/auth/`, `src/lib/auth.ts`)
- **files**: Use provided paths directly
- **all**: Full `src/` directory
- **auto**: Use `git diff --name-only HEAD~5` or uncommitted changes

### Step 2: Run Validation Domains (Parallel)

#### Security Validation
Focus areas for Residio:
- RLS policies on tables (residents, houses, payments, users, audit_logs)
- RBAC permission checks in server actions (`src/actions/`)
- Zod schema validation on form inputs
- Authentication checks in protected routes
- CRON endpoint authentication
- Secrets/API keys exposure

#### Code Quality Validation
Focus areas:
- TypeScript strictness (no `any` types)
- React Query hooks in `src/hooks/use-{domain}.ts`
- Server actions following `src/actions/{domain}/` pattern
- React Hook Form + Zod for forms
- Error handling and edge cases
- Unused imports and dead code

#### Documentation Validation
Focus areas:
- JSDoc on exported functions
- Type documentation for complex interfaces
- Inline comments for non-obvious logic
- CLAUDE.md patterns up to date

#### Performance Validation
Focus areas:
- N+1 query patterns (nested loops with DB calls)
- Missing React.memo/useMemo opportunities
- React Query stale time configuration
- Promise.all for parallel operations

### Step 3: Classify Findings by Severity

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Security vulnerabilities, data exposure | RLS missing, secrets in code |
| **HIGH** | Functional issues, major problems | Missing auth, N+1 queries |
| **MEDIUM** | Quality issues, tech debt | Duplicate code, missing docs |
| **LOW** | Suggestions, minor improvements | Style, optimization hints |

### Step 4: Generate Report

Create markdown report at `docs/validation/validation-YYYYMMDD-HHMMSS.md`:

```markdown
# QA Validation Report

**Generated**: [timestamp]
**Scope**: [scope details]
**Phase**: [current phase from TODO.md]

## Executive Summary
[2-3 sentence summary]

## Findings Overview
| Severity | Count |
|----------|-------|
| CRITICAL | X |
| HIGH | X |
| MEDIUM | X |
| LOW | X |

## Critical Findings
[Details with location, evidence, recommendation]

## High/Medium/Low Findings
[Grouped details]

## Action Items (Prioritized)
1. [Top priority]
2. [Next]
...
```

### Step 5: Notion Sync (Optional)

If triggered by prompt completion:
1. Extract `notion_page_id` from prompt YAML frontmatter
2. Attempt to update Notion with validation summary
3. If MCP fails, log warning but don't block report generation

## Example Invocations

**User says**: "validate the auth module"
**Action**: Run validation on `src/actions/auth/`, `src/lib/auth.ts`, `src/hooks/use-auth.ts`

**User says**: "check security on the payment files"
**Action**: Run security-focused validation on payment-related files

**User says**: "run full validation"
**Action**: Validate entire `src/` directory across all domains

**Hook triggers**: "Prompt moved to processed"
**Action**: Validate files listed in prompt's Related Files section
