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

## Session Commands

When the user types any of these keyphrases, execute the associated action:

| Keyphrase | Action |
|-----------|--------|
| `pause_session` | Execute session handoff procedure |
| `end_session` | Execute session handoff procedure |
| `resume_session` | Read `SESSION_STATE.md`, then continue from its current snapshot and next steps |
| `sync_dev_inbox` | Run Notion sync, check prompts folder, process prompts |
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

### Step 3: Update CLAUDE.md
- Only if new patterns or conventions were established

### Step 4: Update Notion Project Review
Use `mcp__notion__notion-update-page`:
- Page ID: `2c92bfe3-ea0c-81df-b05f-ffcef90414fa`
- URL: https://www.notion.so/2c92bfe3ea0c81dfb05fffcef90414fa
- Update with current project status, completed phases, in-progress work

---

## Sync-Up Procedure

When triggered by `sync_up`:

### Step 1: Update Internal Documentation
- Update `TODO.md` with current state
- Update `CLAUDE.md` if new patterns established
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
1. Check `/prompts/` folder for pending tasks
2. Check `/deferred/` folder for tasks now aligned
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
│ Prompts: X pending, Y deferred (Z now aligned)     │
│ Backlog items: X                                    │
└─────────────────────────────────────────────────────┘

RECOMMENDED NEXT ACTIONS:
(a) Continue current phase work [if incomplete]
(b) Start next phase [if current complete]
(c) Process aligned prompts [if any now aligned]
(d) Review deferred items [if phase changed]
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

---

## Folder Structure for Prompts

```
residio/
├── prompts/          # Pending prompts (auto-populated from Notion)
│   └── *.md          # Auto-generated prompt files
├── processed/        # Successfully completed prompts
│   └── *.md          # Moved here after task completion
├── deferred/         # Prompts deferred to later phase
│   └── *.md          # Moved here when user chooses "Defer"
├── archived/         # Permanently skipped prompts
│   └── *.md          # Moved here when user chooses "Archive"
└── .claude/
    ├── settings.json      # Hook configuration
    └── hooks/
        └── session-start.sh  # SessionStart hook script
```

---

## Prompt Processing Behavior

### Auto-Execute (Phase-Aligned)
- Matches current phase (as defined in TODO.md)
- Type: Bug Fix, Documentation, Security Fix, or Technical Debt
- Phase: Backlog

Action: Add to task list and execute.

### User Decision Required (Non-Aligned)
- Different phase than current
- Not a universally-executable type

Action: Present user with THREE options:

| Option | Description | File Action | Notion Status |
|--------|-------------|-------------|---------------|
| **Defer** | Save for later phase | `mv prompts/X deferred/X` | "Deferred" |
| **Execute anyway** | Override phase restriction | Process normally | (per completion) |
| **Archive** | Skip permanently | `mv prompts/X archived/X` | "Archived" |

---

## Completing Prompts

After successfully completing a prompt task:

### 1. Extract Notion Page ID
From YAML frontmatter:
```yaml
---
notion_page_id: 2ca2bfe3ea0c80c68727cbda365dfcd3
notion_url: https://www.notion.so/...
---
```

### 2. Update Notion Status

**Via MCP** (if available):
```
mcp__notion__notion-update-page
data:
  page_id: [notion_page_id from frontmatter]
  command: update_properties
  properties:
    Status: Done
    Processed Date: [today's date YYYY-MM-DD]
    Analysis Notes: "Completed by Claude Code on [date]. [brief summary]"
```

**Via NSMA Dashboard**: http://localhost:3100

### 3. Move File
```bash
mv prompts/pending/<filename> prompts/processed/<filename>
```
