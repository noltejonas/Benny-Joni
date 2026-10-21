#!/usr/bin/env bash
set -euo pipefail

ANDROID_REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${JAVA_HOME:-}" ]]; then
  for android_jdk in /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
    if [[ -x "$android_jdk/bin/java" ]]; then
      export JAVA_HOME="$android_jdk"
      break
    fi
  done
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  echo 'JDK 21 fehlt. JAVA_HOME setzen oder die Einrichtung in docs/launch/ANDROID.md durchführen.' >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

exec "$ANDROID_REPO_DIR/android/gradlew" -p "$ANDROID_REPO_DIR/android" "$@"
