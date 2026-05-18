#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bundle >/dev/null 2>&1; then
  echo "Bundler is required. Install it with: gem install bundler" >&2
  exit 1
fi

export BUNDLE_PATH="${BUNDLE_PATH:-vendor/bundle}"
export FASTLANE_SKIP_UPDATE_CHECK="${FASTLANE_SKIP_UPDATE_CHECK:-1}"

if ! bundle check >/dev/null 2>&1; then
  bundle install
fi

bundle exec fastlane ios local_testflight
