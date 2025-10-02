#!/bin/bash

# Script to sync environment files from main project to git worktree folders
# Worktrees are stored in .branches/ directory

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Main project directory
MAIN_DIR="/Users/erikjohansson/dev/2025/zine"
WORKTREE_BASE="$MAIN_DIR/.branches"

# List of environment files to sync (relative to main directory)
ENV_FILES=(
    "packages/api/.dev.vars"
    "packages/api/.env"
    "packages/api/local.db"
    "packages/api/local.db-shm"
    "packages/api/local.db-wal"
    "apps/web/.env.local"
    "apps/mobile/.env.local"
    "apps/mobile/.env.development"
    "apps/mobile/.env.preview"
    "apps/mobile/.env.production"
)

# Check if worktree directory exists
if [ ! -d "$WORKTREE_BASE" ]; then
    echo -e "${RED}Error: Worktree directory not found at $WORKTREE_BASE${NC}"
    exit 1
fi

# Get list of worktree directories
WORKTREES=$(find "$WORKTREE_BASE" -maxdepth 1 -type d -not -path "$WORKTREE_BASE")

if [ -z "$WORKTREES" ]; then
    echo -e "${YELLOW}No worktree folders found in $WORKTREE_BASE${NC}"
    exit 0
fi

echo -e "${GREEN}Found worktree folders:${NC}"
echo "$WORKTREES" | while read -r worktree; do
    echo "  - $(basename "$worktree")"
done
echo ""

# Function to sync a single file
sync_file() {
    local src_file="$1"
    local dest_dir="$2"
    local rel_path="$3"
    
    local src_full="$MAIN_DIR/$rel_path"
    local dest_full="$dest_dir/$rel_path"
    local dest_parent=$(dirname "$dest_full")
    
    if [ -f "$src_full" ]; then
        # Create destination directory if it doesn't exist
        mkdir -p "$dest_parent"
        
        # Copy the file
        cp "$src_full" "$dest_full"
        echo -e "  ${GREEN}✓${NC} Copied: $rel_path"
        return 0
    else
        echo -e "  ${YELLOW}⚠${NC} Not found (skipping): $rel_path"
        return 1
    fi
}

# Sync files to each worktree
echo "$WORKTREES" | while read -r worktree; do
    if [ -z "$worktree" ]; then
        continue
    fi
    
    worktree_name=$(basename "$worktree")
    echo -e "${GREEN}Syncing to worktree: $worktree_name${NC}"
    
    files_synced=0
    files_skipped=0
    
    for env_file in "${ENV_FILES[@]}"; do
        if sync_file "$MAIN_DIR" "$worktree" "$env_file"; then
            ((files_synced++))
        else
            ((files_skipped++))
        fi
    done
    
    # Check if mobile app directory exists in this worktree
    mobile_app_dir="$worktree/apps/mobile/zine"
    if [ -d "$mobile_app_dir" ]; then
        echo -e "  ${GREEN}Found React Native app, syncing environment...${NC}"
        
        # Copy web .env.local to mobile app location
        if [ -f "$MAIN_DIR/apps/web/.env.local" ]; then
            cp "$MAIN_DIR/apps/web/.env.local" "$mobile_app_dir/.env.local"
            echo -e "  ${GREEN}✓${NC} Copied: apps/web/.env.local → apps/mobile/zine/.env.local"
            ((files_synced++))
        else
            echo -e "  ${YELLOW}⚠${NC} Source .env.local not found"
            ((files_skipped++))
        fi
    fi
    
    # Also sync .wrangler/state directory if it exists (for D1 database)
    if [ -d "$MAIN_DIR/.wrangler/state" ]; then
        echo -e "  Syncing .wrangler/state directory..."
        mkdir -p "$worktree/.wrangler"
        rsync -a --delete "$MAIN_DIR/.wrangler/state/" "$worktree/.wrangler/state/"
        echo -e "  ${GREEN}✓${NC} Synced: .wrangler/state/"
    fi
    
    echo -e "  Summary: ${GREEN}$files_synced files synced${NC}, ${YELLOW}$files_skipped skipped${NC}"
    echo ""
done

echo -e "${GREEN}Environment sync complete!${NC}"
echo ""
echo "Note: This script synced the following types of files:"
echo "  - API environment variables (.dev.vars, .env)"
echo "  - Local database files (local.db and related)"
echo "  - Web app environment variables (.env.local)"
echo "  - Wrangler state directory (D1 database)"
echo "  - React Native app environment (if apps/mobile/zine exists)"