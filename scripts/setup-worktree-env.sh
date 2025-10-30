#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}Setting up worktree environment...${NC}"
echo ""

echo -e "${YELLOW}Step 1: Configuring port offset${NC}"
# Get the current directory name (branch name)
CURRENT_DIR=$(basename "$PWD")

# Calculate a deterministic port offset from the branch name
# Use a simple hash function: sum of ASCII values mod 90, then multiply by 10
# This gives us offsets like 0, 10, 20, 30... up to 890
PORT_OFFSET=0
if [ "$CURRENT_DIR" != "zine" ]; then
  # Calculate hash
  HASH=$(echo -n "$CURRENT_DIR" | cksum | cut -d' ' -f1)
  PORT_OFFSET=$(( (HASH % 90 + 1) * 10 ))
fi

# Create .env.worktree file with port configuration
cat > .env.worktree << EOF
# Auto-generated port configuration for worktree: $CURRENT_DIR
# Generated on: $(date)
PORT_OFFSET=$PORT_OFFSET

# Calculated ports:
# API (Wrangler): $((8787 + PORT_OFFSET))
# Web (Vite): $((3000 + PORT_OFFSET))
# Mobile (Expo Metro): $((8081 + PORT_OFFSET))
# Mobile (Expo Dev Server): $((19000 + PORT_OFFSET))
EOF

echo -e "${GREEN}✓ Port offset set to: $PORT_OFFSET${NC}"
echo -e "${GREEN}  API will use port: $((8787 + PORT_OFFSET))${NC}"
echo -e "${GREEN}  Web will use port: $((3000 + PORT_OFFSET))${NC}"
echo -e "${GREEN}  Expo Metro will use port: $((8081 + PORT_OFFSET))${NC}"
echo ""

echo -e "${YELLOW}Step 2: Syncing database from main project${NC}"
"$SCRIPT_DIR/sync-db-from-main.sh"
echo ""

echo -e "${YELLOW}Step 3: Syncing environment variables${NC}"
"$SCRIPT_DIR/sync-env-to-worktrees.sh"
echo ""

echo -e "${GREEN}Worktree environment setup complete!${NC}"
