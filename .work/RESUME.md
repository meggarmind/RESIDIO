# RESUME — written 2026-09-04, for the session after the Supabase MCP restart

**Read this first, then `.work/STATE.md`.** Reconcile both against `git log --oneline -20`,
`git branch -a`, `gh issue list`. Git and GitHub win on any disagreement.

This session ended deliberately, to restart with the Supabase MCP server connected. It had
failed with `CONNECT_TIMEOUT` at session start and stayed down throughout, so **every
database claim below comes from reading migration files, not from the database.** That is
the whole reason to restart.

## Do this first, before anything else

The Supabase MCP server should now be reachable. Confirm it, then run the four checks that
were blocked. They are ordered by consequence, not effort.

### 1. Is there a live access bug right now? (highest priority)

32 RLS policies across 25 tables gate on `profiles.role`. That column is `NULL` for every
account created since `20260829100400`, and the **only** thing that populates it is
`assignRoleToProfile()` (`src/actions/roles/assign-role.ts:318`). A super_admin provisioned
any other way — including directly in the database, which is how they have been created
here — would hold a valid RBAC role, pass all 80 `get_my_role()` policies, and be **denied
on all 25 of those tables**, including `audit_logs`, `payment_records` and
`estate_bank_account_passwords`.

```sql
-- Does any active admin have a role_id but no legacy role?
SELECT p.id, p.approval_status, ar.name AS rbac_role, p.role AS legacy_role
FROM profiles p LEFT JOIN app_roles ar ON ar.id = p.role_id
WHERE p.approval_status = 'active' AND p.role IS NULL AND p.role_id IS NOT NULL;
```

Any row returned is an account that is silently locked out of 25 tables. **If this returns
rows, it is a live P0 and it changes the ordering of epic #182** — the 32 policies (#186,
#187) stop being cleanup and become the fix.

### 2. Are all permission seeds actually applied?

All 103 `PERMISSIONS` constants in `src/lib/auth/action-roles.ts` have matching
`INSERT INTO app_permissions` statements in the migration files. Whether those migrations
ran is unverified. A constant with no seeded row denies everyone.

```sql
SELECT name FROM app_permissions ORDER BY name;   -- diff against the 103 constants
```

### 3. Is `has_security_permission()` genuinely orphaned?

Slice #191 drops it. In the migration files it has zero policy callers and zero app
callers. Confirm nothing in the live database references it before dropping.

### 4. Does the invariant already hold?

Slice #184 adds a trigger requiring at least one active super_admin, and **fails the
migration if the invariant is already violated** (deliberately — it must never create an
administrator). Check first so that is not a surprise:

```sql
SELECT count(*) FROM profiles p JOIN app_roles ar ON ar.id = p.role_id
WHERE ar.name = 'super_admin' AND p.approval_status = 'active';
```

## Where everything stands

**Nothing is uncommitted. Nothing is unpushed.** All four worktrees are clean and every
branch is level with origin.

### Epic #180 — Settings IA — 16 of 18 closed

Integration branch `epic/180`, pushed. See `.work/STATE.md` for the full table.

- **#179** is the next slice (wave 4c): index Settings and System in the Cmd+K palette.
  Its brief is in `.work/STATE.md` under "Next action".
- **#181** was verified and re-scoped this session — the issue as filed was wrong in both
  directions. **The correcting comment on the issue is the brief**, not the original body.
  It now also absorbs the pre-epic cleanup (user's call): the unread `AuthorizationResult.role`,
  the dead `LEGACY_TO_NEW_ROLE_MAP`, middleware's unused `role` select, and the UI/server
  divergence at `role-assignment-section.tsx:169` / `pending-accounts-list.tsx:72`.
  It needs a migration (the `audit_logs` RLS policy), so it needs the database.

### Epic #182 — remove the legacy role vocabulary — filed, not started

Designed end-to-end with the user this session through a full grilling round; every branch
of the design tree was settled and confirmed. Twelve slices, **#183–#194**.

- **`docs/adr/0007-one-role-vocabulary.md`** is the binding design. **PR #195, open,
  awaiting review.** Read it before touching any slice.
- **#183** is the only slice marked `ready-for-agent` — the ratchet test that stops new
  migrations referencing `profiles.role`. It needs no database and lands before the epic.
- Everything else is `backlog`. The epic starts after #179 and #181.
- **Live database access is a hard precondition** on every migration slice.

### Open PRs — both mine, both awaiting the user

- **#195** `feat/adr-role-vocabulary` → master. ADR-0007. Docs only, +38/−0.
- **#196** `fix/claude-md-to-issues` → master. Removes the `to-issues` skill reference from
  `CLAUDE.md`; the skill is not installed on this machine and the instruction fails when
  followed. Keeps the standing "file the plan, don't just describe it" behaviour.

### Worktrees

| Path | Branch | State |
|---|---|---|
| `C:/projects/RESIDIO` | `epic/180` | integration branch, clean, pushed |
| `.worktrees/issue-164` | `issue/164-search-permission-filter` | merged and closed; keep per D15 |
| `.worktrees/adr-role` | `feat/adr-role-vocabulary` | PR #195 |
| `.worktrees/claude-md` | `fix/claude-md-to-issues` | PR #196 |

Do **not** `git worktree remove` anything that ever had a junction (D14/D15). Leave the
directories; `git worktree prune` at the very end of the epic.

## Two hazards that must not be lost

1. **Bucket collapse.** `get_my_role()` maps `vice_chairman → chairman` and
   `financial_officer → financial_secretary`. Rewriting a policy by renaming its literals
   silently revokes an entire role across 28 tables, and the result is a perfectly
   well-formed policy no test catches. Rewrites must **expand** the bucket. Full detail in
   ADR-0007 and #190.
2. **Silent denial.** A missed reader of `profiles.role` gets `NULL` and quietly denies
   rather than erroring — which is why #193 renames the column before #194 drops it.

## Session notes

- `npm test` is bare `vitest` — watch mode, never exits. Always `npx vitest run`.
- Two test files time out under full-suite load and pass alone:
  `whatsapp/webhook/twilio/route.test.ts` and `module-integration.test.ts` (D10, D25).
  A full-suite timeout is not a failure until re-run in isolation.
- Gates on `epic/180` at last run: 75 files / 446 tests, tsc 0, lint 0 errors / 326
  warnings, build 0.
- `SESSION_STATE.md` was explicitly ruled **out of scope** by the user for now. It still has
  the structural problems noted in its review (21 sections titled "Last session", a
  snapshot from 2026-08-12 with two contradictory `Lint` rows, `Git branch | master`).
