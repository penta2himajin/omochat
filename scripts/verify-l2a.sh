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

free_port() {
  local port="$1"
  local pids
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      echo "verify-l2a: freeing :$port (pids: $pids)"
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
      sleep 0.3
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

kill_sim_leftovers() {
  # npx wraps the real binary; match both so macOS doesn't leave a panicking GUI app.
  pkill -f "evenhub-simulator.*--automation-port ${AUTOMATION_PORT}" 2>/dev/null || true
  pkill -f "sim-.*/bin/evenhub-simulator.*--automation-port ${AUTOMATION_PORT}" 2>/dev/null || true
}

cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
    # Kill process group when launched with setsid-like semantics (best-effort).
    kill -- -"$pid" 2>/dev/null || true
  done
  kill_sim_leftovers
  free_port "$AUTOMATION_PORT"
  wait 2>/dev/null || true
}
trap cleanup EXIT

echo "verify-l2a: clearing leftover simulator / ports"
kill_sim_leftovers
free_port "$AUTOMATION_PORT"
free_port "$VITE_PORT"
sleep 0.2

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

# Prefer the platform binary so cleanup has the real PID (npx is only a wrapper).
SIM_BIN=()
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "${PLATFORM}-${ARCH}" in
  darwin-arm64) SIM_PKG=sim-darwin-arm64 ;;
  darwin-x86_64|darwin-amd64) SIM_PKG=sim-darwin-x64 ;;
  linux-x86_64|linux-amd64) SIM_PKG=sim-linux-x64 ;;
  *) SIM_PKG="" ;;
esac
if [[ -n "$SIM_PKG" && -x "$ROOT/node_modules/@evenrealities/${SIM_PKG}/bin/evenhub-simulator" ]]; then
  SIM_BIN=("$ROOT/node_modules/@evenrealities/${SIM_PKG}/bin/evenhub-simulator")
else
  SIM_BIN=(npx --no-install evenhub-simulator)
fi
SIM_BIN+=("$APP_URL" --automation-port "$AUTOMATION_PORT")

if [[ "$(uname -s)" == "Linux" && -z "${DISPLAY:-}" ]]; then
  if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "verify-l2a: xvfb-run required on headless Linux (apt install xvfb)" >&2
    exit 1
  fi
  echo "verify-l2a: launching simulator under xvfb-run"
  SIM_BIN=(xvfb-run -a "${SIM_BIN[@]}")
else
  echo "verify-l2a: launching simulator (${SIM_BIN[0]})"
fi

"${SIM_BIN[@]}" >/tmp/omochat-sim-l2a.log 2>&1 &
PIDS+=($!)

echo "verify-l2a: running smoke against :${AUTOMATION_PORT}"
node "$ROOT/scripts/l2a-sim-smoke.mjs" --base "http://127.0.0.1:${AUTOMATION_PORT}"
echo "verify-l2a: OK"
