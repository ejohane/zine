#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_path="$repo_root/apps/ios/ZineNative.xcodeproj"
derived_data_path="$repo_root/.local-data/ios-simulator-derived-data"
simulator_name="${ZINE_SIMULATOR_NAME:-iPhone 17 — Zine}"
simulator_udid="${ZINE_SIMULATOR_UDID:-}"
bundle_id="app.zine.native"
build_pid=""
local_api_build_settings=()

case "${ZINE_LOCAL_API_URL:?Start with bun run dev:worktree to select a local API}" in
  http://*)
    local_api_authority="${ZINE_LOCAL_API_URL#http://}"
    local_api_authority="${local_api_authority%%/*}"
    local_api_host="${local_api_authority%%:*}"
    local_api_build_settings+=(
      "INFOPLIST_PREPROCESSOR_DEFINITIONS=\$(inherited) ZINE_ALLOW_INSECURE_LOCAL_API=1 ZINE_ATS_EXCEPTION_DOMAIN=$local_api_host"
    )
    ;;
esac

cleanup_build() {
  trap - EXIT INT TERM HUP
  if [[ -n "$build_pid" ]] && kill -0 "$build_pid" 2>/dev/null; then
    kill "$build_pid" 2>/dev/null || true
    wait "$build_pid" 2>/dev/null || true
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The iOS Simulator requires macOS and Xcode." >&2
  exit 1
fi

for command_name in node xcodebuild xcrun; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

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

if ! xcrun simctl list devices available | grep -F "$simulator_udid" >/dev/null; then
  echo "Simulator '$simulator_udid' is not available." >&2
  exit 1
fi

trap cleanup_build EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

if ! xcrun simctl list devices booted | grep -F "$simulator_udid" >/dev/null; then
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
    "ZINE_API_BASE_URL=${ZINE_LOCAL_API_URL:?Start with bun run dev:worktree to select a local API}" \
    "${local_api_build_settings[@]}" \
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

installed_app_path="$(xcrun simctl get_app_container "$simulator_udid" "$bundle_id" app)"
installed_api_url="$(/usr/libexec/PlistBuddy -c 'Print :ZINEAPIBaseURL' "$installed_app_path/Info.plist")"
if [[ "$installed_api_url" != "${ZINE_LOCAL_API_URL:?Start with bun run dev:worktree}" ]]; then
  echo "Installed app API does not match this local stack. Rebuild without ZINE_SKIP_IOS_BUILD." >&2
  exit 1
fi
echo "Verified installed native API: $installed_api_url"
installed_extension_api_url="$(/usr/libexec/PlistBuddy -c 'Print :ZINEAPIBaseURL' "$installed_app_path/PlugIns/Zine.appex/Info.plist")"
if [[ "$installed_extension_api_url" != "${ZINE_LOCAL_API_URL:?Start with bun run dev:worktree}" ]]; then
  echo "Installed share extension API does not match this local stack. Rebuild without ZINE_SKIP_IOS_BUILD." >&2
  exit 1
fi
echo "Verified installed share extension API: $installed_extension_api_url"
xcrun simctl launch --terminate-running-process "$simulator_udid" "$bundle_id"

open -a Simulator --args -CurrentDeviceUDID "$simulator_udid"
echo "Zine is running in Apple Simulator: $simulator_name ($simulator_udid)."
echo "Use computer use directly in the Simulator app for login and UI verification."
