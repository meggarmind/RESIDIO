# AGENTS.md

Residio is a Next.js 16 (App Router) + TypeScript app for residential estate access management: resident/roster management, payments, billing (invoices, levies, wallet), security contacts, expenses, and an external access-control API.

## 🎯 Product Focus — READ FIRST (top priority guardrail)

**All forward work is focused on the ADMIN DASHBOARD. The Resident Portal / self-service surfaces (`src/app/(resident)/**`, `src/components/resident-portal/**`) are NOT scheduled for rollout in the foreseeable future.**

Implications for every agent:

- Prioritize, design, and build for the **admin** experience (management, finance, security, operations, reporting).
- **Do not invest in self-service/portal work** (resident payments, portal wallet, portal announcements/documents/profile, impersonation UX, onboarding wizard, resident-facing email flows). Keep existing portal code stable/local only; do not polish, extend, or re-roll it.
- When a task touches portal code, ask yourself: is this *admin* value? If it is resident-facing only, de-prioritize or flag to the user before building.
- Keep `SESSION_STATE.md`, `TODO.md`, and the module-integration allowlists consistent with this direction.

> If this direction changed, the user will say so explicitly. Until then, assume admin-dashboard-first.

## Quick commands

```bash
npm run dev              # dev server, http://localhost:3000
npm run build            # production build
npm run lint             # ESLint v9
npm test                 # Vitest (unit/integration, src/__tests__)
npm run test:e2e         # Playwright (e2e/) — also :ui and :headed variants
npm run db:types         # regenerate src/types/database.generated.ts from cloud schema
```

Run `lint -> build` (and tests where relevant) after changes.

## Stack & conventions

- **Supabase is CLOUD-ONLY.** Do NOT run local CLI commands (`supabase start`, `db:migrate`, etc.). Apply migrations and queries via Supabase MCP tools; regenerate types with `npm run db:types`.
- **Path alias**: `@/*` maps to `src/*`. Always import via `@/...`, never relative.
- State: TanStack React Query. Forms: React Hook Form + Zod. Icons: Lucide. Media/data files handled via `@react-email`, `pdf-lib`, etc.
- DB types: `src/types/database.generated.ts` (generated, do not hand-edit); helpers live in `src/types/database.ts`.

## Server actions — MANDATORY integration

Every write server action (CREATE/UPDATE/DELETE) in `src/actions/**` MUST:
1. Call `authorizePermission(PERMISSIONS.X)` from `@/lib/auth/authorize` FIRST and bail on failure.
2. Call `logAudit(...)` from `@/lib/audit/logger` after a successful write.
3. Register new permission constants in `src/lib/auth/action-roles.ts`; add entity types to `AuditEntityType`.

The compliance test `src/__tests__/integration/module-integration.test.ts` scans `src/actions/**` and will FAIL for any write action missing permission/audit unless it's added to the file's `PERMISSION_ALLOWLIST` / `AUDIT_ALLOWLIST`. **It currently fails out of the box** (17 files short on permission checks, 4 on audit — paystack, two-factor, expenses, personnel, email-imports, projects are not fully integrated). Do not trust it as "all good": run `npm test` yourself after changes. New modules need allowlist entries added until they're fixed. Full pattern reference + checklist: `CLAUDE.md` "Module Integration Requirements", `docs/security/access-control.md`.

## Layout & architecture

- `src/app/**` — App Router routes (grouped `(auth)`, `(dashboard)`, `(resident)`).
- `src/actions/**` — server actions, grouped by domain (billing, payments, residents, houses...).
- `src/lib/**` — supabase clients, auth, audit, email (Resend), pdf, sms, notifications, encryption.
- `src/components/**` — `ui/` (shadcn New-York), plus per-domain `components/<domain>/`.
- `src/emails/**` — React Email templates. `scripts/` — one-off seed/verify/invoice scripts (not in build).
- `docs/` — canonical docs; start at `docs/README.md`.

## Design system

Follow `DESIGN_AGENTS.md` (the repo's design standard) for all UI work: OKLCH colors, `new-york` shadcn style, lucide icons in `IconBox` wrappers, tactile micro-animations (framer-motion). Wrap raw shadcn components in semantic layout components rather than using them directly in pages.

## Testing

- Unit/integration: Vitest under `src/__tests__` (e.g. `module-integration.test.ts` — runs structural checks over server actions, no network).
- E2E: Playwright specs under `e2e/`, shared login helper in `e2e/fixtures.ts`. Requires Cloud Supabase + seeded test users (see `supabase/seed.sql`). Login as `admin@residio.test` / `password123` (super_admin).

## Docs to read first

- `docs/README.md` — master index
- `docs/setup/development-environment.md` — full setup, env vars, conventions
- `docs/api/supabase-integration.md` — data-layer & MCP patterns
- `docs/agents/branching.md` — **branching, isolation, concurrent sessions, the `stage` backup**
- `CLAUDE.md` — auth/audit integration contract, MCP tools, session workflow
- `TODO.md` / `ACTIONPLAN.md` — current phase and in-progress plan; update `ACTIONPLAN.md` as you complete steps.

## Progress tracking

- `SESSION_STATE.md` is the live cross-agent handoff and current verified baseline. Read it before substantive work and update its snapshot, last-session entry, and next steps before finishing, whether or not the user explicitly asks.
- Maintain `TODO.md` as the product backlog: mark completed items, add newly discovered follow-up work, and keep priorities aligned with the current delivery focus.
- Update `ACTIONPLAN.md` whenever work completes, changes, or invalidates an active plan step.
- When implementation is complete and the ticket has been updated with verification results, move its project-board status to **Review** before finishing the session. Keep it open until review is accepted; if project access is unavailable, report the blocker explicitly.
- Record the work actually performed, decisions, verification results, known failures, and remaining work. Do not create separate handoff files; `SESSION_STATE.md` is the sole live handoff.

## Branching and isolation

**Never work on `master`.** It is a merge target. Branch protection refuses direct pushes
from every tool, on every machine, including the repo owner. A rejected push is the rule
working — open a PR rather than routing around it or asking another session to push for you.

This repo is worked by two machines running Claude Code, OpenCode and Codex, sometimes
concurrently. **No session may assume it is the only one.** The live registry of who is
working on what is the remote branch list — `git ls-remote --heads origin`. Check it before
taking a branch, and **push your own branch early** so your work is visible; the push is the
declaration. `SESSION_STATE.md` is the end-of-session handoff record, not a live signal — it
lives on protected `master`, so writing to it needs a PR and arrives too late to coordinate.

Branch prefixes declare the lane: `codex/issue-<n>-<slug>` (repo and board issues),
`feat/<slug>` and `fix/<slug>` (features and fixes), `qa/<date>`, `merge/<slug>`.

Sync `master` into your branch **before** starting work that is not central to the feature.
Apply a migration only from the branch that introduces it, only after that branch merges.

`stage` is the last `master` that passed checks — the rollback point. It advances only via
`.github/workflows/stage-backup.yml`; never push to it by hand.

**Full rules: `docs/agents/branching.md`.**

## Mandatory issue-driven delivery workflow

Every initiative must be decomposed with Matt Pocock's `to-issues` skill before implementation. Present the proposed tracer-bullet vertical slices, confirm their granularity and dependencies, then publish the approved child issues to GitHub in dependency order using the `to-issues` template and `ready-for-agent` label. Do not begin implementation without a published issue number.

Implementation is isolated per issue in `.worktrees/issue-<number>` on `codex/issue-<number>-<slug>`. Use the repository helper configured in `.github/issue-workflow.json`:

```text
npm run issue:doctor
npm run issue:workflow -- start <issue>
npm run issue:workflow -- review <issue> [--check "issue-specific command"]
npm run issue:workflow -- resume <issue>
npm run issue:workflow -- finish <issue> [--check "issue-specific command"]
```

The canonical GitHub Project 1 lifecycle is `Backlog → In progress → In review → Done`. `Backlog` is this board's equivalent of the initial Todo state. `start` moves an issue to In progress after its worktree exists; `review` moves it to In review before checks begin; `resume` returns it to In progress when fixes are needed; and `finish` can set Done only after checks pass, the branch is merged into `master`, and the child issue is closed. Failed checks, dirty worktrees, missing project configuration, and merge conflicts must leave the issue unfinished and preserve its worktree. Parent initiative issues are never closed by child completion.
