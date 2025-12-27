#!/bin/bash
# Residio Session Start Hook - Notion sync and prompt detection
# Automatically runs at session start via Claude Code hooks

PROMPTS_DIR="/home/feyijimiohioma/projects/Residio/prompts"
NOTION_DIR="/home/feyijimiohioma/mobile-first-notion-workflow"
TODO_FILE="/home/feyijimiohioma/projects/Residio/TODO.md"

# Extract current phase from TODO.md dynamically
# Format: "## Current Phase: Phase 9 - Polish (NEXT UP)"
CURRENT_PHASE=$(grep -m1 "^## Current Phase:" "$TODO_FILE" 2>/dev/null | sed 's/## Current Phase: //' | sed 's/ -.*//' | xargs)
if [ -z "$CURRENT_PHASE" ]; then
    CURRENT_PHASE="Unknown"
fi

echo "Current Phase: $CURRENT_PHASE (from TODO.md)"
echo ""

# Run Notion sync
echo "Running Notion sync..."
cd "$NOTION_DIR" && source .env && python3 residio_inbox_processor.py 2>&1

# Count and categorize prompts
echo ""
echo "═══════════════════════════════════════════════════════"
echo "PENDING PROMPTS SUMMARY"
echo "═══════════════════════════════════════════════════════"

# Check if prompts directory exists and has files
if [ ! -d "$PROMPTS_DIR" ] || [ -z "$(ls -A "$PROMPTS_DIR"/*.md 2>/dev/null)" ]; then
    echo "No pending prompts found."
    echo "═══════════════════════════════════════════════════════"
else
    aligned_count=0
    decision_count=0

    for f in "$PROMPTS_DIR"/*.md; do
        [ -e "$f" ] || continue

        filename=$(basename "$f")
        phase=$(grep -m1 "Phase\*\*:" "$f" 2>/dev/null | sed 's/.*Phase\*\*: //')
        type=$(grep -m1 "Type\*\*:" "$f" 2>/dev/null | sed 's/.*Type\*\*: //')
        title=$(grep -m1 "^# Development Task:" "$f" 2>/dev/null | sed 's/# Development Task: //')

        # Default title to filename if not found
        [ -z "$title" ] && title="$filename"

        # Determine alignment
        if [[ "$type" =~ ^(Bug\ Fix|Documentation|Security\ Fix|Technical\ Debt)$ ]]; then
            echo "[EXECUTE] $title"
            echo "   Type: $type (always execute)"
            ((aligned_count++))
        elif [[ "$phase" == "$CURRENT_PHASE" ]] || [[ "$phase" == "Backlog" ]]; then
            echo "[EXECUTE] $title"
            echo "   Phase: $phase (aligned)"
            ((aligned_count++))
        else
            echo "[DECISION REQUIRED] $title"
            echo "   Phase: $phase (not aligned with $CURRENT_PHASE)"
            echo "   Options: (a) Defer, (b) Execute anyway, (c) Archive"
            ((decision_count++))
        fi
        echo ""
    done

    echo "═══════════════════════════════════════════════════════"
    echo "Summary: $aligned_count aligned, $decision_count require decision"
    echo "Read /prompts folder to process tasks."
    echo "═══════════════════════════════════════════════════════"
fi

# Check deferred prompts for phase alignment
DEFERRED_DIR="/home/feyijimiohioma/projects/Residio/deferred"

if [ -d "$DEFERRED_DIR" ] && [ -n "$(ls -A "$DEFERRED_DIR"/*.md 2>/dev/null)" ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "DEFERRED PROMPTS (Review for Phase Alignment)"
    echo "═══════════════════════════════════════════════════════"

    now_aligned=0
    still_deferred=0

    for f in "$DEFERRED_DIR"/*.md; do
        [ -e "$f" ] || continue

        filename=$(basename "$f")
        phase=$(grep -m1 "Phase\*\*:" "$f" 2>/dev/null | sed 's/.*Phase\*\*: //')
        title=$(grep -m1 "^# Development Task:" "$f" 2>/dev/null | sed 's/# Development Task: //')
        [ -z "$title" ] && title="$filename"

        if [[ "$phase" == "$CURRENT_PHASE" ]] || [[ "$phase" == "Backlog" ]]; then
            echo "[NOW ALIGNED] $title"
            echo "   Phase: $phase - Consider moving to prompts/"
            ((now_aligned++))
        else
            echo "[STILL DEFERRED] $title"
            echo "   Phase: $phase"
            ((still_deferred++))
        fi
        echo ""
    done

    echo "═══════════════════════════════════════════════════════"
    echo "Deferred: $now_aligned now aligned, $still_deferred still deferred"
    if [ $now_aligned -gt 0 ]; then
        echo "Run: mv deferred/<file>.md prompts/ to re-activate"
    fi
    echo "═══════════════════════════════════════════════════════"
fi
