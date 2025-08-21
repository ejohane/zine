#!/bin/bash

# Script to share local database between git worktrees using symlinks
# This creates symlinks from worktrees to the main project's database

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Main project path
MAIN_PROJECT="/Users/erikjohansson/dev/2025/zine"
WORKTREES_DIR="$MAIN_PROJECT/.branches"

# Database paths in main project
MAIN_API_WRANGLER="$MAIN_PROJECT/packages/api/.wrangler"
MAIN_WEB_WRANGLER="$MAIN_PROJECT/apps/web/.wrangler"

echo -e "${GREEN}Database Sharing Setup for Git Worktrees${NC}"
echo "========================================="
echo

# Check if main database directories exist
if [ ! -d "$MAIN_API_WRANGLER/state" ]; then
    echo -e "${YELLOW}Warning: Main API database not found at $MAIN_API_WRANGLER/state${NC}"
    echo "Make sure to run the development server in the main project first."
fi

if [ ! -d "$MAIN_WEB_WRANGLER/state" ]; then
    echo -e "${YELLOW}Warning: Main web database not found at $MAIN_WEB_WRANGLER/state${NC}"
fi

# Function to setup symlinks for a worktree
setup_worktree_db() {
    local worktree_path="$1"
    local worktree_name=$(basename "$worktree_path")
    
    echo -e "${GREEN}Setting up database sharing for: $worktree_name${NC}"
    
    # API .wrangler directory
    local worktree_api_wrangler="$worktree_path/packages/api/.wrangler"
    
    if [ -d "$worktree_api_wrangler" ]; then
        # Backup existing state if it exists and is not a symlink
        if [ -d "$worktree_api_wrangler/state" ] && [ ! -L "$worktree_api_wrangler/state" ]; then
            echo "  Backing up existing API state directory..."
            mv "$worktree_api_wrangler/state" "$worktree_api_wrangler/state.backup.$(date +%Y%m%d_%H%M%S)"
        fi
        
        # Remove existing symlink if present
        if [ -L "$worktree_api_wrangler/state" ]; then
            rm "$worktree_api_wrangler/state"
        fi
        
        # Create symlink to main project's database
        ln -s "$MAIN_API_WRANGLER/state" "$worktree_api_wrangler/state"
        echo "  ✓ API database linked"
    else
        echo "  ⚠ API .wrangler directory not found, skipping"
    fi
    
    # Web .wrangler directory (if exists)
    local worktree_web_wrangler="$worktree_path/apps/web/.wrangler"
    
    if [ -d "$worktree_web_wrangler" ]; then
        # Backup existing state if it exists and is not a symlink
        if [ -d "$worktree_web_wrangler/state" ] && [ ! -L "$worktree_web_wrangler/state" ]; then
            echo "  Backing up existing web state directory..."
            mv "$worktree_web_wrangler/state" "$worktree_web_wrangler/state.backup.$(date +%Y%m%d_%H%M%S)"
        fi
        
        # Remove existing symlink if present
        if [ -L "$worktree_web_wrangler/state" ]; then
            rm "$worktree_web_wrangler/state"
        fi
        
        # Create symlink to main project's database
        ln -s "$MAIN_WEB_WRANGLER/state" "$worktree_web_wrangler/state"
        echo "  ✓ Web database linked"
    else
        echo "  ⚠ Web .wrangler directory not found, skipping"
    fi
    
    echo
}

# Process all worktrees or specific one
if [ "$1" = "--all" ] || [ -z "$1" ]; then
    # Process all worktrees
    if [ -d "$WORKTREES_DIR" ]; then
        for worktree in "$WORKTREES_DIR"/*; do
            if [ -d "$worktree" ]; then
                setup_worktree_db "$worktree"
            fi
        done
    else
        echo -e "${RED}Error: Worktrees directory not found at $WORKTREES_DIR${NC}"
        exit 1
    fi
elif [ "$1" = "--help" ]; then
    echo "Usage: $0 [OPTIONS] [WORKTREE_NAME]"
    echo
    echo "Options:"
    echo "  --all           Setup database sharing for all worktrees (default)"
    echo "  --help          Show this help message"
    echo
    echo "Examples:"
    echo "  $0                    # Setup for all worktrees"
    echo "  $0 --all              # Setup for all worktrees"
    echo "  $0 homepage-redesign  # Setup for specific worktree"
else
    # Process specific worktree
    SPECIFIC_WORKTREE="$WORKTREES_DIR/$1"
    if [ -d "$SPECIFIC_WORKTREE" ]; then
        setup_worktree_db "$SPECIFIC_WORKTREE"
    else
        echo -e "${RED}Error: Worktree '$1' not found at $SPECIFIC_WORKTREE${NC}"
        echo
        echo "Available worktrees:"
        ls -1 "$WORKTREES_DIR" 2>/dev/null || echo "  No worktrees found"
        exit 1
    fi
fi

echo -e "${GREEN}Database sharing setup complete!${NC}"
echo
echo "Note: All worktrees now share the same database with the main project."
echo "Any database changes will be reflected across all worktrees."
echo
echo "To revert back to independent databases, simply delete the symlinks:"
echo "  rm packages/api/.wrangler/state"
echo "  rm apps/web/.wrangler/state"