#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}Setting up worktree environment...${NC}"
echo ""

echo -e "${YELLOW}Step 1: Syncing database from main project${NC}"
"$SCRIPT_DIR/sync-db-from-main.sh"
echo ""

echo -e "${YELLOW}Step 2: Syncing environment variables${NC}"
"$SCRIPT_DIR/sync-env-to-worktrees.sh"
echo ""

echo -e "${GREEN}Worktree environment setup complete!${NC}"
