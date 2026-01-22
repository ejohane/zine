#!/bin/bash

# ralph.sh - Automated Claude Code task runner
# Loops through bd ready issues until only epics remain or no issues left
#
# Usage: ./ralph.sh <prompt-file>
# Example: ./ralph.sh prompt.txt

set -e

PROMPT_FILE="${1:-}"

if [ -z "$PROMPT_FILE" ]; then
    echo "Usage: ./ralph.sh <prompt-file>"
    echo "Example: ./ralph.sh prompt.txt"
    exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: Prompt file not found: $PROMPT_FILE"
    exit 1
fi

PROMPT=$(cat "$PROMPT_FILE")

# Helper to format seconds into human readable time
format_duration() {
    local seconds=$1
    local hours=$((seconds / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))

    if [ $hours -gt 0 ]; then
        printf "%dh %dm %ds" $hours $minutes $secs
    elif [ $minutes -gt 0 ]; then
        printf "%dm %ds" $minutes $secs
    else
        printf "%ds" $secs
    fi
}

check_remaining_work() {
    local output
    output=$(bd ready 2>&1)

    # Check if no issues ready
    if echo "$output" | grep -q "No issues ready"; then
        echo "No more issues ready to work on."
        return 1
    fi

    # Check if output shows 0 issues
    if echo "$output" | grep -q "(0 issues"; then
        echo "No more issues ready to work on."
        return 1
    fi

    # Count non-epic issues (lines that don't contain "EPIC:")
    local non_epic_count
    non_epic_count=$(echo "$output" | grep -E "^\s*[0-9]+\." | grep -v "EPIC:" | wc -l | tr -d ' ')

    if [ "$non_epic_count" -eq 0 ]; then
        echo "Only epics remaining. Stopping."
        return 1
    fi

    echo "Found $non_epic_count non-epic issue(s) to work on."
    return 0
}

# Record start time
START_TIME=$(date +%s)
START_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "========================================="
echo "  Ralph - Automated Task Runner"
echo "========================================="
echo ""
echo "Started at: $START_TIMESTAMP"
echo "Prompt file: $PROMPT_FILE"
echo ""

iteration=1

while true; do
    ITER_START=$(date +%s)
    ITER_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    echo ""
    echo "========================================="
    echo "  Iteration $iteration - Started $ITER_TIMESTAMP"
    echo "========================================="
    echo ""

    # Check if there's work to do
    if ! check_remaining_work; then
        END_TIME=$(date +%s)
        TOTAL_DURATION=$((END_TIME - START_TIME))

        echo ""
        echo "========================================="
        echo "  Ralph complete!"
        echo "========================================="
        echo "Finished at: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Total time: $(format_duration $TOTAL_DURATION)"
        echo "Total iterations: $((iteration - 1))"
        break
    fi

    echo ""
    echo "Starting yolo..."
    echo ""

    # Run claude in print mode with dangerously-skip-permissions (aka yolo mode)
    # -p makes it exit after completion instead of staying interactive
    claude -p --dangerously-skip-permissions "$PROMPT" || true

    ITER_END=$(date +%s)
    ITER_DURATION=$((ITER_END - ITER_START))
    ELAPSED=$((ITER_END - START_TIME))

    echo ""
    echo "----------------------------------------"
    echo "Iteration $iteration completed in $(format_duration $ITER_DURATION)"
    echo "Total elapsed: $(format_duration $ELAPSED)"
    echo "Checking for remaining work..."

    ((iteration++))

    # Small delay to allow any file operations to complete
    sleep 2
done
