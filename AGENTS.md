# AGENTS.md

## ⛔ Read `CORE.md` before anything else

**`CORE.md` at the repository root is the canonical instruction set.** It carries all project
policy — the server-action authorization contract, branching, the delivery lifecycle, migration
rules, the coordinator protocol. **Open and read it now, before planning or writing anything.**

This file holds only what is specific to Codex and OpenCode. It is not a summary of `CORE.md`
and cannot substitute for it.

### The non-negotiables, duplicated on purpose

The three rules below are repeated verbatim from `CORE.md` §1 so that they still bind on a
session that never opens it. **This duplication is deliberate — do not "deduplicate" it.**

1. **Never work on `master`.** It is a merge target. Branch protection refuses direct pushes
   from every tool, on every machine, including the repo owner. A rejected push is the rule
   working — open a PR rather than routing around it.
2. **Supabase is CLOUD-ONLY.** Never run local Supabase CLI commands (`supabase start`,
   `db:migrate`, …). Apply migrations and queries through the Supabase MCP tools.
3. **Every write server action needs `authorizePermission()` and `logAudit()`.** Every
   CREATE/UPDATE/DELETE under `src/actions/**` calls `authorizePermission(PERMISSIONS.X)` from
   `@/lib/auth/authorize` first and bails on failure, then `logAudit(...)` from
   `@/lib/audit/logger` after a successful write. `src/__tests__/integration/module-integration.test.ts`
   enforces this. Full contract and the allowlist rationale: `CORE.md` §6.

Everything else — commands, stack, layout, design system, branching detail, the board, migration
rules, the verification protocol, the coordinator protocol — is in `CORE.md`.

---

## Model routing

`CORE.md` §15 defines the tier policy by role. Map its tiers to whatever models your harness
actually offers, and **set the model explicitly on every dispatch** rather than inheriting the
session default:

| `CORE.md` tier | Use for |
| --- | --- |
| Cheapest available | mechanical, fully specified, small blast radius |
| Mid tier (**default**) | everything not explicitly mechanical |
| Top tier | architecture, security and permissions, data modelling, or decisions expensive to reverse — with a one-line justification |

QA runs at the implementer's tier or higher, and tiers *up* for authorization, migrations or
data exposure.

## Sub-agent isolation

`CORE.md` §15 requires that every agent which writes files or runs git gets its own worktree,
and that two tree-mutating agents never share a directory. Whatever your harness's mechanism for
this is, use it — and if it has none, create the worktree explicitly with `git worktree add`
before dispatching, and dispatch with that directory as the working directory.

If you cannot isolate an agent, run it serially rather than concurrently. Never let two writing
agents share a checkout on the theory that they will not collide.

## Issue-driven delivery

`CORE.md` §8 and §10 are the rules; the mechanics here are Codex's.

Decompose every initiative into vertical-slice issues before implementation — the `to-issues`
skill, where your harness provides it. Present the proposed slices, confirm granularity and
dependencies, then publish the approved child issues to GitHub in dependency order with the
`ready-for-agent` label. **Do not begin implementation without a published issue number.**

Codex's lane prefix is `codex/issue-<n>-<slug>`, configured as `branchPrefixes.codex` in
`.github/issue-workflow.json`. Select it explicitly when starting an issue:

```bash
npm run issue:workflow -- start <issue> --lane codex
```

A worktree created under any lane can be resumed, reviewed or finished from any other — the
worktree path `.worktrees/issue-<n>` is lane-independent.

> **Do not run `finish`.** It merges into local `master` and requires that merge to have reached
> `origin/master`, which branch protection forbids; it never opens a PR, and it merges with no
> migrations check. See the note in `CORE.md` §8. Land work by PR instead.

## OpenCode

`.opencode/agent/meggar-review.md` defines `meggar-review`, a subagent that reviews
`ready-for-agent` issues sitting in the board's `In review` column before they move to Done. It
is a review gate, not a general coding assistant, and its permissions deny edits by design.

## When Supabase MCP is unavailable

`CORE.md` §5 forbids the local Supabase CLI, and the MCP server is not reliably present in every
harness — it needs `SUPABASE_ACCESS_TOKEN` in the OS environment, read only at process spawn.

If the MCP tools are not available in your session:

- **Do not fall back to the local CLI.** `db:migrate` and the `--local` scripts in
  `package.json` point at a database that is not the project's, and running them is worse than
  doing nothing.
- **Do not fabricate schema facts.** Read `src/types/database.generated.ts` and
  `supabase/migrations/` for structure, and say plainly that you could not verify against the
  live database.
- **Migrations are written but not applied** in any case (`CORE.md` §11), so a missing MCP
  connection does not block writing one — it blocks verifying it. Say which.
- Report the connection failure to the user so they can restore it, rather than reporting the
  capability as nonexistent.

## Docs to read first

- `CORE.md` — **the canonical instruction set; read this first**
- `docs/README.md` — master index
- `docs/setup/development-environment.md` — full setup, env vars, conventions
- `docs/api/supabase-integration.md` — data-layer and MCP patterns
- `docs/agents/branching.md` — branching, isolation, concurrent sessions, the `stage` backup
- `docs/agents/session-roles.md` — the peer arrangement and its standing safety terms
- `TODO.md` / `ACTIONPLAN.md` — current phase and in-progress plan
