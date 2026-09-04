# One role vocabulary: `app_roles.name` is the only name a role has, and `profiles.role` is removed

Residio has carried two role vocabularies since the RBAC system was introduced. The legacy one is the `profiles.role` column, typed by the `user_role` enum, with four values — `admin`, `chairman`, `financial_secretary`, `security_officer`. The real one is `app_roles.name`, where the same concepts are called `super_admin`, `chairman`, `financial_officer`, `security_officer`, alongside roles the legacy vocabulary cannot express at all: `vice_chairman`, `secretary`, `project_manager`, and every custom role an administrator creates through Roles & Permissions. This decision removes the legacy vocabulary entirely.

The original intent was narrower than what grew. A default administrator, tied to the super administrator role and undeletable, would create other local administrators and approve social logins onto roles, and from there the estate would be administered through those accounts. The legacy column was how that first administrator was recognised. The system has long since outgrown it, and the column now surfaces as a blocker rather than a bootstrap: it is why issue #181 exists, and why an audit-log boundary this project decided in ADR-0006 does not hold in the database.

## What is actually there

The column is closer to dead than it appears, which changes the shape of the work. `get_my_role()` no longer reads `profiles.role`; it resolves `profiles.role_id` to `app_roles.name` and maps the result onto the legacy enum. `handle_new_user()` writes `NULL` for every new signup. The column is nullable with no default, and exactly one code path still populates it — `assignRoleToProfile()` in `src/actions/roles/assign-role.ts`.

That splits the 112 dependent RLS policies into two populations that have nothing in common but their words:

- **80 policies across 28 tables call `get_my_role()`.** They are already RBAC-backed and correct. They simply speak the old vocabulary.
- **32 policies across 25 tables read `profiles.role` directly**, bypassing RBAC entirely. These guard `audit_logs`, `payment_records`, `estate_bank_account_passwords`, `gmail_oauth_credentials`, `whatsapp_provider_credentials`, `search_logs` and the invoice-generation tables.

The second group is where the damage is. Because they test a column that is `NULL` for every account created since August 2026, and populated only by one function, an administrator provisioned by any other path — including directly in the database, which is how super administrators have been created here — holds a valid RBAC role, passes all 80 policies, and is denied by all 32. The same group is why chairman can read audit logs at the database level in contradiction of ADR-0006: the policy thinks in role buckets rather than in permissions.

The two groups therefore get different treatments. The 32 are rewritten to explicit `has_permission()` checks, because bucket semantics is the defect, and re-expressing them as buckets would carry the defect forward. The 80 are retargeted to `get_my_role_name()`, preserving the access they already grant. Rewriting those 80 as permission checks would not be a migration but an authorization redesign across 28 tables, where one wrong judgement either locks administrators out or opens a table; that work belongs to individual modules, later, not to a vocabulary removal.

## Two hazards this decision exists to record

**Rewriting a `get_my_role()` policy is not a find-and-replace.** The function collapses distinct roles into shared buckets: `vice_chairman` returns `chairman`, and `financial_officer` returns `financial_secretary`. A policy reading `get_my_role() IN ('admin', 'chairman')` therefore admits four RBAC roles, not two. Renaming the literals to `('super_admin', 'chairman')` silently revokes every vice_chairman across 28 tables, and the resulting policy is perfectly well-formed — no structural test, type check or review of the diff in isolation will catch it. **Every such rewrite must expand the bucket into the roles it actually admitted.** This is the single most likely way this work causes an outage, and it is invisible unless you already know to look for it.

**The column is renamed before it is dropped.** A reader we miss does not crash; it reads `NULL` and quietly denies, and the symptom is scattered permission errors across 25 tables with no obvious common cause. Renaming `role` to a deliberately unusable name, merging that, and letting it run converts every missed reader into an immediate error naming the exact column. The drop then becomes uneventful, which is the only acceptable state for a destructive migration on the authorization system. The rename is reverted with one statement, which is what makes it safe to attempt at all.

## The bootstrap intent, restated

The undeletable administrator survives this decision, expressed in RBAC terms rather than legacy ones, and stated positively: **at least one active profile must always hold the `super_admin` role.** Protecting one specific row was the original idea and is the weaker one — it breaks the day that person leaves, and it invites a workaround. The invariant covers deletion, demotion and deactivation in a single rule, and it is enforced by database trigger rather than in application code, because the paths that have historically created and modified administrators here include direct database access.

It is guarded on both tables that can violate it. The trigger on `profiles` covers deletion, a change of `role_id`, and a change of `approval_status` away from active. A second trigger on `app_roles` covers deletion of the super administrator role itself: `profiles.role_id` is declared `ON DELETE SET NULL`, so removing that role would silently orphan every holder without any trigger on `profiles` observing it. A migration that finds the invariant already violated fails and says so rather than creating an administrator to satisfy itself — a migration that grants `super_admin` is the same privilege-escalation shape that `handle_new_user()` was hardened against in `20260829100400`.

## What follows from this

The RBAC vocabulary is frozen as it stands. If a role name is wrong, it is renamed after this work, when there is only one name to change; renaming during the migration would mean that when something breaks, nobody can tell whether the mapping is wrong or the name is.

Correctness is demonstrated by a role-access matrix — for each built-in role, which tables it may and may not read — captured as a baseline before the first policy slice and diffed after each one. Any cell that flips from allow to deny is either intended or a bug, and the diff forces someone to say which. Structural tests run alongside it, but they cannot see the bucket-collapse hazard, because the broken policy is well-formed.

New migrations may not reference `profiles.role`. This is enforced by a test that allowlists the existing 32 by filename and fails on anything new, so the number can only go down. It is needed because the most recent migration in the repository at the time of writing — `20260902102528_create_whatsapp_provider_credentials.sql`, adding a policy on a table its own comment describes as holding decryptable secrets — was written against the legacy column days after the retirement work began.
