# Migrations on merge

Merging a branch that adds migrations obliges you to apply them. A merge that
lands migration files without running them leaves the database behind the code
and, worse, leaves the repo describing a database that does not exist.

This is not hypothetical. On 2026-09-02 the production database had **six**
applied migrations whose files existed only on an unmerged branch
(`20260829100000` through `20260830090000`). Reading `master`'s migrations gave
a false picture of the live schema — an audit of `get_my_role()` quoted a
definition from `20260106110000` that production had superseded months earlier
via one of those six. The auditor was not careless; the repo lied.

## Two databases, two merges

Since 2026-10-11 (#420) every change reaches production through two merges,
and each merge has its own database:

| Merge | PR base | Apply to | When |
| --- | --- | --- | --- |
| feature or fix PR | `stage` | **Residio_Stage** | right after the merge, before UAT |
| release PR (`Release vX.Y.Z`) | `master` | **Residio_Prod** | right after the merge, before the prod deploy |
| hotfix PR | `master` | **Residio_Prod**, then Residio_Stage when `master` is merged back into `stage` | right after each merge |

So a migration is applied **twice**, at two different times. Between releases
it is normal for Residio_Stage to be ahead of Residio_Prod; the release PR
should list the migrations it carries, and the person merging it applies
exactly those to Residio_Prod and verifies them there by name.

## The rule

**Before merging**, enumerate what the branch adds that the target lacks.
Compare the PR's **base ref** with its head, not your working tree. The base
is `stage` for a feature PR and `master` for a release or hotfix PR; never
hard-code one:

```bash
BASE=stage   # or master, for a release or hotfix PR
diff \
  <(git ls-tree -r --name-only "origin/$BASE" -- supabase/migrations/) \
  <(git ls-tree -r --name-only origin/<branch> -- supabase/migrations/)
```

**After merging, apply them** to that base's database (table above). The merge
is not complete until that database's ledger matches. If you are not in a
position to apply them — no database access, or a precondition is unmet — say so explicitly in the merge report and record it on
the tracking issue. An unapplied migration that someone knows about is a task;
one nobody knows about is the six-orphan state above.

## Verify against the database, never the directory

**Check the applied list by name.** In every failure mode described here, the
migrations directory looks correct. It is the ledger that tells the truth:

```
list_migrations          # Supabase MCP
supabase migration list  # CLI
```

Compare by migration *name*, not by counting files and not by assuming the
highest version implies everything below it ran.

## Four traps, all of which have occurred here

**Version ordering.** A branch migration timestamped *earlier* than the last
applied version will be treated as already past and silently skipped. Check the
branch's lowest new version against the ledger's highest applied version before
merging. Five migrations sat in exactly this state and were reconciled on
2026-09-02 (#138, now closed); the ledger and `master` agree again.

**`apply_migration` assigns its own version.** The Supabase MCP tool takes only a
name and a query and stamps the ledger with its own execution timestamp. Since #374
`migration-drift.mjs` pairs by name, so this is **not drift** and CI stays green without
any follow-up (#305, verified on Residio_Stage 2026-10-14). **Restoring the authored
version is recommended**, so the ledger and the file agree for the version-ordering trap
above and for anything keyed on version. Do not rename the file, because the PR, issue and
handoff records already name it:

```bash
npm run db:reconcile-version -- <authored-version> <name>   # prints SQL; refuses if no such file
```

Run the printed SQL on the same database through `mcp__supabase__execute_sql`, then
confirm with `list_migrations` that the authored version is present and the stray
stamp is gone. Do not bulk-rewrite historical rows; that is #283/#279 work.

**Some migrations must not be applied.** Correct intent is not sufficient. A
migration can be well-written, well-commented, fix a real bug, and still be the
direct cause of an open P0. **Before applying anything touching RBAC, auth, or
RLS, check open issues for that area.**

**A note about a file is not the file.** This document used to name
`20260830100300_get_my_role_resolves_custom_roles.sql` as the standing example
of a permanently withheld migration, because its fallback granted every
unrecognised role a legacy `admin`/`chairman` bucket that ~100 RLS policies
trust. That description stopped being true on 2026-09-02: the file was
**rewritten in place** by `ea96bc3` into #141's *fix*, which denies custom roles
(`ELSE RETURN NULL;`). The note tracked a filename; the content changed beneath
it. A later session read the note, did not open the file, and came within one
command of deleting the fix — which would also have broken
`src/__tests__/legacy-role-rls-boundary.test.ts`, the regression guard that
reads that exact path.

So: **verify a withheld migration's current contents before acting on any note
about it**, and when you withhold one, record what it *contains* — a commit SHA
or the specific lines — not just its filename.

**A withheld migration must be recorded twice.** On the tracking issue and in
the next handoff comment on issue #412. Otherwise the next person sees a gap in the applied
sequence, assumes an oversight, and applies the file — reintroducing whatever
it was withheld for.

## What this rule cannot do

It binds sessions that read `CORE.md` — which is every harness. It does not bind
a human merging from the GitHub UI, and nothing here can. Treat it as a standing instruction for
agent-driven merges, not as an enforced gate.

## Related

- `CORE.md` — section 11 (this rule in the canonical set), section 5 (Supabase is cloud-only)
- `docs/agents/session-roles.md` — the peer arrangement these merges may run under
- Issue #412 — where deferred and withheld migrations are recorded (`SESSION_STATE.md` is the frozen archive)
- `CLAUDE.md` — `## Supabase MCP`, for the tool names themselves
