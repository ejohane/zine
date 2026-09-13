#!/bin/bash
set -euo pipefail
# Preserve recoverable local edits; only reset a stopped worktree.
bun run ./scripts/reset-local-data.mjs
