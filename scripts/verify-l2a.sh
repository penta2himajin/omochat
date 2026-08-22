#!/usr/bin/env bash
# L2a: Vite + evenhub-simulator automation smoke (no USB / glasses).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTOMATION_PORT="${AUTOMATION_PORT:-9898}"
VITE_PORT="${VITE_PORT:-5173}"
# Skip omoserv probe so simulator smoke does not depend on a phone API.
APP_URL="http://127.0.0.1:${VITE_PORT}/?companionProbe=0"

PIDS=()
cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Ensure simulator children die with the shell.
  wait 2>/dev/null || true
}
trap cleanup EXIT

echo "verify-l2a: starting Vite on :${VITE_PORT}"
npx vite --host 127.0.0.1 --port "$VITE_PORT" >/tmp/omochat-vite-l2a.log 2>&1 &
PIDS+=($!)

echo "verify-l2a: waiting for Vite…"
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${VITE_PORT}/" >/dev/null; then
    break
  fi
  sleep 0.5
done
curl -sf "http://127.0.0.1:${VITE_PORT}/" >/dev/null

SIM_BIN=(npx --no-install evenhub-simulator "$APP_URL" --automation-port "$AUTOMATION_PORT")
if [[ "$(uname -s)" == "Linux" && -z "${DISPLAY:-}" ]]; then
  if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "verify-l2a: xvfb-run required on headless Linux (apt install xvfb)" >&2
    exit 1
  fi
  echo "verify-l2a: launching simulator under xvfb-run"
  SIM_BIN=(xvfb-run -a "${SIM_BIN[@]}")
else
  echo "verify-l2a: launching simulator"
fi

"${SIM_BIN[@]}" >/tmp/omochat-sim-l2a.log 2>&1 &
PIDS+=($!)

echo "verify-l2a: running smoke against :${AUTOMATION_PORT}"
node "$ROOT/scripts/l2a-sim-smoke.mjs" --base "http://127.0.0.1:${AUTOMATION_PORT}"
echo "verify-l2a: OK"
