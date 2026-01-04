#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BUILD_OUTPUT="./build/preview.ipa"

echo -e "${YELLOW}=== iOS Preview Build & Install ===${NC}"

# Step 1: Build the IPA
echo -e "\n${GREEN}[1/3] Building iOS preview...${NC}"
bun run build:ios:preview

# Verify build output exists
if [ ! -f "$BUILD_OUTPUT" ]; then
    echo -e "${RED}Error: Build output not found at $BUILD_OUTPUT${NC}"
    exit 1
fi

echo -e "${GREEN}Build complete: $BUILD_OUTPUT${NC}"

# Step 2: Find connected device
echo -e "\n${GREEN}[2/3] Finding connected iOS device...${NC}"

# Get device info as JSON and parse it
DEVICE_INFO=$(xcrun devicectl list devices --json-output /dev/stdout 2>/dev/null | grep -v "^{" | head -1 || true)

if [ -z "$DEVICE_INFO" ]; then
    # Fallback: try to get device list and parse
    DEVICES_OUTPUT=$(xcrun devicectl list devices 2>&1)
    echo "$DEVICES_OUTPUT"
    
    # Extract UUID from output (looking for connected devices)
    DEVICE_UUID=$(echo "$DEVICES_OUTPUT" | grep -E "^\s+[A-F0-9-]{36}" | head -1 | awk '{print $1}')
    
    if [ -z "$DEVICE_UUID" ]; then
        echo -e "${RED}Error: No iOS device found. Please connect your device and trust this computer.${NC}"
        echo -e "${YELLOW}Tip: Make sure your device is unlocked and you've tapped 'Trust' on the device.${NC}"
        exit 1
    fi
fi

# Try to get device UUID using simpler parsing
DEVICE_UUID=$(xcrun devicectl list devices 2>&1 | grep -oE "[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}" | head -1)

if [ -z "$DEVICE_UUID" ]; then
    echo -e "${RED}Error: Could not find device UUID. Please check device connection.${NC}"
    xcrun devicectl list devices
    exit 1
fi

echo -e "${GREEN}Found device: $DEVICE_UUID${NC}"

# Step 3: Install to device
echo -e "\n${GREEN}[3/3] Installing to device...${NC}"
xcrun devicectl device install app --device "$DEVICE_UUID" "$BUILD_OUTPUT"

echo -e "\n${GREEN}=== Installation complete! ===${NC}"
echo -e "${YELLOW}The app should now be available on your device.${NC}"
