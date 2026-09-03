# PLAN — Epic #180, Settings information architecture

Trunk is **`master`** (not `main`). Integration branch **`epic/180`**, cut from
`origin/master` @ `0c69af2` with `feat/settings-ia-docs` merged in for the ADRs.

## Binding constraints

- **ADR-0004** — Settings holds only Settings and Reference Data. Things you *watch*
  move to `/system/*`. Exception: a manual trigger that runs the rule **on the same
  page** stays (Apply Late Fees, Prune Data). Ownership backfill does not qualify.
- **ADR-0005** — Integrations group by service, and are exempt from the
  configuration-only boundary; credentials + config + console live together.
- **ADR-0006** — Chairman gets `settings.view` **and nothing else**.
- **The middleware hazard (#167)** — `src/middleware.ts` skips its whole auth block
  when no `ROUTE_PERMISSIONS` prefix matches. A `/system/*` page without an entry is
  **public**, not merely under-permissioned. Every relocation therefore: add the new
  entry, **keep the old one** (the redirect stub is a page, so it runs after
  middleware; deleting the old entry widens access to the stub).
- Nothing in CONTEXT.md or the ADRs is marked frozen.

## The three convergence files

`src/lib/auth/action-roles.ts` (ROUTE_PERMISSIONS), `src/config/navigation.ts`,
`src/config/settings-nav.ts`.

**Every one of slices #171–#178 edits all three.** This is the epic's dominant
conflict surface, and it is also the file where a bad merge ships a public page.
Waves are shaped around this, not around raw parallelism. Agents editing these files
are instructed to make **additive, append-only** edits wherever the issue permits,
and I resolve every conflict in them personally.

## Dependency graph

```
#163 prettier ──────────── (infra; precedes everything — a clean npm ci)
#167 middleware ─────┬──── #171 ── {#172,#173,#175} ── #174 ── #176 ──┬── #177
                     │                                               └── #178 ── #179
#168 chairman ───────┘ (independent)
#169 main sidebar      (independent)
#170 settings sidebar  (independent)
#166 hotkeys ────┐
#165 search logs ┴── #164 ── (#179 layers on the palette last)
```

## Waves

| Wave | Issues | Mode | Why this shape |
|------|--------|------|----------------|
| 0 | #163 | solo, main checkout | Mutates `package.json` + lockfile + `node_modules`, which every worktree shares by junction. Must not race. |
| 1 | #167, #168, #169, #170 | 4 parallel worktrees | Fully disjoint files. #167 unblocks all of wave 2. |
| 2a | #171 | solo | Declared template slice. Establishes `/system/layout.tsx`, the nav shape, **and the `/system` structural test** that stops later slices shipping an unguarded page. Nothing may run beside it. |
| 2b | #172, #173, #175 | 3 parallel worktrees | Disjoint page trees; overlap only on the three config files, append-only. |
| 2c | #174 | solo | Contains the unauthenticated-API security fix, and disposes of `/settings/system/health`. |
| 2d | #176 | solo | Retires the `/settings/system` overview that #174 has already stripped. Must follow #174. |
| 3 | #177, #178 | 2 parallel worktrees | #177 owns `system/page.tsx` + `header.tsx` + `navigation.ts`; #178 owns `settings-nav.ts` + Gmail pages + e2e spec. Strict ownership split. |
| 4a | #165, #166 | 2 parallel worktrees | `api/search/route.ts` vs `global-search-command.tsx` — disjoint. |
| 4b | #164 | solo | Touches **both** search files; must follow 4a. |
| 4c | #179 | solo | Blocked by #178 (final Settings shape) and by #164 (shares the palette's permission filtering). |

## Per-issue interpretation of "done"

- **#163** — `prettier` is a declared devDependency at a version `@react-email/render`
  accepts, and `npm ci` from an empty `node_modules` yields a green `npx vitest run`.
  Done means the *fresh-install* path is green, not the currently-masked one.
- **#164** — Each of the six result categories is filtered by the permission gating its
  section, and the four hardcoded Quick Actions by the permission their route requires.
  Traces to the same principle the sidebars already apply; ADR-neutral.
- **#165** — The recorded query text has a reader, or is not recorded. A judgement call;
  see DECISIONS.md. Done either way means no admin keystroke is stored with no consumer.
- **#166** — The on-screen badge number and the `Cmd+N` target derive from **one**
  rendered order. Done is the two agreeing at every list length, with a test.
- **#167** — `/system` has a `ROUTE_PERMISSIONS` entry and sits in `adminOnlyRoutes`;
  a signed-out request to `/system` redirects to login. No visible change. This is the
  precondition ADR-0004 names as "a prerequisite of the first relocation, not follow-up work".
- **#168** — Chairman holds `settings.view` and nothing more; `/settings` opens for them
  and lists only the eight-or-so areas their nine existing permissions already allow.
  The two documents asserting the stronger claim are corrected. ADR-0006 verbatim.
- **#169** — A submenu the reader opened but did not navigate into survives navigation,
  via a module-level store on `useSyncExternalStore` mirroring
  `use-settings-nav-state.ts`. `use-sidebar-state.ts` is explicitly **not** touched.
- **#170** — A collapsed group reopens when entered *from outside* the group, and stays
  as set when moving within it; the mobile sheet is multi-open on the same
  sessionStorage key as desktop. Done is the two surfaces being one model.
- **#171** — Audit logs live at `/system/audit-logs`, the old path permanently redirects,
  **both** ROUTE_PERMISSIONS entries exist, the two dashboard links point at the new path,
  and a `/system` sibling of `settings-nav-coverage.test.ts` exists and would fail on an
  unguarded `/system` page. That test is the deliverable that matters most here.
- **#172** — `/settings/roles` keeps Role Definitions + Assignment Rules under **both**
  `SYSTEM_MANAGE_ROLES` and `SYSTEM_ASSIGN_ROLES`; `/system/accounts` holds the three
  account tabs under `SYSTEM_ASSIGN_ROLES` alone. Components move unchanged.
  Account approval is a thing you watch, so ADR-0004 moves it.
- **#173** — One queue backend: `queue.ts` + `QueueViewer` survive, `queue-management.ts`
  is retired. Hard-delete and Clear Queue are an accepted, deliberate loss — cancel and
  retry replace them. Queue and history become two pages under `/system/*`.
- **#174** — `/api/health/cron-status` refuses an unauthenticated caller (verified by
  request, not by inspection), one canonical cron page at `/system/cron-status`, and the
  two stale links — `CronHealthCard`'s and the one inside the outage-alert **email** —
  point somewhere real. The security half is not deferrable.
- **#175** — The ownership backfill is at `/system/data-tools`. Per ADR-0004 it is a tool
  that merely lived nearby, not a trigger running the rule above it, so it moves. The
  dead `dataManagementVisible` branch and its amber card go with it.
- **#176** — `/settings/maintenance` and `/settings/data-retention` exist, the
  `/settings/system` overview is retired, permissions are **byte-identical** to before.
  A path move, not an authorization change.
- **#177** — `/system` answers "is anything wrong?" in one page, with cards linking to the
  relocated surfaces, and the header's pulsing health link points at it.
- **#178** — `settings-nav.ts` is six subject groups, ~24 links, depth 2, matching the
  table in the issue; the two Gmail pages are one, built on the config page's markup;
  and **the two e2e group-name regexes are updated** — a selector that silently stops
  matching is the failure mode this slice invites.
- **#179** — Palette entries are *generated from* `settings-nav.ts` and the System section
  of `navigation.ts`, so they cannot drift, and are permission-filtered with the same
  `hasAnyPermission` the sidebars use. "email import" finds the page.

## Contradictions and gaps found while planning

1. **Trunk name.** The mission says `main`; the repo's is `master`. Adapted throughout.
2. **Branch prefixes.** `AGENTS.md` enumerates lanes (`codex/issue-*`, `feat/*`, `fix/*`,
   `qa/*`, `merge/*`) and does not include `epic/*` or `issue/*`. The mission names them
   explicitly. Mission wins; logged in DECISIONS.md.
3. **The ADRs were not on `master`.** They existed only on unmerged, PR-less
   `feat/settings-ia-docs`. The epic would otherwise have been built against design
   documents absent from its own tree.
4. **`npm test` is a trap.** It is bare `vitest`, i.e. watch mode — it never exits. Every
   issue body says "npm test". All agents are briefed to run `npx vitest run` instead.
5. **No root `typecheck` script**, though `deploy-admin-guide.yml` calls
   `npm run typecheck` — that job runs inside `website/`, which has its own. The app's
   typecheck is `npx tsc --noEmit`.
6. **#174 and #176 collide.** Both dispose of parts of `/settings/system`: #174 retires
   `/settings/system/health` and the overview's cron section, #176 retires the overview
   itself. Neither issue mentions the other. Serialized #174 → #176.
7. **The baseline typecheck was red** on `master`. Repaired in its own commit before any
   epic work; see BASELINE.md.
8. **#165 states a genuine either/or** rather than a decision. Resolved in DECISIONS.md.

## Wave 3 recon (gathered before dispatch, so the briefs are concrete)

**#177 `/system` dashboard is assembly, not new data plumbing.** Every card it needs
already has a server action:

| Card | Source |
|------|--------|
| cron health | `getCronStatus()` — `src/actions/system/cron-status.ts` (guarded, #174) |
| notification queue depth | `getQueueStatistics()` — `src/actions/notifications/queue.ts:101` |
| recent audit activity | `getAuditStats()` / `getAuditLogs()` — `src/actions/audit/get-audit-logs.ts` |
| accounts awaiting approval | `src/actions/auth/account-approval.ts` |
| data tools | link only — `/system/data-tools` |

**#178 baseline as of post-#174:** `settings-nav.ts` has **6 groups and 32 distinct
`/settings` hrefs** — General & Preferences, Estate Configuration, Access & Security,
Billing & Finance, Communications, System Health. #176 collapses System Health into
"Maintenance & Data"; #178 rewrites the rest to the six subject groups in the issue,
targeting ~24 links. The two Gmail pages are 143 lines (base) and 159 (config); the issue
says take the config page's richer markup as the base.

## Two tensions #178 must resolve (found before dispatch)

**1. The issue's six-group table is not an exhaustive inventory.** It lists 27 links across
six groups, but `settings-nav.ts` currently carries **31** distinct `/settings` hrefs, and
`settings-nav-coverage.test.ts` asserts *every* settings page on disk is listed in nav
unless it is an explicit redirect stub. The clearest omission is
**`/settings/email/debug`** ("Debug & Testing"), a real page currently under Communications
that the table does not mention. Dropping it to match the table literally makes the
coverage test fail with `unlisted: /settings/email/debug`. #178 must reconcile the table
against what is actually on disk and report every page the table omits, rather than
following the table into a red test.

**2. Both e2e group-name regexes break, and would break silently.**
`e2e/enhancements.spec.ts:96` matches `/billing.*finance/i` and `:113` matches
`/estate configuration/i`. Under the new grouping those become **Financial** and **Estate**,
so both selectors stop matching. The issue names this explicitly — a silently passing
selector is worse than a failing one — and it is the failure mode this slice most invites.

## Handoffs into #177

- `src/components/dashboard/header.tsx:94` still points the health indicator at
  `/settings/system`. #176 correctly left it (outside its boundary, still resolves via the
  new stub); #177 names that exact line as its own work.
- The retired `/settings/system` stub currently redirects to `/settings`. Once `/system`
  exists, #177 may re-point it — its call, recorded in D19.
