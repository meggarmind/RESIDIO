#!/bin/bash
# ============================================================================
# Universal Session Start Hook for Notion Sync Manager
# ============================================================================
# Works with any project configured in NSMA
# Place in: ~/.claude/hooks/ or project-specific hooks directory
# ============================================================================

PROJECT_ROOT="$(pwd)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
PROMPTS_DIR="$PROJECT_ROOT/prompts"
NSMA_CLI="/home/feyijimiohioma/projects/Nsma/cli/index.js"

# Check if this project uses the new structure
if [ ! -d "$PROMPTS_DIR" ]; then
    echo "No prompts directory found. Skipping Notion sync."
    exit 0
fi

# Create subfolders if missing (first-time setup)
mkdir -p "$PROMPTS_DIR/pending" "$PROMPTS_DIR/processed" "$PROMPTS_DIR/archived" "$PROMPTS_DIR/deferred" 2>/dev/null

# Try to extract current phase from TODO.md if it exists
TODO_FILE="$PROJECT_ROOT/TODO.md"
CURRENT_PHASE="Unknown"
if [ -f "$TODO_FILE" ]; then
    CURRENT_PHASE=$(grep -m1 "^## Current Phase:" "$TODO_FILE" 2>/dev/null | sed 's/## Current Phase: //' | sed 's/ -.*//' | xargs)
    [ -z "$CURRENT_PHASE" ] && CURRENT_PHASE="Unknown"
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           NOTION SYNC MANAGER - Session Start            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT_NAME"
echo "Current Phase: $CURRENT_PHASE"
echo ""

# Run sync for this project if CLI exists
if [ -f "$NSMA_CLI" ]; then
    echo "🔄 Running Notion sync..."
    node "$NSMA_CLI" --project "$PROJECT_NAME" 2>&1
    echo ""
else
    echo "⚠️  NSMA CLI not found at $NSMA_CLI"
    echo "   Run sync manually from http://localhost:3100"
    echo ""
fi

# ============================================================================
# PENDING PROMPTS ANALYSIS
# ============================================================================
echo "═══════════════════════════════════════════════════════════"
echo "PENDING PROMPTS"
echo "═══════════════════════════════════════════════════════════"

PENDING_DIR="$PROMPTS_DIR/pending"

if [ ! -d "$PENDING_DIR" ] || [ -z "$(ls -A "$PENDING_DIR"/*.md 2>/dev/null)" ]; then
    echo "✨ No pending prompts."
else
    aligned_count=0
    decision_count=0

    for f in "$PENDING_DIR"/*.md; do
        [ -e "$f" ] || continue

        filename=$(basename "$f")
        # Read from YAML frontmatter
        phase=$(grep -m1 "^phase:" "$f" 2>/dev/null | sed 's/phase: //')
        type=$(grep -m1 "^type:" "$f" 2>/dev/null | sed 's/type: //')
        priority=$(grep -m1 "^priority:" "$f" 2>/dev/null | sed 's/priority: //')
        title=$(grep -m1 "^# Development Task:" "$f" 2>/dev/null | sed 's/# Development Task: //')
        [ -z "$title" ] && title="$filename"

        # Determine if aligned
        # Always execute: Bug Fix, Documentation, Security Fix, Technical Debt
        if [[ "$type" =~ ^(Bug\ Fix|Documentation|Security\ Fix|Technical\ Debt)$ ]]; then
            echo "✅ [EXECUTE] $title"
            echo "   Type: $type (always execute) | Priority: $priority"
            ((aligned_count++))
        elif [[ "$phase" == "$CURRENT_PHASE" ]] || [[ "$phase" == "Backlog" ]]; then
            echo "✅ [EXECUTE] $title"
            echo "   Phase: $phase (aligned) | Priority: $priority"
            ((aligned_count++))
        else
            echo "⚠️  [DECISION] $title"
            echo "   Phase: $phase ≠ $CURRENT_PHASE | Priority: $priority"
            echo "   → (d)efer, (e)xecute anyway, (a)rchive"
            ((decision_count++))
        fi
        echo ""
    done

    echo "═══════════════════════════════════════════════════════════"
    echo "Summary: $aligned_count ready to execute, $decision_count need decision"
fi

# ============================================================================
# DEFERRED PROMPTS CHECK
# ============================================================================
DEFERRED_DIR="$PROMPTS_DIR/deferred"

if [ -d "$DEFERRED_DIR" ] && [ -n "$(ls -A "$DEFERRED_DIR"/*.md 2>/dev/null)" ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "DEFERRED PROMPTS (check for phase alignment)"
    echo "═══════════════════════════════════════════════════════════"

    now_aligned=0

    for f in "$DEFERRED_DIR"/*.md; do
        [ -e "$f" ] || continue

        filename=$(basename "$f")
        phase=$(grep -m1 "^phase:" "$f" 2>/dev/null | sed 's/phase: //')
        title=$(grep -m1 "^# Development Task:" "$f" 2>/dev/null | sed 's/# Development Task: //')
        [ -z "$title" ] && title="$filename"

        if [[ "$phase" == "$CURRENT_PHASE" ]] || [[ "$phase" == "Backlog" ]]; then
            echo "🔄 [NOW ALIGNED] $title"
            echo "   Phase: $phase → mv deferred/$filename pending/"
            ((now_aligned++))
        fi
    done

    if [ $now_aligned -eq 0 ]; then
        echo "No deferred prompts aligned with current phase."
    else
        echo ""
        echo "Run: mv prompts/deferred/<file>.md prompts/pending/"
    fi
    echo "═══════════════════════════════════════════════════════════"
fi

# ============================================================================
# INBOX CHECK
# ============================================================================
INBOX_DIR="$HOME/.notion-sync-manager/inbox/pending"

if [ -d "$INBOX_DIR" ] && [ -n "$(ls -A "$INBOX_DIR"/*.md 2>/dev/null)" ]; then
    inbox_count=$(ls -1 "$INBOX_DIR"/*.md 2>/dev/null | wc -l)

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "📥 INBOX: $inbox_count item(s) need assignment"
    echo "═══════════════════════════════════════════════════════════"

    for f in "$INBOX_DIR"/*.md; do
        [ -e "$f" ] || continue

        filename=$(basename "$f")
        title=$(grep -m1 "^# Development Task:" "$f" 2>/dev/null | sed 's/# Development Task: //')
        original=$(grep -m1 "^original_project:" "$f" 2>/dev/null | sed 's/original_project: //')
        [ -z "$title" ] && title="$filename"

        echo "  • $title"
        [ -n "$original" ] && echo "    (was: $original)"
    done

    echo ""
    echo "Assign items at: http://localhost:3100/inbox"
    echo "═══════════════════════════════════════════════════════════"
fi

echo ""
echo "📂 Prompts location: $PROMPTS_DIR/pending/"
echo "🌐 Dashboard: http://localhost:3100"
echo ""
