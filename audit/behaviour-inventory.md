# Behaviour inventory — RESIDIO (`meggarmind/RESIDIO`)

Audit date: 2026-09-04. Repo state: branch `master`, HEAD `0c69af2`.
Scope: instructions governing **how** a contributor (human or AI) should behave. Product,
stack, architecture and domain content is excluded except where a behavioural clause is
embedded in it.

Observed-in tag for every record in this document: **RESIDIO**.

---

## Step 1 — Discovery inventory

### 1.1 Files found and read

| Path | Type | Read by | Auto-loaded? | Committed? | Size | Last commit |
|---|---|---|---|---|---|---|
| `CLAUDE.md` | Markdown instructions | Claude Code | Yes (project root, every session) | tracked | 23,466 B / 523 L | 2026-09-02 |
| `AGENTS.md` | Markdown instructions | Codex, OpenCode; Claude Code via `CLAUDE.md:5` pointer | Codex/OpenCode: yes. Claude Code: only if it follows the pointer | tracked | 9,096 B / 120 L | 2026-09-02 |
| `SESSION_STATE.md` | Live handoff log | All three harnesses, by instruction | No — must be opened | tracked | 92,707 B / 502 L | 2026-09-02 |
| `CONTEXT.md` | Domain glossary (behavioural clause: vocabulary discipline) | Skills via `docs/agents/domain.md` | No | tracked | 6,289 B / 109 L | 2026-08-16 |
| `TODO.md` | Backlog (behavioural: maintenance duty) | All | No | tracked | 137,108 B / 2,399 L | 2026-09-02 |
| `ACTIONPLAN.md` | Active plan (behavioural: update duty, 2 gates) | All | No | tracked | 20,465 B / 193 L | 2026-09-02 |
| `README.md` | Readme, `## Conventions` section only | Human; agents incidentally | No | tracked | 5,413 B / 126 L | 2026-08-07 |
| `DESIGN_AGENTS.md` | Design standard | Referenced from `AGENTS.md:58` | No | tracked | 4,498 B / 81 L | 2026-01-18 |
| `.nsma-config.md` | Notion Sync Manager phase/module config | NSMA CLI (external tool) | `auto_import: true` per its frontmatter — but the CLI it targets is absent | tracked | 6,660 B / 212 L | 2025-12-27 |
| `docs/agents/branching.md` | Rules doc | Claude Code / Codex / OpenCode via pointers | No | tracked | 6,594 B / 134 L | 2026-09-02 |
| `docs/agents/migrations-on-merge.md` | Rules doc | via `CLAUDE.md:64` | No | tracked | 4,633 B / 94 L | 2026-09-02 |
| `docs/agents/session-roles.md` | Rules doc | via skill + `CLAUDE.md:55` | No | tracked | 8,609 B / 160 L | 2026-09-02 |
| `docs/agents/doc-drift.md` | Rules doc | via `CLAUDE.md:32` | No | tracked | 4,194 B / 84 L | 2026-09-02 |
| `docs/agents/project-board.md` | Rules doc | via `CLAUDE.md:17` | No | tracked | 2,350 B / 62 L | 2026-08-14 |
| `docs/agents/issue-tracker.md` | Rules doc | via `CLAUDE.md:9` | No | tracked | 1,228 B / 25 L | 2026-08-11 |
| `docs/agents/triage-labels.md` | Label vocabulary | via `CLAUDE.md:13` | No | tracked | 1,044 B / 14 L | 2026-08-11 |
| `docs/agents/domain.md` | Rules doc | via `CLAUDE.md:38` | No | tracked | 2,044 B / 50 L | 2026-08-11 |
| `docs/setup/project-management.md` | Session/git workflow | via `CLAUDE.md:193` | No | tracked | 10,339 B / 295 L | 2026-09-02 |
| `docs/setup/development-environment.md` | Setup + conventions | via `AGENTS.md:68` | No | tracked | 6,877 B / 249 L | 2025-12-28 |
| `docs/api/supabase-integration.md` | Data-layer patterns (several MUST/NEVER) | via `AGENTS.md:69` | No | tracked | — | — |
| `docs/security/access-control.md` | Security patterns (2 NEVERs) | via `CLAUDE.md:132` | No | tracked | — | — |
| `docs/setup/issue-monitor.md` | Monitor behaviour contract | Human/agent on demand | No | tracked | — | — |
| `.claude/settings.json` | Harness config (hooks) | Claude Code | Yes | tracked | 529 B / 27 L | 2026-08-23 |
| `.claude/settings.local.json` | Harness config (permissions) | Claude Code | Yes | **tracked (should not be)** | 6,605 B / 175 L | 2026-08-23 |
| `.claude/hooks/session-start.sh` | SessionStart hook | Claude Code | Yes (fires, then exits early) | tracked | 7,852 B / 169 L | 2025-12-27 |
| `.claude/hooks/task-complete.sh` | PostToolUse(Bash) hook | Claude Code | Yes (fires, no-ops) | tracked | 3,610 B / 112 L | 2025-12-28 |
| `.claude/agents/qa-director.md` | Sub-agent definition | Claude Code | On invocation | tracked | 8,533 B / 294 L | 2025-12-28 |
| `.claude/agents/frontend-developer.md` | Sub-agent definition | Claude Code | On invocation ("PROACTIVELY") | tracked | 1,318 B / 32 L | 2026-01-04 |
| `.claude/agents/security-dues-processor.md` | Sub-agent definition | Claude Code | On invocation | tracked | 8,132 B / 155 L | 2026-01-06 |
| `.claude/commands/qa-director-validate.md` | Slash command | Claude Code | Manual `/qa-director-validate` | tracked | 2,613 B / 95 L | 2025-12-28 |
| `.claude/skills/session-roles/SKILL.md` | Skill | Claude Code | Manual only (`disable-model-invocation: true`) | tracked | 3,895 B / 84 L | 2026-09-02 |
| `.claude/skills/qa-director-validate.md` | Stray flat file in `skills/` | **Nothing** — skills require `<name>/SKILL.md` | Never | tracked | — | — |
| `.claude/skills/{artifacts-builder,web-artifacts-builder,webapp-testing,frontend-design,senior-frontend}/SKILL.md` | Vendored skills | Claude Code | On invocation | tracked | — | — |
| `.opencode/agent/meggar-review.md` | OpenCode sub-agent | OpenCode only | On invocation | tracked | 7,503 B / 166 L | 2026-08-24 |
| `.agent/rules/*.md` (5 files) | `trigger: always_on` rules | Antigravity / Windsurf-style harnesses. **Not read by Claude Code, Codex or OpenCode** | Claimed always-on; in practice unread | tracked | 107–2,055 B | 2026-01-18 → 2026-01-23 |
| `.github/issue-workflow.json` | Workflow config (checks, statuses, monitor) | `scripts/issue-workflow.mjs`, `scripts/issue-monitor.mjs` | On command | tracked | 45 L | — |
| `.github/workflows/*.yml` (6) | CI | GitHub Actions | On event | tracked | — | — |
| `.gitignore` | File-placement policy | git | Always | tracked | 71+ L | — |
| `.antigravityignore` | Context-exclusion policy | Antigravity | Always (that tool only) | tracked | 100 B / 8 L | 2026-01-13 |
| `.stignore` | Syncthing exclusion policy | Syncthing | Always | tracked | 421 B / 46 L | 2026-01-14 |
| `package.json` `scripts` | Workflow-encoding targets | npm | On command | tracked | 3,366 B | 2026-08-30 |
| `~/.claude/settings.json` | Global harness config | Claude Code (all projects) | Yes | user-level, not in repo | 4,677 B / 105 L | 2026-09-04 |
| `~/.claude/projects/C--projects-RESIDIO/memory/*.md` (8 + index) | Persistent user/feedback memory | Claude Code | `MEMORY.md` index auto-loaded; bodies on recall | user-level | — | 2026-08-19 → 2026-09-02 |
| `.forgestudio/config.json`, `.forgestudio/scripts/*.sh` | Local tool state | ForgeStudio | n/a | **gitignored** (`.gitignore:70`) | — | — |
| `.automaker/**` | Feature specs (product, out of scope) | AutoMaker | n/a | tracked | — | — |
| `.impeccable/critique/*.md` | One-off critique output | `impeccable` skill | n/a | tracked | — | — |

### 1.2 Files searched for and **not present**

`CLAUDE.local.md`, `AGENT.md`, `GEMINI.md`, `.codex/`, any Codex config file, `opencode.json` /
`opencode.jsonc`, `.cursorrules`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`,
`.windsurfrules`, `.aider.conf.yml`, `.continue/`, `CONVENTIONS.md`, `CONTRIBUTING.md`,
`.github/PULL_REQUEST_TEMPLATE*`, `.github/ISSUE_TEMPLATE/`, `.husky/`, any lint-staged or
pre-commit config, any git hook in `.git/hooks` beyond the shipped samples, `Makefile`,
`justfile`, `.editorconfig`, `.mcp.json` (gitignored at `.gitignore:48`, absent from disk),
`~/.claude/CLAUDE.md` (no global user instruction file exists).

**No pre-commit, commit-msg, pre-push or lint-staged mechanism exists anywhere in this repo.**
Every "before you commit" rule below is honour-system.

### 1.3 Imperative-language sweep

Grepping `always|never|must|do not|don't|before you|after each|mandatory` across `docs/`,
root Markdown and dotfolders surfaced additional behavioural clauses in files not on the
canonical list — `docs/api/supabase-integration.md`, `docs/security/access-control.md`,
`docs/setup/development-environment.md`, `docs/setup/issue-monitor.md`, `ACTIONPLAN.md`,
`docs/setup/google-oauth.md`. Those are folded into Step 2. `TODO.md` and `SESSION_STATE.md`
were sampled rather than read whole (137 KB and 93 KB); `SESSION_STATE.md`'s header carries
two behavioural directives, captured as SESSION-02 and PLAN-13.

---

## Step 2 — Behaviour extraction

Legend for **Strength**: assessed against the stated MUST criterion (irreversible /
externally visible / data loss / secret exposure / destructive git / production impact /
regulatory). Where the source file's own wording disagrees, the row says so in **Notes**.

Legend for **Enforcement**: `honour` = prose only; `CI` = GitHub Actions; `test` = a Vitest
assertion; `server` = GitHub branch protection; `script` = a repo script refuses; `config` =
harness permission/hook.

**Precedence weight** is a 1–5 estimate of how likely a model actually is to follow the rule,
given file placement, auto-load behaviour and wording force. 5 = auto-loaded root file,
unambiguous imperative. 1 = a file no active harness reads.

---

### GIT — git behaviour

| ID | Directive (verbatim, operative sentence) | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| GIT-01 | "**Never work on `master`** — branch protection refuses direct pushes from every tool, including the owner." | `CLAUDE.md:46`; dup `AGENTS.md:84`; dup `docs/agents/branching.md:8-11` | repo-wide | always | **MUST** | universal | server (push refused) + honour (for local commits) | 5 | Only the *push* is enforced. Committing on `master` locally is not blocked — this session is doing exactly that. |
| GIT-02 | "Do not look for a way around it, do not ask a human to force it through, and do not ask another session to push on your behalf — that last one is the same bypass wearing a disguise. Open a PR." | `docs/agents/branching.md:13-15` | repo-wide | on push rejection | **MUST** | universal | honour | 4 | Excellent anti-laundering clause; portable verbatim. |
| GIT-03 | "Branch prefixes declare the lane: `codex/issue-<n>-<slug>` … `feat/<slug>` and `fix/<slug>` … `qa/<date>`, `merge/<slug>`." | `AGENTS.md:95-96`; table `docs/agents/branching.md:22-28`; `CLAUDE.md:49` | repo-wide | on branch creation | SHOULD | repo-specific | honour (`script` for `codex/` prefix via `.github/issue-workflow.json:9`) | 4 | `branching.md:30` explicitly softens it: "These are lane defaults, not walls". |
| GIT-04 | "**Push your branch early**, before you have much on it. The push is the declaration." | `docs/agents/branching.md:71-73`; dup `AGENTS.md:91-92` | repo-wide | on starting work | SHOULD | universal | honour | 3 | |
| GIT-05 | "`git ls-remote --heads origin` # who is working on what, right now … Check that list before taking a branch." | `docs/agents/branching.md:67-73`; `AGENTS.md:90-91` | repo-wide | before branch creation | SHOULD | universal | honour | 3 | |
| GIT-06 | "Never push to a branch another session has declared without asking that session and waiting for an explicit answer. A clear is true as of its timestamp, not indefinitely." | `docs/agents/branching.md:78-79` | repo-wide | before push | **MUST** | universal | honour | 3 | Externally visible + can destroy a peer's work. |
| GIT-07 | "send a one-line 'about to push to <branch> — are you clear?' and hold until they answer." | `docs/agents/session-roles.md:113-121` | Rex/Quinn sessions | before push to shared branch | **MUST** | universal | honour | 3 | Near-duplicate of GIT-06 with a stricter procedure. |
| GIT-08 | "Before disclosing what branch you are on, run `git rev-parse --abbrev-ref @{upstream}` and report *that*." | `docs/agents/branching.md:35-36` | repo-wide | before any branch claim | SHOULD | universal | honour | 3 | Derived from a real 2026-09-02 incident. |
| GIT-09 | "Sync `master` into your branch **before** starting work that is not central to the feature." | `AGENTS.md:98`; expanded `docs/agents/branching.md:38-42` ("and again before opening a PR") | repo-wide | on session start / pre-PR | SHOULD | universal | honour | 3 | |
| GIT-10 | "`stage` … advances only via `.github/workflows/stage-backup.yml`; never push to it by hand." | `AGENTS.md:101-102`; `docs/agents/branching.md:90-91`; comment `.github/workflows/stage-backup.yml:3-7` | repo-wide | always | **MUST** | repo-specific | CI + honour | 4 | Destroys the rollback point if broken. |
| GIT-11 | "Even a rollback goes through a PR — protection has no exceptions." | `docs/agents/branching.md:93-94` | repo-wide | on rollback | **MUST** | universal | server | 4 | |
| GIT-12 | "If a task touches multiple concerns, prefer splitting into smaller sequential commits." | `CLAUDE.md:75` | repo-wide | before commit | SHOULD | universal | honour | 3 | |
| GIT-13 | "**Note**: Do not include Claude Code references in commits." | `docs/setup/project-management.md:15` | repo-wide | on commit | SHOULD | universal | honour | 2 | **Contradicts GIT-14 in the same file.** See CONF-01. |
| GIT-14 | Commit template embedding "🤖 Generated with [Claude Code]…" and "Co-Authored-By: Claude Opus 4.5" | `docs/setup/project-management.md:137-147` | `sync_up` only | on `sync_up` | SHOULD | universal | honour | 2 | Model name is stale (4.5). Directly violates GIT-13. |
| GIT-15 | "If no positive confirmation within 30 minutes: Auto-push with message: `feat: Complete Phase X …`" | `docs/setup/project-management.md:203-206` | repo-wide | 30 min after phase completion | ambiguous (worded as procedure) → recommend **delete** | universal | honour | 1 | Publishes without consent, and to `master`. See CONF-02. |
| GIT-16 | "**If connected**: Push within 10 minutes of writing new files" | `docs/setup/project-management.md:49` | repo-wide | 10 min after file creation | ambiguous | universal | honour | 1 | Conflicts with GIT-01 and with the per-issue confirmation rule GIT-24. |
| GIT-17 | "'Phase X is complete. Would you like me to push to both master and origin?' YES → Execute git push" | `docs/setup/project-management.md:194-197` | repo-wide | on phase completion | SHOULD | repo-specific | honour | 2 | "push to both master and origin" is incoherent post-branch-protection. |
| GIT-18 | "Commit should be automatically done when a Bug is confirmed fixed" | `.agent/rules/documentation-update.md:5` | Antigravity-class harnesses | on bugfix verification | ambiguous → recommend **delete** | universal | honour | 1 | No harness in use reads this file. Contradicts GIT-24. |
| GIT-19 | "Version Control: Perform a git commit and push: Message format: `feat(<scope>): complete <task-slug> implementation`" | `.agent/rules/workflow-complex-feature-isolation.md:45-49` | Antigravity-class | on feature completion | ambiguous | universal | honour | 1 | Unread file; also auto-pushes. |
| GIT-20 | "Pushing the resulting `master` commit requires explicit authorization; after it succeeds, rerun `finish`." | `docs/setup/project-management.md:76` | issue workflow | during `issue:workflow finish` | **MUST** | repo-specific | script | 4 | |
| GIT-21 | "`finish` … refuses dirty worktrees or integration branches, merges the issue branch into `master` with `--no-ff`, then verifies that the integration commit has reached `origin/master`" | `docs/setup/project-management.md:74`; `AGENTS.md:118-119` | issue workflow | on `finish` | **MUST** | repo-specific | script | 4 | Enforced by `scripts/issue-workflow.mjs`. |
| GIT-22 | "Never edit code, push commits, or merge PRs." | `.opencode/agent/meggar-review.md:160` | `meggar-review` agent | always | **MUST** | universal | config (`permission: edit: deny`, `.opencode/agent/meggar-review.md:5-8`) | 5 | Best-enforced rule in the repo: prose + harness deny. |
| GIT-23 | "Never close an issue." | `.opencode/agent/meggar-review.md:161` | `meggar-review` agent | always | SHOULD | repo-specific | honour | 4 | |
| GIT-24 | "commit only the specific issue's changes and ask the user to confirm before starting the next issue in the batch — do not proceed … and do not auto-commit without being asked." | `~/.claude/projects/C--projects-RESIDIO/memory/feedback_commit_confirmation_per_issue.md:11` | global user (this project) | multi-issue sessions | SHOULD | universal | honour (memory recall) | 4 | Directly contradicts GIT-15, GIT-16, GIT-18, GIT-19. |
| GIT-25 | "stage only that issue's files (the repo commonly has unrelated uncommitted work in the tree … never sweep those in)" | `…/feedback_commit_confirmation_per_issue.md:14` | global user | on staging | **MUST** | universal | honour | 4 | Committing another session's WIP is externally visible and hard to unpick. Contradicts `git add .` at `docs/setup/project-management.md:135`. |
| GIT-26 | "`git add .`" in the sync-up procedure | `docs/setup/project-management.md:135` | `sync_up` | on `sync_up` | ambiguous → recommend **delete** | universal | honour | 2 | See GIT-25. |
| GIT-27 | "Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone." | `docs/agents/issue-tracker.md:14` | repo-wide | on `gh` use | SHOULD | universal | honour | 3 | |
| GIT-28 | "Resolve each item's `content.repository` from project item-list JSON. Do not assume one repository." | `.opencode/agent/meggar-review.md:61` | `meggar-review` | on board reads | SHOULD | universal | honour | 3 | |

**Vague enough that two readers would act differently:** GIT-03 (is a `chore/` branch a
violation or an "exception"? `branching.md:30` permits exceptions but names no bar);
GIT-16 ("if connected" is undefined — connected to what?); GIT-17 ("push to both master and
origin" names two things that are not two things).

---

### TEST — testing and verification gates

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| TEST-01 | "Run `lint -> build` (and tests where relevant) after changes." | `AGENTS.md:29` | repo-wide | after any change | SHOULD | stack-dependent | honour | 4 | "where relevant" is the loophole; TEST-02 closes it for one case only. |
| TEST-02 | "Do not trust it as 'all good': run `npm test` yourself after changes." | `AGENTS.md:45` | `src/actions/**` | after change | SHOULD | repo-specific | test (`src/__tests__/integration/module-integration.test.ts`) | 4 | |
| TEST-03 | "Re-run `npm test` after any new write action." | `CLAUDE.md:438` | `src/actions/**` | on new write action | SHOULD | repo-specific | test | 4 | |
| TEST-04 | "Run `npm run docs:drift` before wrapping up any session that touched `src/**`." | `CLAUDE.md:36` | sessions touching `src/**` | session end | SHOULD | repo-specific | CI advisory (`.github/workflows/docs-drift.yml`, "does not fail the build", `docs/agents/doc-drift.md:76`) | 4 | |
| TEST-05 | "Never run `docs:verify -- --all` to clear a report you have not read." | `CLAUDE.md:36`; dup `docs/agents/doc-drift.md:56` | repo-wide | always | SHOULD | repo-specific | honour | 4 | Source words it "never"; not irreversible (re-stampable), so SHOULD. |
| TEST-06 | "Before marking a feature complete, verify: [7-item integration checklist]" | `CLAUDE.md:422-432` | `src/actions/**` | before completion claim | SHOULD | repo-specific | test (partially) | 4 | |
| TEST-07 | "Static Analysis (Linting): Run a check for lint errors in all modified files. Ensure all used hooks … are explicitly imported." | `.agent/rules/self-verification.md:7-10` | Antigravity-class | after every code modification | SHOULD | stack-dependent | honour | 1 | Unread by the three active harnesses. |
| TEST-08 | "Proactively run a lint check on modified files to catch missing imports … before I finish." | `.agent/rules/self-assurance.md:7` | Antigravity-class | before finishing | SHOULD | stack-dependent | honour | 1 | Near-duplicate of TEST-07. |
| TEST-09 | "verify by name against the database's applied list — never against the migrations directory, which looks correct in every failure mode." | `CLAUDE.md:64`; expanded `docs/agents/migrations-on-merge.md:31-42`; ref `docs/agents/branching.md:53-55` | migrations | after merge / before claims | **MUST** | stack-dependent (Supabase) | honour | 5 | Production impact. Stated three times; strongest-worded rule in the repo. |
| TEST-10 | "Never treat a checked issue checkbox as proof." | `.opencode/agent/meggar-review.md:82` | `meggar-review` | on review | SHOULD | universal | honour | 4 | |
| TEST-11 | "Count only merged or otherwise deployed work as complete. Open or unmerged PRs remain in progress." | `.opencode/agent/meggar-review.md:87` | `meggar-review` | on review | SHOULD | universal | honour | 4 | |
| TEST-12 | "Never approve from an issue description alone. Without a linked PR, commit, deployment, or other artifact, hold the issue." | `.opencode/agent/meggar-review.md:159` | `meggar-review` | on verdict | SHOULD | universal | honour | 4 | |
| TEST-13 | Gate commands: `lint`, `tests`, `build` | `.github/issue-workflow.json:28-44` | issue workflow | on `review`/`finish` | **MUST** | repo-specific | script | 5 | Machine-enforced; the only mandatory test gate in the repo. |
| TEST-14 | "**Verifies sub-agent claims against the actual files or diff before relaying.**" | `docs/agents/session-roles.md:34-36`; dup `CLAUDE.md:100` | delegating sessions | before relaying | SHOULD | universal | honour | 4 | |
| TEST-15 | "**verify a withheld migration's current contents before acting on any note about it**" | `docs/agents/migrations-on-merge.md:76-78` | migrations | before acting on a note | **MUST** | universal | honour | 4 | Near-miss incident recorded in the same paragraph. |
| TEST-16 | "A claim of the form 'this is a live bug on master today' is only established by reading `git show origin/master:<path>`." | memory `feedback_verify_against_origin_not_worktree.md:8-9` | global user | before any master claim | SHOULD | universal | honour | 4 | |
| TEST-17 | "before reporting, say out loud what the command actually establishes versus what you are about to claim; if they differ, run the wider check or narrow the claim." | memory `feedback_narrow_check_broad_claim.md:20-21` | global user | before reporting | SHOULD | universal | honour | 4 | |
| TEST-18 | "Any `head`, `-m`, `--limit`, `head_limit` or default result cap makes a 'nothing found' conclusion unsound. Count the matches first, or re-run uncapped." | memory `feedback_narrow_check_broad_claim.md:32-34` | global user | before absence claims | SHOULD | universal | honour | 4 | Highly portable; currently only in memory. |
| TEST-19 | "verify the resulting behaviour, not whether it matches what you asked for." | memory `feedback_review_behaviour_not_conformance.md:8-11` | global user | on review | SHOULD | universal | honour | 4 | |
| TEST-20 | "Check CI via `statusCheckRollup`; failing or pending checks prevent confirmation." | `.opencode/agent/meggar-review.md:85` | `meggar-review` | on review | SHOULD | universal | honour | 4 | Currently unsatisfiable — see ORPH-07. |
| TEST-21 | "Mark visual, UX, or external behavioral requirements that cannot be proven from available evidence as needing manual verification." | `.opencode/agent/meggar-review.md:88` | `meggar-review` | on review | SHOULD | universal | honour | 4 | |
| TEST-22 | "`review` sets `In review` before running the configured lint, test, and build checks. `finish` reruns those checks" | `docs/setup/project-management.md:74` | issue workflow | on review/finish | **MUST** | repo-specific | script | 5 | |

**Vague:** TEST-01 ("where relevant" — unbounded); TEST-06 (the checklist's "verify" has no
command attached to items 3–4).

---

### FILE — file creation, placement, naming, temp handling

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| FILE-01 | "**Path alias**: `@/*` maps to `src/*`. Always import via `@/...`, never relative." | `AGENTS.md:34`; dup `README.md:119`; dup `docs/setup/development-environment.md:182-192`; dup `CLAUDE.md:205` | `src/**` | on import | SHOULD | stack-dependent | honour (no lint rule found) | 4 | Restated four times. |
| FILE-02 | "DB types: `src/types/database.generated.ts` (generated, do not hand-edit)" | `AGENTS.md:36` | that file | always | SHOULD | stack-dependent | honour | 4 | |
| FILE-03 | "Do not create separate handoff files; `SESSION_STATE.md` is the sole live handoff." | `AGENTS.md:80` | repo-wide | at session end | SHOULD | universal | honour | 4 | Strong, portable anti-sprawl rule. |
| FILE-04 | "Implementation is isolated per issue in `.worktrees/issue-<number>` on `codex/issue-<number>-<slug>`." | `AGENTS.md:110`; `docs/setup/project-management.md:74`; config `.github/issue-workflow.json:8-9` | issue workflow | on start | **MUST** | repo-specific | script + `.gitignore:71` | 5 | |
| FILE-05 | "Create Temporary Context File: Immediately create a specific tracking file at `docs/todo/<task-slug>.md`." | `.agent/rules/workflow-complex-feature-isolation.md:12` | Antigravity-class | on complex task | SHOULD | universal | honour | 1 | **Orphan** — `docs/todo/` does not exist. |
| FILE-06 | "Cleanup: Delete the temporary file `docs/todo/<task-slug>.md`." | `.agent/rules/workflow-complex-feature-isolation.md:50` | Antigravity-class | on completion | SHOULD | universal | honour | 1 | Orphan (pairs with FILE-05). |
| FILE-07 | "Create a permanent feature documentation file in `docs/features/<task-slug>.md` detailing how the feature works." | `.agent/rules/workflow-complex-feature-isolation.md:43` | Antigravity-class | on completion | SHOULD | universal | honour | 1 | `docs/features/` exists; the rule is not followed by active harnesses. |
| FILE-08 | "Reports are generated in `docs/validation/validation-YYYYMMDD-HHMMSS.md`" | `CLAUDE.md:156`; `.claude/commands/qa-director-validate.md:58` | qa-director | on validation | SHOULD | repo-specific | honour | 3 | |
| FILE-09 | "# Scratch / ad-hoc files in repo root" → `/re_match.ts`, `/testFile.txt`, `/testsprite/`, `/.playwright-mcp/` ignored | `.gitignore:60-66` | repo root | always | SHOULD | repo-specific | git | 5 | Names specific past offenders rather than a pattern; a new scratch file is not covered. |
| FILE-10 | "# MCP configuration (contains secrets)" → `.mcp.json` ignored | `.gitignore:47-48` | repo root | always | **MUST** | universal | git | 5 | |
| FILE-11 | "Keep the globs **narrow** … Map a page to the routes, actions, and libs it actually describes — never to `src/**`." | `docs/agents/doc-drift.md:60` | `website/docs/**` frontmatter | on new doc page | SHOULD | repo-specific | honour | 3 | |
| FILE-12 | "Server actions following `actionName.ts` convention" | `.claude/agents/qa-director.md:44` | `src/actions/**` | on new action | SHOULD | repo-specific | honour | 2 | Never stated in `AGENTS.md`/`CLAUDE.md`; only inside a sub-agent prompt. |
| FILE-13 | "Register new permission constants in `src/lib/auth/action-roles.ts`; add entity types to `AuditEntityType`." | `AGENTS.md:43`; dup `CLAUDE.md:315-330`, `CLAUDE.md:401-410` | `src/actions/**` | on new permission | **MUST** | repo-specific | test | 5 | Auth surface; a miss is a security-visible defect. |
| FILE-14 | "`# env files (can opt-in for committing if needed)` `.env*` … `!.env.example`" with the reason recorded inline | `.gitignore:35-40` | repo root | always | **MUST** | universal | git | 5 | Model example of a rule carrying its own rationale. |
| FILE-15 | "`/.worktrees/`" ignored | `.gitignore:70-71` | repo root | always | SHOULD | repo-specific | git | 5 | |
| FILE-16 | "`/.forgestudio/` `/skill-observations/`" ignored ("Local tool state") | `.gitignore:73-75` | repo root | always | SHOULD | repo-specific | git | 5 | |
| FILE-17 | "`node_modules/ … .automaker/`" excluded from agent context | `.antigravityignore:1-8` | Antigravity | always | MAY | repo-specific | config | 1 | Only one tool honours it. |
| FILE-18 | Scratchpad convention — this session's harness supplies a session-scoped temp dir under `%LOCALAPPDATA%\Temp\claude\…` | Claude Code system prompt (harness-level, not a repo file) | Claude Code | on temp file | SHOULD | universal | config | 5 | **No repo file states a temp-file policy.** See GAP-03. |

**Vague:** FILE-09 (an allowlist of four historical filenames, not a rule — the next scratch
file lands untracked-but-unignored and shows in `git status`).

---

### EDIT — editing conventions

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| EDIT-01 | "If something exists in both, `AGENTS.md` wins; don't duplicate." | `CLAUDE.md:5` | `CLAUDE.md` vs `AGENTS.md` | on doc edit | SHOULD | universal | honour | 4 | The repo's own precedence clause. Violated in several places — see CONF-04. |
| EDIT-02 | "**Important**: Do NOT immediately change code when user explains a problem. 1. Analyze first 2. Present options 3. Get confirmation before implementation" | `docs/setup/project-management.md:42-45` | repo-wide | on problem report | SHOULD | universal | honour | 3 | Buried three files deep; high value, low weight. |
| EDIT-03 | "**Color Space**: Always use **OKLCH** for color definitions." | `DESIGN_AGENTS.md` §2 | UI code | on styling | SHOULD | stack-dependent | honour | 2 | |
| EDIT-04 | "Wrap raw shadcn components in semantic layout components rather than using them directly in pages." | `AGENTS.md:58` | `src/components/**` | on UI work | SHOULD | stack-dependent | honour | 3 | |
| EDIT-05 | "Never use `revalidatePath()` in server actions for client-component pages. Instead, rely on React Query's `invalidateQueries()`." | `docs/api/supabase-integration.md:367` | `src/actions/**` | on write action | SHOULD | stack-dependent | honour | 3 | |
| EDIT-06 | "All monetary input fields MUST use `CurrencyInput`" / "**DO NOT** use `<Input type=\"number\" />` for currency fields." | `docs/api/supabase-integration.md:323,354` | forms | on currency field | SHOULD | stack-dependent | honour | 3 | Source says MUST; consequence is a UI defect, so SHOULD. |
| EDIT-07 | "Always use typed responses from server actions" | `docs/setup/development-environment.md:215` | `src/actions/**` | always | SHOULD | stack-dependent | honour | 3 | |
| EDIT-08 | "When your output names a domain concept … use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids." | `docs/agents/domain.md:43` | all output | on naming | SHOULD | universal | honour | 3 | |
| EDIT-09 | "If your output contradicts an existing ADR, surface it explicitly rather than silently overriding" | `docs/agents/domain.md:49` | all output | on ADR conflict | SHOULD | universal | honour | 3 | |
| EDIT-10 | "Do not reconstruct the roles from memory or from a peer's summary of them; an arrangement run from a paraphrase is the failure this doc exists to prevent." | `.claude/skills/session-roles/SKILL.md:18-20` | session-roles | on activation | SHOULD | universal | honour | 4 | Generalises well: read the source, don't paraphrase. |
| EDIT-11 | "Every write server action (CREATE/UPDATE/DELETE) in `src/actions/**` MUST: 1. Call `authorizePermission(PERMISSIONS.X)` … FIRST and bail on failure. 2. Call `logAudit(...)` … after a successful write." | `AGENTS.md:40-42`; dup `CLAUDE.md:303-312`, `CLAUDE.md:368-400`, `CLAUDE.md:445-470`; dup `README.md:121` | `src/actions/**` | on write action | **MUST** | repo-specific | test | 5 | Auth bypass = externally visible security impact. Stated five times across two files. |
| EDIT-12 | "Don't re-add hard permission checks there [allowlisted recipient-facing/cron/webhook flows]." | `CLAUDE.md:438` | allowlisted actions | on edit | SHOULD | repo-specific | honour | 3 | A carve-out to EDIT-11; easy to miss because it sits in a status paragraph. |
| EDIT-13 | "Use `'use client'` directive only when needed (hooks, event handlers)" | `docs/setup/development-environment.md:224` | `src/**` | on component | SHOULD | stack-dependent | honour | 2 | |
| EDIT-14 | "Never interpolate user input into raw SQL" | `docs/security/access-control.md:321` | repo-wide | always | **MUST** | universal | honour | 4 | Injection = externally visible. |
| EDIT-15 | "Never log passwords or tokens" | `docs/security/access-control.md:333` | repo-wide | always | **MUST** | universal | honour | 4 | Secret exposure. |
| EDIT-16 | "Lucide icons don't accept `title` prop. Wrap in `<span title=\"...\">` instead" | `docs/api/supabase-integration.md:444` | UI | on icon | MAY | stack-dependent | honour | 2 | |

---

### SESSION — session lifecycle, startup, handoff, resumption

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| SESSION-01 | "`SESSION_STATE.md` is the live cross-agent handoff and current verified baseline. Read it before substantive work and update its snapshot, last-session entry, and next steps before finishing, whether or not the user explicitly asks." | `AGENTS.md:76` | repo-wide | session start + end | SHOULD | universal | honour | 4 | |
| SESSION-02 | "**Keep this up to date at the end of every session.** Anyone starting work reads this first." | `SESSION_STATE.md:4` | repo-wide | session end | SHOULD | universal | honour | 3 | |
| SESSION-03 | "declare your tool, branch and intent in `SESSION_STATE.md` and check it before taking a branch" | `CLAUDE.md:47-49` | repo-wide | before branch | SHOULD | repo-specific | honour | 4 | **Contradicted by SESSION-04.** See CONF-03. |
| SESSION-04 | "**The remote branch list is the live registry — not `SESSION_STATE.md`.** … Do not use it for live signalling." | `docs/agents/branching.md:59-63`; dup `AGENTS.md:92-93` | repo-wide | before branch | SHOULD | universal | honour | 3 | |
| SESSION-05 | "Maintain `TODO.md` as the product backlog: mark completed items, add newly discovered follow-up work" | `AGENTS.md:77`; near-dup `.agent/rules/documentation-update.md:5`; dup `docs/setup/project-management.md:26` | repo-wide | on backlog change | SHOULD | repo-specific | honour | 3 | |
| SESSION-06 | "Update `ACTIONPLAN.md` whenever work completes, changes, or invalidates an active plan step." | `AGENTS.md:78`; dup `AGENTS.md:72`; dup `docs/setup/project-management.md:27` | repo-wide | on plan change | SHOULD | repo-specific | honour | 3 | |
| SESSION-07 | Keyphrase table: `pause_session`, `end_session`, `resume_session`, `sync_dev_inbox`, `sync_up` | `CLAUDE.md:184-192`; dup `docs/setup/project-management.md:82-90` | repo-wide | on keyphrase | SHOULD | repo-specific | honour | 4 | `sync_dev_inbox` is orphaned — see ORPH-01. |
| SESSION-08 | "Run `date` command to confirm current date/time" | `docs/setup/project-management.md:37`; dup `:124` | repo-wide | session start | SHOULD | universal | honour | 2 | |
| SESSION-09 | "Revalidate last known state (concurrent sessions possible)" | `docs/setup/project-management.md:38` | repo-wide | session start | SHOULD | universal | honour | 2 | |
| SESSION-10 | Handoff procedure Steps 1–4 (SESSION_STATE → TODO/ACTIONPLAN → CLAUDE.md → Notion page `2c92bfe3-…`) | `docs/setup/project-management.md:98-113` | repo-wide | `pause_session`/`end_session` | SHOULD | repo-specific | honour | 3 | Step 4 depends on a Notion MCP server that is unauthenticated this session. |
| SESSION-11 | "Update CLAUDE.md — Only if new patterns or conventions were established" | `docs/setup/project-management.md:106-107` | repo-wide | session end | SHOULD | universal | honour | 3 | Good restraint clause; contradicts nothing but is easily over-applied. |
| SESSION-12 | "Before asking the user for input or ending a turn, the agent MUST update the Current Session Context section of the specific `docs/todo/<task-slug>.md` file." | `.agent/rules/workflow-complex-feature-isolation.md:34` | Antigravity-class | every turn | SHOULD | universal | honour | 1 | Orphan target dir; unread file. |
| SESSION-13 | "If the user returns to this task after a break, the agent must read `docs/todo/<task-slug>.md` first to restore the memory state." | `.agent/rules/workflow-complex-feature-isolation.md:36` | Antigravity-class | on resume | SHOULD | universal | honour | 1 | Orphan. |
| SESSION-14 | "`README.md` \| Hourly \| Or at session end" | `docs/setup/project-management.md:28` | repo-wide | hourly | ambiguous → recommend **delete** | universal | honour | 1 | Nobody updates a README hourly; last commit was 2026-08-07. |
| SESSION-15 | "On activation, create the flag the hook checks: `touch \"$HOME/.claude/role-mode-active\"`" | `.claude/skills/session-roles/SKILL.md:73-74` | session-roles | on activation | SHOULD | repo-specific | honour | 2 | **Orphan** — the `SessionEnd`/`git-sync.ps1` hook it suppresses does not exist. See ORPH-03. |
| SESSION-16 | "Before exploring, read these: **`CONTEXT.md`** at the repo root … **`docs/adr/`**" | `docs/agents/domain.md:5-9` | exploration | before exploring | SHOULD | universal | honour | 3 | |
| SESSION-17 | "If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront." | `docs/agents/domain.md:11` | exploration | on missing file | SHOULD | universal | honour | 3 | Rare and valuable: a rule about *not* generating noise. |
| SESSION-18 | "**`task-observer` skill** … Invoke it at the start of any multi-step, tool-using task in this repo, per its own description." | `CLAUDE.md:107` | repo-wide | task start | SHOULD | repo-specific | honour | 3 | |
| SESSION-19 | "Save a `feedback` memory whenever I correct your approach or confirm a non-obvious one worked" | `CLAUDE.md:106` | repo-wide | on correction | SHOULD | universal | honour (harness memory) | 4 | Demonstrably working — 8 memories exist. |
| SESSION-20 | "Read `docs/agents/session-roles.md` in full before acting." | `.claude/skills/session-roles/SKILL.md:15` | session-roles | on activation | SHOULD | universal | honour | 4 | |
| SESSION-21 | "Say which role you took and which rule gave it to you. A silent choice makes a collision invisible until work is already in flight." | `.claude/skills/session-roles/SKILL.md:44` | session-roles | on activation | SHOULD | universal | honour | 4 | |
| SESSION-22 | "Execute Development Inbox Workflow (automated via SessionStart hook)" | `docs/setup/project-management.md:36` | repo-wide | session start | SHOULD | repo-specific | config (`.claude/settings.json:3-12`) | 2 | Hook fires and exits at `session-start.sh:15-18` ("No prompts directory found"). See ORPH-01. |
| SESSION-23 | "Record the work actually performed, decisions, verification results, known failures, and remaining work." | `AGENTS.md:80` | repo-wide | session end | SHOULD | universal | honour | 4 | |

**Vague:** SESSION-01 vs SESSION-04 — "declare in SESSION_STATE" vs "SESSION_STATE is not a
live signal" leaves a reader unsure whether to write a declaration at all. SESSION-11 ("new
patterns or conventions") has no test.

---

### PERM — permission and safety guardrails

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| PERM-01 | "**Supabase is CLOUD-ONLY.** Do NOT run local CLI commands (`supabase start`, `db:migrate`, etc.)." | `AGENTS.md:33`; dup `CLAUDE.md:225`; dup `docs/api/supabase-integration.md:224`; dup `docs/setup/development-environment.md:107`; dup `README.md:120`; dup `.agent/rules/supabase-guide.md:5` | repo-wide | always | **MUST** | stack-dependent | honour | 5 | Stated **six** times. Yet `package.json:10-12,21-22,25` still ships `supabase:start`, `supabase:stop`, `supabase:reset`, `db:migrate --local`, `db:types --local`. See ORPH-04. |
| PERM-02 | "**IMPORTANT**: Always use the Supabase MCP tools for database operations." | `CLAUDE.md:215` | repo-wide | on DB op | **MUST** | stack-dependent | honour | 5 | |
| PERM-03 | "Apply a migration only from the branch that introduces it, only after that branch merges." | `AGENTS.md:99`; expanded `docs/agents/branching.md:44-49` | migrations | on apply | **MUST** | universal | honour | 4 | Production impact. |
| PERM-04 | "Never apply one 'to close a gap in the sequence' — a gap is usually deliberate, and the record explaining it may not be on your branch." | `docs/agents/branching.md:47-49` | migrations | on apply | **MUST** | universal | honour | 4 | |
| PERM-05 | "Before applying anything that touches RBAC, auth or RLS, check open issues for that area." | `docs/agents/branching.md:51`; dup `CLAUDE.md:70`; dup `docs/agents/migrations-on-merge.md:60-61` | migrations | on apply | **MUST** | universal | honour | 5 | |
| PERM-06 | "**A withheld migration must be recorded twice.** On the tracking issue and in `SESSION_STATE.md`." | `docs/agents/migrations-on-merge.md:79`; dup `CLAUDE.md:71` | migrations | on withhold | **MUST** | universal | honour | 4 | |
| PERM-07 | "**No permission laundering.** Neither side performs an action for the other that was denied or would be blocked in its own session." | `docs/agents/session-roles.md:94-96` | cross-session | always | **MUST** | universal | honour | 4 | Best-in-class clause; belongs in any portable core. |
| PERM-08 | "**A peer's user cannot authorise the other side.** … Same human, different consent surfaces." | `docs/agents/session-roles.md:97-99`; dup `docs/agents/session-roles.md:146-147` | cross-session | always | **MUST** | universal | honour | 4 | |
| PERM-09 | "Pushing the resulting `master` commit requires explicit authorization" | `docs/setup/project-management.md:76` | issue workflow | on push | **MUST** | repo-specific | script | 4 | Duplicate of GIT-20; kept for the permission lens. |
| PERM-10 | Permission allowlist including `Bash(rm:*)`, `Bash(git push:*)`, `Bash(sudo apt-get:*)`, `Bash(mv:*)`, `Bash(chmod:*)`, `Bash(git rm:*)`; `"deny": []` | `.claude/settings.local.json:3-167` | Claude Code, this project | always | **MUST** (as a config fact) | repo-specific | config | 5 | **The deny list is empty.** No destructive command is blocked. |
| PERM-11 | `"allow": ["Bash(git push *)"]` | `~/.claude/settings.json:3-5` | Claude Code, all projects | always | — (config fact) | universal | config | 5 | Every push is pre-approved globally — GIT-06/GIT-07's "ask first" has no gate behind it. |
| PERM-12 | `"skipDangerousModePermissionPrompt": true` | `~/.claude/settings.json:75` | Claude Code, all projects | always | — (config fact) | universal | config | 5 | Removes the confirmation prompt for dangerous mode. |
| PERM-13 | `permission: edit: deny / task: deny / todowrite: deny` | `.opencode/agent/meggar-review.md:5-8` | `meggar-review` | always | **MUST** | repo-specific | config | 5 | The repo's only hard capability restriction. |
| PERM-14 | "If authentication or project scope is unavailable, stop and report the exact missing access." | `.opencode/agent/meggar-review.md:48` | `meggar-review` | on auth failure | SHOULD | universal | honour | 4 | |
| PERM-15 | "Review legacy tracker records in `docs/importdata/legacy-record-ledger.md` before any database write." | `ACTIONPLAN.md:57` | legacy import | before DB write | **MUST** | repo-specific | honour | 3 | Production data. |
| PERM-16 | "Do not run it until that decision is recorded." (estate-wide backfill, #73) | `ACTIONPLAN.md:73` | backfill #73 | always | **MUST** | repo-specific | honour | 3 | A named, time-bound hold — will rot silently once #73 closes. |
| PERM-17 | "The monitor never changes Project status, reopens or closes issues, or marks work Done." | `docs/setup/issue-monitor.md:12` | issue monitor | always | **MUST** | repo-specific | script | 4 | |
| PERM-18 | "Add `workflow:paused` when work is intentionally paused. … The project owner must remove the label when work resumes." | `docs/setup/issue-monitor.md:14` | issue monitor | on pause | SHOULD | repo-specific | script | 3 | |
| PERM-19 | "The hourly schedule runs WITHOUT `--dry-run`, so re-enabling it starts live writes … Re-enable by uncommenting, once `done-no-integration` no longer fires on a cleanly merged issue. Verify with a dispatch at `dry_run=true` first." | `.github/workflows/monitor-issue-workflow.yml:5-19` | monitor workflow | before re-enabling | **MUST** | repo-specific | honour (the comment) + config (schedule commented out) | 4 | Exemplary: the hold, the reason, the exit condition and the verification step in one comment. |
| PERM-20 | "SECURITY NOTE: This workflow only uses repository secrets (APP_URL, CRON_SECRET) and does not process any untrusted user input." | `.github/workflows/backup-cron-invoices.yml:6-7` | that workflow | on edit | SHOULD | repo-specific | honour | 3 | An invariant a future editor is expected to preserve, but nothing checks it. |

**Vague:** PERM-15 ("review" — read? cross-check? sign off?). PERM-16 has no owner and no
expiry mechanism.

---

### PLAN — planning discipline, todo tracking, decomposition

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| PLAN-01 | "Every initiative must be decomposed with Matt Pocock's `to-issues` skill before implementation." | `AGENTS.md:108`; dup `docs/setup/project-management.md:56` | repo-wide | before implementation | SHOULD | repo-specific | honour | 4 | |
| PLAN-02 | "Do not begin implementation without a published issue number." | `AGENTS.md:108` | repo-wide | before implementation | SHOULD | repo-specific | honour | 4 | |
| PLAN-03 | "whenever a plan, spec, or PRD for this project is finalized … invoke the `to-issues` skill directly … Do not just describe the plan back to the user and stop — file it." | `CLAUDE.md:30` | repo-wide | on plan finalisation | SHOULD | repo-specific | honour | 4 | Explicitly overrides the skill's own `disable-model-invocation` gate. |
| PLAN-04 | "Present the numbered slices, dependencies, and user stories for approval." | `docs/setup/project-management.md:59`; dup `AGENTS.md:108` | repo-wide | on decomposition | SHOULD | universal | honour | 3 | |
| PLAN-05 | "1. Analyze first 2. Present options 3. Get confirmation before implementation" | `docs/setup/project-management.md:43-45` | repo-wide | on problem report | SHOULD | universal | honour | 3 | Duplicate lens of EDIT-02. |
| PLAN-06 | "Move an issue's Status at exactly these two points, without being asked: 1. … → `In progress`. 2. … → `Done`. Don't set `In review` automatically" | `CLAUDE.md:21-26`; dup `docs/agents/project-board.md:36-41` | board issues | on start / on close | SHOULD | repo-specific | honour | 4 | **Contradicted by PLAN-07.** See CONF-05. |
| PLAN-07 | "When implementation is complete and the ticket has been updated with verification results, move its project-board status to **Review** before finishing the session." | `AGENTS.md:79` | board issues | at session end | SHOULD | repo-specific | honour | 4 | |
| PLAN-08 | "`npm run issue:workflow -- start\|review\|resume\|finish <issue>`" | `AGENTS.md:113-118`; dup `docs/setup/project-management.md:67-72` | issue workflow | per phase | SHOULD | repo-specific | script | 4 | |
| PLAN-09 | "Start work only through the issue workflow helper, which creates the issue-specific worktree and moves the issue to `In progress`." | `docs/setup/project-management.md:62` | repo-wide | on start | SHOULD | repo-specific | script | 3 | Contradicts Claude Code's own `feat/`/`fix/` lane (GIT-03). |
| PLAN-10 | "Upon confirming the task is a 'Complex Deliverable': Generate a Task Slug … Create Temporary Context File" | `.agent/rules/workflow-complex-feature-isolation.md:5-31` | Antigravity-class | on complex task | SHOULD | universal | honour | 1 | Orphan chain with FILE-05/06/07, SESSION-12/13. |
| PLAN-11 | "Failed checks, dirty worktrees, missing project configuration, and merge conflicts must leave the issue unfinished and preserve its worktree." | `AGENTS.md:119`; dup `docs/setup/project-management.md:74` | issue workflow | on failure | **MUST** | repo-specific | script | 5 | Machine-enforced fail-closed behaviour. |
| PLAN-12 | "Parent initiative issues are never closed by child completion." | `AGENTS.md:120`; dup `docs/setup/project-management.md:60` | issue workflow | on close | SHOULD | repo-specific | script | 4 | |
| PLAN-13 | "**Do not invest in self-service/portal work** … When a task touches portal code, ask yourself: is this *admin* value? If it is resident-facing only, de-prioritize or flag to the user before building." | `AGENTS.md:7-16`; dup `CLAUDE.md:115`; dup `SESSION_STATE.md:8` | repo-wide | on every task | SHOULD | repo-specific | honour | 5 | Marked **REVIEW** for the unified file: it is a prioritisation directive (behavioural) wrapped around product scope (out of scope). Stated three times, always near the top. |
| PLAN-14 | "The helper resolves Project, field, item, and option IDs by name at runtime and fails closed if any required project data is missing." | `docs/setup/project-management.md:76` | issue workflow | always | **MUST** | repo-specific | script | 4 | |
| PLAN-15 | "Reference real issue numbers in each `Blocked by` section; do not close or modify a parent initiative issue." | `docs/setup/project-management.md:60` | on issue creation | on publish | SHOULD | repo-specific | honour | 3 | |
| PLAN-16 | "Run `npm run issue:doctor` when setting up a new machine or after Project configuration changes." | `docs/setup/project-management.md:63`; dup `AGENTS.md:113` | new machine | on setup | SHOULD | repo-specific | script | 3 | |

---

### DELEG — delegation, sub-agents, parallelism

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| DELEG-01 | Model tiers: "`haiku` – mechanical bulk work … `sonnet` – default for well-specified implementation … `opus` – genuinely tricky work" | `CLAUDE.md:81-84` | all delegated work | on dispatch | SHOULD | universal (tier names are Claude-specific) | honour | 4 | |
| DELEG-02 | "`fable` – NEVER use. Not a valid tier; do not spawn Fable sub-agents under any circumstances, prompted or not." | `CLAUDE.md:85`; dup `CLAUDE.md:92`; dup `CLAUDE.md:60`; dup `docs/agents/session-roles.md:26-27` | all delegated work | on dispatch | SHOULD | repo-specific | honour | 5 | Worded as absolute; cost/quality consequence only, so SHOULD. Stated four times. |
| DELEG-03 | "Set the `model` parameter explicitly on every call; never omit it (omission silently inherits the session model)" | `CLAUDE.md:79`; dup `CLAUDE.md:92`; dup `docs/agents/session-roles.md:25-26` | all delegated work | on dispatch | SHOULD | universal | honour | 5 | |
| DELEG-04 | "When unsure between tiers, pick the cheaper and escalate on failure." | `CLAUDE.md:87` | delegation | on uncertainty | SHOULD | universal | honour | 4 | |
| DELEG-05 | "**Default model `haiku`, maximum 5 sub-agents.**" | `docs/agents/session-roles.md:23`; dup `CLAUDE.md:60` | Rex sessions | on dispatch | SHOULD | repo-specific | honour | 4 | Explicitly overrides DELEG-01 while roles are active. |
| DELEG-06 | "Either limit may be exceeded when complexity genuinely warrants it — but Rex must say so, and why, in the report. Silently scaling up is a violation." | `docs/agents/session-roles.md:23-24` | Rex sessions | on exceeding | SHOULD | universal | honour | 4 | Model pattern: an escape hatch with a mandatory disclosure. |
| DELEG-07 | "**Split by independence, not by file.** Fan out … only when subtasks don't depend on each other's output; sequence dependent steps instead of racing them." | `CLAUDE.md:98`; dup `docs/agents/session-roles.md:28-29` | delegation | on fan-out | SHOULD | universal | honour | 4 | |
| DELEG-08 | "**Brief each fresh agent like a stranger.** … the dispatch prompt must carry the specific files, line numbers, and acceptance criteria itself, never 'based on the plan above.'" | `CLAUDE.md:99`; dup `docs/agents/session-roles.md:30-33` | delegation | on dispatch | SHOULD | universal | honour | 4 | |
| DELEG-09 | "use a fresh agent when independence from your own framing is the point (a second opinion, an adversarial review)" | `CLAUDE.md:99`; dup `docs/agents/session-roles.md:32-33` | delegation | on dispatch | SHOULD | universal | honour | 4 | |
| DELEG-10 | "**Verify before relaying.** Don't pass a sub-agent's summary straight through to me — check its claims against the actual diff or files" | `CLAUDE.md:100`; dup `docs/agents/session-roles.md:34-36` | delegation | before reporting | SHOULD | universal | honour | 4 | Same rule as TEST-14, different lens. |
| DELEG-11 | "reach for the Workflow tool when a task has 3+ independent parallelizable subtasks or would benefit from a pipeline/judge panel" | `CLAUDE.md:90` | repo-wide | on task shaping | MAY | repo-specific | honour | 2 | **Orphan** — no `Workflow` tool is exposed to this session. See ORPH-05. |
| DELEG-12 | "if ultracode is NOT on for the session … check with me first – propose the workflow in one or two sentences with the rough shape and cost, and wait for my reply; my 'yes' is the opt-in." | `CLAUDE.md:90` | repo-wide | before workflow | SHOULD | repo-specific | honour | 3 | "ultracode" is defined nowhere in the repo. |
| DELEG-13 | "Rex consolidates, analyses and interprets — it does not implement. The exception is trivia … **When Rex handles something itself rather than delegating, it says so.**" | `docs/agents/session-roles.md:39-46` | Rex sessions | always | SHOULD | universal | honour | 4 | |
| DELEG-14 | "Quinn advises and has no veto — but when Rex declines a point, it says so plainly and gives the reason. Silently dropping feedback defeats the arrangement." | `docs/agents/session-roles.md:64-66` | Rex sessions | on declining | SHOULD | universal | honour | 4 | |
| DELEG-15 | "Do not queue work under a term the other side cannot run. … Before requiring one, confirm the counterpart's checkout provides it" | `docs/agents/session-roles.md:130-135` | cross-session | on queuing | SHOULD | universal | honour | 3 | |
| DELEG-16 | "Delegate to `security-auditor` and `security-scanning` agents" (and `architect-review`, `code-reviewer`, `docs-architect`, `reference-builder`) | `.claude/agents/qa-director.md:20,38,55` | qa-director | on validation | SHOULD | repo-specific | honour | 1 | **Orphan** — none of these six agents exist in `.claude/agents/`. See ORPH-06. |

---

### COMM — communication and output style

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| COMM-01 | "**Every cross-session message opens with a signature line** … `[Rex -> Quinn] <subject>`" | `docs/agents/session-roles.md:83-90` | cross-session | every message | SHOULD | universal | honour | 4 | |
| COMM-02 | "**Address by the name in your own `ListAgents`.** Never by the name the other side calls itself." | `docs/agents/session-roles.md:80-82`; dup memory `feedback_cross_session_message_verification.md:10` | cross-session | on send | SHOULD | universal | honour | 4 | |
| COMM-03 | "**`success: true` means accepted-for-delivery, not receipt.** Ask for an explicit ack on anything consequential." | `docs/agents/session-roles.md:122-123`; dup memory `…verification.md:11`; dup memory `feedback_always_report_findings_to_peer.md:20-21` | cross-session | after send | SHOULD | universal | honour | 4 | Stated three times across two layers. |
| COMM-04 | "**Push disclosure up front**, naming the target branch. If both sides would commit to the same branch, sequence rather than race." | `docs/agents/session-roles.md:100-101` | cross-session | before work | SHOULD | universal | honour | 4 | |
| COMM-05 | "**Push disclosure is not symmetric — check your own machine before promising anything.** … Check `~/.claude/settings.json` and `.claude/settings*.json` for a `Stop` hook before offering 'I have not pushed' as a guarantee, and state which case you are in." | `docs/agents/session-roles.md:102-112`; dup `docs/agents/branching.md:81-84` | cross-session | before promising | SHOULD | universal | honour | 4 | The named hook does not exist here — see ORPH-03 — but the *procedure* (check before promising) survives. |
| COMM-06 | "Findings from a review go to the peer session (Rex) via SendMessage, always. … This includes **negative results**" | memory `feedback_always_report_findings_to_peer.md:8-10` | Quinn sessions | on finding | SHOULD | universal | honour | 4 | Not in any repo file. |
| COMM-07 | "Post the review report as an issue comment. Do not close the issue." / "Do not comment for Hold verdicts." | `.opencode/agent/meggar-review.md:117,155` | `meggar-review` | on verdict | SHOULD | repo-specific | honour | 4 | |
| COMM-08 | "Never fabricate criteria, tests, or checks. State unavailable evidence plainly." | `.opencode/agent/meggar-review.md:164` | `meggar-review` | always | **MUST** | universal | honour | 4 | Fabricated verification is externally visible and load-bearing on a merge decision. |
| COMM-09 | "Reasoning: <2-3 sentences max, tied directly to evidence>" | `.opencode/agent/meggar-review.md:147` | `meggar-review` | on report | SHOULD | repo-specific | honour | 3 | The only explicit verbosity budget anywhere in the repo. |
| COMM-10 | "Focus on working code over explanations. Include usage examples in comments." | `.claude/agents/frontend-developer.md:32` | frontend-developer | always | SHOULD | universal | honour | 2 | |
| COMM-11 | "If a Status update or relabel fails, report the exact failure." | `.opencode/agent/meggar-review.md:129` | `meggar-review` | on failure | SHOULD | universal | honour | 4 | |
| COMM-12 | "When you cross lanes, say so in `SESSION_STATE.md` rather than leaving the prefix to mislead the next session." | `docs/agents/branching.md:30-31` | repo-wide | on lane crossing | SHOULD | universal | honour | 3 | |
| COMM-13 | Structured `SYNC-UP COMPLETE` box with options (a)–(e) | `docs/setup/project-management.md:163-186` | `sync_up` | on `sync_up` | MAY | repo-specific | honour | 2 | |
| COMM-14 | "Inform the user: 'I have initialized the workspace for [Feature Name] in `docs/todo/<task-slug>.md`. Proceeding with Phase 1.'" | `.agent/rules/workflow-complex-feature-isolation.md:31` | Antigravity-class | on init | MAY | repo-specific | honour | 1 | Orphan. |
| COMM-15 | "Tell Jimi you have done this, and that commits in this session are yours alone — nothing is pushed unless he asks." | `.claude/skills/session-roles/SKILL.md:83-84` | session-roles | on activation | SHOULD | repo-specific | honour | 2 | The promise it instructs you to make is currently unverifiable — see ORPH-03. |

---

### ESC — escalation: when to stop and ask

| ID | Directive | Source | Scope | Trigger | Strength | Portability | Enforcement | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|
| ESC-01 | "If it is missing from this checkout, stop and say so — it is on the branch that introduced it and is not on every branch." | `.claude/skills/session-roles/SKILL.md:17-18` | session-roles | on missing doc | SHOULD | universal | honour | 4 | |
| ESC-02 | "if project access is unavailable, report the blocker explicitly." | `AGENTS.md:79` | board work | on access failure | SHOULD | universal | honour | 4 | |
| ESC-03 | "If you are not in a position to apply them … say so explicitly in the merge report and record it on the tracking issue — an unapplied migration that someone knows about is a task; one nobody knows about is the six-orphan state above." | `docs/agents/migrations-on-merge.md:25-29`; dup `CLAUDE.md:69` | migrations | on inability | **MUST** | universal | honour | 5 | |
| ESC-04 | "When a task touches portal code, ask yourself: is this *admin* value? If it is resident-facing only, de-prioritize or flag to the user before building." | `AGENTS.md:13` | portal code | on task | SHOULD | repo-specific | honour | 4 | |
| ESC-05 | "check with me first – propose the workflow in one or two sentences with the rough shape and cost, and wait for my reply" | `CLAUDE.md:90` | repo-wide | before workflow | SHOULD | repo-specific | honour | 3 | |
| ESC-06 | "Once a phase and/or section is completed, request to commit and push to remote should be presented to the User." | `.agent/rules/documentation-update.md:5` | Antigravity-class | on phase completion | SHOULD | universal | honour | 1 | Same file's next sentence auto-commits (GIT-18) — internally contradictory. |
| ESC-07 | "If the board is unreachable, stop and report the exact access or network failure." | `.opencode/agent/meggar-review.md:166` | `meggar-review` | on failure | SHOULD | universal | honour | 4 | |
| ESC-08 | "**Hold → needs input**: criteria are ambiguous or verification needs unavailable information, such as manual QA or design approval." | `.opencode/agent/meggar-review.md:105` | `meggar-review` | on ambiguity | SHOULD | universal | honour | 4 | |
| ESC-09 | "Treat the role as unsettled until it confirms. Delivery success is not agreement, and the counterpart may decline or need its own user's authorisation — both legitimate." | `.claude/skills/session-roles/SKILL.md:54-56` | session-roles | on handshake | SHOULD | universal | honour | 4 | |
| ESC-10 | "A queued task that skips one of these is the sender's error — bounce it rather than improvising around it." | `docs/agents/session-roles.md:128-129` | cross-session | on bad queue | SHOULD | universal | honour | 4 | Rare and good: refuse rather than paper over. |
| ESC-11 | "It may decline work or seek its own user's authorisation; that is legitimate and not something Rex routes around." | `docs/agents/session-roles.md:68-70` | Rex sessions | on peer refusal | SHOULD | universal | honour | 4 | |
| ESC-12 | "Refer a session seeking coordination there rather than turning it away." | `docs/agents/session-roles.md:152-153` | any session | on outsider contact | SHOULD | repo-specific | honour | 3 | |
| ESC-13 | "If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`)." | `docs/agents/domain.md:45` | on naming | on gap | SHOULD | universal | honour | 3 | |

### Categories with no rules found

- **Network access / dependency installs**: no repo file states any policy on installing
  packages, adding dependencies, or making outbound network calls. The only trace is
  permission grants (`Bash(npm install:*)`, `Bash(sudo apt-get:*)`, `Bash(curl:*)`,
  `WebFetch(domain:…)` at `.claude/settings.local.json:4,30,27,49,117,129,130`), which permit
  rather than govern.
- **Secrets handling in agent work**: only two clauses exist and both are about application
  code (EDIT-15, `docs/security/access-control.md:333`; FILE-10, `.gitignore:47-48`). Nothing
  instructs an agent on what to do when it *encounters* a secret. See GAP-02.
- **Verbosity / tone / response format for the main assistant**: only COMM-09 exists, and it
  scopes to one OpenCode sub-agent's issue comments. Nothing governs the main session's
  output style.
- **Context compaction / long-session behaviour**: nothing anywhere.

---

## Step 3 — Conflict and coherence analysis

Ranked by how often each would bite in day-to-day work.

### a. Direct contradictions

| # | Conflict | Competing directives | What actually happens today | Risk if unresolved | Recommended resolution |
|---|---|---|---|---|---|
| **CONF-01** | Claude Code attribution in commits | GIT-13 `docs/setup/project-management.md:15` "Do not include Claude Code references in commits" **vs** GIT-14 `docs/setup/project-management.md:137-147` template containing "🤖 Generated with [Claude Code]" and `Co-Authored-By: Claude Opus 4.5` | Neither wins by rule. In practice the harness-level attribution instruction (system prompt) supplies a `Co-Authored-By` trailer, so GIT-13 loses silently to a layer the file cannot see. Git log on `master` shows the trailer in use. | Low technical risk, high credibility cost: a rule that is visibly and permanently violated teaches readers the file is decorative. | Delete GIT-13, or restate it as "no `🤖 Generated with` line; keep `Co-Authored-By`". Update GIT-14's stale model name. One sentence, one place. |
| **CONF-02** | Commit/push timing | GIT-24 (memory) "ask the user to confirm before starting the next issue … do not auto-commit without being asked" **vs** GIT-15 `…project-management.md:203-206` "Auto-push … after 30 min timeout", GIT-16 `:49` "Push within 10 minutes", GIT-18 `.agent/rules/documentation-update.md:5` "Commit should be automatically done when a Bug is confirmed fixed", GIT-19 `.agent/rules/workflow-complex-feature-isolation.md:45-49` | GIT-24 wins in Claude Code because memory is auto-recalled and the others sit in files Claude Code does not auto-load. Under Codex/OpenCode (which read `AGENTS.md` but not memory) nothing forbids auto-push, and `AGENTS.md` is silent on commit timing. | An agent auto-pushing unreviewed work to a shared repo, on a branch that may be someone else's. Externally visible and hard to retract. | Promote GIT-24 into `AGENTS.md` verbatim as the single commit-timing rule. Delete GIT-15, GIT-16, GIT-18, GIT-19. |
| **CONF-03** | Is `SESSION_STATE.md` a live signal? | SESSION-03 `CLAUDE.md:47-49` "declare your tool, branch and intent in `SESSION_STATE.md` and check it before taking a branch" **vs** SESSION-04 `docs/agents/branching.md:59-63` "**The remote branch list is the live registry — not `SESSION_STATE.md`** … Do not use it for live signalling" | `CLAUDE.md` is auto-loaded and `branching.md` is not, so the *wrong* rule has the higher weight. A Claude Code session will most likely write a declaration into a file that cannot be read by anyone until a PR merges. | Coordination failures between concurrent sessions — the exact failure mode both docs exist to prevent. This is the highest-frequency conflict here. | Rewrite `CLAUDE.md:47-49` to point at `git ls-remote --heads origin` and "push your branch early", and keep `SESSION_STATE.md` for end-of-session handoff only. `branching.md` is correct; `CLAUDE.md` is stale. |
| **CONF-04** | Module-integration test status | `AGENTS.md:45` "**It currently fails out of the box** (17 files short on permission checks, 4 on audit …). Do not trust it as 'all good'" **vs** `CLAUDE.md:438` "✅ **Current status (2026-08-06): `npm test` green** — the integration module passes." | Both are auto-loaded (for their respective harnesses) and flatly disagree. Neither was re-verified in this audit. `CLAUDE.md:5` says `AGENTS.md` wins — so a Claude Code session following its own precedence rule would believe the test fails, while reading a ✅ two hundred lines later. | An agent skips `npm test` because `CLAUDE.md` says green, or wastes a cycle chasing 17 phantom failures. Either way the file is untrustworthy on the one gate that guards the auth surface. | Delete the status paragraph from both files. Replace with one line: "run `npm test`; the file's allowlists are the source of truth." A snapshot of a test result does not belong in an instruction file. |
| **CONF-05** | Who sets `In review` | PLAN-06 `CLAUDE.md:26` "Don't set `In review` automatically" (dup `docs/agents/project-board.md:41`) **vs** PLAN-07 `AGENTS.md:79` "move its project-board status to **Review** before finishing the session" | Both auto-loaded. `CLAUDE.md:5` hands precedence to `AGENTS.md`, so the correct reading is "do set it" — but `CLAUDE.md`'s own section is emphatic and closer to hand, and `project-board.md:36` explicitly cites `CLAUDE.md` as the authority. Circular. | Board state drifts; the `meggar-review` agent (which only acts on `In review` + `ready-for-agent`) either never sees work or sees it prematurely. | Pick one. Given `meggar-review` exists and gates on `In review`, `AGENTS.md:79` is the useful behaviour. Delete `CLAUDE.md:26` and fix `project-board.md:41`. |
| **CONF-06** | Local Supabase CLI | PERM-01 (six restatements: "Do NOT run local CLI commands") **vs** `package.json:10-12,21,22,25` shipping `supabase:start`, `supabase:stop`, `supabase:reset`, `db:migrate` (`--local`), `db:types` (`--local`), `supabase:status` | The scripts exist and run. `npm run db:types` — recommended in `AGENTS.md:26`, `CLAUDE.md:181`, `README.md:57` — passes `--local`, so following the *recommended* command executes exactly the *forbidden* class of operation, against a local stack that isn't running. | Type regeneration silently fails or emits an empty/local schema over `src/types/database.generated.ts`. Data-shape corruption at the type layer. | Fix `db:types` to target the cloud project; delete `supabase:start/stop/reset/status` and `db:migrate` from `package.json`. A forbidden action should not be one keystroke from a documented one. |
| **CONF-07** | Which branch lane a Claude Code session takes | GIT-03 / `CLAUDE.md:49` "Claude Code's lane is `feat/<slug>` and `fix/<slug>`" **vs** PLAN-09 `docs/setup/project-management.md:62` "Start work only through the issue workflow helper" (which always creates `codex/issue-<n>-<slug>` per `.github/issue-workflow.json:9`) | Claude Code sessions use `feat/`/`fix/` (recent history: `fix/hold-monitor-schedule`, `fix/rbac-migration-ledger-reconciliation`), so PLAN-09 loses. The board transitions the helper would have performed are then done by hand per PLAN-06. | Duplicated, divergent lifecycle handling; issues worked outside the helper skip its fail-closed check gate (TEST-13, PLAN-11). | State the split explicitly in `AGENTS.md`: the helper is Codex's path; Claude Code uses `feat/`/`fix/` and owes the same checks manually. |
| **CONF-08** | Staging scope on commit | GIT-25 (memory) "stage only that issue's files … never sweep those in" **vs** GIT-26 `docs/setup/project-management.md:135` `git add .` | Memory wins in Claude Code; nothing constrains other harnesses. | Committing another concurrent session's uncommitted work — a documented incident class in this repo (`SESSION_STATE.md` records a working tree being hard-reset mid-session). | Delete `git add .` from the sync-up block; replace with `git add <explicit paths>`. |
| **CONF-09** | Auto-commit on bugfix vs. escalation | GIT-18 `.agent/rules/documentation-update.md:5` "Commit should be automatically done when a Bug is confirmed fixed" **vs** ESC-06, same file, same sentence-block: "request to commit and push to remote should be presented to the User" | Neither fires — no active harness reads `.agent/rules/`. | Zero today; becomes live the moment someone opens this repo in Antigravity or Windsurf. | Delete `.agent/rules/` or convert it to a pointer file. See CANON table. |

### b. Scope collisions (legitimate overlap, no stated winner)

| # | Overlap | Sources | Who wins today |
|---|---|---|---|
| **SCOPE-01** | `CLAUDE.md` vs `AGENTS.md` generally | `CLAUDE.md:5` says `AGENTS.md` wins and "don't duplicate" | Stated, but violated: branching, product focus, module integration and delegation appear in both. The clause is the right mechanism with no enforcement. |
| **SCOPE-02** | Sub-agent tiers: general vs Rex | `CLAUDE.md:81-87` vs `docs/agents/session-roles.md:23` / `CLAUDE.md:60` | Explicitly resolved in text ("overriding the general tier guidance"). **Model resolution — no action.** |
| **SCOPE-03** | Branching rules: three copies | `CLAUDE.md:44-51`, `AGENTS.md:82-104`, `docs/agents/branching.md` (full) | `branching.md` declares itself canonical (`AGENTS.md:104`, `CLAUDE.md:51`) but the two summaries have already drifted (CONF-03). |
| **SCOPE-04** | Issue lifecycle: `AGENTS.md:106-120` vs `docs/setup/project-management.md:54-76` vs `.opencode/agent/meggar-review.md` | Three descriptions of one lifecycle, one of them harness-specific | No stated winner. `meggar-review` moves items to Done independently of the helper's `finish`, so two mechanisms can both claim the Done transition. |
| **SCOPE-05** | Session-end duties: `AGENTS.md:74-80` vs `docs/setup/project-management.md:94-113` vs `SESSION_STATE.md:4` | Three checklists, overlapping but not identical (only `project-management.md` mentions the Notion page) | No stated winner. |
| **SCOPE-06** | Permission layers | `.claude/settings.local.json` (project) vs `~/.claude/settings.json` (user) | Harness merges them; the union is permissive (`git push` allowed at both levels, `deny` empty). No file documents that this union exists. |

### c. Silent duplication (same rule, different words — will drift)

| # | Rule | Restated at | Drift status |
|---|---|---|---|
| **DUP-01** | Never work on `master` (GIT-01) | `CLAUDE.md:46`, `AGENTS.md:84-86`, `docs/agents/branching.md:8-15`, `docs/agents/session-roles.md:150-151` | 4 copies, still consistent |
| **DUP-02** | Supabase cloud-only (PERM-01) | `AGENTS.md:33`, `CLAUDE.md:225`, `docs/api/supabase-integration.md:224`, `docs/setup/development-environment.md:107`, `README.md:120`, `.agent/rules/supabase-guide.md:5` | 6 copies; **already drifted from `package.json`** (CONF-06) |
| **DUP-03** | authorizePermission + logAudit (EDIT-11) | `AGENTS.md:40-43`, `CLAUDE.md:303-312`, `CLAUDE.md:368-400`, `CLAUDE.md:445-470`, `README.md:121` | 5 copies; the `CLAUDE.md` trio is three renderings of one contract |
| **DUP-04** | Path alias `@/*` (FILE-01) | `AGENTS.md:34`, `CLAUDE.md:205`, `README.md:119`, `docs/setup/development-environment.md:182-192` | 4 copies, consistent |
| **DUP-05** | `fable` ban (DELEG-02) | `CLAUDE.md:60`, `CLAUDE.md:85`, `CLAUDE.md:92`, `docs/agents/session-roles.md:26-27` | 4 copies, consistent |
| **DUP-06** | Verify sub-agent claims (DELEG-10 / TEST-14) | `CLAUDE.md:100`, `docs/agents/session-roles.md:34-36` | 2 copies |
| **DUP-07** | Migration ledger vs directory (TEST-09) | `CLAUDE.md:64`, `docs/agents/branching.md:53-55`, `docs/agents/migrations-on-merge.md:31-42` | 3 copies, consistent |
| **DUP-08** | Stop-hook push disclosure (COMM-05) | `docs/agents/session-roles.md:102-112`, `docs/agents/branching.md:81-84` | 2 copies, both naming a hook that does not exist |
| **DUP-09** | Product focus guardrail (PLAN-13) | `AGENTS.md:5-16`, `CLAUDE.md:113-119`, `SESSION_STATE.md:8` | 3 copies, consistent |
| **DUP-10** | Self-verification / lint after change (TEST-07, TEST-08) | `.agent/rules/self-verification.md:7-10`, `.agent/rules/self-assurance.md:7` | 2 copies of the same protocol in adjacent files; `self-assurance.md` even says it "created a dedicated verification_protocol.md" that does not exist |
| **DUP-11** | Board Status → In progress / Done (PLAN-06) | `CLAUDE.md:21-26`, `docs/agents/project-board.md:36-41` | 2 copies, mutually citing each other |
| **DUP-12** | `success: true` ≠ receipt (COMM-03) | `docs/agents/session-roles.md:122-123`, memory ×2 | 3 copies across two layers |

### d. Orphan rules (reference something that no longer exists)

| # | Rule | References | Reality |
|---|---|---|---|
| **ORPH-01** | SESSION-07 (`sync_dev_inbox`), SESSION-22, and the whole prompt pipeline at `docs/setup/project-management.md:220-295` | `prompts/`, `processed/`, `deferred/`, `archived/`, NSMA CLI at `/home/feyijimiohioma/projects/Nsma/cli/index.js`, dashboard at `localhost:3100` | None of the four directories exist. The CLI path is a Linux path on a Windows host. `session-start.sh:15-18` exits immediately with "No prompts directory found" — observed in this session's own hook output. `task-complete.sh` can therefore never fire. **~80 lines of `project-management.md` and both hooks are dead.** |
| **ORPH-02** | FILE-05, FILE-06, SESSION-12, SESSION-13, PLAN-10, COMM-14 | `docs/todo/<task-slug>.md` | `docs/todo/` does not exist. |
| **ORPH-03** | SESSION-15, COMM-05, COMM-15; `docs/agents/branching.md:81-84` | A `Stop`/`SessionEnd` hook running `git-sync.ps1 -Mode Checkpoint`, and `$HOME/.claude/role-mode-active` | `~/.claude/settings.json` defines only a `PreToolUse` hook (`quieten.js`). No `git-sync.ps1` exists anywhere under `~/.claude`. No flag file exists. The suppression instruction suppresses nothing, and the "check before promising" advice points at an absent artefact. |
| **ORPH-04** | PERM-01's six restatements vs `package.json` | `supabase:start/stop/reset/status`, `db:migrate --local`, `db:types --local` | Scripts present and runnable; `db:types` is actively recommended in three files while carrying `--local`. |
| **ORPH-05** | DELEG-11, DELEG-12 | "the Workflow tool", "ultracode" | No `Workflow` tool is exposed to this session, and "ultracode" is defined in no file in the repo. |
| **ORPH-06** | DELEG-16 | `security-auditor`, `security-scanning`, `architect-review`, `code-reviewer`, `docs-architect`, `reference-builder` sub-agents | `.claude/agents/` contains three agents: `qa-director`, `frontend-developer`, `security-dues-processor`. All six delegation targets are missing, so `/qa-director-validate` cannot execute its documented plan. |
| **ORPH-07** | TEST-20, and every "CI is green" precondition (`meggar-review.md:85,103,162`) | `statusCheckRollup` | `docs/agents/branching.md:116-120` records that GitHub Actions was account-locked as of 2026-09-02 and "nothing is verifying what merges". A user memory (`project_actions_billing_lock_suppressed.md`) says it cleared on 2026-09-02 — **the repo doc and the memory disagree, and the doc is the one an agent reads.** |
| **ORPH-08** | TEST-08's pointer | "I have created a dedicated `verification_protocol.md` in the brain directory" (`.agent/rules/self-assurance.md:11-13`) | No such file exists in the repo or under `~/.claude`. |
| **ORPH-09** | `.claude/skills/qa-director-validate.md` | Claude Code skill discovery | A flat `.md` in `skills/` is not a skill; skills require `<name>/SKILL.md`. This file is loaded by nothing. |
| **ORPH-10** | `.nsma-config.md` (`auto_import: true`) | NSMA | Same dead tool as ORPH-01. |
| **ORPH-11** | `add-issues-to-project.yml` at repo root | — | A duplicate of `.github/workflows/add-issues-to-project.yml` sitting in the repo root, where GitHub does not read it. Harmless but misleading. |
| **ORPH-12** | PERM-16 (`ACTIONPLAN.md:73`, hold on #73) | Issue #73 | Not re-verified in this audit; a hold pinned to an issue number with no removal trigger is a latent orphan by construction. |

### e. Unenforceable MUSTs (stated as MUST, no mechanism behind them)

GIT-06, GIT-07, GIT-25, TEST-09, TEST-15, PERM-03, PERM-04, PERM-05, PERM-06, PERM-07,
PERM-08, PERM-15, PERM-16, PERM-19, EDIT-14, EDIT-15, ESC-03, COMM-08.

Two of the docs say so themselves, which is unusually honest and worth preserving:

> "They bind sessions that read this file, and branch protection binds every tool at the
> server. Neither binds a human merging from the GitHub UI who chooses to dismiss a check,
> and nothing here can." — `docs/agents/branching.md:122-127`

> "It binds sessions that read `CLAUDE.md`. It does not bind a human merging from the GitHub
> UI, and nothing here can." — `docs/agents/migrations-on-merge.md:84-88`

### f. Precedence ambiguity (outcome depends on which harness runs)

| # | Situation | Claude Code | Codex | OpenCode |
|---|---|---|---|---|
| **PREC-01** | Which root instruction file is authoritative | Loads `CLAUDE.md`; `CLAUDE.md:5` defers to `AGENTS.md`, which it must then choose to read | Loads `AGENTS.md` only; never sees `CLAUDE.md`'s Claude-specific rules | Loads `AGENTS.md`; also has `.opencode/agent/*` |
| **PREC-02** | Commit-timing rule (CONF-02) | Memory GIT-24 wins | No rule at all — `AGENTS.md` is silent on commit timing | No rule at all |
| **PREC-03** | Delegation policy (DELEG-01…16) | Fully specified in `CLAUDE.md` | **Absent** — `AGENTS.md` says nothing about sub-agent models, the `fable` ban, or briefing | Absent |
| **PREC-04** | `.agent/rules/` (5 files, `trigger: always_on`) | Ignored | Ignored | Ignored |
| **PREC-05** | Whether `SESSION_STATE.md` is a live signal (CONF-03) | Sees the wrong version first (`CLAUDE.md:47`) | Sees the corrected version (`AGENTS.md:92-93`) | Same as Codex |
| **PREC-06** | Module-integration test status (CONF-04) | Sees ✅ green | Sees ❌ fails out of the box | Sees ❌ |

**Ranking by day-to-day bite:** CONF-03 > CONF-02 > CONF-04 > CONF-06 > CONF-05 > CONF-07 >
CONF-08 > CONF-01 > CONF-09. Orphans by bite: ORPH-01 (dead hook every session start) >
ORPH-07 (CI-green preconditions unsatisfiable) > ORPH-04 (a recommended command does a
forbidden thing) > ORPH-06 > ORPH-03 > ORPH-02 > the rest.

---

### CANONICAL HOME table

For every rule appearing in more than one place: who should own it, and what each other
occurrence becomes.

| Rule | Canonical home | Other occurrences → action |
|---|---|---|
| GIT-01 … GIT-11 (all branching/push/stage) | `docs/agents/branching.md` | `AGENTS.md:82-104` → replace with a 3-line summary + pointer. `CLAUDE.md:44-51` → **delete**, replace with a pointer (it is the stale copy, CONF-03). `docs/agents/session-roles.md:149-153` → pointer (already is). |
| GIT-12 (commit splitting), GIT-24, GIT-25 (commit timing + staging scope) | `AGENTS.md` `## Git` (new section) | Memory files → keep as memory *and* promote text into `AGENTS.md` so non-Claude harnesses inherit it. `docs/setup/project-management.md:15,49,135-151,190-216` → **delete** the whole "Sync-Up"/"Phase Completion Git Push" block. |
| GIT-13/GIT-14 (attribution) | `AGENTS.md`, one sentence | `docs/setup/project-management.md:15` and `:137-147` → delete both. |
| TEST-01 … TEST-06 (verification gates) | `AGENTS.md` `## Testing` | `CLAUDE.md:36,422-432,438` → pointer. `.agent/rules/self-verification.md` + `self-assurance.md` → **delete** (unread, duplicated, orphan pointer). |
| TEST-09, TEST-15, PERM-03…PERM-06, ESC-03 (migrations) | `docs/agents/migrations-on-merge.md` | `CLAUDE.md:62-71` → pointer only. `docs/agents/branching.md:44-55` → pointer only (already mostly is). |
| TEST-16…TEST-19 (evidence discipline) | **New** `docs/agents/evidence.md` | Currently memory-only. Memory files stay; the doc becomes the citable copy for peers and other harnesses. |
| FILE-01 (path alias) | `AGENTS.md:34` | `CLAUDE.md:205`, `README.md:119`, `docs/setup/development-environment.md:182-192` → keep README (human-facing) and delete the other two, or convert to pointers. |
| FILE-03 (no separate handoff files) | `AGENTS.md:80` | — (single) |
| EDIT-11 / FILE-13 (authorizePermission + logAudit) | `AGENTS.md:38-45` | `CLAUDE.md:301-432` → collapse the three renderings into one worked example and a pointer. `README.md:121` → keep (human-facing summary). |
| PERM-01 (Supabase cloud-only) | `AGENTS.md:33` | `CLAUDE.md:225`, `docs/api/supabase-integration.md:224`, `docs/setup/development-environment.md:107` → pointers. `.agent/rules/supabase-guide.md` → delete with the folder. `README.md:120` → keep. **And fix `package.json`.** |
| PERM-07, PERM-08, COMM-01…COMM-05, DELEG-05, DELEG-06, DELEG-13, DELEG-14, ESC-09…ESC-12 (cross-session terms) | `docs/agents/session-roles.md` | `CLAUDE.md:53-60` → pointer (already close). `.claude/skills/session-roles/SKILL.md` → already correctly a pure selector; **no change** (this file is the model for how to do it). |
| DELEG-01 … DELEG-10 (sub-agent policy) | `AGENTS.md` (**move out of `CLAUDE.md`**) | `CLAUDE.md:77-100` → pointer. Rationale: Codex and OpenCode also spawn sub-agents and currently inherit no policy at all (PREC-03). |
| PLAN-01, PLAN-02, PLAN-08, PLAN-09, PLAN-11, PLAN-12, PLAN-14…PLAN-16 (issue lifecycle) | `docs/setup/project-management.md:54-76` | `AGENTS.md:106-120` → 3-line summary + pointer. |
| PLAN-06 / PLAN-07 (board Status) | `docs/agents/project-board.md` | `CLAUDE.md:17-26` → pointer. `AGENTS.md:79` → pointer. Resolve CONF-05 in the canonical file first. |
| PLAN-13 (product focus) | `AGENTS.md:5-16` | `CLAUDE.md:113-119` → pointer. `SESSION_STATE.md:8` → keep (it is a live banner, refreshed by hand). |
| SESSION-01…SESSION-06, SESSION-23 (handoff) | `AGENTS.md:74-80` | `docs/setup/project-management.md:94-113` → keep only the Notion step, pointer for the rest. `SESSION_STATE.md:4` → keep (self-describing header). |
| DUP-10 (self-verification protocol) | — | Delete both `.agent/rules/self-verification.md` and `self-assurance.md`; fold anything worth keeping into `AGENTS.md` `## Testing`. |

Deduplication is the fix. `CLAUDE.md:5` already states the precedence clause and it did not
prevent CONF-03, CONF-04 or CONF-05 — because a precedence clause only resolves a conflict
after someone notices there is one.

---

## Step 4 — Mechanisation pass

For every rule rated MUST above.

| ID | MUST | Proposed mechanism | Cost | Notes |
|---|---|---|---|---|
| GIT-01 | Never work on `master` | Already: branch protection (server). **Add** a Claude Code `PreToolUse` hook on `Bash` matching `git commit` that fails when `git rev-parse --abbrev-ref HEAD` is `master` | low | Closes the local-commit gap this very session fell through. |
| GIT-02 | No push-rejection workarounds | None available (it is a rule about intent) | — | Keep as MUST; enforcement is the server refusing. |
| GIT-06 / GIT-07 | Ask before pushing to a peer's branch | `PreToolUse` deny-by-default on `git push` + an allow entry per session; today `~/.claude/settings.json:4` pre-approves **all** pushes | low (remove the blanket allow) | The single highest-leverage config change available. |
| GIT-10 | Never push to `stage` by hand | Branch protection rule on `stage` restricting pushes to the Actions app | low | GitHub setting, not a code change. |
| GIT-11 | Rollbacks go through a PR | Covered by GIT-10 + `master` protection | — | Already enforced. |
| GIT-20 / PERM-09 | Explicit authorization before pushing the `master` merge | Already enforced by `scripts/issue-workflow.mjs` | — | Enforced. |
| GIT-21 / PLAN-11 / PLAN-14 / TEST-13 / TEST-22 | Fail-closed check gate | Already enforced by `scripts/issue-workflow.mjs` + `.github/issue-workflow.json` | — | Enforced. Only reachable via the helper, so Claude Code's `feat/`/`fix/` lane bypasses it (CONF-07). |
| GIT-22 | `meggar-review` never edits/pushes/merges | Already enforced (`permission: edit: deny`) | — | Enforced. |
| GIT-25 | Never sweep unrelated WIP into a commit | `PreToolUse` hook rejecting `git add .` / `git add -A` / `git commit -a` | low | Pairs with deleting GIT-26. |
| TEST-09 | Verify migrations by ledger name, not directory | Script: `npm run db:migrations:diff` comparing `list_migrations` output against `git ls-tree` and printing the delta; make it the documented command | medium | Turns a discipline into an artefact, which is what `feedback_narrow_check_broad_claim.md:22-24` argues for. |
| TEST-15 | Verify a withheld migration's contents before acting | Same script, printing content hashes rather than filenames | medium | The 2026-09-02 near-miss was exactly a filename/content mismatch. |
| PERM-03 / PERM-04 | Apply migrations only from the introducing branch, after merge | CI check: fail a PR that both adds a migration and shows it already applied | high | Requires DB access from CI. **Recommend keeping honour-system + the diff script.** |
| PERM-05 | Check open issues before RBAC/auth/RLS migrations | CI: label-based check on PRs touching `supabase/migrations/**` matching `rbac\|auth\|rls`, requiring a linked issue | medium | |
| PERM-06 | Record a withheld migration twice | None available | — | Keep MUST; it is a two-line write with high downside. |
| PERM-07 / PERM-08 | No permission laundering; peer's user can't authorise | None available (cross-session, cross-machine) | — | Keep MUST. |
| PERM-15 | Review the legacy ledger before any DB write | None available | — | **Recommend demotion to SHOULD** — the trigger ("any database write") is far broader than the actual risk surface (legacy import scripts), and an unscoped MUST that fires on every write will be ignored. |
| PERM-16 | Don't run the #73 backfill | Guard inside the backfill script requiring an env flag | low | Cheap and removes the doc-rot risk. |
| PERM-19 | Don't re-enable the monitor schedule until fixed | Already: the schedule is commented out with the exit condition inline | — | Enforced by construction. Model example. |
| PERM-10/11/12 | (config facts, not directives) | Add a `deny` list: `Bash(git push --force*)`, `Bash(git reset --hard*)`, `Bash(rm -rf *)`, `Bash(git clean -fd*)`, `Bash(git push*:master)` | low | `.claude/settings.local.json:166` `"deny": []` is the largest open guardrail gap. |
| EDIT-11 / FILE-13 | authorizePermission + logAudit | Already: `src/__tests__/integration/module-integration.test.ts` | — | Enforced, subject to CONF-04. |
| EDIT-14 | Never interpolate user input into raw SQL | ESLint rule / `eslint-plugin-security` or a grep check in CI over `src/**` for template literals inside `.rpc(`/raw SQL | medium | |
| EDIT-15 | Never log passwords or tokens | CI grep for `console.log` near `password`/`token` identifiers; or a lint rule | medium | Partial coverage only. |
| FILE-04 | Worktrees at `.worktrees/issue-<n>` | Already: `scripts/issue-workflow.mjs` + `.gitignore:71` | — | Enforced. |
| FILE-10 / FILE-14 | `.mcp.json` and `.env*` never committed | Already: `.gitignore`. **Add** `gitleaks`/`trufflehog` as a pre-commit hook or CI job | low (CI job) | Would have caught the live secrets in `.claude/settings.local.json` — see GAP-01. |
| ESC-03 | Say so when you cannot apply a migration | None available | — | Keep MUST. |
| COMM-08 | Never fabricate criteria/tests/checks | None available | — | Keep MUST. |
| PERM-01 / PERM-02 | Supabase cloud-only, MCP for DB ops | `PreToolUse` deny on `Bash(npx supabase start*)`, `Bash(npx supabase db reset*)`, `Bash(*--local*)` **and** removing the offending `package.json` scripts | low | Highest ratio of risk removed to effort. |
| PERM-17 | Monitor never changes Status/closes issues | Already: `scripts/issue-monitor.mjs` | — | Enforced. |

### Proposed MUST → SHOULD demotions (review these as a set)

| ID | Current | Why demote |
|---|---|---|
| PERM-15 | MUST ("before any database write") | Trigger is unscoped to the point of being unfollowable; the real scope is legacy-import scripts. Re-scope and demote. |
| TEST-05 | Sourced as "Never" | Re-stamping is reversible; consequence is a stale doc, not data loss. Style/process → SHOULD. |
| DELEG-02 (`fable` ban) | Sourced as "NEVER … under any circumstances" | Consequence is cost and output quality, not irreversibility. SHOULD, with the forcefulness kept in the wording. |
| DELEG-03 (explicit `model`) | Sourced as "never omit" | Same reasoning. SHOULD. |
| EDIT-06 (`CurrencyInput` MUST) | Sourced as MUST | A UI defect, reversible. SHOULD. |
| PERM-18 | "must remove the label" | Housekeeping. SHOULD. |
| SESSION-12 | "the agent MUST update" | Process hygiene, and the target file does not exist. SHOULD (or delete). |
| GIT-23 | "Never close an issue" | Reversible (issues reopen). SHOULD, scoped to `meggar-review`. |

MUSTs that survive the criterion, with a one-line justification each, are listed in
`audit/unified-practices.md`.

---

## Gaps: guardrails missing from the current setup entirely

| # | Gap | Category | Evidence |
|---|---|---|---|
| **GAP-01** | **Live secrets are committed to the repository.** `.claude/settings.local.json` is tracked in git and contains a Supabase personal access token (`sbp_…`, line 68), a `CRON_SECRET` value (line 81), and a Postgres password (line 123). `.gitignore` covers `.env*` and `.mcp.json` but not `.claude/settings*.json`. | secrets | `.claude/settings.local.json:68,81,123`; `git ls-files` confirms tracked; no `git check-ignore` match |
| **GAP-02** | No rule anywhere tells an agent what to do **when it encounters a secret** — redact, refuse to echo, warn, rotate. The only secret rules concern application logging (EDIT-15) and gitignore (FILE-10). | secrets | absence across all files searched |
| **GAP-03** | No repo-level temp/scratch policy. `.gitignore:59-66` lists four historical filenames rather than a rule; nothing says where working files go. The only scratch convention is harness-supplied and invisible to Codex and OpenCode. | file placement | `.gitignore:59-66` |
| **GAP-04** | **The `deny` permission list is empty** (`.claude/settings.local.json:166`) while `rm:*`, `git push:*`, `git rm:*`, `mv:*`, `chmod:*`, `sudo apt-get:*` are all allowed, and `~/.claude/settings.json:75` sets `skipDangerousModePermissionPrompt: true`. No destructive command is gated anywhere. | destructive ops | `.claude/settings.local.json:166`; `~/.claude/settings.json:4,75` |
| **GAP-05** | No rule covers `git reset --hard`, `git clean`, `git push --force`, `git branch -D`, or worktree removal — despite `SESSION_STATE.md` recording "**⚠️ Something hard-reset this working tree mid-session and destroyed uncommitted work**". The incident is documented; no rule came out of it. | destructive ops | `SESSION_STATE.md:40` |
| **GAP-06** | No context-compaction or long-session rule. Nothing says which rules must be re-read after compaction, and the load-bearing ones (TEST-09, PERM-05, GIT-01) live in non-auto-loaded files. | session lifecycle | absence |
| **GAP-07** | No dependency-install or network-access policy. Adding an npm dependency, calling an external API, or fetching a URL is ungoverned; `Bash(curl:*)` and `Bash(npm install:*)` are blanket-allowed. | permissions | `.claude/settings.local.json:4,27` |
| **GAP-08** | No commit-message convention is stated as a rule. `docs/agents/doc-drift.md:68` *assumes* conventional commits ("`feat:` minor, `fix:`/`perf:` patch") but no file requires them, and no commit-msg hook exists. | git | `docs/agents/doc-drift.md:68` |
| **GAP-09** | No PR template, no `CONTRIBUTING.md`, no review checklist — despite every merge path being "open a PR". | git | absence |
| **GAP-10** | No verbosity/tone/output-format rule for the main session. COMM-09 is the only budget and it applies to one OpenCode sub-agent. | communication | absence |
| **GAP-11** | Session handoff has no completeness check. SESSION-01/02/23 describe what to write; nothing verifies a session actually wrote it, and `SESSION_STATE.md` has grown to 93 KB with no rotation policy. | session handoff | `SESSION_STATE.md` size |
| **GAP-12** | `.stignore:12-14` has the env-file exclusions **commented out** (`#.env`, `#.env.local`, `#.env*.local`) under the heading "Environment files (don't sync secrets!)" — so Syncthing will replicate `.env.local` between the two machines. | secrets | `.stignore:11-14` |
| **GAP-13** | No rule governs when an instruction file itself may be edited, beyond SESSION-11 ("only if new patterns were established"). Nine documented conflicts accumulated with no review cadence. | editing | `docs/setup/project-management.md:106-107` |
