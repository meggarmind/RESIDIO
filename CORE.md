# CORE.md

**The canonical instruction set for this repository.** Every agent working on Residio obeys
this file, whatever tool it is running under — Claude Code, Codex, OpenCode, or anything else.

`CLAUDE.md` and `AGENTS.md` exist only to carry *harness mechanics* — tool names, model names,
how a particular tool spawns an isolated sub-agent. They do not carry policy. If a rule about
what this project does or forbids lives anywhere, it lives here.

---

## 1. Non-negotiables

Three rules whose violation is expensive. They are duplicated verbatim at the top of
`AGENTS.md` **on purpose**, so they still bind on a session that never opens this file. Do not
"deduplicate" them.

1. **Never work on `master`.** It is a merge target. Branch protection refuses direct pushes
   from every tool, on every machine, including the repo owner. A rejected push is the rule
   working — open a PR rather than routing around it.
2. **Supabase is CLOUD-ONLY.** Never run local Supabase CLI commands. Apply migrations and
   queries through the Supabase MCP tools.
3. **Every write server action needs `authorizePermission()` and `logAudit()`.** No exceptions
   without an allowlist entry and a reason. See §6.

---

## 2. Instruction surfaces

Four files carry instructions. Knowing all four prevents the next agent discovering one by
accident:

| Surface | Read by | Holds |
| --- | --- | --- |
| `CORE.md` (this file) | everyone, by explicit instruction | all project policy |
| `CLAUDE.md` | Claude Code (inlines this file via `@CORE.md`) | Claude Code mechanics only |
| `AGENTS.md` | Codex, OpenCode | Codex/OpenCode mechanics only |
| `.agent/rules/*.md` | always-on rule loaders | pointers back here |

Supporting documents, referenced from the sections below: `DESIGN_AGENTS.md`,
`docs/agents/*.md`, `CONTEXT.md`, `docs/adr/`.

**Where a new directive goes — the routing rule.** When the user gives a new instruction,
classify it *before* writing it down:

- Constrains what the project does or forbids, regardless of tool → **`CORE.md`**
- Names a Claude Code mechanism (Skill, Agent, Workflow, `mcp__*`, `.claude/`, model tiers,
  memory) → **`CLAUDE.md`**
- Names a Codex/OpenCode mechanism (`issue:workflow`, `.worktrees/`, `.opencode/`) →
  **`AGENTS.md`**
- Ambiguous → **`CORE.md`**, phrased tool-neutrally. Default to shared.

Never write the same rule into two files unless it is in the §1 block. After writing it, say
which file it went in.

---

## 3. Product focus — read first

**All forward work is on the ADMIN DASHBOARD.** The Resident Portal and self-service surfaces
(`src/app/(resident)/**`, `src/components/resident-portal/**`) are **not scheduled for rollout
in the foreseeable future**.

- Prioritize, design and build for the **admin** experience — management, finance, security,
  operations, reporting.
- **Do not invest in portal/self-service work**: resident payments, portal wallet, portal
  announcements/documents/profile, impersonation UX, onboarding wizard, resident-facing email
  flows. Keep existing portal code stable and local; do not polish, extend or re-roll it.
- When a task touches portal code, ask whether it is *admin* value. If it is resident-facing
  only, de-prioritize it or flag it before building.

If this direction changes, the user will say so explicitly. Until then, admin-dashboard-first.

---

## 4. Stack and conventions

Residio is a Next.js 16 (App Router) + TypeScript app for residential estate access
management: resident/roster management, payments, billing (invoices, levies, wallet), security
contacts, expenses, and an external access-control API.

```bash
npm run dev              # dev server, http://localhost:3000
npm run build            # production build
npm run lint             # ESLint v9
npm test                 # Vitest (unit/integration, src/__tests__)
npm run test:e2e         # Playwright (e2e/) -- also :ui and :headed variants
npm run db:types         # regenerate src/types/database.generated.ts
npm run docs:drift       # report wiki pages whose sources have moved on
npm run issue:workflow   # issue lifecycle helper (see §8)
```

Run `lint` then `build`, plus tests where relevant, after changes.

- **Path alias**: `@/*` maps to `src/*`. Always import via `@/...`, never relative.
- State: TanStack React Query. Forms: React Hook Form + Zod. Icons: Lucide.
- DB types: `src/types/database.generated.ts` is generated — never hand-edit. Helpers live in
  `src/types/database.ts`.

### Layout

- `src/app/**` — App Router routes, grouped `(auth)`, `(dashboard)`, `(resident)`
- `src/actions/**` — server actions grouped by domain (billing, payments, residents, houses…)
- `src/lib/**` — supabase clients, auth, audit, email (Resend), pdf, sms, notifications, encryption
- `src/components/**` — `ui/` (shadcn New-York) plus per-domain `components/<domain>/`
- `src/emails/**` — React Email templates. `scripts/` — one-off seed/verify scripts, not in build
- `docs/` — canonical docs; start at `docs/README.md`

### Design system

Follow `DESIGN_AGENTS.md` for all UI work: OKLCH colors, `new-york` shadcn style, lucide icons
in `IconBox` wrappers, tactile micro-animations. Wrap raw shadcn components in semantic layout
components rather than using them directly in pages.

### Testing

- Unit/integration: Vitest under `src/__tests__`, no network.
- E2E: Playwright specs under `e2e/`, shared login helper in `e2e/fixtures.ts`. Requires Cloud
  Supabase and seeded test users. Log in as `admin@residio.test` / `password123` (super_admin).

---

## 5. Supabase is cloud-only

Do **not** run `supabase start`, `supabase db reset`, or any other local CLI command. Apply
migrations and run queries through the Supabase MCP tools; your harness's file names them.

> **Known defect — do not be misled by `package.json`.** `db:types` and `db:migrate` are
> currently defined with `--local` (`supabase gen types typescript --local`,
> `supabase db push --local`), which contradicts this rule. `db:migrate` must never be run.
> Treat the cloud-only rule as authoritative and the scripts as wrong; the fix is tracked
> separately.

---

## 6. Server actions — the mandatory contract

Every write server action (CREATE/UPDATE/DELETE) under `src/actions/**` MUST:

1. Call `authorizePermission(PERMISSIONS.X)` from `@/lib/auth/authorize` **first** and bail on
   failure.
2. Call `logAudit(...)` from `@/lib/audit/logger` after a successful write.
3. Register new permission constants in `src/lib/auth/action-roles.ts`; add new entity types to
   `AuditEntityType` in `src/types/database.ts`.

```typescript
'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';

export async function updateSomething(id: string, input: Input) {
  const auth = await authorizePermission(PERMISSIONS.MODULE_UPDATE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const { data: oldRecord } = await supabase.from('table').select('*').eq('id', id).single();
  const { data, error } = await supabase.from('table').update(input).eq('id', id).select().single();

  if (!error && data) {
    const changes = getChangedValues(oldRecord, data);
    await logAudit({
      action: 'UPDATE',
      entityType: 'table_name',   // must exist in AuditEntityType
      entityId: id,
      entityDisplay: data.name,   // human-readable identifier
      oldValues: changes.old,
      newValues: changes.new,
    });
  }

  return { data, error };
}
```

**Audit actions available**: `CREATE` / `UPDATE` / `DELETE`; `VERIFY` / `APPROVE` / `REJECT`;
`ASSIGN` / `UNASSIGN`; `ACTIVATE` / `DEACTIVATE`; `GENERATE` / `ALLOCATE`.

### Adding a new permission

1. Add the constant to `src/lib/auth/action-roles.ts`:
   ```typescript
   NEW_MODULE_VIEW: 'new_module.view',
   NEW_MODULE_CREATE: 'new_module.create',
   ```
2. Migration to extend the category enum:
   ```sql
   ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'new_module';
   ```
3. Migration to seed the permissions and assign them to roles:
   ```sql
   INSERT INTO app_permissions (name, display_name, description, category, is_active)
   VALUES ('new_module.view', 'View New Module', 'Can view new module', 'new_module', true)
   ON CONFLICT (name) DO NOTHING;

   INSERT INTO role_permissions (role_id, permission_id)
   SELECT r.id, p.id FROM app_roles r CROSS JOIN app_permissions p
   WHERE r.name IN ('super_admin', 'chairman') AND p.category = 'new_module'
   ON CONFLICT DO NOTHING;
   ```

### Checklist before calling a feature complete

- [ ] Every write action has an `authorizePermission()` check
- [ ] Permission constants added to `src/lib/auth/action-roles.ts`
- [ ] Permission category enum migration created
- [ ] Permissions seeded with role assignments
- [ ] Every write action calls `logAudit()` after success
- [ ] New entity types added to `AuditEntityType`
- [ ] New pages added to `ROUTE_PERMISSIONS`

**UI actions need the write permission, not just the route's view permission.** A page guarded
by `module.view` must still filter its buttons by `module.create` / `module.update` /
`module.delete`. Gate on the action, not the page.

### Enforcement, and what "green" means

`src/__tests__/integration/module-integration.test.ts` scans `src/actions/**` and fails for any
write action missing permission or audit, unless the file is listed in its
`PERMISSION_ALLOWLIST` / `AUDIT_ALLOWLIST`.

**The suite passes today, with 42 files allowlisted for permission and 5 for audit** (verified
2026-09-05). Passing therefore means "no *new* gaps", not "no gaps". Some entries are permanent
and deliberate: recipient-facing, cron, webhook and pre-auth flows (`payments/*`,
`billing/pay-*-with-wallet`, `paystack/init+verify+webhook`, `email-imports/*`,
`two-factor/verify`) cannot take an admin RBAC guard because they authenticate as a resident,
via `CRON_SECRET`, or by signature verification. **Do not add hard permission checks there.**

Re-run `npm test` after adding any write action.

---

## 7. Branching and isolation

**Never work on `master`** (§1). This repo is worked by two machines running Claude Code,
OpenCode and Codex, sometimes concurrently. **No session may assume it is the only one.**

**The remote branch list is the live registry — not `SESSION_STATE.md`.**

```bash
git ls-remote --heads origin      # who is working on what, right now
```

Check it before taking a branch, and **push your own branch early**: the push is the
declaration. `SESSION_STATE.md` lives on protected `master`, so writing to it requires a PR and
arrives far too late to coordinate. It is the end-of-session handoff record, not a live signal.

Branch prefixes declare the lane:

| Prefix | Used for |
| --- | --- |
| `codex/issue-<n>-<slug>` | issue work from Codex |
| `feat/<slug>`, `feat/issue-<n>-<slug>` | features |
| `fix/<slug>` | fixes |
| `chore/<slug>` | tooling, docs, instruction changes |
| `qa/<date>` | QA campaigns |
| `merge/<slug>` | integration branches |

These are lane defaults, not walls. When you cross lanes, say so rather than letting the prefix
mislead the next session.

- Sync `master` into your branch **before** starting work not central to the feature.
- Apply a migration only from the branch that introduces it, and only after that branch merges.
- `stage` is the last `master` that passed checks — the rollback point. It advances only via
  `.github/workflows/stage-backup.yml`. Never push to it by hand.

Full rules: `docs/agents/branching.md`.

---

## 8. Delivery lifecycle

Work is **issue-first and worktree-isolated**, for every harness. No implementation begins
without a published issue number.

Implementation is isolated in `.worktrees/issue-<number>`, on a branch whose prefix names your
lane (§7). The repository helper drives the lifecycle:

```bash
npm run issue:doctor
npm run issue:workflow -- start <issue> [--lane <lane>]
npm run issue:workflow -- review <issue> [--check "issue-specific command"]
npm run issue:workflow -- resume <issue>
npm run issue:workflow -- finish <issue> [--check "issue-specific command"]
```

`--lane` (or `ISSUE_WORKFLOW_LANE`) selects the branch prefix at creation time. A worktree
created under one lane can be resumed, reviewed and finished from any other — the worktree path
is lane-independent.

Failed checks, dirty worktrees, missing project configuration and merge conflicts must leave the
issue unfinished and preserve its worktree. Parent initiative issues are never closed by child
completion.

> **`finish` is coordinator-only, and currently cannot complete.** It merges into local
> `master` and then requires that merge to have reached `origin/master` — but `master` is
> branch-protected and refuses pushes, and `finish` never opens a PR. It also merges with no
> migrations check, contradicting §11. **No sub-agent may run it.** Land work by PR (§16).

---

## 9. Issue tracker, triage and the board

Issues and PRDs live as GitHub issues in `meggarmind/RESIDIO`, accessed via the `gh` CLI.
External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

**Triage labels**: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`. See `docs/agents/triage-labels.md`.

**Project board** ("Jazrmann Dashboard", GitHub Projects v2). New issues are auto-added by
`.github/workflows/add-issues-to-project.yml`, but nothing moves them between columns
automatically — that is your job. Board and field IDs, and the exact `gh project item-edit`
commands, are in `docs/agents/project-board.md`.

`Status` columns: **Backlog → Ready → In progress → In review → Done**.

Move an issue's Status at these three points, without being asked:

1. Starting work on a `ready-for-agent` / `ready-for-human` issue → **In progress**
2. Opening the PR for it → **In review**
3. The issue or its PR is closed or merged → **Done**

Do not move issues *backwards* (to Backlog or Ready) on your own; that stays manual.

---

## 10. Planning becomes issues

Whenever a plan, spec or PRD is finalized — or any planning discussion converges on a concrete
set of next steps — break it into vertical-slice issues and **file them**. Do not describe the
plan back and stop.

An epic gets one umbrella issue carrying the design and the verified facts, plus one issue per
slice. **Brief each slice for an agent starting cold**: the exact files and line numbers, what
"done" means, and what *not* to do. That is the only context the implementing agent will have.

---

## 11. Migrations on merge

Merging a branch that adds migrations obliges you to apply them, and to verify by name against
the **database's applied list** — never against the migrations directory, which looks correct in
every failure mode. Standing rule, not a suggestion:

1. **Before merging**, diff `git ls-tree` on both refs to enumerate the migrations the branch
   adds.
2. **After merging**, apply them. If you cannot, say so in the merge report and record it on the
   tracking issue. An unapplied migration nobody knows about is how six of them ended up
   orphaned on this project.
3. **Check open issues before applying anything touching RBAC, auth or RLS.** A migration can be
   correct in intent and still be the direct cause of an open P0.
4. **Record any deliberately withheld migration twice** — on its issue and in
   `SESSION_STATE.md` — so a later reader does not "fix" the gap by applying it.

Migrations are **written** by an implementing agent and **never applied** by one. See §16 for
the rollback-fidelity requirement. Full detail: `docs/agents/migrations-on-merge.md`.

---

## 12. Documentation drift

The wiki in `website/docs` is pinned to the app: each page declares the source globs it
documents and the commit it was last verified against.

- `npm run docs:drift` reports pages whose sources have moved on.
- `npm run docs:verify -- <path>` re-stamps one after review.

**Standing instruction**: when a change under `src/**` alters something a page describes — a
renamed control, a new or removed setting, a changed rule or sequence of steps — update that
page in the same piece of work and re-stamp it. Run `npm run docs:drift` before wrapping up any
session that touched `src/**`. **Never run `docs:verify -- --all`** to clear a report you have
not read. See `docs/agents/doc-drift.md`.

---

## 13. Verification protocol

After every code modification, before calling it done:

**Static analysis**
- Run a lint check over the modified files.
- Ensure every hook used (`useEffect`, `useState`, …) is explicitly imported.
- No unused variables or broken imports introduced.

**Supabase / database integrity**
- **Join ambiguity**: when adding a `.select()` join, check whether the table has multiple
  foreign keys to that relation. If it does, use explicit join syntax
  (`relation_name:table_name!column_name(...)`) or you will get `PGRST201` at runtime.
- **Schema sync**: any new column added in a migration must be added to the `.select()` strings
  of the corresponding server actions.

**UI consistency**
- **Payload symmetry**: `create` and `update` actions must return the same joined shape as `get`
  actions, or the UI shows blank columns until a refresh.
- **State sync**: a page holding local state needs a `useEffect` syncing it with fresh server
  props when `router.refresh()` fires.
- **Payee/context**: when displaying an entity that can be a Vendor, Resident or Staff member,
  handle every case rather than leaving blanks.

**Error handling**
- `console.error` blocks carry meaningful context and do not swallow the database error object.
- High-level pages have error boundaries or explicit "no data" states.

---

## 14. Progress tracking

Four files, four distinct jobs. Keep them in their lanes:

| File | Job |
| --- | --- |
| GitHub issues | **the tracker** — the authoritative record of what is to be done |
| `TODO.md` | the product backlog: mark completed items, add discovered follow-ups |
| `ACTIONPLAN.md` | the active plan — update it whenever work completes or invalidates a step |
| `SESSION_STATE.md` | the sole live handoff record |

`SESSION_STATE.md` is read before substantive work and updated before finishing, whether or not
you were asked. Record what was actually performed, decisions taken, verification results, known
failures and remaining work. **Do not create separate handoff files.**

Domain knowledge lives in `CONTEXT.md` and `docs/adr/` (see `docs/agents/domain.md`).

### Session keyphrases

| Keyphrase | Action |
| --- | --- |
| `pause_session` / `end_session` | run the session handoff procedure |
| `resume_session` | read `SESSION_STATE.md`, continue from its snapshot and next steps |
| `sync_up` | commit and push, then evaluate pending work |

Full procedures: `docs/setup/project-management.md`.

### Commit hygiene

If a task touches multiple concerns, split it into smaller sequential commits.

---

## 15. Coordinated delivery

**The standing posture for all sessions in this repo, under every harness. Not opt-in.**

You coordinate; sub-agents write the code. You analyse, interpret, decide and verify.

The exception is trivia — reading a file to answer a question, a one-line fix, a single grep.
Dispatching an agent to fix a typo costs more than it saves. **When you handle something
yourself rather than delegating, say so.** The threshold is a convenience, not a loophole, and
it erodes silently if undisclosed.

### Scope

Work out what needs doing from the conversation *and* from the tracker (`gh issue list`,
`gh issue view`, following any `- [ ] #n` task lists). Check existing branches and open PRs
before assuming anything is unstarted. State what you have resolved the scope to, and wait if it
is unclear.

### Inventory pass — before planning, not after

Run one read-only sweep over the code, and over the database where the work touches it.

Issue bodies go stale: expect wrong paths, stale line numbers, undercounts, and items already
done by an earlier slice. **Brief from what you verified, not from what the issue says**, and
post the corrections back to the issue so the record survives the session. If the inventory
changes the size or shape of the work, say so before dispatching anything.

### Plan first

For each item: your reading of what it actually needs, acceptance criteria, the files it
touches, what it depends on, and the model tier. Show this before dispatching.

### Model routing

Tiers are named here by role; your harness file maps them to actual model names.

- **Cheapest tier** — mechanical, fully specified, small blast radius.
- **Mid tier** — *the default for everything else.*
- **Top tier** — architecture, security and permissions, data modelling, or decisions expensive
  to reverse. Give a one-line justification.

If torn, drop a tier and let QA catch it. **QA runs at the implementer's tier or higher**, and
tiers *up* — never down — for anything touching authorization, migrations or data exposure.

### Isolation — not optional

**Every agent that writes files or runs git gets its own worktree.** Agents sharing one checkout
fight over HEAD: commits land on the wrong branch, and one agent's git operations destroy
another's working tree. Never run two tree-mutating agents in the same directory, even briefly.

Test runs are tree-mutating in effect — a full suite in one worktree slows the machine enough to
fail timing-sensitive specs in another. Serialise gate runs where you can.

This nests inside §8: `.worktrees/issue-<n>` is the integration point for the issue, and each
dispatched agent gets its own worktree beneath it.

### Dispatch

**At most 5 concurrent tree-mutating agents per machine**, rising to 8 total when a peer on a
different system is available (§17). Run independent items in parallel; serialise anything
sharing a file.

Each brief states: objective, acceptance criteria, files in scope, files off-limits, an existing
file in the repo to mirror, the exact gate commands to run, and that *done* means tests written
and passing with lint clean. No new dependencies, no adjacent refactors.

Every implementer brief also carries these clauses verbatim:

- Do not spawn sub-agents.
- Do not push, do not open a PR, do not apply migrations. Commit and stop.
- Verify the branch before every commit; stage explicit paths, never `git add -A`.
- If files you did not edit show as modified, they belong to someone else. Leave them.
- Report anything you noticed but left alone.

### QA

After each item, dispatch a **fresh** QA agent that has not seen the implementer's reasoning and
must not read its transcript. Prefer running it on a peer session (§17), where that blindness is
structural rather than promised.

It checks acceptance criteria one by one, scope creep, repo conventions, error handling, and
leftovers.

**QA must mutation-test the tests**: change the thing each assertion claims to protect and
confirm the test fails. Report which mutations were caught. This is the highest-value thing QA
does — it repeatedly finds assertions that look like they verify behaviour and cannot fail.

**QA has no database access.** When a finding depends on live state, QA flags it unresolved
rather than assuming. Closing those is the coordinator's job.

Verdict: **PASS**, **PASS WITH NOTES**, or **FAIL**, with `file:line` references and defects
separated from preferences. Send defects back to the implementer. Two attempts, then escalate to
the user.

### Your verification duties

**Never relay an agent's claim as fact.** Check it against the artefact — the diff, the file,
the database — before it reaches the user. Agents have variously mis-scoped a grep, misdiagnosed
a flake, and asserted a rollback was faithful when it was not.

Where the work changes who can do what, or what a schema contains, **measure the delta rather
than predicting it**. A transaction that applies the change, probes it, and ends in `ROLLBACK`
gives real numbers with nothing committed.

### Flakes

A failing spec is not a failure until it has been re-run alone on an otherwise idle machine.
Check whether it also fails on the base branch. Re-running during another agent's install has
nearly caused a clean branch to be reported as broken.

### Stop and ask the user when

- criteria are ambiguous, or an acceptance criterion turns out to be unachievable as written
- a schema or API contract would change
- the set of people who can see or do something changes, **even as a side effect**
- personal data or credentials are in scope
- something fails QA twice
- the work uncovers a defect outside its scope — **file it as its own issue rather than
  absorbing it**, so a security fix is never hidden inside a refactor

---

## 16. Reporting and continuity

Branch per issue, commits referencing it, **PR only after a pass. The user does the merging.**

After each wave, report: what shipped, the model used, the QA verdict, how many agents ran on
which machine, and any decisions you made on the user's behalf. **Decisions, not a transcript.**

Read `SESSION_STATE.md` at the start of the session. Before finishing, write back to it:

- what shipped
- what was decided and why
- **what is applied versus merely merged**
- what the next session must not re-litigate

Decisions that came from the user go in writing, with the evidence that settled them, so nobody
reverses them later by reading the change as a regression.

Record on the **issue**, not only in chat: scope corrections, measured facts that contradict the
issue body, and traps the next slice will hit.

**Applied is not the same as merged.** A merged migration that was never applied, or a branch or
worktree left lying around, both read to the next session as something they are not. Close them
out, or say explicitly that you did not.

---

## 17. Peer sessions as capacity

A single machine's memory caps how many concurrent agents it can host. A peer session on a
**different system** is therefore additional capacity, not merely a second opinion.

- **The budget is per-machine.** At most 5 concurrent tree-mutating agents on any one machine;
  with a peer on a different system, up to **8 total, never more than 5 on either side**.
- **A second session on the same machine is not a peer.** It adds contention, not capacity, and
  does not raise the cap.
- **Standing for dispatch, gated for writes.** You may use a detected peer for read-only work,
  QA and analysis without asking. Anything that writes files, commits, or touches a shared
  branch on the peer needs the user's explicit clearance **in the live session**.
- **Prefer placing QA on the peer** — a separate session cannot read the implementer's
  transcript, so §15's blindness requirement is satisfied structurally, and the heaviest
  concurrent load moves off the implementing machine.
- **Report the split** in the wave report (§16).

The named arrangement, the message protocol, and the standing terms that make cross-session work
safe — no permission laundering, a peer's user cannot authorise your side, push disclosure — are
in `docs/agents/session-roles.md`. **Read it before queueing anything across a link.**

---

## 18. Learning from feedback

When the user corrects your approach, or confirms a non-obvious one worked, capture it rather
than re-litigating it next session. A one-off preference is worth recording; a repeated
correction is worth promoting into a documented rule in this file, via the routing rule in §2.
