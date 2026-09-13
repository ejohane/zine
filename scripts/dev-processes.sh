#!/bin/bash
# Shared lifecycle for the worktree orchestrator and its focused process test.
PROXY_PID=""
IOS_PREVIEW_PID=""
SERVICES_PID=""

collect_process_tree() {
  local root_pid=$1 child_pid
  echo "$root_pid"
  for child_pid in $(pgrep -P "$root_pid" 2>/dev/null || true); do
    collect_process_tree "$child_pid"
  done
}

stop_process_tree() {
  local root_pid=$1
  local process_ids=()
  local process_id
  if [ -z "$root_pid" ]; then return; fi
  # Snapshot descendants before signaling their parent; Bun/Turbo may each
  # create a separate process group. Never match processes by name or port.
  while read -r process_id; do
    process_ids+=("$process_id")
  done < <(collect_process_tree "$root_pid")
  kill -TERM "${process_ids[@]}" 2>/dev/null || true
  wait "$root_pid" 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM HUP
  stop_process_tree "$SERVICES_PID"
  stop_process_tree "$IOS_PREVIEW_PID"
  stop_process_tree "$PROXY_PID"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
