#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_path="$repo_root/apps/ios/ZineNative.xcodeproj"
derived_data_path="$repo_root/.local-data/ios-simulator-preview-derived-data"
serve_sim_path="$repo_root/node_modules/.bin/serve-sim"
simulator_name="${ZINE_SIMULATOR_NAME:-iPhone 17 — Zine}"
simulator_udid="${ZINE_SIMULATOR_UDID:-}"
bundle_id="app.zine.native"
build_pid=""
serve_sim_pid=""

cleanup_serve_sim() {
  trap - EXIT INT TERM HUP
  if [[ -n "$build_pid" ]] && kill -0 "$build_pid" 2>/dev/null; then
    kill "$build_pid" 2>/dev/null || true
    wait "$build_pid" 2>/dev/null || true
  fi
  if [[ -n "$serve_sim_pid" ]] && kill -0 "$serve_sim_pid" 2>/dev/null; then
    kill "$serve_sim_pid" 2>/dev/null || true
    wait "$serve_sim_pid" 2>/dev/null || true
  fi
  if [[ -n "$simulator_udid" ]]; then
    "$serve_sim_path" --kill "$simulator_udid" >/dev/null 2>&1 || true
  fi
}

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "serve-sim requires an Apple Silicon Mac." >&2
  exit 1
fi

for command_name in node xcodebuild xcrun; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ ! -x "$serve_sim_path" ]]; then
  echo "serve-sim is not installed. Run 'bun install' from the repository root." >&2
  exit 1
fi

if [[ -z "$simulator_udid" ]]; then
  simulator_udid="$(node -e '
    const { execFileSync } = require("node:child_process");
    const requestedName = process.argv[1];
    const output = execFileSync(
      "xcrun",
      ["simctl", "list", "devices", "available", "--json"],
      { encoding: "utf8" },
    );
    const matches = Object.values(JSON.parse(output).devices)
      .flat()
      .filter((device) => device.name === requestedName);
    const selected = matches.find((device) => device.state === "Booted") ?? matches[0];
    if (selected) process.stdout.write(selected.udid);
  ' "$simulator_name")"
fi

if [[ -z "$simulator_udid" ]]; then
  echo "No available simulator named '$simulator_name'." >&2
  echo "Set ZINE_SIMULATOR_NAME or ZINE_SIMULATOR_UDID to an available iPhone Simulator." >&2
  exit 1
fi

if ! xcrun simctl list devices available | grep -Fq "$simulator_udid"; then
  echo "Simulator '$simulator_udid' is not available." >&2
  exit 1
fi

"$serve_sim_path" --kill "$simulator_udid" >/dev/null 2>&1 || true
trap cleanup_serve_sim EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

if ! xcrun simctl list devices booted | grep -Fq "$simulator_udid"; then
  xcrun simctl boot "$simulator_udid"
fi
xcrun simctl bootstatus "$simulator_udid" -b

if [[ "${ZINE_SKIP_IOS_BUILD:-0}" != "1" ]]; then
  xcodebuild \
    -project "$project_path" \
    -scheme ZineNative \
    -configuration Debug \
    -destination "platform=iOS Simulator,id=$simulator_udid" \
    -derivedDataPath "$derived_data_path" \
    -quiet \
    build &
  build_pid=$!
  wait "$build_pid"
  build_pid=""

  app_path="$derived_data_path/Build/Products/Debug-iphonesimulator/Zine Native.app"
  if [[ ! -d "$app_path" ]]; then
    echo "Expected simulator app was not built at '$app_path'." >&2
    exit 1
  fi
  xcrun simctl install "$simulator_udid" "$app_path"
fi

xcrun simctl launch --terminate-running-process "$simulator_udid" "$bundle_id"

echo "Starting the Zine simulator preview for $simulator_name ($simulator_udid)."
echo "Press Control-C to stop the preview and its Zine-scoped helper."
"$serve_sim_path" "$simulator_udid" --fit "$@" &
serve_sim_pid=$!
wait "$serve_sim_pid"
