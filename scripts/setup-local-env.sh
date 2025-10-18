#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

MAIN_PROJECT_PATH="/Users/erikjohansson/dev/2025/zine"
CURRENT_PATH=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

echo -e "${YELLOW}Setting up local environment...${NC}"
echo "Main project: $MAIN_PROJECT_PATH"
echo "Current directory: $CURRENT_PATH"
echo ""

echo -e "${YELLOW}Step 1: Syncing database from main project${NC}"

SOURCE_WRANGLER_DIR="$MAIN_PROJECT_PATH/packages/api/.wrangler"
DEST_WRANGLER_DIR="$CURRENT_PATH/packages/api/.wrangler"
SOURCE_LOCAL_DB="$MAIN_PROJECT_PATH/packages/api/local.db"
DEST_LOCAL_DB="$CURRENT_PATH/packages/api/local.db"

mkdir -p "$DEST_WRANGLER_DIR/state/v3/d1/miniflare-D1DatabaseObject"

if [ -d "$SOURCE_WRANGLER_DIR/state" ]; then
    echo -e "${YELLOW}Syncing .wrangler state...${NC}"
    rsync -av --delete \
        "$SOURCE_WRANGLER_DIR/state/" \
        "$DEST_WRANGLER_DIR/state/"
    echo -e "${GREEN}✓ .wrangler state synced${NC}"
else
    echo -e "${YELLOW}Warning: No .wrangler state found in main project${NC}"
fi

if [ -f "$SOURCE_LOCAL_DB" ]; then
    echo -e "${YELLOW}Syncing local.db...${NC}"
    cp "$SOURCE_LOCAL_DB" "$DEST_LOCAL_DB"
    [ -f "$SOURCE_LOCAL_DB-wal" ] && cp "$SOURCE_LOCAL_DB-wal" "$DEST_LOCAL_DB-wal"
    [ -f "$SOURCE_LOCAL_DB-shm" ] && cp "$SOURCE_LOCAL_DB-shm" "$DEST_LOCAL_DB-shm"
    echo -e "${GREEN}✓ local.db synced${NC}"
else
    echo -e "${YELLOW}Warning: No local.db found in main project${NC}"
fi

echo ""

echo -e "${YELLOW}Step 2: Syncing environment variables${NC}"

ENV_FILES=(
    "packages/api/.dev.vars"
    "packages/api/.env"
    "apps/web/.env.local"
    "apps/mobile/.env.local"
    "apps/mobile/.env.development"
    "apps/mobile/.env.preview"
    "apps/mobile/.env.production"
)

files_synced=0
files_skipped=0

for env_file in "${ENV_FILES[@]}"; do
    src_full="$MAIN_PROJECT_PATH/$env_file"
    dest_full="$CURRENT_PATH/$env_file"
    dest_parent=$(dirname "$dest_full")
    
    if [ -f "$src_full" ]; then
        mkdir -p "$dest_parent"
        cp "$src_full" "$dest_full"
        echo -e "  ${GREEN}✓${NC} Copied: $env_file"
        ((files_synced++))
    else
        echo -e "  ${YELLOW}⚠${NC} Not found (skipping): $env_file"
        ((files_skipped++))
    fi
done

echo ""
echo -e "${GREEN}Local environment setup complete!${NC}"
echo -e "  Summary: ${GREEN}$files_synced files synced${NC}, ${YELLOW}$files_skipped skipped${NC}"
