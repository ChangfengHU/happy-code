#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVER_PUBLIC_URL="${SERVER_PUBLIC_URL:-https://server.vyibc.com}"
WEB_PUBLIC_URL="${WEB_PUBLIC_URL:-https://web.vyibc.com}"
TUNNEL_NAME="${TUNNEL_NAME:-}"

if [[ -z "$TUNNEL_NAME" ]]; then
  echo "Set TUNNEL_NAME to your cloudflared tunnel name (the one with web/server hostnames)."
  echo "Example: TUNNEL_NAME=happy-dev $0"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found in PATH."
  exit 1
fi

PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

echo "Starting cloudflared tunnel: ${TUNNEL_NAME}"
cloudflared tunnel run "$TUNNEL_NAME" &
PIDS+=($!)

echo "Starting server (expects local Postgres/Redis running)..."
(cd "$ROOT_DIR/server" && yarn dev) &
PIDS+=($!)

echo "Starting web dev server..."
(cd "$ROOT_DIR/expo-app" && EXPO_PUBLIC_HAPPY_SERVER_URL="$SERVER_PUBLIC_URL" yarn web) &
PIDS+=($!)

echo "Starting CLI..."
cd "$ROOT_DIR/cli"
HAPPY_SERVER_URL="$SERVER_PUBLIC_URL" HAPPY_WEBAPP_URL="$WEB_PUBLIC_URL" yarn dev
