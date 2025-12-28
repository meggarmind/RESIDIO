---
description: Trigger comprehensive QA validation across security, code quality, documentation, and performance domains
argument-hint: "[prompt|phase|module|files|all] [value]"
---

# QA Director Validate

Trigger comprehensive validation across security, code quality, documentation, and performance domains.

## Usage

```
/qa-director-validate [scope]
```

## Scope Options

| Scope | Description | Example |
|-------|-------------|---------|
| `prompt <filename>` | Validate files related to a specific prompt | `/qa-director-validate prompt feature-auth.md` |
| `phase <number>` | Validate all files modified in a phase | `/qa-director-validate phase 15` |
| `module <name>` | Validate a specific module | `/qa-director-validate module auth` |
| `files <paths>` | Validate specific files (comma-separated) | `/qa-director-validate files src/actions/auth.ts,src/lib/auth.ts` |
| `all` | Full codebase validation | `/qa-director-validate all` |
| *(no argument)* | Auto-detect scope from git diff | `/qa-director-validate` |

## What Gets Validated

### Security Domain
- RLS policy verification
- Authentication/authorization checks
- OWASP Top 10 vulnerabilities
- Dependency vulnerabilities
- Secrets detection
- Input validation

### Code Quality Domain
- TypeScript type safety
- React patterns and hooks
- Server action conventions
- Error handling
- Code duplication

### Documentation Domain
- JSDoc coverage
- README completeness
- API documentation
- Type documentation

### Performance Domain
- N+1 query detection
- Memoization opportunities
- Cache configuration
- Bundle size concerns

## Output

Reports are generated in `docs/validation/validation-YYYYMMDD-HHMMSS.md` with:
- Executive summary
- Findings ranked by severity (Critical > High > Medium > Low)
- Actionable recommendations
- Validator timing summary

## Examples

### Validate after completing a feature
```
/qa-director-validate prompt 20251228_portal_resident_dashboard_improvements.md
```

### Validate entire phase before release
```
/qa-director-validate phase 15
```

### Quick check on specific files
```
/qa-director-validate files src/actions/residents/create-resident.ts
```

### Full codebase audit
```
/qa-director-validate all
```

---

Invoke the QA-Director Agent to perform comprehensive validation on $ARGUMENTS.

The agent will:
1. Identify target files based on scope
2. Run parallel validation across security, code quality, docs, and performance
3. Consolidate findings with severity ranking
4. Generate a markdown report in `docs/validation/`
5. Optionally update Notion status (graceful failure handling)
