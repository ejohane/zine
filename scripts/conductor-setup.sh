#!/bin/bash

# Conductor Setup Script for Zine Monorepo
# Sets up a new workspace with dependencies, env files, and database

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Zine Workspace Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# 1. Check for bun (fail-fast)
echo -e "${YELLOW}[1/6] Checking for bun...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${RED}✗ Error: bun is not installed${NC}"
    echo -e "${RED}Please install bun first: https://bun.sh${NC}"
    exit 1
fi
echo -e "${GREEN}✓ bun found: $(bun --version)${NC}"
echo

# 2. Install dependencies
echo -e "${YELLOW}[2/6] Installing dependencies...${NC}"
if ! bun install; then
    echo -e "${RED}✗ Error: Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo

# 3. Setup environment files
echo -e "${YELLOW}[3/6] Setting up environment files...${NC}"

# List of environment files to copy (relative to main directory)
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

# Check if root has env files to copy
if [ -n "$CONDUCTOR_ROOT_PATH" ] && [ -d "$CONDUCTOR_ROOT_PATH" ]; then
    files_copied=0
    files_skipped=0
    
    for env_file in "${ENV_FILES[@]}"; do
        src_file="$CONDUCTOR_ROOT_PATH/$env_file"
        dest_file="./$env_file"
        dest_dir=$(dirname "$dest_file")
        
        if [ -f "$src_file" ]; then
            # Create destination directory if it doesn't exist
            mkdir -p "$dest_dir"
            # Copy the file
            cp "$src_file" "$dest_file"
            echo -e "  ${GREEN}✓${NC} Copied: $env_file"
            ((files_copied++))
        else
            echo -e "  ${YELLOW}⚠${NC} Not found (skipping): $env_file"
            ((files_skipped++))
        fi
    done
    
    echo -e "  Summary: ${GREEN}$files_copied files copied${NC}, ${YELLOW}$files_skipped skipped${NC}"
else
    echo -e "${YELLOW}⚠ CONDUCTOR_ROOT_PATH not set or not found${NC}"
    echo -e "${YELLOW}  Skipping environment file copying${NC}"
    echo -e "${YELLOW}  Set CONDUCTOR_ROOT_PATH to your main project directory to enable env file copying${NC}"
fi
echo

# 4. Sync Wrangler state
echo -e "${YELLOW}[4/6] Syncing Wrangler state...${NC}"
if [ -n "$CONDUCTOR_ROOT_PATH" ] && [ -d "$CONDUCTOR_ROOT_PATH/.wrangler/state" ]; then
    echo -e "  Syncing .wrangler/state directory..."
    mkdir -p "./.wrangler"
    rsync -a --delete "$CONDUCTOR_ROOT_PATH/.wrangler/state/" "./.wrangler/state/"
    echo -e "${GREEN}✓ Synced .wrangler/state/${NC}"
else
    echo -e "${YELLOW}⚠ No .wrangler/state found in root, skipping${NC}"
fi
echo

# 5. Sync database
echo -e "${YELLOW}[5/6] Syncing database from main project...${NC}"
if [ -f "./scripts/sync-db-from-main.sh" ]; then
    if ./scripts/sync-db-from-main.sh; then
        echo -e "${GREEN}✓ Database synced${NC}"
    else
        echo -e "${YELLOW}⚠ Database sync had warnings (this may be okay for first setup)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ sync-db-from-main.sh not found, skipping database sync${NC}"
fi
echo

# 6. Build shared packages
echo -e "${YELLOW}[6/6] Building shared packages...${NC}"
if bun run build; then
    echo -e "${GREEN}✓ Packages built successfully${NC}"
else
    echo -e "${RED}✗ Warning: Build had errors${NC}"
    echo -e "${YELLOW}You may need to fix build errors before running the app${NC}"
fi
echo

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Workspace setup complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${BLUE}Next steps:${NC}"
echo -e "  • Run '${YELLOW}bun run dev${NC}' to start development servers"
echo -e "  • Check apps/mobile/.env.development for mobile configuration"
echo -e "  • Check packages/api/.dev.vars for API configuration"
echo
echo -e "${BLUE}Environment files synced:${NC}"
echo -e "  • API: .dev.vars, .env, local.db files"
echo -e "  • Mobile: .env.local, .env.development, .env.preview, .env.production"
echo -e "  • Web: .env.local"
echo -e "  • Wrangler: .wrangler/state directory"
echo
