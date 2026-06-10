#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$MOBILE_DIR" rev-parse --show-toplevel)"

BUILD_OUTPUT="$MOBILE_DIR/build/preview.ipa"
MAX_BUILD_ATTEMPTS="${MAX_BUILD_ATTEMPTS:-1}"
BUILD_ONLY=0
CHECK_ENV_ONLY=0

REQUIRED_PREVIEW_ENV_KEYS=(
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"
    "EXPO_PUBLIC_SPOTIFY_CLIENT_ID"
    "EXPO_PUBLIC_YOUTUBE_CLIENT_ID"
    "EXPO_PUBLIC_X_CLIENT_ID"
    "EXPO_PUBLIC_API_URL"
)

for arg in "$@"; do
    case "$arg" in
        --build-only)
            BUILD_ONLY=1
            ;;
        --check-env)
            CHECK_ENV_ONLY=1
            ;;
        *)
            echo -e "${RED}Error: Unknown argument '$arg'${NC}"
            exit 1
            ;;
    esac
done

find_main_worktree() {
    git -C "$REPO_ROOT" worktree list --porcelain | awk '
        /^worktree / { worktree = substr($0, 10) }
        /^branch refs\/heads\/main$/ { print worktree; exit }
    '
}

resolve_preview_env_file() {
    if [ -n "${ZINE_MOBILE_PREVIEW_ENV_FILE:-}" ]; then
        printf '%s\n' "$ZINE_MOBILE_PREVIEW_ENV_FILE"
        return
    fi

    if [ -f "$MOBILE_DIR/.env.preview" ]; then
        printf '%s\n' "$MOBILE_DIR/.env.preview"
        return
    fi

    local main_worktree
    main_worktree="$(find_main_worktree)"
    if [ -n "$main_worktree" ] && [ -f "$main_worktree/apps/mobile/.env.preview" ]; then
        printf '%s\n' "$main_worktree/apps/mobile/.env.preview"
    fi

    return 0
}

validate_preview_env_file() {
    local env_file="$1"
    local missing=()

    if [ -z "$env_file" ] || [ ! -f "$env_file" ]; then
        echo -e "${RED}Error: Missing preview env file.${NC}"
        echo -e "${YELLOW}Set ZINE_MOBILE_PREVIEW_ENV_FILE or create apps/mobile/.env.preview in this worktree or the main worktree.${NC}"
        exit 1
    fi

    for key in "${REQUIRED_PREVIEW_ENV_KEYS[@]}"; do
        local value
        value="$(
            grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$env_file" 2>/dev/null | \
                tail -n 1 | \
                sed -E 's/^[[:space:]]*(export[[:space:]]+)?[^=]+=//'
        )"
        if [ -z "$value" ]; then
            missing+=("$key")
        fi
    done

    if [ "${#missing[@]}" -gt 0 ]; then
        echo -e "${RED}Error: Preview env file is missing required keys:${NC}"
        printf '   - %s\n' "${missing[@]}"
        echo -e "${YELLOW}Preview builds embed these public values, so the build is blocked before EAS starts.${NC}"
        exit 1
    fi
}

find_available_device_uuid() {
    local devices_output
    devices_output="$(xcrun devicectl list devices 2>&1 || true)"

    local device_uuid
    device_uuid="$(
        printf '%s\n' "$devices_output" | awk '
            {
                for (i = 1; i <= NF; i++) {
                    if ($i ~ /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/ && $(i + 1) == "available") {
                        print $i
                        exit
                    }
                }
            }
        '
    )"

    if [ -z "$device_uuid" ]; then
        echo "$devices_output"
        echo -e "${RED}Error: No available iOS device found. Please connect/unlock your device and trust this computer.${NC}"
        echo -e "${YELLOW}Tip: The device must show as 'available' in xcrun devicectl list devices.${NC}"
        exit 1
    fi

    printf '%s\n' "$device_uuid"
}

echo -e "${YELLOW}=== iOS Preview Build & Install ===${NC}"

PREVIEW_ENV_FILE="$(resolve_preview_env_file)"
validate_preview_env_file "$PREVIEW_ENV_FILE"

echo -e "${GREEN}Using preview env: $PREVIEW_ENV_FILE${NC}"

if [ "$CHECK_ENV_ONLY" -eq 1 ]; then
    exit 0
fi

# Step 1: Build the IPA locally
echo -e "\n${GREEN}[1/3] Building iOS preview...${NC}"

BUILD_SUCCESS=0
for attempt in $(seq 1 "$MAX_BUILD_ATTEMPTS"); do
    echo -e "${YELLOW}Build attempt ${attempt}/${MAX_BUILD_ATTEMPTS}${NC}"

    rm -f "$BUILD_OUTPUT"
    mkdir -p "$(dirname "$BUILD_OUTPUT")"

    if env -u EXPO_PUBLIC_STORYBOOK_ENABLED EXPO_NO_DOTENV=1 dotenv -e "$PREVIEW_ENV_FILE" -- env EXPO_PUBLIC_API_URL=https://api.myzine.app eas build --platform ios --profile preview --local --output "$BUILD_OUTPUT" --non-interactive; then
        BUILD_SUCCESS=1
        break
    fi

    if [ "$attempt" -lt "$MAX_BUILD_ATTEMPTS" ]; then
        echo -e "${YELLOW}Build failed, retrying in 5 seconds...${NC}"
        sleep 5
    fi
done

if [ "$BUILD_SUCCESS" -ne 1 ]; then
    echo -e "${RED}Error: iOS preview build failed after ${MAX_BUILD_ATTEMPTS} attempts.${NC}"
    exit 1
fi

if [ ! -f "$BUILD_OUTPUT" ]; then
    echo -e "${RED}Error: Build output not found at $BUILD_OUTPUT${NC}"
    exit 1
fi

echo -e "${GREEN}Build complete: $BUILD_OUTPUT${NC}"

if [ "$BUILD_ONLY" -eq 1 ]; then
    exit 0
fi

# Step 2: Find connected device
echo -e "\n${GREEN}[2/3] Finding connected iOS device...${NC}"

DEVICE_UUID="$(find_available_device_uuid)"

echo -e "${GREEN}Found device: $DEVICE_UUID${NC}"

# Step 3: Install to device
echo -e "\n${GREEN}[3/3] Installing to device...${NC}"
xcrun devicectl device install app --device "$DEVICE_UUID" "$BUILD_OUTPUT"

echo -e "\n${GREEN}=== Installation complete! ===${NC}"
echo -e "${YELLOW}The app should now be available on your device.${NC}"
