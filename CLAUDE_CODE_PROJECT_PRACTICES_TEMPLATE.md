# Claude Code Project Practices Template

A comprehensive template for setting up Claude Code project management practices including session management, Notion inbox integration, handoff procedures, and phase-based task tracking.

**Source:** Extracted from Residio project best practices
**Version:** 1.0
**Last Updated:** 2025-12-22

---

## Table of Contents

1. [Quick Start Checklist](#1-quick-start-checklist)
2. [CLAUDE.md Template](#2-claudemd-template)
3. [TODO.md Template](#3-todomd-template)
4. [HANDOFF_SUMMARY.md Template](#4-handoff_summarymd-template)
5. [NEXT_SESSION_HANDOFF_PROMPT.md Template](#5-next_session_handoff_promptmd-template)
6. [Session Start Hook](#6-session-start-hook)
7. [Notion Inbox Processor Setup](#7-notion-inbox-processor-setup)
8. [Folder Structure Setup](#8-folder-structure-setup)
9. [Placeholder Reference](#9-placeholder-reference)

---

## 1. Quick Start Checklist

Use this checklist when setting up a new project with these practices.

### Step 1: Create Core Files

```bash
# Navigate to your project root
cd {{PROJECT_ROOT}}

# Create core documentation files
touch CLAUDE.md
touch TODO.md
touch HANDOFF_SUMMARY.md
touch NEXT_SESSION_HANDOFF_PROMPT.md
```

### Step 2: Create Folder Structure

```bash
# Create prompt management folders
mkdir -p prompts processed deferred archived

# Add .gitkeep files to track empty folders
touch prompts/.gitkeep
touch processed/.gitkeep
touch deferred/.gitkeep
touch archived/.gitkeep

# Create Claude Code hooks directory
mkdir -p .claude/hooks
```

### Step 3: Set Up Session Start Hook

```bash
# Create hook script
touch .claude/hooks/session-start.sh
chmod +x .claude/hooks/session-start.sh

# Create settings file
touch .claude/settings.json
```

### Step 4: Set Up Notion Integration

```bash
# Clone/copy the inbox processor to a central location
# (Outside project, shared across projects)
mkdir -p ~/mobile-first-notion-workflow
cd ~/mobile-first-notion-workflow

# Create required files
touch residio_inbox_processor.py
touch update_notion_prompt.py
touch inbox_processor_config.json
touch .env
```

### Step 5: Configure Environment

```bash
# Add to .env in inbox processor directory
echo "NOTION_TOKEN=your_notion_integration_token" >> .env
```

### Step 6: Populate Templates

Copy the templates from sections 2-5 into the respective files, replacing all `{{PLACEHOLDER}}` values.

### Setup Verification Checklist

- [ ] CLAUDE.md created and populated
- [ ] TODO.md created with initial phases
- [ ] HANDOFF_SUMMARY.md created (can be empty initially)
- [ ] NEXT_SESSION_HANDOFF_PROMPT.md created (can be empty initially)
- [ ] prompts/, processed/, deferred/, archived/ folders created
- [ ] .claude/hooks/session-start.sh created and executable
- [ ] .claude/settings.json configured
- [ ] Notion database created with required properties
- [ ] inbox_processor_config.json configured for this project
- [ ] NOTION_TOKEN set in .env

---

## 2. CLAUDE.md Template

Copy the following template into your project's `CLAUDE.md` file:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

{{PROJECT_NAME}} is {{PROJECT_DESCRIPTION}}.

**Current Status**: See `TODO.md` for current phase (dynamically tracked)

## Development Inbox Workflow

This project uses a Notion-based mobile inbox for capturing development tasks. Claude Code processes these **automatically via SessionStart hook**.

### Automatic Session Start (Hook-Based)

A **SessionStart hook** runs automatically at every Claude Code session start. It:
1. Runs Notion sync to fetch new tasks from mobile inbox
2. Analyzes all prompts in `/prompts/` folder
3. Categorizes prompts by phase alignment
4. Displays summary to user

**Hook location**: `.claude/hooks/session-start.sh`
**Hook config**: `.claude/settings.json`

You do NOT need to manually run sync - it happens automatically.

### Manual Sync (if needed)

```bash
cd ~/mobile-first-notion-workflow && source .env && python3 {{PROJECT_NAME_LOWER}}_inbox_processor.py
```

Or type `sync_dev_inbox` to trigger manual sync.

### Workflow Triggers

| Trigger | When | Automatic? |
|---------|------|------------|
| **SessionStart** | Every Claude Code session start | Yes (hook) |
| **Manual** | User types `sync_dev_inbox` | Manual |
| **Resume** | `resume_session` command | Yes (hook) |

### Session Start Procedure

The SessionStart hook displays a summary. After that, Claude should:

1. **Read each prompt in `/prompts/`** folder
2. **Categorize by alignment** (see Prompt Processing Behavior below)
3. **Process ALL prompts** - do not skip any silently

4. **Complete Task & Update Notion (Bidirectional Sync)**:
   After successfully completing a prompt task:

   a. **Extract Notion page ID from YAML frontmatter**:
      ```yaml
      ---
      notion_page_id: abc123...
      notion_url: https://www.notion.so/...
      ---
      ```

   b. **Update Notion status using direct API utility**:
      ```bash
      cd ~/mobile-first-notion-workflow && source .env && \
      python3 update_notion_prompt.py "{{PROJECT_ROOT}}/prompts/<filename>.md" "Done" "Completed by Claude Code on [date]"
      ```

   c. **Move file to processed folder**:
      ```bash
      mv prompts/<filename> processed/<filename>
      ```

### Prompt File Format

Prompts include YAML frontmatter with:
- `notion_page_id`: For updating Notion after completion
- `notion_url`: Link back to original Notion item
- Related files section based on affected module
- Explicit completion actions

### Prompt Processing Behavior

**IMPORTANT: Process ALL prompts** - do not skip based on phase alone.

**Phase-Aligned (auto-execute):**
- Matches current phase (as defined in TODO.md)
- Type: Bug Fix, Documentation, Security Fix, or Technical Debt
- Phase: Backlog

Action: Add to task list and execute.

**Non-Aligned (user decision required):**
- Different phase than current (e.g., Phase 3 when current is Phase 6)
- Not a universally-executable type

Action: Present user with THREE options using `AskUserQuestion`:

| Option | Description | File Action | Notion Status |
|--------|-------------|-------------|---------------|
| **Defer** | Save for later phase | `mv prompts/X deferred/X` | "Deferred" |
| **Execute anyway** | Override phase restriction | Process normally | (per completion) |
| **Archive** | Skip permanently | `mv prompts/X archived/X` | "Archived" |

### Deferring a Prompt

When user chooses "Defer":

1. **Update Notion status**:
   ```bash
   cd ~/mobile-first-notion-workflow && source .env && \
   python3 update_notion_prompt.py "{{PROJECT_ROOT}}/prompts/<filename>.md" "Deferred" "Deferred to [target phase] by user on [date]"
   ```

2. **Move file**:
   ```bash
   mv prompts/<filename> deferred/<filename>
   ```

**Re-check behavior**: Deferred prompts are automatically re-checked at every session start. If the current phase matches the prompt's phase, it will be flagged as `[NOW ALIGNED]` with a suggestion to move it back to `prompts/`.

### Archiving a Prompt

When user chooses "Archive":

1. **Update Notion status**:
   ```bash
   cd ~/mobile-first-notion-workflow && source .env && \
   python3 update_notion_prompt.py "{{PROJECT_ROOT}}/prompts/<filename>.md" "Archived" "Archived by user on [date]. Reason: [if provided]"
   ```

2. **Move file**:
   ```bash
   mv prompts/<filename> archived/<filename>
   ```

### Folder Structure

```
{{PROJECT_NAME_LOWER}}/
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

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # Linting

# Testing
npm run test             # Run tests
```

## Tech Stack

{{TECH_STACK_LIST}}

## Architecture

### Directory Structure

```
{{DIRECTORY_STRUCTURE}}
```

### Key Patterns

{{KEY_PATTERNS_DESCRIPTION}}

## Conventions

### Path Aliases
`@/*` maps to `src/*` - use for all imports.

### Styling
{{STYLING_CONVENTIONS}}

### Type Safety
{{TYPE_SAFETY_CONVENTIONS}}

## Project Management

**Git Configuration**:
- Repository: {{GITHUB_REPO}}
- User: `{{GITHUB_USER}}`
- Email: `{{GIT_EMAIL}}`
- Do not include Claude Code references in commits

**Documentation Updates**:
- `TODO.md` - Update at least every 30 minutes with current state
- `HANDOFF_SUMMARY.md` - Update when:
  - User requests to close the session
  - Context remaining before compression hits ~10%
- `README.md` - Update hourly or at session end

**Session Workflow**:
1. **Session Start**: First, execute the Development Inbox Workflow. Then run `date` command to confirm current date/time.
2. **Problem Analysis**: Do NOT immediately change code when user explains a problem - analyze first and present options
3. **GitHub Sync**: Check that pushes are done within 10 mins of writing new files

**Session Commands**:
When the user types any of these keyphrases, execute the associated action:

| Keyphrase | Action |
|-----------|--------|
| `pause_session` | Execute session handoff procedure below |
| `end_session` | Execute session handoff procedure below |
| `resume_session` | Read `NEXT_SESSION_HANDOFF_PROMPT.md` and follow its instructions as your prompt |
| `sync_dev_inbox` | Run Notion sync command, check prompts folder, process prompts per Development Inbox Workflow |

**Session Handoff Procedure**:
When triggered by the above keyphrases, perform the following:

1. Update `TODO.md` with current state and any troubleshooting in progress
2. Update `CLAUDE.md` if any new patterns or conventions were established
3. Update `HANDOFF_SUMMARY.md` with:
   - Overall goal for this session
   - Key decisions made or approaches discussed/attempted
   - Specific code changes or edits made
   - Current state of any in-progress tasks
   - Next steps or remaining tasks
4. Create/update `NEXT_SESSION_HANDOFF_PROMPT.md` with a complete prompt for the next session
5. Update Notion project review page using `mcp__notion__notion-update-page`:
   - Page ID: `{{NOTION_PROJECT_PAGE_ID}}`
   - Update with current project status

**Phase Completion Git Push Workflow**:
At the end of each phase after all TODOs have been successfully implemented:

1. **Ask user for git push confirmation**:
   - "Phase X is complete. Would you like me to push to both master and origin?"
   - If YES → Execute git push
   - If NO → Continue to next task

2. **Auto-push after 30 minutes**:
   - If no positive confirmation received within 30 minutes
   - Auto-push with commit message: "feat: Complete Phase X - [brief description]"
```

---

## 3. TODO.md Template

Copy the following template into your project's `TODO.md` file:

```markdown
# TODO.md - {{PROJECT_NAME}} Project Status

**Last Updated:** {{DATE}}

## Current Phase: Phase 1 - {{PHASE_1_NAME}} (ACTIVE)

> **Prompts Check**: Always check `/prompts` folder for pending development tasks:
> - **Session start**: Automated via SessionStart hook
> - **Between phases**: Check before starting new phase work
> - **When asked "what's next?"**: Review prompts alongside TODO items
>
> **MANDATORY: After completing any prompt from Notion inbox:**
> 1. Move prompt file: `mv prompts/<filename> processed/`
> 2. Update Notion status to "Done"

---

## Phase 0: Project Setup & Infrastructure ✅ COMPLETE
- [x] Initialize project with chosen framework
- [x] Install core dependencies
- [x] Configure environment variables
- [x] Connect to GitHub
- [x] Set up Claude Code practices (this template)

---

## Phase 1: {{PHASE_1_NAME}}
- [ ] {{TASK_1}}
- [ ] {{TASK_2}}
- [ ] {{TASK_3}}

### Key Implementation Notes:
- {{NOTES}}

---

## Phase 2: {{PHASE_2_NAME}}
- [ ] {{TASK_1}}
- [ ] {{TASK_2}}

---

## Phase 3: {{PHASE_3_NAME}}
- [ ] {{TASK_1}}
- [ ] {{TASK_2}}

---

## Future Phases

### Phase 4+
Define additional phases as project scope becomes clearer.

---

## Project Structure
```
{{PROJECT_STRUCTURE}}
```

## Troubleshooting

No pending issues.

---

## Recent Updates ({{DATE}})

### {{UPDATE_TITLE}} ✅
- {{UPDATE_DESCRIPTION}}

**Files Modified:**
- `{{FILE_PATH}}`
```

---

## 4. HANDOFF_SUMMARY.md Template

Copy the following template into your project's `HANDOFF_SUMMARY.md` file:

```markdown
# Handoff Summary - {{PROJECT_NAME}} Project

**Date:** {{DATE}}
**Current Phase:** Phase {{PHASE_NUMBER}} - {{PHASE_NAME}}
**Last Completed:** {{LAST_COMPLETED_PHASE}}

---

## Session Goal

This session focused on {{SESSION_GOAL_DESCRIPTION}}.

---

## Key Decisions Made

### {{DECISION_CATEGORY}}
- {{DECISION_1}}
- {{DECISION_2}}

---

## Code Changes Made

### Files Created ({{COUNT}})

1. **`{{FILE_PATH}}`**:
   - {{DESCRIPTION}}

### Files Modified ({{COUNT}})

1. **`{{FILE_PATH}}`**:
   - {{CHANGE_DESCRIPTION}}

---

## Current State

### Completed ✅
- [x] {{COMPLETED_ITEM_1}}
- [x] {{COMPLETED_ITEM_2}}

### What Works
- {{WORKING_FEATURE_1}}
- {{WORKING_FEATURE_2}}

---

## Next Steps (Priority Order)

1. **{{NEXT_STEP_1}}**:
   - {{DETAILS}}

2. **Check for new prompts** from Notion inbox

---

## Commands to Resume

```bash
cd {{PROJECT_ROOT}}
npm run dev
```

---

## Environment Notes

{{ENVIRONMENT_NOTES}}
```

---

## 5. NEXT_SESSION_HANDOFF_PROMPT.md Template

Copy the following template into your project's `NEXT_SESSION_HANDOFF_PROMPT.md` file:

```markdown
# Next Session Handoff Prompt

**Date:** {{DATE}}
**Phase:** Phase {{PHASE_NUMBER}} - {{PHASE_NAME}}

---

## Context

{{CONTEXT_DESCRIPTION}}

### Status Summary
- ✅ {{COMPLETED_ITEM}}
- ⬜ {{PENDING_ITEM}}

---

## Immediate Action

1. **Run Notion sync** to check for new prompts:
   ```bash
   cd ~/mobile-first-notion-workflow && source .env && python3 {{PROJECT_NAME_LOWER}}_inbox_processor.py
   ```

2. **Check `/prompts` folder** for any new tasks

3. **Continue with**: {{NEXT_TASK}}

---

## Key Files Modified in This Session

### New Files Created
- [{{FILE_PATH}}]({{FILE_PATH}}) - {{DESCRIPTION}}

### Files Updated
- `{{FILE_PATH}}` - {{CHANGE_DESCRIPTION}}

---

## Build Status

✅ Build passes (`npm run build`)
✅ Dev server runs without errors

---

## Environment

- **Dev server**: `npm run dev`
- {{OTHER_ENV_NOTES}}
```

---

## 6. Session Start Hook

### .claude/settings.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash {{PROJECT_ROOT}}/.claude/hooks/session-start.sh",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### .claude/hooks/session-start.sh

```bash
#!/bin/bash

# ============================================
# {{PROJECT_NAME}} - Claude Code Session Start Hook
# ============================================
# This hook runs automatically at every Claude Code session start.
# It syncs the Notion inbox and analyzes pending prompts.

# Configuration
PROJECT_ROOT="{{PROJECT_ROOT}}"
NOTION_WORKFLOW_DIR="$HOME/mobile-first-notion-workflow"
PROMPTS_DIR="$PROJECT_ROOT/prompts"
DEFERRED_DIR="$PROJECT_ROOT/deferred"
TODO_FILE="$PROJECT_ROOT/TODO.md"

# Extract current phase from TODO.md
CURRENT_PHASE=$(grep -m1 "^## Current Phase:" "$TODO_FILE" 2>/dev/null | sed 's/## Current Phase: //' | sed 's/ (.*//' | xargs)
if [ -z "$CURRENT_PHASE" ]; then
    CURRENT_PHASE="Unknown"
fi

echo "Current Phase: $CURRENT_PHASE (from TODO.md)"
echo ""

# Run Notion sync
echo "Running Notion sync..."
cd "$NOTION_WORKFLOW_DIR" && source .env && python3 {{PROJECT_NAME_LOWER}}_inbox_processor.py 2>&1
echo ""

# Analyze pending prompts
echo "═══════════════════════════════════════════════════════"
echo "PENDING PROMPTS SUMMARY"
echo "═══════════════════════════════════════════════════════"

ALIGNED_COUNT=0
DECISION_COUNT=0

# Process each prompt file
for prompt_file in "$PROMPTS_DIR"/*.md; do
    [ -f "$prompt_file" ] || continue
    [ "$(basename "$prompt_file")" = ".gitkeep" ] && continue

    filename=$(basename "$prompt_file")

    # Extract metadata from prompt
    phase=$(grep -m1 "^\*\*Phase\*\*:" "$prompt_file" 2>/dev/null | sed 's/.*: //')
    type=$(grep -m1 "^\*\*Type\*\*:" "$prompt_file" 2>/dev/null | sed 's/.*: //')
    title=$(grep -m1 "^# Development Task:" "$prompt_file" 2>/dev/null | sed 's/# Development Task: //')

    if [ -z "$title" ]; then
        title="$filename"
    fi

    # Determine if aligned or needs decision
    # Auto-execute types: Bug Fix, Documentation, Security Fix, Technical Debt
    if [[ "$type" == "Bug Fix" ]] || [[ "$type" == "Documentation" ]] || [[ "$type" == "Security Fix" ]] || [[ "$type" == "Technical Debt" ]]; then
        echo "[EXECUTE] $title"
        echo "   Type: $type (always execute)"
        echo ""
        ((ALIGNED_COUNT++))
    elif [[ "$phase" == "$CURRENT_PHASE" ]] || [[ "$phase" == "Backlog" ]]; then
        echo "[EXECUTE] $title"
        echo "   Phase: $phase (aligned)"
        echo ""
        ((ALIGNED_COUNT++))
    else
        echo "[DECISION REQUIRED] $title"
        echo "   Phase: $phase (not aligned with $CURRENT_PHASE)"
        echo "   Options: (a) Defer, (b) Execute anyway, (c) Archive"
        echo ""
        ((DECISION_COUNT++))
    fi
done

echo "═══════════════════════════════════════════════════════"
echo "Summary: $ALIGNED_COUNT aligned, $DECISION_COUNT require decision"
echo "Read /prompts folder to process tasks."
echo "═══════════════════════════════════════════════════════"

# Check deferred prompts for re-alignment
if [ -d "$DEFERRED_DIR" ]; then
    DEFERRED_ALIGNED=0
    STILL_DEFERRED=0

    for deferred_file in "$DEFERRED_DIR"/*.md; do
        [ -f "$deferred_file" ] || continue
        [ "$(basename "$deferred_file")" = ".gitkeep" ] && continue

        filename=$(basename "$deferred_file")
        phase=$(grep -m1 "^\*\*Phase\*\*:" "$deferred_file" 2>/dev/null | sed 's/.*: //')
        title=$(grep -m1 "^# Development Task:" "$deferred_file" 2>/dev/null | sed 's/# Development Task: //')

        if [ -z "$title" ]; then
            title="$filename"
        fi

        if [[ "$phase" == "$CURRENT_PHASE" ]]; then
            if [ $DEFERRED_ALIGNED -eq 0 ]; then
                echo ""
                echo "DEFERRED PROMPTS (Review for Phase Alignment)"
                echo "═══════════════════════════════════════════════════════"
            fi
            echo "[NOW ALIGNED] $title"
            echo "   Phase: $phase - Consider moving to prompts/"
            ((DEFERRED_ALIGNED++))
        else
            ((STILL_DEFERRED++))
        fi
    done

    if [ $DEFERRED_ALIGNED -gt 0 ] || [ $STILL_DEFERRED -gt 0 ]; then
        echo ""
        echo "Deferred: $DEFERRED_ALIGNED now aligned, $STILL_DEFERRED still deferred"
        echo "Run: mv deferred/<file>.md prompts/ to re-activate"
        echo "═══════════════════════════════════════════════════════"
    fi
fi
```

---

## 7. Notion Inbox Processor Setup

### Notion Database Properties

Create a Notion database with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `Idea/Todo` | Title | Task title |
| `Type` | Select | Feature, Bug Fix, Improvement, Technical Debt, Documentation, Security Fix |
| `Affected Module` | Select | Module categories for your project |
| `Suggested Phase` | Select | Phase 1, Phase 2, etc., or Backlog |
| `Priority` | Select | High, Medium, Low |
| `Status` | Select | Not started, In progress, Done, Deferred, Archived |
| `Detailed Description` | Text | Full task description |
| `Captured Date` | Date | Auto-set on creation |
| `Assigned Phase` | Select | Override for suggested phase |
| `Hydrated` | Checkbox | If true, use page body as prompt content |
| `Processed Date` | Date | Set when task completed |
| `Analysis Notes` | Text | Notes from Claude Code processing |

### inbox_processor_config.json

```json
{
  "project_name": "{{PROJECT_NAME}}",
  "notion_database_id": "{{NOTION_DATABASE_ID}}",

  "paths": {
    "prompts_dir": "{{PROJECT_ROOT}}/prompts",
    "processed_dir": "{{PROJECT_ROOT}}/processed",
    "deferred_dir": "{{PROJECT_ROOT}}/deferred",
    "archived_dir": "{{PROJECT_ROOT}}/archived"
  },

  "status_workflow": {
    "initial_statuses": ["Not started", null],
    "processing_status": "In progress",
    "completed_status": "Done",
    "deferred_status": "Deferred",
    "archived_status": "Archived"
  },

  "module_file_mapping": {
    "{{MODULE_1}}": [
      "src/{{MODULE_1_PATH}}/"
    ],
    "{{MODULE_2}}": [
      "src/{{MODULE_2_PATH}}/"
    ]
  },

  "phase_keywords": {
    "Phase 1": ["{{PHASE_1_KEYWORDS}}"],
    "Phase 2": ["{{PHASE_2_KEYWORDS}}"]
  },

  "effort_estimation": {
    "type_scores": {
      "Feature": 3,
      "Improvement": 2,
      "Bug Fix": 1,
      "Technical Debt": 2,
      "Documentation": 1,
      "Security Fix": 2
    },
    "effort_bands": {
      "1": "XS - < 2 hours",
      "2": "S - 2-4 hours",
      "3": "M - 4-8 hours",
      "4": "L - 1-2 days"
    }
  }
}
```

### update_notion_prompt.py

```python
#!/usr/bin/env python3
"""
Notion Prompt Status Updater

Updates Notion page status after prompt completion/deferral/archival.
Reads notion_page_id from YAML frontmatter in prompt file.

Usage:
    python3 update_notion_prompt.py <prompt_file> <status> [notes]

    status: Done, Deferred, Archived, In progress
"""

import os
import sys
import json
import re
from datetime import datetime

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

import requests


def extract_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from markdown content."""
    if not content.startswith('---'):
        return {}

    end_marker = content.find('---', 3)
    if end_marker == -1:
        return {}

    frontmatter_text = content[3:end_marker].strip()

    if HAS_YAML:
        try:
            return yaml.safe_load(frontmatter_text) or {}
        except yaml.YAMLError:
            pass

    # Fallback: simple key:value parsing
    result = {}
    for line in frontmatter_text.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            result[key.strip()] = value.strip()
    return result


def update_notion_page(page_id: str, status: str, notes: str = None) -> bool:
    """Update Notion page properties."""
    token = os.getenv('NOTION_TOKEN')
    if not token:
        print("Error: NOTION_TOKEN environment variable not set")
        return False

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    # Build properties update
    properties = {
        "Status": {"select": {"name": status}},
        "Processed Date": {"date": {"start": datetime.now().strftime("%Y-%m-%d")}}
    }

    if notes:
        properties["Analysis Notes"] = {
            "rich_text": [{"text": {"content": notes}}]
        }

    url = f"https://api.notion.com/v1/pages/{page_id}"

    try:
        response = requests.patch(url, headers=headers, json={"properties": properties})
        response.raise_for_status()
        print(f"Successfully updated Notion page: {status}")
        return True
    except requests.RequestException as e:
        print(f"Error updating Notion: {e}")
        return False


def update_from_prompt(prompt_path: str, status: str, notes: str = None) -> bool:
    """Main function to update Notion from prompt file."""
    # Read prompt file
    try:
        with open(prompt_path, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {prompt_path}")
        return False

    # Extract frontmatter
    frontmatter = extract_frontmatter(content)
    page_id = frontmatter.get('notion_page_id')

    if not page_id:
        print("Error: No notion_page_id found in frontmatter")
        return False

    # Update Notion
    return update_notion_page(page_id, status, notes)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 update_notion_prompt.py <prompt_file> <status> [notes]")
        print("Status options: Done, Deferred, Archived, In progress")
        sys.exit(1)

    prompt_file = sys.argv[1]
    status = sys.argv[2]
    notes = sys.argv[3] if len(sys.argv) > 3 else None

    success = update_from_prompt(prompt_file, status, notes)
    sys.exit(0 if success else 1)
```

### Prompt File Template (Generated by Processor)

```markdown
---
notion_page_id: {{NOTION_PAGE_ID}}
notion_url: {{NOTION_URL}}
generated_at: {{GENERATED_AT}}
---

# Development Task: {{TITLE}}

## Metadata
- **Type**: {{TYPE}}
- **Module**: {{MODULE}}
- **Phase**: {{PHASE}}
- **Priority**: {{PRIORITY}}
- **Effort**: {{EFFORT}}

## Objective
{{OBJECTIVE_DESCRIPTION}}

## Related Files
{{RELATED_FILES_LIST}}

## Dependencies
{{DEPENDENCIES_LIST}}

## Success Criteria
- [ ] Implementation complete
- [ ] No TypeScript errors (`npm run build` passes)
- [ ] Follows existing patterns in related files
- [ ] Audit logging integrated (if data mutation)

## Completion Actions
After completing this task, update Notion status:
```bash
cd ~/mobile-first-notion-workflow && source .env && \
python3 update_notion_prompt.py "{{PROJECT_ROOT}}/prompts/{{FILENAME}}" "Done" "Completed by Claude Code on {{DATE}}"
```

Then move this file to `processed/`:
```bash
mv prompts/{{FILENAME}} processed/{{FILENAME}}
```

---
*From mobile capture: {{CAPTURED_DATE}}*
*Notion: {{NOTION_URL}}*
```

---

## 8. Folder Structure Setup

### Required Directory Structure

```
{{PROJECT_ROOT}}/
├── CLAUDE.md                    # Project instructions for Claude Code
├── TODO.md                      # Phase tracking and task list
├── HANDOFF_SUMMARY.md           # Session accomplishment tracking
├── NEXT_SESSION_HANDOFF_PROMPT.md  # Context for resuming sessions
├── README.md                    # Project documentation
│
├── prompts/                     # Pending tasks from Notion
│   └── .gitkeep
│
├── processed/                   # Completed tasks (archive)
│   └── .gitkeep
│
├── deferred/                    # Tasks awaiting future phase
│   └── .gitkeep
│
├── archived/                    # Permanently skipped tasks
│   └── .gitkeep
│
├── .claude/
│   ├── settings.json           # Claude Code hook configuration
│   └── hooks/
│       └── session-start.sh    # SessionStart hook script
│
└── src/                        # Project source code
    └── ...
```

### Setup Commands

```bash
# Create all directories at once
cd {{PROJECT_ROOT}}

mkdir -p prompts processed deferred archived .claude/hooks

# Create .gitkeep files
touch prompts/.gitkeep processed/.gitkeep deferred/.gitkeep archived/.gitkeep

# Create core files
touch CLAUDE.md TODO.md HANDOFF_SUMMARY.md NEXT_SESSION_HANDOFF_PROMPT.md

# Create hook files
touch .claude/settings.json .claude/hooks/session-start.sh
chmod +x .claude/hooks/session-start.sh

# Verify structure
tree -a -L 2 --dirsfirst
```

### .gitignore Additions

Add these to your `.gitignore` if you don't want to track prompt files:

```gitignore
# Optional: Exclude prompt management folders from git
# prompts/
# processed/
# deferred/
# archived/

# Always exclude environment files
.env
.env.local
```

---

## 9. Placeholder Reference

Replace these placeholders throughout the templates:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{PROJECT_NAME}}` | Project name (Title Case) | Residio |
| `{{PROJECT_NAME_LOWER}}` | Project name (lowercase) | residio |
| `{{PROJECT_DESCRIPTION}}` | Brief project description | A residential estate access management system |
| `{{PROJECT_ROOT}}` | Absolute path to project | /home/user/projects/residio |
| `{{NOTION_DATABASE_ID}}` | Notion database UUID | 0f46cdeb58f64ee5b419a4dcd145752d |
| `{{NOTION_PROJECT_PAGE_ID}}` | Notion project overview page ID | 2c92bfe3-ea0c-81df-b05f-ffcef90414fa |
| `{{GITHUB_REPO}}` | GitHub repository URL | https://github.com/user/project |
| `{{GITHUB_USER}}` | GitHub username | meggarmind |
| `{{GIT_EMAIL}}` | Git commit email | user@example.com |
| `{{TECH_STACK_LIST}}` | Bullet list of technologies | - Next.js 16<br>- Supabase<br>- Tailwind CSS |
| `{{DIRECTORY_STRUCTURE}}` | ASCII tree of project structure | src/<br>├── app/<br>├── components/ |
| `{{KEY_PATTERNS_DESCRIPTION}}` | Description of architectural patterns | Server actions for data mutations... |
| `{{STYLING_CONVENTIONS}}` | CSS/styling guidelines | Use Tailwind classes... |
| `{{TYPE_SAFETY_CONVENTIONS}}` | TypeScript conventions | Always use typed responses... |
| `{{PHASE_N_NAME}}` | Name for phase N | Authentication & RBAC |
| `{{PHASE_N_KEYWORDS}}` | Keywords for phase detection | auth, login, rbac, permission |
| `{{MODULE_N}}` | Module name | Billing System |
| `{{MODULE_N_PATH}}` | Path to module files | actions/billing |
| `{{DATE}}` | Current date | 2025-12-22 |

### Quick Replacement Script

Create a script to replace placeholders:

```bash
#!/bin/bash
# replace_placeholders.sh
# Usage: ./replace_placeholders.sh <file>

FILE=$1

# Define your values
PROJECT_NAME="YourProject"
PROJECT_NAME_LOWER="yourproject"
PROJECT_ROOT="/home/$(whoami)/projects/$PROJECT_NAME_LOWER"
NOTION_DATABASE_ID="your-database-id"
GITHUB_REPO="https://github.com/yourusername/$PROJECT_NAME_LOWER"
GITHUB_USER="yourusername"
GIT_EMAIL="your@email.com"

# Replace placeholders
sed -i "s|{{PROJECT_NAME}}|$PROJECT_NAME|g" "$FILE"
sed -i "s|{{PROJECT_NAME_LOWER}}|$PROJECT_NAME_LOWER|g" "$FILE"
sed -i "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" "$FILE"
sed -i "s|{{NOTION_DATABASE_ID}}|$NOTION_DATABASE_ID|g" "$FILE"
sed -i "s|{{GITHUB_REPO}}|$GITHUB_REPO|g" "$FILE"
sed -i "s|{{GITHUB_USER}}|$GITHUB_USER|g" "$FILE"
sed -i "s|{{GIT_EMAIL}}|$GIT_EMAIL|g" "$FILE"
sed -i "s|{{DATE}}|$(date +%Y-%m-%d)|g" "$FILE"

echo "Placeholders replaced in $FILE"
```

---

## Appendix: Best Practices Summary

### Documentation Discipline
- Update `TODO.md` at least every 30 minutes
- Update handoff files on session end (`pause_session` / `end_session`)
- Keep `CLAUDE.md` as single source of truth

### Session Management
- Always run Notion sync at session start (automated via hook)
- Process ALL prompts - never skip silently
- Use three-option workflow for non-aligned prompts (Defer/Execute/Archive)

### Bidirectional Sync
- Always extract `notion_page_id` from prompt frontmatter
- Update Notion status BEFORE moving files
- Move files to appropriate folder AFTER Notion update

### Phase Alignment
- Current phase is extracted dynamically from `TODO.md`
- Deferred prompts are re-checked at every session start
- Bug fixes, documentation, and security fixes always auto-execute

### Git Workflow
- Ask for push confirmation at phase completion
- Auto-push after 30 minutes if no response
- Never include Claude Code references in commits

---

**End of Template**
