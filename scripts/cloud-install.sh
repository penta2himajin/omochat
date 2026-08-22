#!/usr/bin/env bash
# Cursor Cloud Build install — prepare L0/L1 toolchains (idempotent).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "cloud-install: npm ci"
npm ci

echo "cloud-install: Android SDK"
bash "$ROOT/scripts/setup-android-sdk.sh"

# Shared debug keystore is gitignored; generate a disposable one for assembleDebug.
KS="$ROOT/companion/android/omoserv-debug.keystore"
if [[ ! -f "$KS" ]]; then
  echo "cloud-install: generating omoserv-debug.keystore"
  keytool -genkeypair \
    -v \
    -keystore "$KS" \
    -storepass android \
    -keypass android \
    -alias androiddebugkey \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=omoserv-debug,O=omochat,C=JP" \
    -storetype pkcs12
fi

echo "cloud-install: warm Gradle unit tests"
(
  cd "$ROOT/companion/android"
  chmod +x ./gradlew
  ./gradlew testDebugUnitTest --no-daemon
)

echo "cloud-install: omochat vitest + typecheck"
npm test
npm run typecheck

echo "cloud-install: done"
