#!/bin/bash
set -eu
sdk_version=$(xcrun --sdk iphoneos --show-sdk-version)
major=${sdk_version%%.*}
rest=${sdk_version#*.}
minor=${rest%%.*}
if [ "$major" -lt 27 ] || { [ "$major" -eq 27 ] && [ "$minor" -lt 1 ]; }; then
  echo 'error: Zine Next requires Xcode with the iOS 27.1 SDK or newer for full Duo support.' >&2
  exit 1
fi
