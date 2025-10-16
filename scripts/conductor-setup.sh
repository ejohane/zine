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
echo -e "${YELLOW}[1/5] Checking for bun...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${RED}✗ Error: bun is not installed${NC}"
    echo -e "${RED}Please install bun first: https://bun.sh${NC}"
    exit 1
fi
echo -e "${GREEN}✓ bun found: $(bun --version)${NC}"
echo

# 2. Install dependencies
echo -e "${YELLOW}[2/5] Installing dependencies...${NC}"
if ! bun install; then
    echo -e "${RED}✗ Error: Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo

# 3. Setup environment files
echo -e "${YELLOW}[3/5] Setting up environment files...${NC}"

# Check if root has env files to link
if [ -n "$CONDUCTOR_ROOT_PATH" ] && [ -d "$CONDUCTOR_ROOT_PATH" ]; then
    # Mobile app env files
    if [ -f "$CONDUCTOR_ROOT_PATH/apps/mobile/.env.development" ]; then
        ln -sf "$CONDUCTOR_ROOT_PATH/apps/mobile/.env.development" "apps/mobile/.env.development"
        echo -e "${GREEN}✓ Linked apps/mobile/.env.development${NC}"
    else
        echo -e "${YELLOW}⚠ No .env.development found in root (apps/mobile/.env.development)${NC}"
        echo -e "${YELLOW}  You may need to create this file manually${NC}"
    fi

    # API .dev.vars
    if [ -f "$CONDUCTOR_ROOT_PATH/packages/api/.dev.vars" ]; then
        ln -sf "$CONDUCTOR_ROOT_PATH/packages/api/.dev.vars" "packages/api/.dev.vars"
        echo -e "${GREEN}✓ Linked packages/api/.dev.vars${NC}"
    else
        echo -e "${YELLOW}⚠ No .dev.vars found in root (packages/api/.dev.vars)${NC}"
        echo -e "${YELLOW}  You may need to create this file manually${NC}"
    fi
else
    echo -e "${YELLOW}⚠ CONDUCTOR_ROOT_PATH not set or not found${NC}"
    echo -e "${YELLOW}  Skipping environment file linking${NC}"
fi
echo

# 4. Sync database
echo -e "${YELLOW}[4/5] Syncing database from main project...${NC}"
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

# 5. Build shared packages
echo -e "${YELLOW}[5/5] Building shared packages...${NC}"
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
