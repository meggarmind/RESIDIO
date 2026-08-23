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
- `CLAUDE.md` — auth/audit integration contract, MCP tools, session workflow
- `TODO.md` / `ACTIONPLAN.md` — current phase and in-progress plan; update `ACTIONPLAN.md` as you complete steps.

## Progress tracking

- `SESSION_STATE.md` is the live cross-agent handoff and current verified baseline. Read it before substantive work and update its snapshot, last-session entry, and next steps before finishing, whether or not the user explicitly asks.
- Maintain `TODO.md` as the product backlog: mark completed items, add newly discovered follow-up work, and keep priorities aligned with the current delivery focus.
- Update `ACTIONPLAN.md` whenever work completes, changes, or invalidates an active plan step.
- When implementation is complete and the ticket has been updated with verification results, move its project-board status to **Review** before finishing the session. Keep it open until review is accepted; if project access is unavailable, report the blocker explicitly.
- Record the work actually performed, decisions, verification results, known failures, and remaining work. Do not create separate handoff files; `SESSION_STATE.md` is the sole live handoff.
