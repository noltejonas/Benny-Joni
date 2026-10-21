#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/opt/ruby/bin:/usr/local/opt/ruby/bin:$PATH"
export BUNDLE_GEMFILE="$REPO_DIR/ios/App/Gemfile"
export BUNDLE_PATH="${BUNDLE_PATH:-$REPO_DIR/ios/App/vendor/bundle}"
export FASTLANE_OPT_OUT_USAGE=1
export FASTLANE_SKIP_UPDATE_CHECK=1
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

cd "$REPO_DIR/ios/App"
exec bundle exec fastlane "$@"
