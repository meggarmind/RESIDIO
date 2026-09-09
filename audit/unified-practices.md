# Unified practices — candidate pool (v0.1)

**Status: candidate pool, not an adopted file.** Every plausibly reusable rule found in the
first audited repository is here, untrimmed. Curation — length budget, merges, cuts, and the
owner's own practices — happens in a later session.

Format: `ID · STRENGTH · [repos observed] · KEEP|REVIEW — rule` (REVIEW rules carry a trailing
half-line saying why).

Repos observed so far: **RESIDIO** (1).

---

## 0. Precedence — which layer wins

When two instructions conflict, resolve in this order. Higher wins.

1. **A direct instruction from the user in the current session.** It overrides every file.
2. **Harness-enforced configuration** — permission deny lists, hooks, branch protection, CI
   gates. Not because it is more correct, but because it is what actually happens. If a file
   contradicts a live gate, the file is wrong until someone changes the gate.
3. **This portable core** (§1–§10 below).
4. **The repository's canonical rules file** (`AGENTS.md`, or whatever the repo declares) for
   anything project-specific.
5. **Subordinate docs the canonical file points at** (`docs/agents/*.md` and similar).
6. **Agent-, skill- and command-scoped instructions**, within their own scope only.
7. **Persistent memory** — advisory. Memory records what was true when written; a file the
   memory contradicts wins unless the memory is the more recent correction.

Reasoning: layers 1–2 are the two that can actually bind, so they sit on top. The core sits
above repo files because it exists to survive a repo's local drift — RESIDIO produced nine
live contradictions between files that each individually claimed authority. Below the core,
specificity wins, which is the ordinary convention and the one readers expect. Memory ranks
last because it is invisible to every other tool and cannot be reviewed in a PR.

**Corollary, learned from RESIDIO:** a precedence clause does not prevent drift. RESIDIO's
`CLAUDE.md:5` states one ("if something exists in both, `AGENTS.md` wins; don't duplicate")
and still accumulated three direct contradictions between those two files. **Deduplicate to
one canonical home; use precedence only to break ties you failed to prevent.**

---

## 1. Git behaviour — core (universal)

- GIT-01 · **MUST** · [RESIDIO] · KEEP — Never commit or push on the default/protected branch; branch first.
- GIT-02 · **MUST** · [RESIDIO] · KEEP — A rejected push is the rule working: do not route around it, do not ask a human to force it, do not ask another agent or session to push on your behalf. Open a PR.
- GIT-04 · SHOULD · [RESIDIO] · KEEP — Push your branch early, before it has much on it; the push is how other sessions learn the branch is taken.
- GIT-05 · SHOULD · [RESIDIO] · KEEP — Check the remote branch list (`git ls-remote --heads origin`) before claiming a branch name.
- GIT-06 · **MUST** · [RESIDIO] · KEEP — Never push to a branch another session has declared without asking and waiting for an explicit answer; a clear is true as of its timestamp, not indefinitely.
- GIT-08 · SHOULD · [RESIDIO] · KEEP — Before stating what branch you are on, run `git rev-parse --abbrev-ref @{upstream}` and report that; a branch name is not evidence of its upstream.
- GIT-09 · SHOULD · [RESIDIO] · KEEP — Sync the base branch into yours before starting non-central work, and again before opening a PR.
- GIT-11 · **MUST** · [RESIDIO] · KEEP — Even a rollback goes through a PR; protection has no exceptions.
- GIT-12 · SHOULD · [RESIDIO] · KEEP — If a change touches multiple concerns, split it into smaller sequential commits.
- GIT-24 · SHOULD · [RESIDIO] · KEEP — Ask for explicit confirmation before each commit, one unit of work at a time; never auto-commit or batch commits across units without being asked.
- GIT-25 · **MUST** · [RESIDIO] · KEEP — Stage only the files belonging to the current unit of work; never `git add .` when the tree may hold another session's or another task's changes.
- GIT-27 · SHOULD · [RESIDIO] · KEEP — Infer the repository from `git remote -v`; never assume a default repo when calling `gh`.
- GIT-28 · SHOULD · [RESIDIO] · KEEP — When reading multi-repo tool output, resolve each item's repository explicitly; do not assume one repository.
- GIT-13 · SHOULD · [RESIDIO] · **REVIEW** — Commit attribution policy (whether to include tool/co-author trailers) — RESIDIO contradicts itself on this; decide once.
- GIT-29 · SHOULD · [—] · **REVIEW** — Conventional-commit prefixes (`feat:`/`fix:`/`perf:`) — assumed by RESIDIO tooling but never stated as a rule; adopt or drop deliberately.
- GIT-30 · **MUST** · [—] · **REVIEW** — No `git reset --hard`, `git clean -fd`, `git push --force`, or branch deletion without explicit per-instance confirmation — **not present in RESIDIO**; proposed to close GAP-05, where exactly this destroyed uncommitted work.

## 2. Testing and verification gates — core (universal)

- TEST-01 · SHOULD · [RESIDIO] · KEEP — Run the repo's lint and build after changes; run tests when the change could affect them.
- TEST-09 · **MUST** · [RESIDIO] · KEEP — Verify state against the authoritative ledger, never against the artefact that merely describes it (migrations: the database's applied list, never the migrations directory).
- TEST-10 · SHOULD · [RESIDIO] · KEEP — Never treat a self-reported completion marker (a ticked checkbox, a status field, a summary) as proof.
- TEST-11 · SHOULD · [RESIDIO] · KEEP — Count only merged or deployed work as complete; open or unmerged work is in progress.
- TEST-12 · SHOULD · [RESIDIO] · KEEP — Never approve from a description alone; without a diff, commit, or deployment artefact, hold.
- TEST-14 · SHOULD · [RESIDIO] · KEEP — Verify a sub-agent's claims against the actual files or diff before relaying them.
- TEST-15 · **MUST** · [RESIDIO] · KEEP — Verify the current contents of the thing a note describes before acting on the note; a note names a file, and the file's contents change beneath it.
- TEST-16 · SHOULD · [RESIDIO] · KEEP — Any claim about what the mainline contains must be checked with `git show origin/<branch>:<path>`, never a working tree — the tree may carry uncommitted edits, including your own sub-agents'.
- TEST-17 · SHOULD · [RESIDIO] · KEEP — Before reporting, state what the command actually establishes versus what you are about to claim; if they differ, widen the check or narrow the claim.
- TEST-18 · SHOULD · [RESIDIO] · KEEP — Any `head`, `-m`, `--limit` or default result cap makes a "nothing found" conclusion unsound; count matches or re-run uncapped before asserting absence.
- TEST-19 · SHOULD · [RESIDIO] · KEEP — Review work against its resulting behaviour, not against whether it complied with your request; a reviewer checking conformance to their own ask cannot catch a fault in the ask.
- TEST-21 · SHOULD · [RESIDIO] · KEEP — Mark anything you cannot prove from available evidence as needing manual verification rather than asserting it.
- TEST-23 · SHOULD · [RESIDIO] · **REVIEW** — Distrust clean narrow results most; they feel like corroboration and prove least. (Attitude, not action — may be redundant with TEST-17.)

## 3. File creation and placement — core (universal)

- FILE-03 · SHOULD · [RESIDIO] · KEEP — One handoff file per project; do not create parallel or per-session handoff documents.
- FILE-10 · **MUST** · [RESIDIO] · KEEP — Configuration files containing credentials are gitignored, always, and the ignore entry carries a comment saying why.
- FILE-14 · **MUST** · [RESIDIO] · KEEP — `.env*` is ignored except a committed `.env.example`; record the reason for any exception inline in `.gitignore` so a later edit does not silently undo it.
- FILE-02 · SHOULD · [RESIDIO] · KEEP — Generated files are never hand-edited; regenerate them.
- FILE-19 · SHOULD · [—] · **REVIEW** — All scratch/working files go to a single declared scratch location outside the repo — **not present in RESIDIO** (GAP-03); its `.gitignore` lists four historical scratch filenames instead of a rule.
- FILE-11 · SHOULD · [RESIDIO] · KEEP — When a file declares which sources it tracks, keep those globs narrow; a checker that fires on every commit gets muted within a week.
- FILE-20 · SHOULD · [—] · **REVIEW** — Never create a file outside the paths the task implies without saying so — inferred practice, not observed as a written rule anywhere.

## 4. Editing conventions — core (universal)

- EDIT-01 · SHOULD · [RESIDIO] · KEEP — One canonical home per rule; other locations become pointers, never copies.
- EDIT-02 · SHOULD · [RESIDIO] · KEEP — When the user describes a problem, analyse and present options before changing code; do not start editing on the strength of a problem report.
- EDIT-08 · SHOULD · [RESIDIO] · KEEP — Use the project's own vocabulary as defined in its glossary; do not drift to synonyms.
- EDIT-09 · SHOULD · [RESIDIO] · KEEP — If your output contradicts a recorded decision (an ADR), surface the contradiction explicitly rather than silently overriding it.
- EDIT-10 · SHOULD · [RESIDIO] · KEEP — Read the source document rather than reconstructing it from memory or a peer's summary; an arrangement run from a paraphrase is the failure the document exists to prevent.
- EDIT-14 · **MUST** · [RESIDIO] · KEEP — Never interpolate user input into raw SQL.
- EDIT-15 · **MUST** · [RESIDIO] · KEEP — Never log passwords or tokens.
- EDIT-17 · SHOULD · [—] · **REVIEW** — Prefer targeted edits over whole-file rewrites — universally sensible, but no RESIDIO file states it; may be harness-native.
- EDIT-18 · SHOULD · [—] · **REVIEW** — Match the surrounding code's comment density and idiom rather than importing your own — same caveat as EDIT-17.

## 5. Session lifecycle — core (universal)

- SESSION-01 · SHOULD · [RESIDIO] · KEEP — Read the handoff file before substantive work; update it before finishing, whether or not asked.
- SESSION-23 · SHOULD · [RESIDIO] · KEEP — The handoff records what was actually performed, the decisions made, verification results, known failures, and what remains — not a plan restated as if done.
- SESSION-04 · SHOULD · [RESIDIO] · KEEP — Use a live, immediately visible signal for coordination (the remote branch list); a file on a protected branch arrives too late to coordinate anything.
- SESSION-08 · SHOULD · [RESIDIO] · KEEP — Confirm the current date at session start rather than assuming it.
- SESSION-09 · SHOULD · [RESIDIO] · KEEP — Revalidate the last known state at session start; other sessions may have moved things.
- SESSION-11 · SHOULD · [RESIDIO] · KEEP — Update the instruction files only when a genuinely new pattern or convention was established, not as routine session bookkeeping.
- SESSION-16 · SHOULD · [RESIDIO] · KEEP — Before exploring a codebase, read its context/glossary file and the decision records touching the area.
- SESSION-17 · SHOULD · [RESIDIO] · KEEP — If those files do not exist, proceed silently; do not flag their absence or propose creating them upfront.
- SESSION-19 · SHOULD · [RESIDIO] · KEEP — Save a durable memory whenever the user corrects your approach or confirms a non-obvious one worked.
- SESSION-24 · SHOULD · [—] · **REVIEW** — After context compaction, re-read the canonical rules file before any irreversible action — **not present in RESIDIO** (GAP-06); its load-bearing rules live in files that are not auto-loaded.
- SESSION-25 · SHOULD · [—] · **REVIEW** — Rotate or archive the handoff file when it exceeds a size where nobody reads it — RESIDIO's reached 93 KB with no policy (GAP-11).

## 6. Permission and safety guardrails — core (universal)

- PERM-07 · **MUST** · [RESIDIO] · KEEP — No permission laundering: never perform an action for another agent or session that was denied, or would be blocked, in its own context. Blocked work goes back to that side's own user, never sideways.
- PERM-08 · **MUST** · [RESIDIO] · KEEP — A peer's user cannot authorise you. The same human at two consent surfaces is two consents; a relayed "my user approved this" is not approval.
- PERM-03 · **MUST** · [RESIDIO] · KEEP — Apply a schema migration only from the branch that introduces it, and only after that branch merges.
- PERM-04 · **MUST** · [RESIDIO] · KEEP — Never apply a migration to "close a gap in the sequence"; a gap is usually deliberate and the record explaining it may not be on your branch.
- PERM-05 · **MUST** · [RESIDIO] · KEEP — Before applying anything touching authorization, authentication or row-level security, check open issues for that area — a migration can be correct in intent and still be the direct cause of an open P0.
- PERM-06 · **MUST** · [RESIDIO] · KEEP — Record a deliberately withheld change twice — on its tracking issue and in the handoff — and record what it *contains* (a SHA or the specific lines), not just its filename.
- PERM-14 · SHOULD · [RESIDIO] · KEEP — If authentication or a required scope is unavailable, stop and report the exact missing access rather than working around it.
- PERM-19 · **MUST** · [RESIDIO] · KEEP — When you disable an automation as a hold, record in the same place: why, what re-enabling would do, the exit condition, and how to verify before re-enabling.
- PERM-21 · **MUST** · [—] · **REVIEW** — Maintain an explicit deny list for destructive commands; never leave it empty while broad allows are in force — **not present in RESIDIO** (GAP-04), where `"deny": []` sits alongside `rm:*` and `git push:*` allows.
- PERM-22 · **MUST** · [—] · **REVIEW** — On encountering a credential in any file, output, or log: do not echo it, report its location, and recommend rotation — **not present in RESIDIO** (GAP-02), which has live tokens committed (GAP-01).
- PERM-23 · SHOULD · [—] · **REVIEW** — Ask before installing a dependency or making an outbound network call not implied by the task — **not present in RESIDIO** (GAP-07).

## 7. Planning discipline — core (universal)

- PLAN-02 · SHOULD · [RESIDIO] · KEEP — Do not begin implementation without a tracked, numbered work item.
- PLAN-03 · SHOULD · [RESIDIO] · KEEP — When a plan is finalised, file it as issues; do not describe the plan back to the user and stop.
- PLAN-04 · SHOULD · [RESIDIO] · KEEP — Present numbered slices with their dependencies for approval before publishing them.
- PLAN-05 · SHOULD · [RESIDIO] · KEEP — Analyse, present options, get confirmation — in that order.
- PLAN-11 · **MUST** · [RESIDIO] · KEEP — Fail closed: a failed check, dirty tree, missing configuration, or merge conflict leaves the work item unfinished and preserves its workspace.
- PLAN-14 · **MUST** · [RESIDIO] · KEEP — Resolve identifiers by name at runtime and fail closed when required data is missing, rather than proceeding on a stale hardcoded ID.
- PLAN-12 · SHOULD · [RESIDIO] · KEEP — Completing a child item never closes its parent initiative.
- PLAN-17 · SHOULD · [RESIDIO] · KEEP — Move a work item's tracked status at defined points only, and say which points those are; every other transition is manual.
- PLAN-15 · SHOULD · [RESIDIO] · KEEP — Reference real item numbers in dependency sections; do not write placeholder references.

## 8. Delegation — core (universal)

- DELEG-03 · SHOULD · [RESIDIO] · KEEP — Set the model/tier explicitly on every delegated call; omission silently inherits the caller's, which is usually wrong and always undeclared.
- DELEG-01 · SHOULD · [RESIDIO] · KEEP — Match tier to work: cheapest tier for mechanical bulk work, default tier for well-specified implementation, top tier for genuinely tricky work (concurrency, subtle algorithms, adversarial review).
- DELEG-04 · SHOULD · [RESIDIO] · KEEP — When unsure between tiers, pick the cheaper and escalate on failure.
- DELEG-05 · SHOULD · [RESIDIO] · KEEP — Set a default sub-agent count and tier, and state them.
- DELEG-06 · SHOULD · [RESIDIO] · KEEP — Either limit may be exceeded when complexity warrants — but say so and why, in the report. Silently scaling up is a violation.
- DELEG-07 · SHOULD · [RESIDIO] · KEEP — Split by independence, not by file; fan out only where subtasks do not depend on each other's output, and sequence the rest.
- DELEG-08 · SHOULD · [RESIDIO] · KEEP — Brief a fresh agent like a stranger: the dispatch prompt carries the specific files, line numbers and acceptance criteria itself, never "per the plan above".
- DELEG-09 · SHOULD · [RESIDIO] · KEEP — Use a forked/continuing agent for continuity; use a fresh agent when independence from your own framing is the point.
- DELEG-10 · SHOULD · [RESIDIO] · KEEP — Sub-agents return raw observations; you do the interpretation. Never pass a summary through unchecked.
- DELEG-13 · SHOULD · [RESIDIO] · KEEP — A coordinating session consolidates and interprets rather than implementing; when it handles something itself, it says so — the threshold is a convenience, not a loophole, and it erodes silently if undisclosed.
- DELEG-14 · SHOULD · [RESIDIO] · KEEP — A reviewer advises and has no veto — but when you decline a point, say so plainly with the reason. Silently dropping feedback defeats the arrangement.
- DELEG-15 · SHOULD · [RESIDIO] · KEEP — Do not queue work under a term the other side cannot run; confirm their environment provides it first. An unrunnable term is the sender's error.
- DELEG-02 · SHOULD · [RESIDIO] · **REVIEW** — Banned model tiers — repo-specific list, but the *pattern* (an explicit never-use tier) may be worth carrying.

## 9. Communication and output style — core (universal)

- COMM-01 · SHOULD · [RESIDIO] · KEEP — Open every cross-session message with an explicit `[sender -> recipient] subject` signature line; the recipient cannot rely on the displayed sender name.
- COMM-02 · SHOULD · [RESIDIO] · KEEP — Address a peer by the name in your own agent listing, never by the name it calls itself; display names are locally assigned and asymmetric.
- COMM-03 · SHOULD · [RESIDIO] · KEEP — `success: true` means accepted-for-delivery, not receipt. A substantive reply is the only proof. Report an unanswered send as unconfirmed, not done.
- COMM-04 · SHOULD · [RESIDIO] · KEEP — Disclose intended pushes up front, naming the target branch; if two sides would touch one branch, sequence rather than race.
- COMM-05 · SHOULD · [RESIDIO] · KEEP — Before promising that work stays local, check your own machine for a hook that commits or pushes at session end, and state which case you are in.
- COMM-06 · SHOULD · [RESIDIO] · KEEP — Send findings to the peer who can act on them, not only to the user — and include the checks that came back clean, so the peer knows what ground is covered.
- COMM-08 · **MUST** · [RESIDIO] · KEEP — Never fabricate criteria, tests or checks; state unavailable evidence plainly.
- COMM-11 · SHOULD · [RESIDIO] · KEEP — When an action fails, report the exact failure rather than a paraphrase.
- COMM-12 · SHOULD · [RESIDIO] · KEEP — When you deviate from a convention (crossing a branch lane, skipping a step), say so in the record rather than leaving the artefact to mislead the next reader.
- COMM-09 · SHOULD · [RESIDIO] · **REVIEW** — A stated length budget for reasoning in reports (RESIDIO: "2-3 sentences max, tied directly to evidence") — worth generalising, but the number is arbitrary.
- COMM-10 · SHOULD · [RESIDIO] · **REVIEW** — "Focus on working code over explanations" — sub-agent-scoped in RESIDIO; may or may not suit a main session.
- COMM-16 · SHOULD · [—] · **REVIEW** — Default output verbosity for the main session — **no rule exists in RESIDIO** (GAP-10); this is a slot for your own preference.

## 10. Escalation — core (universal)

- ESC-01 · SHOULD · [RESIDIO] · KEEP — If a document a procedure depends on is missing from this checkout, stop and say so; do not reconstruct it.
- ESC-02 · SHOULD · [RESIDIO] · KEEP — When required access is unavailable, report the blocker explicitly rather than working around it or going quiet.
- ESC-03 · **MUST** · [RESIDIO] · KEEP — When you cannot complete an obligation a merge created (applying a migration, running a check), say so explicitly in the report *and* record it on the tracking item. A known gap is a task; an unknown one is an incident.
- ESC-07 · SHOULD · [RESIDIO] · KEEP — If a required external system is unreachable, stop and report the exact access or network failure.
- ESC-08 · SHOULD · [RESIDIO] · KEEP — When acceptance criteria are ambiguous or verification needs information you cannot get, hold and ask — do not resolve the ambiguity yourself and proceed.
- ESC-09 · SHOULD · [RESIDIO] · KEEP — Treat a negotiated arrangement as unsettled until the counterpart confirms; delivery is not agreement.
- ESC-10 · SHOULD · [RESIDIO] · KEEP — A queued task that skips a required convention is the sender's error — bounce it rather than improvising around it.
- ESC-11 · SHOULD · [RESIDIO] · KEEP — A peer may decline work or seek its own authorisation; that is legitimate and not something to route around.
- ESC-13 · SHOULD · [RESIDIO] · KEEP — If the concept you need is not in the project's glossary, treat that as a signal: either you are inventing language the project does not use, or there is a real gap worth noting.
- ESC-04 · SHOULD · [RESIDIO] · **REVIEW** — Flag to the user before building anything outside the declared priority area — RESIDIO frames this around one product decision; the generalisable form is "check scope before investing".

---

## 11. Stack-dependent rules (not core)

Carry these only into projects using the same stack.

### Supabase / Postgres
- PERM-01 · **MUST** · [RESIDIO] · KEEP — Cloud-only: never run local Supabase CLI commands (`supabase start/stop/reset`, local `db push`). *And keep the package scripts consistent with this — RESIDIO's did not.*
- PERM-02 · **MUST** · [RESIDIO] · KEEP — Use the Supabase MCP tools for all database operations.
- TEST-24 · SHOULD · [RESIDIO] · KEEP — After applying through an MCP tool that assigns its own version, reconcile filename and ledger and say which side you changed.
- EDIT-19 · SHOULD · [RESIDIO] · **REVIEW** — On a `.select()` join, check for multiple foreign keys and use explicit `relation:table!column` syntax — from an unread rules file; verify it still matches the client version.

### Next.js / React / TypeScript
- FILE-01 · SHOULD · [RESIDIO] · KEEP — Import via the path alias, never relative.
- EDIT-05 · SHOULD · [RESIDIO] · KEEP — Do not use `revalidatePath()` in server actions for client-component pages; invalidate through the query client instead.
- EDIT-07 · SHOULD · [RESIDIO] · KEEP — Always use typed responses from server actions.
- EDIT-13 · SHOULD · [RESIDIO] · KEEP — Add `'use client'` only where hooks or handlers require it; prefer server components for data fetching.
- EDIT-06 · SHOULD · [RESIDIO] · **REVIEW** — Route all currency inputs through a dedicated component — good pattern, component name is repo-local.
- EDIT-04 · SHOULD · [RESIDIO] · **REVIEW** — Wrap raw design-system primitives in semantic layout components rather than using them directly in pages.
- EDIT-03 · SHOULD · [RESIDIO] · **REVIEW** — Define colours in OKLCH — design-system choice, not a behaviour rule.
- EDIT-16 · MAY · [RESIDIO] · **REVIEW** — Icon-library `title` workaround — too library-specific to carry.

### Git hosting / GitHub
- GIT-10 · **MUST** · [RESIDIO] · KEEP — A "last known good" branch advances only via CI, never by hand.
- PLAN-16 · SHOULD · [RESIDIO] · KEEP — Provide and run a `doctor` command when setting up a new machine or after configuration changes.
- TEST-13 · **MUST** · [RESIDIO] · KEEP — Define the gate commands (lint, test, build) in one config file that the workflow scripts read, so the gate cannot drift from the docs.

---

## 12. Repo-specific rules (RESIDIO only — do not promote without a second sighting)

- EDIT-11 · **MUST** · [RESIDIO] — Every write server action calls `authorizePermission()` first and `logAudit()` after success.
- FILE-13 · **MUST** · [RESIDIO] — New permission constants go in `src/lib/auth/action-roles.ts`; new entity types in `AuditEntityType`.
- EDIT-12 · SHOULD · [RESIDIO] — Do not re-add hard permission checks to allowlisted cron/webhook/recipient-facing actions.
- TEST-02 / TEST-03 / TEST-06 · SHOULD · [RESIDIO] — Run `npm test` after changes to `src/actions/**`; the structural test is the gate.
- TEST-04 / TEST-05 · SHOULD · [RESIDIO] — Run `npm run docs:drift` before wrapping a session that touched `src/**`; never `docs:verify -- --all` to clear an unread report.
- GIT-03 · SHOULD · [RESIDIO] — Branch prefixes declare the lane (`codex/issue-`, `feat/`, `fix/`, `qa/`, `merge/`).
- GIT-20 / GIT-21 / PLAN-08 / PLAN-09 / TEST-22 · [RESIDIO] — The `issue:workflow start|review|resume|finish` lifecycle.
- FILE-04 · **MUST** · [RESIDIO] — Per-issue worktrees at `.worktrees/issue-<n>`.
- PLAN-06 / PLAN-07 · [RESIDIO] — Project-board Status transition points. *Unresolved conflict — see CONF-05.*
- PLAN-13 · SHOULD · [RESIDIO] — Admin-dashboard-first; do not invest in the resident portal.
- PERM-15 / PERM-16 · [RESIDIO] — Legacy-ledger review before DB writes; the #73 backfill hold.
- PERM-17 / PERM-18 · [RESIDIO] — Issue-monitor read-only contract; `workflow:paused` label.
- SESSION-07 · [RESIDIO] — Keyphrase commands (`pause_session`, `end_session`, `resume_session`, `sync_up`).
- SESSION-18 · [RESIDIO] — Invoke `task-observer` at the start of multi-step tool-using tasks.
- SESSION-20 / SESSION-21 / ESC-01 / COMM-15 · [RESIDIO] — Rex/Quinn activation protocol.
- DELEG-16 · [RESIDIO] — QA-director delegation targets. *Orphaned — the named agents do not exist.*
- FILE-08 · [RESIDIO] — Validation reports to `docs/validation/validation-YYYYMMDD-HHMMSS.md`.
- FILE-12 · [RESIDIO] — Server action files named `actionName.ts`.

**Not carried forward at all** (dead on arrival, listed so a second audit does not resurrect
them): GIT-15, GIT-16, GIT-17, GIT-18, GIT-19, GIT-26, SESSION-14, SESSION-22, and the entire
`prompts/`→`processed/` pipeline (FILE-05, FILE-06, FILE-07, SESSION-12, SESSION-13, PLAN-10,
COMM-14, TEST-07, TEST-08, ESC-06). Reasons in `behaviour-inventory.md` §3(d).

---

## 13. MUST inventory

**26 MUST rules across core + stack + repo-specific**, each justified against the criterion
(irreversible, externally visible, data loss, secret exposure, destructive git, production
impact, or regulatory/contractual breach).

| ID | Justification |
|---|---|
| GIT-01 | A push to a protected mainline is externally visible and, if it lands, rewrites shared history. |
| GIT-02 | Routing around a refused push defeats the one server-side gate that exists. |
| GIT-06 | Pushing over a peer's branch destroys their unpushed work irreversibly. |
| GIT-11 | A rollback that skips review can ship a worse state to production than the one it undoes. |
| GIT-25 | Sweeping another session's uncommitted work into a commit publishes work its author never approved. |
| GIT-30 *(proposed)* | `reset --hard` / `clean -fd` / `push --force` destroy work with no recovery path. |
| TEST-09 | A false picture of the deployed schema produces production-impacting migrations. |
| TEST-15 | Acting on a stale note nearly deleted a live security fix in RESIDIO. |
| PERM-01 | A local CLI command against a cloud-only project silently writes to, or reads from, the wrong database. |
| PERM-02 | Same. |
| PERM-03 | Applying a migration off-branch puts production ahead of every branch's code. |
| PERM-04 | Sequence gaps are deliberate; filling one reintroduces whatever it was withheld for. |
| PERM-05 | RBAC/auth/RLS changes widen access; a correct-looking one caused an open P0 here. |
| PERM-06 | An unrecorded withheld change is how six orphaned migrations happened. |
| PERM-07 | Permission laundering defeats every consent boundary in the system at once. |
| PERM-08 | Accepting a relayed authorisation executes unapproved actions under the appearance of approval. |
| PERM-19 | Re-enabling a held automation starts live writes across many external records. |
| PERM-21 *(proposed)* | An empty deny list alongside broad allows means no destructive command is gated. |
| PERM-22 *(proposed)* | Echoing or propagating a credential is secret exposure, by definition. |
| EDIT-11 | A missing authorization check is an externally visible security defect. |
| EDIT-14 | SQL injection: externally visible, data loss. |
| EDIT-15 | Logging a token is secret exposure to anyone with log access. |
| FILE-10 | Committing a credentials file exposes secrets permanently in history. |
| FILE-13 | Same surface as EDIT-11. |
| FILE-14 | Committing `.env*` exposes production secrets permanently. |
| FILE-04 | Working outside the per-issue worktree collides with concurrent sessions' checkouts. |
| PLAN-11 | Finishing on a failed check ships unverified work to the mainline. |
| PLAN-14 | Acting on a stale hardcoded ID mutates the wrong external record. |
| TEST-13 | The only machine-enforced gate; bypassing it merges unverified work. |
| GIT-10 | Hand-advancing the rollback point destroys the ability to roll back. |
| ESC-03 | Silence about an unapplied migration is what turns a task into an incident. |
| COMM-08 | A fabricated check is load-bearing on a merge decision that reaches production. |

*(Count reflects distinct IDs; three are proposed additions not observed in RESIDIO and are
marked as such.)*

**Demoted from the source files' own wording** — see `behaviour-inventory.md` Step 4 for the
full demotion set: TEST-05, DELEG-02, DELEG-03, EDIT-06, PERM-15, PERM-18, SESSION-12, GIT-23.

---

## 14. Project-specific overrides

*(Empty by design. Per-project additions go here so they never contaminate the portable core.
One subsection per project.)*

---

## 15. My own practices

*(Empty placeholder. To be filled during curation — e.g. personal git workflow conventions,
commit-message style, preferred review cadence, escalation thresholds.)*

---

## 16. How to merge a second repository's audit into this file

**IDs.** IDs are allocated by category and never renumbered. When a second repo produces a
rule that is *the same rule* as one already here, do not give it a new ID — append the repo
name to the existing rule's `[repos observed]` list. When it is a genuinely different rule in
the same category, take the next free number in that category's sequence. If two audits
independently allocated the same number to different rules, the earlier audit keeps the
number and the later one is renumbered upward; record the reassignment in the changelog.

**A rule seen in one repo but not another.** Absence is not disagreement. Keep the rule,
leave its `[repos observed]` list at one entry, and do not promote it. If the second repo has
a rule that *contradicts* one already here, that is a finding, not a merge conflict: record
both, note which repo each came from, and leave the resolution to curation. Do not average
them into a vaguer rule that satisfies neither.

**Promotion to universal.** A rule becomes core (§1–§10) when it has been observed in **three
or more repositories**, or in two repositories with materially different stacks. Below that
threshold it lives in §11 (stack-dependent) or §12 (repo-specific), even when it obviously
generalises — RESIDIO's `AGENTS.md` looked canonical and was internally contradictory in four
places, so one repo's confidence is not evidence. A rule may also be promoted on a single
sighting if it is a MUST under the criterion in §13 *and* it names a concrete artefact rather
than an attitude; mark such promotions with `(promoted on 1 sighting)`.

**Demotion.** A core rule that a second repo actively contradicts drops back to §11/§12 with
both sources recorded, until a third sighting breaks the tie.

**Housekeeping.** Every merge updates: the repo count at the top, the `[repos observed]` lists,
the MUST count in §13, and the changelog in §17.

---

## 17. Changelog / backlog

Seeded with the orphans and gaps from the first audit, as an initial backlog rather than an
empty section. Each entry is an item to resolve during curation or in the source repo.

### v0.1 — 2026-09-04 — first audit (RESIDIO)
- Extracted 165 directives across 10 categories from 45 files.
- 9 direct contradictions, 6 scope collisions, 12 silent duplications, 12 orphan rules,
  18 unenforceable MUSTs, 6 precedence ambiguities.

### Backlog — orphans to resolve (source: RESIDIO)
- [ ] ORPH-01 — Dead Notion/prompts pipeline: `prompts/`, `processed/`, `deferred/`,
      `archived/` do not exist; both `.claude/hooks/*.sh` no-op; the NSMA CLI path is a Linux
      path on a Windows host. ~80 lines of `docs/setup/project-management.md` are dead. **Delete.**
- [ ] ORPH-02 — `docs/todo/<task-slug>.md` workflow references a directory that does not exist.
- [ ] ORPH-03 — `git-sync.ps1 -Mode Checkpoint` `SessionEnd` hook does not exist; three
      documents and one skill instruct behaviour around it, including a promise to the user.
- [ ] ORPH-04 — `package.json` ships `supabase:start/stop/reset` and `--local` flags in
      `db:types` and `db:migrate`, contradicting a rule stated six times.
- [ ] ORPH-05 — "the Workflow tool" and "ultracode" are referenced but defined nowhere.
- [ ] ORPH-06 — `qa-director` delegates to six sub-agents that do not exist.
- [ ] ORPH-07 — CI-green preconditions are unsatisfiable per `branching.md:116-120`, while a
      user memory says the lock cleared. Doc and memory disagree.
- [ ] ORPH-08 — `verification_protocol.md` "in the brain directory" does not exist.
- [ ] ORPH-09 — `.claude/skills/qa-director-validate.md` is a flat file where a skill needs
      `<name>/SKILL.md`; nothing loads it.
- [ ] ORPH-11 — `add-issues-to-project.yml` duplicated at the repo root where GitHub ignores it.
- [ ] ORPH-12 — `ACTIONPLAN.md:73` pins a hold to issue #73 with no removal trigger.

### Backlog — conflicts to resolve
- [ ] CONF-03 (highest bite) — `SESSION_STATE.md` as live signal vs handoff record.
- [ ] CONF-02 — commit/push timing: four auto-commit rules vs one ask-first rule.
- [ ] CONF-04 — module-integration test reported as both green and failing.
- [ ] CONF-06 — cloud-only rule vs local-CLI package scripts.
- [ ] CONF-05 — who sets `In review`.
- [ ] CONF-07 — Claude Code's `feat/`/`fix/` lane vs "start work only through the helper".
- [ ] CONF-08 — `git add .` vs stage-only-this-issue.
- [ ] CONF-01 — commit attribution: forbidden and templated in the same file.
- [ ] CONF-09 — auto-commit vs ask-the-user, in one sentence-block.

### Backlog — gaps to fill
- [ ] GAP-01 **(urgent)** — live Supabase token, `CRON_SECRET` and a Postgres password are
      committed in `.claude/settings.local.json`. Rotate, untrack, gitignore.
- [ ] GAP-12 — `.stignore` has its env-file exclusions commented out; Syncthing will
      replicate `.env.local` between machines.
- [ ] GAP-04 — empty `deny` list alongside `rm:*`/`git push:*` allows and
      `skipDangerousModePermissionPrompt: true`.
- [ ] GAP-05 — no rule covers `reset --hard` / `clean` / `force push`, despite a recorded
      incident that destroyed uncommitted work.
- [ ] GAP-02 — no rule for what to do on encountering a secret.
- [ ] GAP-06 — no context-compaction rule; load-bearing rules sit in non-auto-loaded files.
- [ ] GAP-03 — no temp/scratch file policy.
- [ ] GAP-07 — no dependency-install or network-access policy.
- [ ] GAP-08 — commit-message convention assumed by tooling, never stated.
- [ ] GAP-09 — no PR template, `CONTRIBUTING.md`, or review checklist.
- [ ] GAP-10 — no verbosity/tone rule for the main session.
- [ ] GAP-11 — no handoff-file rotation policy (93 KB and growing).
- [ ] GAP-13 — no cadence for reviewing the instruction files themselves.
