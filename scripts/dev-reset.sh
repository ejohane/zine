#!/bin/bash
# =============================================================================
# scripts/dev-reset.sh - Reset worktree dev environment for fresh re-seed
# =============================================================================
#
# PURPOSE:
#   Clean up all worktree-specific state so the next `bun run dev:worktree`
#   will re-seed the database and regenerate secrets from main.
#
# WHAT IT REMOVES:
#   - .wrangler/state/.seeded-from-main (marker file)
#   - .wrangler/state/ (entire database directory)
#   - apps/worker/.dev.vars (symlink to main)
#
# WHAT IT PRESERVES:
#   - node_modules/
#   - Git state
#   - Main worktree (NEVER modified)
#
# USAGE:
#   bun run dev:reset                    # Reset this worktree
#   bun run dev:reset && bun run dev:worktree  # Reset and restart
#
# =============================================================================

STATE_DIR="apps/worker/.wrangler/state"
SEEDED_MARKER="$STATE_DIR/.seeded-from-main"

echo "🔄 Resetting worktree dev environment..."

# -----------------------------------------------------------------------------
# Clear seeded marker
# -----------------------------------------------------------------------------
if [ -f "$SEEDED_MARKER" ]; then
    rm "$SEEDED_MARKER"
    echo "   ✓ Cleared seed marker"
fi

# -----------------------------------------------------------------------------
# Remove local database state
# -----------------------------------------------------------------------------
if [ -d "$STATE_DIR" ]; then
    rm -rf "$STATE_DIR"
    echo "   ✓ Removed local database"
fi

# -----------------------------------------------------------------------------
# Remove worker secrets symlink
# -----------------------------------------------------------------------------
if [ -L apps/worker/.dev.vars ]; then
    rm apps/worker/.dev.vars
    echo "   ✓ Removed .dev.vars symlink"
elif [ -f apps/worker/.dev.vars ]; then
    echo "   ⚠️  apps/worker/.dev.vars is a real file, not touching it"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "   ✓ Reset complete."
echo "   Run 'bun run dev:worktree' to re-initialize from main."
