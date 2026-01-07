#!/bin/bash
set -e

# =============================================================================
# scripts/dev.sh - Worktree-aware development environment orchestrator
# =============================================================================
#
# PURPOSE:
#   Enable parallel development across multiple git worktrees by providing
#   each worktree with an isolated, fully-functional development environment.
#
# WHAT IT DOES:
#   1. Computes a unique port (8700-8799) from the worktree path hash
#   2. Seeds database from main worktree on first run (OAuth tokens, test data)
#   3. Symlinks worker secrets (.dev.vars) from main
#   4. Generates mobile .env.local with dynamic port
#   5. Starts all services via turbo
#
# USAGE:
#   bun run dev:worktree         # Normal usage
#   ZINE_WORKER_PORT=8888 bun run dev:worktree  # Override port
#   bun run dev:reset && bun run dev:worktree   # Fresh re-seed
#
# =============================================================================

WORKTREE_PATH=$(pwd)
MAIN_WORKTREE=$(git worktree list | head -1 | awk '{print $1}')
STATE_DIR="apps/worker/.wrangler/state"
SEEDED_MARKER="$STATE_DIR/.seeded-from-main"

# -----------------------------------------------------------------------------
# Port Assignment: Deterministic from worktree path (with manual override)
# -----------------------------------------------------------------------------
# Function to check if a port is in use
port_in_use() {
    command -v lsof >/dev/null 2>&1 && lsof -i :$1 >/dev/null 2>&1
}

# Function to find an available port starting from a base
find_available_port() {
    local base=$1
    local max_attempts=100
    local port=$base
    
    for ((i=0; i<max_attempts; i++)); do
        if ! port_in_use $port; then
            echo $port
            return 0
        fi
        port=$((port + 1))
        # Wrap around within 8700-8799 range for worker ports
        if [ $port -ge 8800 ]; then
            port=8700
        fi
    done
    
    # Fallback: return original and let wrangler fail with clear error
    echo $base
    return 1
}

if [ -n "$ZINE_WORKER_PORT" ]; then
  WORKER_PORT=$ZINE_WORKER_PORT
else
  PORT_OFFSET=$(($(echo "$WORKTREE_PATH" | cksum | awk '{print $1}') % 100))
  PREFERRED_PORT=$((8700 + PORT_OFFSET))
  WORKER_PORT=$(find_available_port $PREFERRED_PORT)
  
  if [ "$WORKER_PORT" != "$PREFERRED_PORT" ]; then
    echo "   ℹ️  Port $PREFERRED_PORT in use, using $WORKER_PORT instead"
  fi
fi

# Metro bundler port: 8081 for main, 8100+ for worktrees
if [ "$WORKTREE_PATH" = "$MAIN_WORKTREE" ]; then
  METRO_PORT=8081
else
  PREFERRED_METRO=$((8100 + PORT_OFFSET))
  METRO_PORT=$(find_available_port $PREFERRED_METRO)
  
  if [ "$METRO_PORT" != "$PREFERRED_METRO" ]; then
    echo "   ℹ️  Metro port $PREFERRED_METRO in use, using $METRO_PORT instead"
  fi
fi

echo "🚀 Zine Dev Environment"
echo "   Worktree: $WORKTREE_PATH"
echo "   Main:     $MAIN_WORKTREE"
echo "   Worker:   http://localhost:$WORKER_PORT"
echo "   Metro:    http://localhost:$METRO_PORT"

# Port conflict detection is now handled above in find_available_port

# -----------------------------------------------------------------------------
# Database Seeding: Copy state from main worktree on first run
# -----------------------------------------------------------------------------
if [ "$WORKTREE_PATH" != "$MAIN_WORKTREE" ] && [ ! -f "$SEEDED_MARKER" ] && [ -d "$MAIN_WORKTREE/$STATE_DIR" ]; then
    echo "   📦 Seeding database from main worktree..."
    mkdir -p "$(dirname "$STATE_DIR")"
    cp -R "$MAIN_WORKTREE/$STATE_DIR" "$STATE_DIR"
    echo "Seeded from $MAIN_WORKTREE on $(date)" > "$SEEDED_MARKER"
    echo "   ✓ Database seeded (includes OAuth tokens, existing data)"
elif [ "$WORKTREE_PATH" = "$MAIN_WORKTREE" ]; then
    echo "   ℹ️  Running in main worktree"
elif [ ! -d "$MAIN_WORKTREE/$STATE_DIR" ]; then
    echo "   ⚠️  No main worktree database found"
    echo "      Starting with empty database"
    echo "      (Run main worktree first to enable seeding)"
fi

# Apply any pending database migrations (branch may have migrations not in main's DB)
if [ -d "$STATE_DIR" ]; then
    echo "   🔄 Checking for pending database migrations..."
    MIGRATION_OUTPUT=$(cd apps/worker && bun wrangler d1 migrations apply DB --local 2>&1)
    if echo "$MIGRATION_OUTPUT" | grep -q "Migrations to be applied"; then
        echo "$MIGRATION_OUTPUT" | grep -E "(Migrations to be applied|✅|name)" | head -10
        echo "   ✓ Migrations applied"
    else
        echo "   ✓ Database schema up to date"
    fi
fi

# -----------------------------------------------------------------------------
# Secret Files Management
# -----------------------------------------------------------------------------

# --- Worker Secrets ---
if [ "$WORKTREE_PATH" != "$MAIN_WORKTREE" ]; then
    # Check for broken symlink (target deleted)
    if [ -L apps/worker/.dev.vars ]; then
        if [ ! -e apps/worker/.dev.vars ]; then
            echo "   ⚠️  Broken .dev.vars symlink detected, recreating..."
            rm apps/worker/.dev.vars
        fi
    fi
    
    # Create symlink if it doesn't exist
    if [ ! -L apps/worker/.dev.vars ] && [ -f "$MAIN_WORKTREE/apps/worker/.dev.vars" ]; then
        echo "   🔗 Linking apps/worker/.dev.vars from main..."
        ln -sf "$MAIN_WORKTREE/apps/worker/.dev.vars" apps/worker/.dev.vars
    fi
fi

# --- Mobile Secrets ---
# Only regenerate if port has changed or file doesn't exist
CURRENT_PORT=""
if [ -f apps/mobile/.env.local ]; then
    CURRENT_PORT=$(grep "^EXPO_PUBLIC_API_URL=" apps/mobile/.env.local 2>/dev/null | sed 's/.*localhost:\([0-9]*\).*/\1/' || echo "")
fi

if [ "$CURRENT_PORT" != "$WORKER_PORT" ]; then
    echo "   📝 Generating apps/mobile/.env.local (port $WORKER_PORT)..."
    mkdir -p apps/mobile

    # Start with dynamic API URL
    cat > apps/mobile/.env.local << EOF
# Auto-generated by scripts/dev.sh for worktree isolation
# Worker port: $WORKER_PORT
# To regenerate: bun run dev:reset && bun run dev:worktree
EXPO_PUBLIC_API_URL=http://localhost:$WORKER_PORT
EOF

    # Append other env vars from main's .env.local (excluding API_URL)
    if [ -f "$MAIN_WORKTREE/apps/mobile/.env.local" ]; then
        grep -v "^EXPO_PUBLIC_API_URL=" "$MAIN_WORKTREE/apps/mobile/.env.local" | \
            grep -v "^#" | grep -v "^$" >> apps/mobile/.env.local 2>/dev/null || true
        echo "   ✓ Copied secrets from main's .env.local"
    else
        echo "   ⚠️  No main .env.local found"
        echo "      You may need to add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY etc."
        echo "      See apps/mobile/.env.example for required variables"
    fi
fi

# -----------------------------------------------------------------------------
# Export and Start Services
# -----------------------------------------------------------------------------
export WORKER_PORT
export METRO_PORT

echo ""
echo "   Starting services..."
echo ""

# Use exec to replace this shell with turbo (clean signal handling)
exec bun run dev
