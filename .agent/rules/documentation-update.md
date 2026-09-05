---
trigger: always_on
---

# Tracking and documentation

Superseded by `CORE.md` -- read `CORE.md` section 14 ("Progress tracking").

Summary of what binds:

- **GitHub issues are the tracker.** `TODO.md` is the product backlog, `ACTIONPLAN.md` the
  active plan, `SESSION_STATE.md` the sole live handoff. Keep each in its own lane.
- Update `TODO.md` as work completes: mark finished items, add discovered follow-ups.
- Run `npm run docs:drift` before wrapping up any session that touched `src/**`
  (`CORE.md` section 12).

**Do not commit or push automatically.** An earlier version of this rule authorised committing
without asking whenever a bug was confirmed fixed. That is withdrawn: implementing agents commit
and stop, and the user does the merging (`CORE.md` sections 15 and 16).
