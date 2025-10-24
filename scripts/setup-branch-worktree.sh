#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo -e "${RED}Error: Branch name is required${NC}"
  echo "Usage: $0 <branch-name>"
  exit 1
fi

BRANCH_NAME="$1"
WORKTREE_PATH=".branches/$BRANCH_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}Setting up worktree for branch: $BRANCH_NAME${NC}"
echo ""

echo -e "${YELLOW}Step 1: Creating git worktree${NC}"
git worktree add "$WORKTREE_PATH" "$BRANCH_NAME" || git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH"
echo ""

cd "$WORKTREE_PATH"

echo -e "${YELLOW}Step 2: Setting up worktree environment${NC}"
"$SCRIPT_DIR/setup-worktree-env.sh"
echo ""

echo -e "${YELLOW}Step 3: Installing dependencies${NC}"
bun install
echo ""

echo -e "${YELLOW}Step 4: Creating tmux session${NC}"
tmux new-session -d -s "$BRANCH_NAME" -c "$PWD"
echo ""

echo -e "${GREEN}Worktree setup complete!${NC}"
echo -e "${GREEN}Attach to tmux session: tmux attach -t $BRANCH_NAME${NC}"
