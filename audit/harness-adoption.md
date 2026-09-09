# Harness and model adoption review — RESIDIO

How this repo's instruction set, and the unified file drafted in `audit/unified-practices.md`,
would actually be consumed by **Claude Code**, **Codex** and **OpenCode**.

Claims about harness behaviour are sourced from vendor documentation, fetched 2026-09-04, and
cited inline. Anything I could not confirm from documentation is marked **UNVERIFIED**.

Sources consulted:
- [AGENTS.md — the open format](https://agents.md/)
- [Codex — Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenCode — Rules](https://opencode.ai/docs/rules/)
- [OpenCode — Instructions](https://opencode.ai/v2/docs/instructions)
- [Claude Code — How Claude remembers your project](https://code.claude.com/docs/en/memory)

---

## 1. Claude Code

### 1.1 What it reads automatically

| File | Loaded? | Mechanism |
|---|---|---|
| `CLAUDE.md` (repo root) | **Yes, in full, every session** | Walks up the directory tree from cwd, concatenating `CLAUDE.md` / `CLAUDE.local.md`. Loaded regardless of length. |
| `~/.claude/CLAUDE.md` | Would be, if it existed | **Not present on this machine.** No global user instruction layer exists. |
| `~/.claude/projects/C--projects-RESIDIO/memory/MEMORY.md` | **Yes** — the index line-per-memory | Auto memory. Bodies load on recall, surfaced inside `<system-reminder>` blocks. |
| `.claude/settings.json` + `.claude/settings.local.json` | **Yes** — as configuration, not text | Hooks and the permission allow/deny lists. |
| `~/.claude/settings.json` | **Yes** | Global permissions, hooks, plugins. Merged with project settings. |
| `.claude/agents/*.md` | Descriptions indexed; bodies on invocation | `frontend-developer` says "Use PROACTIVELY", which makes it eligible for model-initiated dispatch. |
| `.claude/skills/*/SKILL.md` | Descriptions indexed; bodies on invocation | `session-roles` sets `disable-model-invocation: true`, so it is manual-only. |
| `.claude/commands/*.md` | On `/qa-director-validate` only | |

### 1.2 What it ignores completely

`AGENTS.md` (**not** auto-loaded by Claude Code — it is reached only because `CLAUDE.md:5`
tells the model to go read it, which is a model decision, not a load), every file under
`docs/agents/`, `docs/setup/`, `docs/api/`, `docs/security/`, `SESSION_STATE.md`, `TODO.md`,
`ACTIONPLAN.md`, `CONTEXT.md`, `DESIGN_AGENTS.md`, `README.md`, `.agent/rules/*` (all five),
`.opencode/agent/meggar-review.md`, `.nsma-config.md`, `.antigravityignore`.

**This is the single most consequential fact in the audit.** Of the 26 MUST-rated rules,
**19 live in files Claude Code does not auto-load.** TEST-09 (verify migrations against the
ledger), PERM-05 (check issues before RBAC migrations), PERM-07 (no permission laundering),
GIT-06 (don't push to a peer's branch) all sit in `docs/agents/*.md` and reach the model only
if it chooses to open them.

### 1.3 Hierarchy and discovery behaviour

Root-to-cwd concatenation; **subtree `CLAUDE.md` files are not loaded at launch** — they load
when the model reads a file in that subdirectory. RESIDIO has no nested `CLAUDE.md`, so this
is latent rather than active. No documented import/include syntax for `CLAUDE.md`; RESIDIO
uses prose pointers ("See `docs/agents/branching.md`"), which are instructions to the model,
not a loading mechanism.

### 1.4 Permissions, hooks, approval gates

**Enforced:**
- `.claude/settings.json:3-25` — a `SessionStart` hook and a `PostToolUse(Bash)` hook. Both
  fire; both no-op (see `behaviour-inventory.md` ORPH-01). The SessionStart hook's output in
  this very session was "No prompts directory found. Skipping Notion sync."
- `.claude/settings.local.json:3-165` — 160+ allow entries. **`"deny": []` at line 166.**
- `~/.claude/settings.json:3-5` — `Bash(git push *)` allowed globally.
- `~/.claude/settings.json:75` — `skipDangerousModePermissionPrompt: true`.
- `~/.claude/settings.json:8-19` — a `PreToolUse` hook on `Bash|PowerShell` (`quieten.js`).

**Merely suggested:** everything else. There is no `PreToolUse` gate on `git commit`,
`git push`, `rm`, `git reset`, or `supabase … --local`. The repo's most emphatic prose rules
("Never work on `master`", "Do NOT run local CLI commands") have no local mechanism behind
them — `master` is protected server-side, which catches the push but not the commit.

**Net position:** RESIDIO's guardrails are enforced at exactly three points — GitHub branch
protection, `scripts/issue-workflow.mjs`, and one Vitest structural test. Everything else is
honour system, and the permission layer is configured maximally permissive.

### 1.5 Degradation over a long session / after compaction

Root `CLAUDE.md` is re-read and re-injected after compaction; nested ones are not. Anthropic
guidance targets **under 200 lines** per `CLAUDE.md` for adherence.

**`CLAUDE.md` here is 523 lines / 23.5 KB** — roughly 2.6× that target, and much of it is
reference material (MCP tool tables, code samples, a stale test-status paragraph) rather than
behaviour. The behavioural rules sit in lines 7–110; lines 111–523 are documentation. A rule
at line 438 (`CLAUDE.md:438`, the module-integration status) competes with 400 lines of
tables ahead of it.

**Implication:** critical rules belong (a) in root `CLAUDE.md`, near the top, short, and
(b) mirrored into a harness gate wherever a gate is possible. A rule that exists only in
`docs/agents/branching.md` has no compaction survival story at all — it was never in context
to begin with.

---

## 2. Codex

### 2.1 What it reads automatically

Per [Codex docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md), discovery is:

1. `~/.codex/AGENTS.override.md`, else `~/.codex/AGENTS.md` — **neither exists on this
   machine** (`.codex/` absent). No global layer.
2. Project scope: walk from repo root down to cwd, checking each level for
   `AGENTS.override.md`, then `AGENTS.md`, then configured fallback filenames.
3. Merge: concatenate root-downward; **closer directories override earlier guidance**.
4. Cap: combined instructions **32 KiB** by default (`project_doc_max_bytes`).
5. At most one file per directory level. Empty files skipped.

So Codex reads exactly one RESIDIO file automatically: **`AGENTS.md` (9,096 B)** — comfortably
inside the cap, with ~23 KB of headroom.

### 2.2 What it ignores completely

`CLAUDE.md` (the docs do not list it as read; `project_doc_fallback_filenames` could be
configured to include it but no Codex config exists here), every `docs/agents/*.md`,
`.claude/**`, `.opencode/**`, `.agent/rules/**`, memory.

### 2.3 The Codex gap

`AGENTS.md` is **silent on**: sub-agent model tiers and the `fable` ban (DELEG-01…04),
briefing discipline (DELEG-07…10), commit timing and staging scope (GIT-24, GIT-25),
the `to-issues` auto-invocation standing instruction (PLAN-03), doc-drift duties
(TEST-04, TEST-05), session-roles cross-session terms (PERM-07, PERM-08, COMM-01…05), and
the "analyse before editing" rule (EDIT-02).

Codex branches are the `codex/issue-<n>-<slug>` lane and the issue-workflow helper is *its*
path (`docs/agents/branching.md:24`), so Codex is the harness most likely to be running
multi-step delivery — and it inherits none of the delegation or commit-timing discipline.

`AGENTS.md` does point at `docs/agents/branching.md` (line 104) and `CLAUDE.md` (line 71), but
those are prose pointers with no loading mechanism and **no import syntax exists** in the
AGENTS.md format. Codex must choose to open them.

### 2.4 Permissions, hooks, approval gates

Codex has approval modes and sandboxing as a product feature, but the AGENTS.md documentation
page does not connect them to instruction files, and no Codex configuration exists in this
repo or on this machine. **UNVERIFIED** whether any Codex-side gate is active for this repo.
What is certain: nothing in the repository configures one.

### 2.5 Degradation

**UNVERIFIED** — I found no vendor documentation on Codex instruction re-injection after
context compaction. The 32 KiB cap implies instructions are treated as a bounded prefix, which
suggests they persist, but I am not asserting it.

---

## 3. OpenCode

### 3.1 What it reads automatically

Per [OpenCode Rules](https://opencode.ai/docs/rules/) and
[Instructions](https://opencode.ai/v2/docs/instructions):

1. Local files, traversing up from cwd: `AGENTS.md`, `CLAUDE.md`. **"The first matching file
   wins in each category."**
2. Global: `~/.config/opencode/AGENTS.md`.
3. Claude Code fallback: `~/.claude/CLAUDE.md`, unless disabled.
4. **"If you have both `AGENTS.md` and `CLAUDE.md`, only `AGENTS.md` is used."**
5. Extra files and globs merge in via the `instructions` array in `opencode.json`.
6. `@file/path` references inside `AGENTS.md` are loaded lazily, on a need-to-know basis.

Applied to RESIDIO: OpenCode reads **`AGENTS.md` only**. `CLAUDE.md` is explicitly excluded by
rule 4. There is **no `opencode.json` in this repo**, so mechanism 5 — the one purpose-built
way to auto-load `docs/agents/*.md` — is unused. `AGENTS.md` contains no `@` references, so
mechanism 6 is unused too.

### 3.2 What it ignores

Everything except `AGENTS.md` and `.opencode/agent/meggar-review.md` (loaded on invocation of
that sub-agent).

### 3.3 Permissions

`.opencode/agent/meggar-review.md:5-8` declares `permission: edit: deny / task: deny /
todowrite: deny`. This is the **only hard capability restriction anywhere in the repository**,
and it correctly backs the prose rule at line 160 ("Never edit code, push commits, or merge
PRs") with a mechanism. It is the model the rest of the repo should copy.

Whether OpenCode supports repo-level hooks equivalent to Claude Code's `PreToolUse` is
**UNVERIFIED** — the Rules documentation does not cover hooks, and none are configured here.

### 3.4 Degradation

**UNVERIFIED.**

---

## 4. Compatibility matrix

Rows: behaviour categories. Cells: **enforced** (a mechanism blocks or fails the action),
**honoured** (the harness reads the rule and is likely to follow it), **ignored** (the harness
never sees the rule), **unknown**.

| Category | Claude Code | Codex | OpenCode |
|---|---|---|---|
| **Git: never work on `master`** | enforced (server, on push) + honoured (`CLAUDE.md:46`) | enforced (server) + honoured (`AGENTS.md:84`) | enforced (server) + honoured (`AGENTS.md:84`) |
| **Git: branch lanes / early push / peer coordination** | honoured (summary only; `docs/agents/branching.md` ignored) | honoured (summary only) | honoured (summary only) |
| **Git: commit timing & staging scope** | honoured (memory GIT-24/25) | **ignored** — no rule in `AGENTS.md` | **ignored** |
| **Git: destructive ops (`reset --hard`, force push, `clean`)** | **ignored** — no rule exists, and `deny` is empty | **ignored** | **ignored** |
| **Git: `stage` branch protection** | honoured + enforced (CI-only advance) | honoured + enforced | honoured + enforced |
| **Testing: lint→build→test after changes** | honoured (`AGENTS.md:29` if read; `CLAUDE.md` doesn't state it) | honoured | honoured |
| **Testing: issue-workflow check gate** | enforced (`scripts/issue-workflow.mjs`) when used | enforced when used | enforced when used |
| **Testing: auth/audit integration** | enforced (Vitest structural test) | enforced | enforced |
| **Testing: doc-drift before session end** | honoured (`CLAUDE.md:36`) + CI advisory | **ignored** — not in `AGENTS.md` | **ignored** |
| **Testing: migration ledger verification** | honoured *only if* the model opens `docs/agents/migrations-on-merge.md` | honoured (one line, `AGENTS.md:99`) | honoured (one line) |
| **Testing: evidence discipline (narrow check / origin vs worktree)** | honoured (memory) | **ignored** | **ignored** |
| **File placement: worktrees, generated files, path alias** | honoured | honoured | honoured |
| **File placement: secrets / `.env` / `.mcp.json`** | enforced (`.gitignore`) — **but `.claude/settings*.json` is not covered** | enforced (same gap) | enforced (same gap) |
| **File placement: temp/scratch** | honoured (harness-supplied scratchpad) | **ignored** — no rule | **ignored** |
| **Editing: auth+audit contract** | enforced (test) + honoured ×4 | enforced + honoured | enforced + honoured |
| **Editing: analyse before changing code** | honoured only if `docs/setup/project-management.md` is opened | **ignored** | **ignored** |
| **Editing: stack conventions (path alias, revalidatePath, typed responses)** | honoured (partly) | honoured (partly) | honoured (partly) |
| **Session: read/update handoff** | honoured if `AGENTS.md` is read | honoured | honoured |
| **Session: startup rituals (`date`, revalidate state)** | **ignored** — three files deep | **ignored** | **ignored** |
| **Session: prompt/inbox pipeline** | hook fires and no-ops | **ignored** | **ignored** |
| **Session: compaction survival** | root `CLAUDE.md` re-injected; `docs/agents/*` never in context | unknown | unknown |
| **Permissions: destructive command gating** | **enforced-as-permissive** — `"deny": []`, `git push` allowed globally, dangerous-mode prompt skipped | unknown | unknown |
| **Permissions: sub-agent capability limits** | **ignored** — no `.claude/agents/*` declares tool restrictions beyond `frontend-developer`'s tool list | n/a | **enforced** (`meggar-review` `permission: … deny`) |
| **Permissions: Supabase cloud-only** | honoured ×2 (`CLAUDE.md:225`, `AGENTS.md:33`) but **contradicted by `package.json`** | honoured, same contradiction | honoured, same contradiction |
| **Permissions: no permission laundering / peer authorisation** | honoured *only if* `docs/agents/session-roles.md` is opened | **ignored** | **ignored** |
| **Planning: issue-first, `to-issues`, board transitions** | honoured (`CLAUDE.md:9-30`) | honoured (`AGENTS.md:106-120`, different rules) | honoured (same) |
| **Planning: fail-closed lifecycle** | enforced (script) | enforced | enforced |
| **Delegation: model tiers, `fable` ban, briefing** | honoured (`CLAUDE.md:77-100`) | **ignored** | **ignored** |
| **Communication: cross-session protocol** | honoured only if `session-roles.md` is opened; memory covers part | **ignored** | **ignored** |
| **Communication: verbosity/tone** | **ignored** — no rule exists | **ignored** | **ignored** |
| **Escalation: stop-and-ask triggers** | honoured (scattered) | honoured (`AGENTS.md:13,79`) | honoured (same two) |

**Reading the matrix:** the enforced column is thin and identical across harnesses (server
protection, one script, one test). The differences are almost entirely in *what each harness
even sees* — and Codex and OpenCode see one file.

---

## 5. Recommended file topology

### 5.1 The recommendation

```
AGENTS.md                    ← CANONICAL. Every behavioural rule that is not
                               Claude-Code-specific. Target ≤ 200 lines.
                               Read natively by Codex and OpenCode; read by
                               Claude Code because CLAUDE.md points at it.

CLAUDE.md                    ← THIN POINTER + Claude-only content.
                               Target ≤ 60 lines. Contents:
                                 · "Read AGENTS.md first; it is canonical."
                                 · The 5–8 highest-consequence MUSTs, restated
                                   verbatim (compaction insurance).
                                 · Claude-only: skills, memory policy, sub-agent
                                   model tiers, Workflow-tool opt-in.
                               Everything currently at lines 111–523 moves to
                               docs/ and is referenced, not inlined.

opencode.json                ← NEW. { "instructions": ["docs/agents/*.md"] }
                               This is the only supported way to get the rules
                               docs in front of OpenCode automatically.

~/.codex/AGENTS.md           ← NEW (optional). Personal cross-project practices
                               for Codex, mirroring ~/.claude/CLAUDE.md if you
                               create one.

docs/agents/*.md             ← Deep rules, one canonical home per topic. Reached
                               by pointer (Claude Code, Codex) or by the
                               instructions array (OpenCode).

.opencode/agent/*.md         ← STAYS. OpenCode-only: per-agent `permission:`
                               blocks have no equivalent in the other two.
.claude/agents/*.md          ← STAYS. Claude-only sub-agent definitions.
.claude/skills/*/SKILL.md    ← STAYS. Claude-only.
.claude/settings*.json       ← STAYS. Claude-only hooks and permissions.
                               Add a non-empty `deny` list. Untrack it.
.agent/rules/*.md            ← DELETE. No harness in use reads it, and it
                               carries three contradictions and two orphans.
```

### 5.2 What must stay harness-specific, and why

| Content | Must stay in | Reason |
|---|---|---|
| Sub-agent `permission: edit/task/todowrite: deny` | `.opencode/agent/*.md` | Only OpenCode supports per-agent capability denial. |
| `PreToolUse`/`SessionStart` hooks, permission allow/deny | `.claude/settings*.json` | Only Claude Code has this mechanism. |
| Skills, `disable-model-invocation`, slash commands | `.claude/skills/`, `.claude/commands/` | Claude-only concepts. |
| Model-tier names (`haiku`/`sonnet`/`opus`) | `CLAUDE.md` | Meaningless to Codex/OpenCode — but the *policy* ("set the tier explicitly", "split by independence", "brief like a stranger") is portable and belongs in `AGENTS.md`. |
| `project_doc_max_bytes`, fallback filenames | `~/.codex/config` | Codex-only. |
| `instructions` glob array | `opencode.json` | OpenCode-only. |

### 5.3 Trade-offs against the alternative

**The alternative** is what RESIDIO does today: two peer root files (`CLAUDE.md`,
`AGENTS.md`), each substantial, with a written precedence clause (`CLAUDE.md:5`) resolving
overlaps.

| | Recommended (thin `CLAUDE.md`, canonical `AGENTS.md`) | Current (two peers + precedence clause) |
|---|---|---|
| Drift | Structurally prevented — one copy | Observed: 3 direct contradictions between the two files in ~4 weeks |
| Codex / OpenCode coverage | Full — they read the canonical file | Partial — they miss delegation, commit timing, doc-drift, cross-session terms |
| Claude Code compaction survival | Strong — short root file, re-injected whole | Weak — 523 lines, key rules buried at 438 |
| Cost of a rule change | One edit | Two edits, or one edit and silent divergence |
| Claude-specific nuance | Preserved in the thin file | Preserved |
| **Downside: indirection** | Claude Code must follow a pointer to reach the canonical file — a model decision, not a load | No indirection; everything Claude needs is in the auto-loaded file |
| **Downside: migration cost** | Real — ~450 lines of `CLAUDE.md` must be relocated and every pointer re-checked | Zero |
| **Downside: 32 KiB cap** | `AGENTS.md` grows as it absorbs content; must stay under Codex's cap | Not currently near the cap |

The indirection downside is genuine and is why the recommendation keeps **5–8 MUSTs restated
verbatim** in `CLAUDE.md` rather than pointing at all of them. Duplication is normally the
disease, but for a handful of irreversible-consequence rules, a second copy in the one file
that is guaranteed to be in context — and re-injected after compaction — buys more than it
costs. Keep that list short and audit it, or it becomes CONF-03 again.

A third option — **a single `AGENTS.md` and a `CLAUDE.md` that is a one-line symlink or
pointer** — is cleaner still, but loses the Claude-only content (skills, model tiers, memory
policy) that has nowhere else to live. Not recommended.

---

## 6. How the unified practices file would be consumed

`audit/unified-practices.md` as drafted is **read by nothing**. It is a candidate pool, which
is correct for now. When curated, the adoption path is:

- §1–§10 (core, universal) → the personal global layer: `~/.claude/CLAUDE.md`,
  `~/.config/opencode/AGENTS.md`, `~/.codex/AGENTS.md`. Three copies of one file is
  unavoidable — no cross-harness global format exists. Generate them from one source.
- §11 (stack-dependent) → the project `AGENTS.md` of each project on that stack.
- §12 (repo-specific) → that repo's `AGENTS.md` only.
- §14 (project overrides) → per-project `AGENTS.md`.
- The MUST inventory in §13 → the input to a permission `deny` list and a hook set, not just
  prose.

At its current length the core would be roughly 90 lines, which fits comfortably inside
Anthropic's ≤200-line adherence guidance and Codex's 32 KiB cap.
