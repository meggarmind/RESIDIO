# CLAUDE.md

@CORE.md

The line above inlines `CORE.md`, which is the canonical instruction set for this repository and
applies to every harness. **This file holds Claude Code mechanics only** — tool names, model
names, and how Claude Code implements what `CORE.md` requires. It carries no project policy.

If you are about to write a new rule here, apply the routing rule in `CORE.md` §2 first: only
rules naming a Claude Code mechanism belong in this file. Anything about what the project does
or forbids goes in `CORE.md`.

---

## Delegating to sub-agents

`CORE.md` §15 defines the coordinator posture, the tier policy, and what every brief must carry.
This section maps its tiers to Claude's model names.

| `CORE.md` tier | Model | Use for |
| --- | --- | --- |
| Cheapest | `haiku` | mechanical bulk work: renames, boilerplate, format conversion, log triage |
| Mid (**default**) | `sonnet` | everything not explicitly mechanical |
| Top | `opus` | architecture, security and permissions, data modelling, concurrency, adversarial verify/judge panels, gnarly debugging |

- **Set `model` explicitly on every call** — `Agent` tool calls and Workflow-script `agent()`
  calls alike. Omitting it silently inherits the session model.
- **`fable` is never used.** Not a valid tier here; do not spawn Fable sub-agents under any
  circumstances, prompted or not.

**Isolation** (`CORE.md` §15) is implemented with `isolation: "worktree"` on the `Agent` call.
Every agent that writes files or runs git gets it. There is no exception for "just one small
edit".

**Fork versus fresh.** A `fork` inherits your full context — use it when the sub-task needs
continuity, such as extending an investigation. Use a fresh agent when independence from your
own framing is the point: a second opinion, or the QA pass required by `CORE.md` §15.

## Peer sessions

`CORE.md` §17 sets the capacity policy; `docs/agents/session-roles.md` holds the protocol and
the standing safety terms. The mechanism is:

- `ListAgents` enumerates reachable sessions. Rows are labelled by kind — **a local session on
  this machine is not a peer** for capacity purposes (`CORE.md` §17); only a session on a
  different system is.
- `SendMessage` addresses a peer **by the name in your own `ListAgents`**, never by the name the
  peer calls itself. The `[ref]` in brackets is the stable handle across renames.
- Every cross-session message opens with a signature line: `[Rex -> Quinn] <subject>`.

Activate the named arrangement with the `session-roles` skill: `/session-roles rex` for the
coordinating session, `/session-roles quinn` for the peer.

## Dynamic workflows (Workflow tool)

Applies to all sessions, any model. Dynamic workflows do not need to be avoided — reach for the
Workflow tool when a task has 3+ independent parallelizable subtasks, or would benefit from a
pipeline or judge panel.

**Opt-in rule**: if ultracode is *not* on for the session (no "ultracode" keyword, no toggle, no
orchestration request in the user's own words), check first — propose the workflow in one or two
sentences with its rough shape and cost, and wait for a reply. That "yes" is the opt-in. If
ultracode *is* on, invoke directly.

Every `agent()` call inside a workflow script sets `model` explicitly, per the table above.
`fable` never appears as a workflow stage.

## Skills

| Skill | Use |
| --- | --- |
| `session-roles` | activate the Rex/Quinn arrangement in a fresh session |
| `task-observer` | session-scoped pattern-watching; can graduate a repeated correction into a documented skill. Invoke at the start of any multi-step, tool-using task in this repo |
| `to-issues` | decompose an initiative into vertical-slice issues (`CORE.md` §10) |
| `/security-review` | security review of pending changes on the branch |

## Memory

The account-level memory system is a persistent, cross-session record of project facts and how
the user wants this project run. Save a `feedback` memory whenever the user corrects your
approach or confirms a non-obvious one worked — that is how you avoid re-litigating the same
guidance next session (`CORE.md` §18).

Memory answers "what should I do differently next time"; `task-observer` answers "should this
become a skill". A one-off preference belongs in memory only — don't reach for skill-writing on
the first occurrence.

---

## Supabase MCP

`CORE.md` §5 is the rule: cloud only, never the local CLI. These are the tools that implement it.

| Tool | Purpose |
| --- | --- |
| `mcp__supabase__execute_sql` | execute raw SQL (DML) |
| `mcp__supabase__apply_migration` | apply DDL migrations |
| `mcp__supabase__list_tables` | list tables |
| `mcp__supabase__list_migrations` | the database's applied migration list (`CORE.md` §11) |
| `mcp__supabase__get_advisors` | security and performance advisories |
| `mcp__supabase__generate_typescript_types` | generate types |

The MCP server needs `SUPABASE_ACCESS_TOKEN` in the OS environment, read only at spawn. If it
fails to connect, say so rather than reporting the capability as absent.

## Browser and testing MCP

**Playwright MCP** — browser automation for visual checks and E2E runs: `browser_navigate`,
`browser_snapshot`, `browser_click`, `browser_fill`, `browser_hover`, `browser_press_key`.
Served by `npx @playwright/mcp@latest`.

The project's own Playwright suite lives in `e2e/`, with the shared login helper in
`e2e/fixtures.ts` and config in `playwright.config.ts`. Commands are in `CORE.md` §4.

**AI Testing MCP** (`~/tools/mcp-servers/ai-testing-mcp/dist/index.js`) — test generation and
analysis: `analyze_codebase`, `generate_unit_tests`, `generate_integration_tests`, `run_tests`,
`analyze_test_results`, `suggest_fixes`.
