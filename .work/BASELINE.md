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

## Baseline moved as wave 1 landed

After #167, #169 and #170 merged, `epic/180` stands at **68 files / 406 tests**, lint
**0 errors / 327 warnings** (one fewer than the original 328, from dead imports removed in
#169), typecheck exit 0, build exit 0. Quote *these* numbers to QA agents from wave 2
onward, not the originals.

## Environment hazard — read before trusting any gate result

On 2026-09-03 the shared `node_modules` was silently corrupted (16 package directories
emptied, `prettier` and `@react-pdf/renderer` among them) during worktree teardown. It
presented as 20 "pre-existing" TypeScript errors, a failing build, and the two billing
suites from #163 failing again — and an agent reasonably concluded its environment had
always been broken. Full account in DECISIONS.md D14.

**If gate numbers ever disagree with a run you did yourself, suspect the tree before the
code.** The check that settles it in seconds:

```
ls node_modules/prettier | wc -l      # 0 means an emptied shell, not a missing package
```

Repair is `npm ci` (about 3 minutes with a warm cache). Worktrees no longer share
`node_modules` at all — see D15.

## Standing rules for every QA agent

1. **326 lint warnings are baseline** as of wave 4a (328 at the branch point; #169
   removed one via dead imports, #174 one more). Only a rise in the warning count, or
   any lint *error*, is chargeable to a slice.
2. A failure listed above is never charged against a remediation budget.
3. ~~`prettier` is absent from `package.json`; a clean `npm ci` reproduces #163's
   breakage.~~ **RETRACTED 2026-09-03 — do not brief this to anyone.** It was the
   premise of #163 and it is false. `prettier@3.7.4` is a declared `dependencies`
   entry of `@react-email/render@2.0.0` and has been in the committed
   `package-lock.json` since `4590ecd` (2025-12-21). A cold `npm ci` in a throwaway
   clone of `epic/180` — no `node_modules` at all — exits 0 and runs 383/383 green.
   #163 is closed as not reproducible; full evidence in D9. **A green test run here
   is ordinary evidence, not a masked state.** If tests fail on `prettier`, you have
   the D14 corruption, not this — check `ls node_modules/prettier | wc -l` and
   `npm ci`.
