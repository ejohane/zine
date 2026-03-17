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
#   1. Computes a unique worker port (8700-8799) from the worktree path hash
#   2. Seeds database from main worktree on first run (OAuth tokens, test data)
#   3. Symlinks worker secrets (.dev.vars) from main
#   4. Generates mobile .env.local with a reachable API URL
#   5. Starts a public dev proxy when non-localhost access is needed
#   6. Starts all services via turbo
#
# USAGE:
#   bun run dev:worktree                                # Normal usage
#   ZINE_WORKER_PORT=8888 bun run dev:worktree          # Override port
#   ZINE_DEV_HOST=100.92.242.50 bun run dev:worktree    # Override mobile/API host
#   ZINE_API_PORT=8890 bun run dev:worktree             # Override public API port
#   bun run dev:reset && bun run dev:worktree          # Fresh re-seed
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

# Function to find the next available port without range wrapping.
find_available_port_from() {
    local base=$1
    local max_attempts=${2:-100}
    local port=$base

    for ((i=0; i<max_attempts; i++)); do
        if ! port_in_use $port; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done

    echo $base
    return 1
}

# Function to determine the host Expo Go and the mobile app should use.
# Prefers an explicit override, then the current Tailscale IPv4, and falls
# back to localhost for simulator-only development.
resolve_dev_host() {
    if [ -n "$ZINE_DEV_HOST" ]; then
        echo "$ZINE_DEV_HOST"
        return 0
    fi

    if command -v tailscale >/dev/null 2>&1; then
        local tailscale_ip
        tailscale_ip=$(tailscale ip -4 2>/dev/null | head -n 1 | tr -d '\r')
        if [ -n "$tailscale_ip" ]; then
            echo "$tailscale_ip"
            return 0
        fi
    fi

    echo "localhost"
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

DEV_HOST=$(resolve_dev_host)
PUBLIC_API_PORT=$WORKER_PORT
PUBLIC_API_NOTE=""

if [ "$DEV_HOST" != "localhost" ]; then
  if [ -n "$ZINE_API_PORT" ]; then
    PUBLIC_API_PORT=$ZINE_API_PORT
  else
    PUBLIC_API_PORT=$(find_available_port_from $((WORKER_PORT + 100)))
  fi
  PUBLIC_API_NOTE=" (proxy -> http://localhost:$WORKER_PORT)"
fi

API_BASE_URL="http://$DEV_HOST:$PUBLIC_API_PORT"

echo "🚀 Zine Dev Environment"
echo "   Worktree: $WORKTREE_PATH"
echo "   Main:     $MAIN_WORKTREE"
echo "   Worker:   http://localhost:$WORKER_PORT"
echo "   Metro:    http://localhost:$METRO_PORT"
if [ "$DEV_HOST" != "localhost" ]; then
  echo "   API:      $API_BASE_URL$PUBLIC_API_NOTE"
  echo "   Expo Go:  exp://$DEV_HOST:$METRO_PORT"
else
  echo "   API:      $API_BASE_URL"
  echo "   Expo Go:  exp://localhost:$METRO_PORT"
fi

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
# Only regenerate if the API URL has changed or file doesn't exist
CURRENT_API_URL=""
CURRENT_ENV_BACKUP=""
if [ -f apps/mobile/.env.local ]; then
    CURRENT_API_URL=$(grep "^EXPO_PUBLIC_API_URL=" apps/mobile/.env.local 2>/dev/null | sed 's/^EXPO_PUBLIC_API_URL=//' || echo "")
    CURRENT_ENV_BACKUP=$(mktemp)
    cp apps/mobile/.env.local "$CURRENT_ENV_BACKUP"
fi

if [ "$CURRENT_API_URL" != "$API_BASE_URL" ]; then
    echo "   📝 Generating apps/mobile/.env.local ($API_BASE_URL)..."
    mkdir -p apps/mobile

    # Start with dynamic API URL
    cat > apps/mobile/.env.local << EOF
# Auto-generated by scripts/dev.sh for worktree isolation
# Worker host: $DEV_HOST
# Worker port: $WORKER_PORT
# To regenerate: bun run dev:reset && bun run dev:worktree
EXPO_PUBLIC_API_URL=$API_BASE_URL
EOF

    # Append other env vars from the previous env file snapshot (main if available,
    # otherwise the current worktree's prior file) excluding dynamic/local-only vars.
    ENV_SOURCE_FILE=""
    if [ "$WORKTREE_PATH" = "$MAIN_WORKTREE" ] && [ -n "$CURRENT_ENV_BACKUP" ] && [ -f "$CURRENT_ENV_BACKUP" ]; then
        ENV_SOURCE_FILE="$CURRENT_ENV_BACKUP"
    elif [ -f "$MAIN_WORKTREE/apps/mobile/.env.local" ]; then
        ENV_SOURCE_FILE="$MAIN_WORKTREE/apps/mobile/.env.local"
    elif [ -n "$CURRENT_ENV_BACKUP" ] && [ -f "$CURRENT_ENV_BACKUP" ]; then
        ENV_SOURCE_FILE="$CURRENT_ENV_BACKUP"
    fi

    if [ -n "$ENV_SOURCE_FILE" ]; then
        grep -v "^EXPO_PUBLIC_API_URL=" "$ENV_SOURCE_FILE" | \
            grep -v "^EXPO_PUBLIC_STORYBOOK_ENABLED=" | \
            grep -v "^#" | grep -v "^$" >> apps/mobile/.env.local 2>/dev/null || true
        echo "   ✓ Copied secrets from existing .env.local"
    else
        echo "   ⚠️  No main .env.local found"
        echo "      You may need to add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY etc."
        echo "      See apps/mobile/.env.example for required variables"
    fi
fi

if [ -n "$CURRENT_ENV_BACKUP" ] && [ -f "$CURRENT_ENV_BACKUP" ]; then
    rm -f "$CURRENT_ENV_BACKUP"
fi

# -----------------------------------------------------------------------------
# Export and Start Services
# -----------------------------------------------------------------------------
export WORKER_PORT
export METRO_PORT
export EXPO_HOSTNAME="$DEV_HOST"
export REACT_NATIVE_PACKAGER_HOSTNAME="$DEV_HOST"

PROXY_PID=""

cleanup() {
  if [ -n "$PROXY_PID" ] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

if [ "$PUBLIC_API_PORT" != "$WORKER_PORT" ]; then
  echo "   🔀 Starting API proxy on $PUBLIC_API_PORT -> $WORKER_PORT..."
  ZINE_PROXY_HOST=0.0.0.0 \
    ZINE_PROXY_PORT="$PUBLIC_API_PORT" \
    ZINE_PROXY_TARGET_HOST=127.0.0.1 \
    ZINE_PROXY_TARGET_PORT="$WORKER_PORT" \
    node ./scripts/dev-worker-proxy.mjs &
  PROXY_PID=$!
fi

echo ""
echo "   Starting services..."
echo ""

bun run dev
