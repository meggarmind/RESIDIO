# SESSION_STATE.md — Live Handoff

Coordination file shared between OpenCode and Claude Code working on Residio.
**Keep this up to date at the end of every session.** Anyone starting work reads this first.

> Replaces the stale `HANDOFF_SUMMARY.md` / `NEXT_SESSION_HANDOFF_PROMPT.md` (theme re-engineering, Jan 2026 — both are historical, no longer current).

> **🎯 PRODUCT FOCUS — READ BEFORE ANY TASK (set 2026-08-06): ALL work targets the ADMIN DASHBOARD.** Resident Portal / self-service (`src/app/(resident)/**`, `src/components/resident-portal/**`) is **not planned for rollout** in the foreseeable future. Do not invest in portal/self-service work; keep it stable/local only. When a task touches portal code, ask: is this admin value? Ensure TODO.md/AGENTS.md/CLAUDE.md stay aligned with this direction.

---

## Current snapshot (verified 2026-08-06)

| Item | State |
|------|-------|
| Runtime | Node v24.7.0 on **Windows 11** (migrated from WSL). Cross-platform: `.gitattributes` normalizes LF. |
| Git branch | `master`. Remote: `origin` → `git@github.com:meggarmind/RESIDIO.git` |
| Working tree | clean (pushed) |
| Tests | `npm test` (Vitest) **green: 5 files / 16 tests passing**. Added `vitest.config.ts` (defines `@`→`src` alias + includes only `src/**/*.test.*`, excluding Playwright `e2e/` specs). |
| Integration coverage | `module-integration.test.ts` passes. Fixed real gaps (permission+audit) for `system/prune-data`, `personnel/actions`, `projects/create-project`, `expenses/create+update`, `finance/petty-cash`, `finance/manual-verification`. Allowed `vendors`/`projects` as audit entity types. Recipient-facing/cron/webhook/auth flows (payments, billing wallet-pay, paystack init/verify/webhook, email-imports, 2FA login) are allowlisted with rationale — they cannot take an admin RBAC `authorizePermission` guard. |
| Known debt | Repo-wide `npm run lint` still has ~350 pre-existing errors in unrelated files (`middleware.ts`, `src/lib/validators/*`, pre-existing `any` in `types/database.ts`). `npm run build` may also be red from these. Not introduced by the auth work. |

---

## Coordination rules

1. **One source of truth for project setup**: `AGENTS.md`. `CLAUDE.md` defers to it for stack/commands/architecture; `CLAUDE.md` keeps the auth/audit integration contract only. Don't let these diverge.
2. **Update this file** at end of every session: bump "Current snapshot", log what changed, set next steps.
3. **Commit + push** the end of every session so the tree the other agent opens is clean and shared (do not leave 18 modified files sitting in the tree).
4. **Test baseline**: `npm test` is currently red on integration. This is a known, intentional gap list — do not treat it as "all good". Fix gaps (add `authorizePermission` + `logAudit`) or add allowlist entries as you complete modules.
5. Shared credentials are LOCAL-ONLY: never commit `.env` or service keys. `.env*` is gitignored.

---

## Before you start

```bash
git fetch && git pull          # sync with remote if another agent pushed
npm install                    # only if package.json changed
npm test                       # confirm known-current baseline
cat AGENTS.md                  # commands, architecture, conventions
```

## Before you finish

```bash
npm run lint && npm run build  # must pass
npm test                       # document any remaining failures here
```

Then update `Current snapshot` + `Last session` below, commit, and push.

---

## Last session (OpenCode, 2026-08-06)

- Dotenv issue: **`/dev` fixed.** Added `.env.local` (gitignored): `NEXT_PUBLIC_ENV_MODE=cloud`, `NEXT_PUBLIC_SUPABASE_URL_CLOUD`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_CLOUD` = the kzugmyjjqttardhfejzc cloud project; user added `SUPABASE_SERVICE_ROLE_KEY_CLOUD`. Pages load (login +200; root redirects to /dashboard).
- **Product focus set:** Admin Dashboard only; Resident Portal/self-service not planned for rollout. Baked this guardrail into `AGENTS.md`, `CLAUDE.md`, `TODO.md`, `SESSION_STATE.md`.
- Committed+pushed: `5b7cae6` (vitest config). Lint/build remain pre-existing-red.

## Next steps (suggested priority)

0. **Product focus (set):** Admin Dashboard only. No self-service/portal rollout.
1. Triage/address pre-existing lint debt (`middleware.ts`, `src/lib/validators/*`, `any` in `types/database.ts`) so `npm run build` can pass — highest-priority admin-platform blocker.
2. Investigate the Playwright job separately via `npm run test:e2e` (needs admin@residio.test/password123 against Cloud Supabase).
3. Update `README.md` (still default `create-next-app` boilerplate; reflect Windows/Node/cloud Supabase setup).