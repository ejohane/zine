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

echo -e "${YELLOW}Tearing down worktree for branch: $BRANCH_NAME${NC}"
echo ""

# Check if worktree exists
if [ ! -d "$WORKTREE_PATH" ]; then
  echo -e "${RED}Error: Worktree directory $WORKTREE_PATH does not exist${NC}"
  exit 1
fi

# Step 1: Kill tmux session if it exists
echo -e "${YELLOW}Step 1: Killing tmux session${NC}"
if tmux has-session -t "$BRANCH_NAME" 2>/dev/null; then
  tmux kill-session -t "$BRANCH_NAME"
  echo -e "${GREEN}Tmux session '$BRANCH_NAME' killed${NC}"
else
  echo -e "${YELLOW}No tmux session found for '$BRANCH_NAME'${NC}"
fi
echo ""

# Step 2: Remove git worktree
echo -e "${YELLOW}Step 2: Removing git worktree${NC}"
git worktree remove "$WORKTREE_PATH" --force
echo -e "${GREEN}Worktree removed${NC}"
echo ""

# Step 3: Prune worktree references
echo -e "${YELLOW}Step 3: Pruning worktree references${NC}"
git worktree prune
echo ""

echo -e "${GREEN}Worktree teardown complete!${NC}"
echo -e "${YELLOW}Note: Branch '$BRANCH_NAME' still exists in git. To delete it, run:${NC}"
echo -e "${YELLOW}  git branch -d $BRANCH_NAME  (safe delete)${NC}"
echo -e "${YELLOW}  git branch -D $BRANCH_NAME  (force delete)${NC}"
