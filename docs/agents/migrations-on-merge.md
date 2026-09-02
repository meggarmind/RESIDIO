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

## The rule

**Before merging**, enumerate what the branch adds that the target lacks.
Compare the two refs, not your working tree:

```bash
diff \
  <(git ls-tree -r --name-only origin/master -- supabase/migrations/) \
  <(git ls-tree -r --name-only origin/<branch> -- supabase/migrations/)
```

**After merging, apply them.** The merge is not complete until the ledger
matches. If you are not in a position to apply them — no database access, or a
precondition is unmet — say so explicitly in the merge report and record it on
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

**`apply_migration` assigns its own version.** The Supabase MCP tool records the
migration under a timestamp it chooses, not your filename. After applying
through it, filename and ledger disagree. Reconcile one to the other — renaming
the file is usually right, since the ledger records what actually ran — and say
in your report which side you changed.

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
`SESSION_STATE.md`. Otherwise the next person sees a gap in the applied
sequence, assumes an oversight, and applies the file — reintroducing whatever
it was withheld for.

## What this rule cannot do

It binds sessions that read `CLAUDE.md`. It does not bind a human merging from
the GitHub UI, and nothing here can. Treat it as a standing instruction for
agent-driven merges, not as an enforced gate.

## Related

- `docs/agents/session-roles.md` — the two-session arrangement these merges run under
- `SESSION_STATE.md` — where deferred and withheld migrations are recorded
- `CLAUDE.md` — `## Supabase MCP`, for the tools themselves
