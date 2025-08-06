#!/bin/bash

# Script to sync database from main zine project to current worktree
# Usage: ./scripts/sync-db-from-main.sh

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the main worktree path
MAIN_PROJECT_PATH="/Users/erikjohansson/dev/2025/zine"
CURRENT_PATH=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

echo -e "${YELLOW}Syncing database from main project to current worktree...${NC}"
echo "Main project: $MAIN_PROJECT_PATH"
echo "Current worktree: $CURRENT_PATH"

# Check if we're in a git worktree
if ! git worktree list | grep -q "$CURRENT_PATH"; then
    echo -e "${RED}Error: Current directory is not a git worktree${NC}"
    exit 1
fi

# Define paths
SOURCE_WRANGLER_DIR="$MAIN_PROJECT_PATH/packages/api/.wrangler"
DEST_WRANGLER_DIR="$CURRENT_PATH/packages/api/.wrangler"
SOURCE_LOCAL_DB="$MAIN_PROJECT_PATH/packages/api/local.db"
DEST_LOCAL_DB="$CURRENT_PATH/packages/api/local.db"

# Create destination directories if they don't exist
mkdir -p "$DEST_WRANGLER_DIR/state/v3/d1/miniflare-D1DatabaseObject"

# Sync .wrangler state (contains D1 database)
if [ -d "$SOURCE_WRANGLER_DIR/state" ]; then
    echo -e "${YELLOW}Syncing .wrangler state...${NC}"
    rsync -av --delete \
        "$SOURCE_WRANGLER_DIR/state/" \
        "$DEST_WRANGLER_DIR/state/"
    echo -e "${GREEN}✓ .wrangler state synced${NC}"
else
    echo -e "${YELLOW}Warning: No .wrangler state found in main project${NC}"
fi

# Sync local.db if it exists
if [ -f "$SOURCE_LOCAL_DB" ]; then
    echo -e "${YELLOW}Syncing local.db...${NC}"
    cp "$SOURCE_LOCAL_DB" "$DEST_LOCAL_DB"
    # Also copy WAL and SHM files if they exist
    [ -f "$SOURCE_LOCAL_DB-wal" ] && cp "$SOURCE_LOCAL_DB-wal" "$DEST_LOCAL_DB-wal"
    [ -f "$SOURCE_LOCAL_DB-shm" ] && cp "$SOURCE_LOCAL_DB-shm" "$DEST_LOCAL_DB-shm"
    echo -e "${GREEN}✓ local.db synced${NC}"
else
    echo -e "${YELLOW}Warning: No local.db found in main project${NC}"
fi

echo -e "${GREEN}Database sync complete!${NC}"
echo -e "${YELLOW}Note: If you still have issues, try running 'bun run db:migrate' in packages/api${NC}"