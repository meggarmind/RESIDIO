# Project Management

This document covers git configuration, documentation update cadence, session workflows, and development commands.

---

## Git Configuration

| Setting | Value |
|---------|-------|
| Repository | https://github.com/meggarmind/RESIDIO |
| User | `meggarmind` |
| Email | `feyijimiohioma@gmail.com` |

**Note**: Do not include Claude Code references in commits.

---

## Documentation Updates

### Update Cadence

| Document | Frequency | Trigger |
|----------|-----------|---------|
| `SESSION_STATE.md` | Every substantive session | Before finishing any work, including unprompted progress tracking |
| `TODO.md` | When backlog status changes | Complete, defer, discover, or reprioritize work |
| `ACTIONPLAN.md` | When an active plan changes | Complete, revise, or invalidate a plan step |
| `README.md` | Hourly | Or at session end |

---

## Session Workflow

### 1. Session Start

1. Execute Development Inbox Workflow (automated via SessionStart hook)
2. Run `date` command to confirm current date/time
3. Revalidate last known state (concurrent sessions possible)

### 2. Problem Analysis

**Important**: Do NOT immediately change code when user explains a problem.
1. Analyze first
2. Present options
3. Get confirmation before implementation

### 3. GitHub Sync

- **If connected**: Push within 10 minutes of writing new files
- **If not connected**: Prompt user to connect every 30 minutes

---

## Issue-driven vertical-slice workflow

All initiatives use Matt Pocock's `to-issues` process before implementation:

1. Break the initiative into independently verifiable tracer-bullet slices that cross the required integration layers end to end.
2. Present the numbered slices, dependencies, and user stories for approval.
3. Publish the approved issues in dependency order with the `to-issues` body template and `ready-for-agent` label. Reference real issue numbers in each `Blocked by` section; do not close or modify a parent initiative issue.
4. Start work only through the issue workflow helper, which creates the issue-specific worktree and moves the issue to `In progress`.

The workflow is configured in `.github/issue-workflow.json` and uses user Project 1 as the canonical tracker. Project status names are exact: `Backlog`, `In progress`, `In review`, and `Done`; `Backlog` is the board's equivalent of the initial Todo state. Run `npm run issue:doctor` when setting up a new machine or after Project configuration changes. The GitHub CLI token must include the `project` scope.

### Issue lifecycle commands

```text
npm run issue:workflow -- start <issue>
npm run issue:workflow -- review <issue> [--check "issue-specific command"]
npm run issue:workflow -- resume <issue>
npm run issue:workflow -- finish <issue> [--check "issue-specific command"]
```

Worktrees live at `.worktrees/issue-<number>` with branches named `codex/issue-<number>-<slug>`. `review` sets `In review` before running the configured lint, test, and build checks. `finish` reruns those checks, refuses dirty worktrees or integration branches, merges the issue branch into `master` with `--no-ff`, then verifies that the integration commit has reached `origin/master` before it closes the child issue, sets Project status to `Done`, and removes the worktree and merged branch. A failed check, merge conflict, or unpublished integration leaves the issue in review and preserves its worktree. `resume` returns an issue to `In progress` for fixes.

The helper resolves Project, field, item, and option IDs by name at runtime and fails closed if any required project data is missing. Pushing the resulting `master` commit requires explicit authorization; after it succeeds, rerun `finish` to complete the remote issue and Project status transition.

---

## Session Commands

When the user types any of these keyphrases, execute the associated action:

| Keyphrase | Action |
|-----------|--------|
| `pause_session` | Execute session handoff procedure |
| `end_session` | Execute session handoff procedure |
| `resume_session` | Read `SESSION_STATE.md`, then continue from its current snapshot and next steps |
| `sync_up` | Execute sync-up procedure |

---

## Session Handoff Procedure

When triggered by `pause_session` or `end_session`:

### Step 1: Update `SESSION_STATE.md`
- Verified project baseline: branch, working-tree state, and test/build/lint outcomes
- Work completed, decisions made, troubleshooting in progress, and next steps

### Step 2: Update `TODO.md` and `ACTIONPLAN.md`
- Mark completed work, add discovered follow-ups, and reprioritize the backlog as needed
- Update active plan steps where the session changed them

### Step 3: Update the instruction files
- Only if new patterns or conventions were established
- Route the change per `CORE.md` section 2: project policy goes in `CORE.md`, Claude Code
  mechanics in `CLAUDE.md`, Codex/OpenCode mechanics in `AGENTS.md`

---

## Sync-Up Procedure

When triggered by `sync_up`:

### Step 1: Update Internal Documentation
- Update `TODO.md` with current state
- Update `CORE.md` (or a harness file, per its section 2) if new patterns established
- Run `date` to confirm timestamp

### Step 2: Git Commit & Push

```bash
# Review changes
git status
git diff --stat

# Stage changes
git add .

# Commit with format
git commit -m "$(cat <<'EOF'
chore(sync): [brief description of session work]

- [Key change 1]
- [Key change 2]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# Push
git push
```

### Step 3: Evaluate Pending Work
1. Check open issues on the tracker (`gh issue list`), including any `ready-for-agent` items
2. Check the remote branch list (`git ls-remote --heads origin`) for work already in flight
3. Read current phase from `TODO.md`
4. Identify next phase from roadmap

### Step 4: Present Options

Display structured summary:

```
═══════════════════════════════════════════════════════
SYNC-UP COMPLETE
═══════════════════════════════════════════════════════
📁 Git Status: [X files changed, pushed to origin/master]
📅 Current Phase: Phase N - [Name] [STATUS]
📋 Next Phase: Phase N+1 - [Name]

PENDING WORK:
┌─────────────────────────────────────────────────────┐
│ Open issues: X (Y ready-for-agent)                  │
│ Backlog items: X                                    │
└─────────────────────────────────────────────────────┘

RECOMMENDED NEXT ACTIONS:
(a) Continue current phase work [if incomplete]
(b) Start next phase [if current complete]
(c) Pick up a ready-for-agent issue [if any]
(d) Review in-flight branches [if any]
(e) End session [if stopping work]

What would you like to do?
═══════════════════════════════════════════════════════
```

---

## Phase Completion Git Push Workflow

At the end of each phase after all TODOs completed:

### 1. Ask User for Confirmation
> "Phase X is complete. Would you like me to push to both master and origin?"
- YES → Execute git push with relevant commit message
- NO → Continue to next task

### 2. Follow-up Prompts
After subsequent task completion, ask again if previous answer was NO:
> "Task Y complete. Ready to push Phase X changes?"

### 3. Auto-push After 30 Minutes
If no positive confirmation within 30 minutes:
- Auto-push with message: `"feat: Complete Phase X - [brief description]"`
- Notify user: `"Auto-pushing Phase X changes after 30 min timeout"`

### 4. Commit Message Format

```
feat: [Phase description]

- [Key change 1]
- [Key change 2]
- [Key change 3]
```
