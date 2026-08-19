#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${OMOCHAT_ANDROID_BUILD_IMAGE:-mingc/android-build-box:latest}"
PLATFORM="${OMOCHAT_ANDROID_PLATFORM:-linux/amd64}"

echo "Using OrbStack/Docker (context: $(docker context show)) image=$IMAGE platform=$PLATFORM"

docker pull "$IMAGE"

docker run --rm \
  --platform "$PLATFORM" \
  -v "$PWD":/project \
  -w /project \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    if [[ ! -x ./gradlew ]]; then
      echo "Bootstrapping Gradle wrapper…"
      curl -fsSL https://services.gradle.org/distributions/gradle-8.7-bin.zip -o /tmp/gradle-8.7-bin.zip
      unzip -q /tmp/gradle-8.7-bin.zip -d /tmp
      /tmp/gradle-8.7/bin/gradle wrapper --gradle-version 8.7
    fi
    chmod +x gradlew
    ./gradlew assembleDebug --no-daemon --stacktrace
  '

echo "APK: $PWD/app/build/outputs/apk/debug/app-debug.apk"
