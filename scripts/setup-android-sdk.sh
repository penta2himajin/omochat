#!/usr/bin/env bash
# Idempotent Android SDK bootstrap for Cursor Cloud / Linux CI (L0–L1).
# On macOS desks, prefer an existing Android Studio SDK via ANDROID_SDK_ROOT.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$ROOT/.android-sdk}}"
SDK_ROOT="$DEFAULT_SDK"
ANDROID_DIR="$ROOT/companion/android"

mkdir -p "$SDK_ROOT"

if [[ ! -x "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]]; then
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "setup-android-sdk: cmdline-tools missing and host is not Linux."
    echo "Set ANDROID_SDK_ROOT to your Android Studio SDK, or run this on Cloud/Linux."
    exit 1
  fi
  echo "setup-android-sdk: downloading commandlinetools…"
  tmp="$(mktemp -d)"
  curl -fsSL \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
    -o "$tmp/cmdtools.zip"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  unzip -q "$tmp/cmdtools.zip" -d "$tmp"
  rm -rf "$SDK_ROOT/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
  rm -rf "$tmp"
fi

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export PATH="$SDK_ROOT/cmdline-tools/latest/bin:$SDK_ROOT/platform-tools:$PATH"

yes | sdkmanager --licenses >/dev/null || true
sdkmanager \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"

# Gradle reads sdk.dir from local.properties (gitignored).
props="$ANDROID_DIR/local.properties"
tavily_line=""
if [[ -f "$props" ]]; then
  tavily_line="$(grep '^tavily.api.key=' "$props" || true)"
fi
{
  echo "sdk.dir=${SDK_ROOT}"
  if [[ -n "$tavily_line" ]]; then
    echo "$tavily_line"
  fi
} >"${props}.tmp"
mv "${props}.tmp" "$props"

echo "setup-android-sdk: ready at $SDK_ROOT"
