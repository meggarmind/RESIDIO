# SESSION_STATE.md — Live Handoff

Coordination file shared between OpenCode and Claude Code working on Residio.
**Keep this up to date at the end of every session.** Anyone starting work reads this first.

> Replaces the stale `HANDOFF_SUMMARY.md` / `NEXT_SESSION_HANDOFF_PROMPT.md` (theme re-engineering, Jan 2026 — both are historical, no longer current).

---

## Current snapshot (verified 2026-08-06)

| Item | State |
|------|-------|
| Runtime | Node v24.7.0 on **Windows 11** (migrated from WSL). Cross-platform: `.gitattributes` normalizes LF. |
| Git branch | `master` (1 commit **ahead** of `origin/master` — un-pushed). Remote: `origin` → `git@github.com:meggarmind/RESIDIO.git` |
| Working tree | 18 files modified (auth/billing/paystack/two-factor/personnel component + source changes) — **uncommitted** |
| Tests | `src/__tests__/integration/module-integration.test.ts` **FAILS**: 17 actions missing permission checks, 4 missing audit logging |
| Integration coverage | `module-integration.test.ts` enforces permission+audit for write actions via allowlists; current gaps = `paystack/*`, `two-factor/verify`, `system/prune-data`, `personnel/actions`, `expenses/*`, `email-imports/*`, `finance/*`, `billing/pay-*-with-wallet`, `projects/create-project` |

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

- Rewrote `AGENTS.md` from generic workflow prose → compact repo instruction file.
- Untracked + gitignored stale artifacts: `playwright-report/`, `test-results/`, `.playwright-mcp/`, `testsprite*/`, `re_match.ts`, `testFile.txt`.
- Added `.gitattributes` LF normalization is already present; **review the 18 uncommitted source changes before the next feature session** — several were not committed.

## Next steps (suggested priority)

1. Decide on the 18 uncommitted source changes — commit or stash before further work.
2. Fix the integration test gaps (permission + audit) for: personnel, expenses, email-imports, paystack, two-factor, projects, finance, billing wallet-pay actions (or explicitly allowlist until fixed).
3. Reflect the Windows/Node/cloud setup in `README.md` (still default `create-next-app` boilerplate).
4. Finish whatever the 18 modified files started (reports/statements/personnel/petty-cash UI).