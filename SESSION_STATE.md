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
| Working tree | clean; latest commits **not yet pushed** (`575220c`, `00d3ef9`) |
| Tests | `npm test` (Vitest) **green: 5 files / 16 tests passing**. Added `vitest.config.ts` (defines `@`→`src` alias + includes only `src/**/*.test.*`, excluding Playwright `e2e/` specs). |
| Build | **`npm run build` GREEN (exit 0)** — first time; 39 page-groups, dashboard + api dynamic. `npx tsc --noEmit` clean (was 22 errors/7 files). |
| Lint | `npm run lint`: **323 errors / 489 warnings** (down from 351). Cleared safe buckets: RHF/ts fixes + static-prerender opts (`00d3ef9`); low-risk batch — empty-type→alias, `require()`→ESM, `<a>`→`<Link>`, typographic quotes in admin copy (`575220c`). Remaining 323 = mostly `no-unused-vars` + `no-explicit-any` (237); 18 `no-unescaped` resident-portal (out of scope). |
| Integration coverage | `module-integration.test.ts` passes. Fixed real gaps (permission+audit) for `system/prune-data`, `personnel/actions`, `projects/create-project`, `expenses/create+update`, `finance/petty-cash`, `finance/manual-verification`. Allowed `vendors`/`projects` as audit entity types. Recipient-facing/cron/webhook/auth flows (payments, billing wallet-pay, paystack init/verify/webhook, email-imports, 2FA login) are allowlisted with rationale — they cannot take an admin RBAC `authorizePermission` guard. Note: this test reports "70 permission / 51 audit gaps" but PASSES — gap summary includes allowlisted-but-still-missing entries, not a failure signal. |
| Known debt | **Build blocker cleared.** Build/tsc green. Lint debt remains: ~323 errors, dominated by `@typescript-eslint/no-explicit-any` (237) and `no-unused-vars` (443 incl warnings). These are the "bigger refactor" paused pending user direction. |

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

## Last session (OpenCode, 2026-08-07)

- **Build blocker cleared.** Fixed 22 tsc errors across 7 files: RHF `Resolver` generic mismatch in `log-expense-dialog.tsx` (15-error cascade) via explicit cast; missing lucide/type imports (`Receipt`/`FileText`/`PersonnelInsert`); `ExpensePaymentMethod` union lacked `card`/`other` (added + labels); wrong role literal in `header.tsx`; `URLSearchParams` typing; `title` null in `petty-cash-dashboard`; missing report options in `cron/generate-reports`. Opted `(dashboard)` subtree (`force-dynamic` in layout) + `/verify-2fa` (Suspense boundary around `useSearchParams`) out of static prerender.
- Committed+pushed: `00d3ef9` (build fixes), `575220c` (low-risk lint). **Not yet pushed:** this doc update. Working tree now clean.
- `npm run build` GREEN, `tsc` clean, `npm test` 5/16 green, `npm run lint` 351→323 errors.

## Next steps (suggested priority)

0. **Product focus (set):** Admin Dashboard only. No self-service/portal rollout.
1. **Lint debt (user chose low-risk-first; big refactors paused).** Easy admin edits done. Remaining 323 errors = `no-explicit-any` (237) + `no-unused-vars` (~many) + 18 `no-unescaped-entities` but only in resident-portal (de-prioritized) + 9 `ban-ts-comment` + 1 `rules-of-hooks`. Decide whether to grind the `any`/`unused-vars` refactor (high-value, high-churn).
2. Investigate the Playwright job separately via `npm run test:e2e` (needs admin@residio.test/password123 against Cloud Supabase).
3. Update `README.md` (still default `create-next-app` boilerplate; reflect Windows/Node/cloud Supabase).