# Baseline — epic/180

Established 2026-09-02. Branch point: `origin/master` @ `0c69af2`, plus a
docs-only merge of `feat/settings-ia-docs` (ADR-0004/0005/0006 + CONTEXT.md
vocabulary; no `src/**` change), plus one baseline repair commit.

## Canonical commands (use these verbatim — they are what CI runs)

| Purpose   | Command              | Notes |
|-----------|----------------------|-------|
| test      | `npx vitest run`     | `npm test` is bare `vitest` = watch mode. Never use it in an agent. |
| build     | `npm run build`      | `next build` |
| lint      | `npm run lint`       | bare `eslint` |
| typecheck | `npx tsc --noEmit`   | no `typecheck` script exists in the root package.json |
| e2e       | `npx playwright test <spec>` | needs a running app; not part of the routine gate |
| docs      | `npm run docs:drift` / `npm run docs:verify -- <path>` | |

## Results on the branch point (before any epic code change)

| Gate      | Result | Detail |
|-----------|--------|--------|
| test      | PASS   | 66 files, 383 tests, exit 0 |
| build     | PASS   | exit 0 |
| lint      | PASS   | exit 0 — **0 errors, 328 warnings** |
| typecheck | **FAIL** | exit 2 — 2 errors, see below |

### Pre-existing typecheck failure (fixed, commit `8d3ee77`)

```
src/__tests__/integration/issue-monitor.test.ts(76,96): error TS2322: Type 'string' is not assignable to type 'never'.
src/__tests__/integration/issue-monitor.test.ts(79,115): error TS2322: Type 'string' is not assignable to type 'never'.
```

Confirmed pre-existing: the file on `epic/180` is byte-identical to
`origin/master`, and `feat/settings-ia-docs` never touched it after the
merge-base. Cause: `detectFindings({ branchNames = [] })` in
`scripts/issue-monitor.mjs` infers `never[]` from the empty default, so any
caller passing real branch names is a type error. Fixed with an inline JSDoc
type on the default. No runtime change. Post-fix: `npx tsc --noEmit` exit 0.

## Standing rules for every QA agent

1. **328 lint warnings are baseline.** Only a rise in the warning count, or any
   lint *error*, is chargeable to a slice.
2. A failure listed above is never charged against a remediation budget.
3. `prettier` is present in `node_modules` at 3.7.4 but absent from
   `package.json` — the masked state described by #163. Tests are green *only
   because of that stray install*; a clean `npm ci` reproduces the breakage.
   Until #163 lands, do not read a green test run as proof of a clean install.
