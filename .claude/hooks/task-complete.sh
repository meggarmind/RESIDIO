#!/bin/bash
# ============================================================================
# Task Complete Hook for QA-Director Agent
# ============================================================================
# Triggered by PostToolUse hook when Bash tool is used
# Detects file moves from prompts/pending/ to prompts/processed/
# Outputs trigger context for QA-Director validation
# ============================================================================

# Exit silently on any error (non-blocking)
set +e

PROJECT_ROOT="$(pwd)"
PROMPTS_DIR="$PROJECT_ROOT/prompts"
PENDING_DIR="$PROMPTS_DIR/pending"
PROCESSED_DIR="$PROMPTS_DIR/processed"

# Read tool input from environment or stdin
TOOL_INPUT="${TOOL_INPUT:-}"
TOOL_NAME="${TOOL_NAME:-}"

# Only process Bash tool calls
if [[ "$TOOL_NAME" != "Bash" ]] && [[ "$TOOL_NAME" != "bash" ]]; then
    exit 0
fi

# Check if this is a mv command involving prompts folders
if [[ -z "$TOOL_INPUT" ]]; then
    exit 0
fi

# Look for mv command pattern: mv prompts/pending/* prompts/processed/*
if ! echo "$TOOL_INPUT" | grep -qE "mv.*prompts/pending.*prompts/processed"; then
    exit 0
fi

# Extract the filename being moved
# Pattern: mv prompts/pending/filename.md prompts/processed/
MOVED_FILE=""
if echo "$TOOL_INPUT" | grep -qE "mv\s+prompts/pending/([^\s]+)"; then
    MOVED_FILE=$(echo "$TOOL_INPUT" | sed -n 's/.*mv\s\+prompts\/pending\/\([^ ]*\).*/\1/p')
fi

# Alternative pattern: mv prompts/pending/filename prompts/processed/filename
if [[ -z "$MOVED_FILE" ]]; then
    MOVED_FILE=$(echo "$TOOL_INPUT" | sed -n 's/.*prompts\/pending\/\([^[:space:]]*\.md\).*/\1/p')
fi

# If we couldn't extract a filename, exit
if [[ -z "$MOVED_FILE" ]]; then
    exit 0
fi

# Count remaining pending prompts
PENDING_COUNT=0
if [ -d "$PENDING_DIR" ]; then
    PENDING_COUNT=$(find "$PENDING_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
fi

# Count processed prompts
PROCESSED_COUNT=0
if [ -d "$PROCESSED_DIR" ]; then
    PROCESSED_COUNT=$(find "$PROCESSED_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
fi

# Extract current phase from TODO.md
CURRENT_PHASE="Unknown"
TODO_FILE="$PROJECT_ROOT/TODO.md"
if [ -f "$TODO_FILE" ]; then
    CURRENT_PHASE=$(grep -m1 "^## Current Phase:" "$TODO_FILE" 2>/dev/null | sed 's/## Current Phase: //' | sed 's/ -.*//' | xargs)
    [ -z "$CURRENT_PHASE" ] && CURRENT_PHASE="Unknown"
fi

# Determine trigger type
TRIGGER_TYPE="prompt_completion"
if [ "$PENDING_COUNT" -eq 0 ]; then
    TRIGGER_TYPE="phase_completion"
fi

# Output trigger context for Claude to process
echo ""
echo "============================================================"
echo "QA-DIRECTOR VALIDATION TRIGGER"
echo "============================================================"
echo ""
echo "Trigger Type: $TRIGGER_TYPE"
echo "Moved File: $MOVED_FILE"
echo "Current Phase: $CURRENT_PHASE"
echo "Pending Prompts: $PENDING_COUNT"
echo "Processed Prompts: $PROCESSED_COUNT"
echo ""

if [ "$TRIGGER_TYPE" = "phase_completion" ]; then
    echo "PHASE COMPLETION DETECTED"
    echo "All prompts in $CURRENT_PHASE have been processed."
    echo ""
    echo "Recommended action: Run comprehensive phase validation"
    echo "Command: /qa-director-validate phase $CURRENT_PHASE"
else
    echo "PROMPT COMPLETION DETECTED"
    echo "Prompt file: $MOVED_FILE"
    echo ""
    echo "Recommended action: Validate files related to this prompt"
    echo "Command: /qa-director-validate prompt $MOVED_FILE"
fi

echo ""
echo "============================================================"
echo ""

# Always exit 0 to not block the main flow
exit 0
