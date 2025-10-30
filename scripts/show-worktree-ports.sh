#!/bin/bash

# Script to display port assignments for all worktrees
# Shows which ports each branch is using for dev servers

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

MAIN_DIR="/Users/erikjohansson/dev/2025/zine"
WORKTREE_BASE="$MAIN_DIR/.branches"

echo -e "${BLUE}=== Worktree Port Assignments ===${NC}"
echo ""

# Function to calculate port offset for a branch name
calculate_offset() {
  local branch_name="$1"
  if [ "$branch_name" == "main" ] || [ "$branch_name" == "zine" ]; then
    echo "0"
  else
    local hash=$(echo -n "$branch_name" | cksum | cut -d' ' -f1)
    echo $(( (hash % 90 + 1) * 10 ))
  fi
}

# Show main branch ports
echo -e "${GREEN}Main branch (zine)${NC}"
echo -e "  ${CYAN}API (Wrangler):${NC}    8787"
echo -e "  ${CYAN}Web (Vite):${NC}        3000"
echo -e "  ${CYAN}Expo Metro:${NC}        8081"
echo -e "  ${CYAN}Expo Dev Server:${NC}   19000"
echo ""

# Check if worktree directory exists
if [ ! -d "$WORKTREE_BASE" ]; then
  echo -e "${YELLOW}No worktree directory found${NC}"
  exit 0
fi

# Get list of worktree directories
WORKTREES=$(find "$WORKTREE_BASE" -maxdepth 1 -type d -not -path "$WORKTREE_BASE" | sort)

if [ -z "$WORKTREES" ]; then
  echo -e "${YELLOW}No worktree folders found${NC}"
  exit 0
fi

# Show each worktree's ports
echo "$WORKTREES" | while read -r worktree; do
  if [ -z "$worktree" ]; then
    continue
  fi
  
  branch_name=$(basename "$worktree")
  
  # Check if .env.worktree exists
  if [ -f "$worktree/.env.worktree" ]; then
    # Read PORT_OFFSET from .env.worktree
    port_offset=$(grep "^PORT_OFFSET=" "$worktree/.env.worktree" | cut -d'=' -f2)
  else
    # Calculate what it would be
    port_offset=$(calculate_offset "$branch_name")
  fi
  
  api_port=$((8787 + port_offset))
  web_port=$((3000 + port_offset))
  metro_port=$((8081 + port_offset))
  expo_port=$((19000 + port_offset))
  
  echo -e "${GREEN}Branch: $branch_name${NC} ${YELLOW}(offset: $port_offset)${NC}"
  echo -e "  ${CYAN}API (Wrangler):${NC}    $api_port"
  echo -e "  ${CYAN}Web (Vite):${NC}        $web_port"
  echo -e "  ${CYAN}Expo Metro:${NC}        $metro_port"
  echo -e "  ${CYAN}Expo Dev Server:${NC}   $expo_port"
  
  # Check if any dev servers are running on these ports
  if lsof -Pi :$api_port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ API server running${NC}"
  fi
  if lsof -Pi :$web_port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Web server running${NC}"
  fi
  if lsof -Pi :$metro_port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Expo Metro running${NC}"
  fi
  
  echo ""
done

echo -e "${BLUE}===================================${NC}"
echo ""
echo "To run dev servers for a specific worktree:"
echo "  cd $WORKTREE_BASE/<branch-name>"
echo "  bun dev"
