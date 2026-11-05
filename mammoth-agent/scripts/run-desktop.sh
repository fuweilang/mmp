#!/usr/bin/env bash
# One-shot local desktop launcher (sets Electron mirror/cache).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
# Node fetch must honor the same proxy as Electron downloads.
export NODE_USE_ENV_PROXY="${NODE_USE_ENV_PROXY:-1}"
export MMP_RESOURCE_DOWNLOAD_TIMEOUT_MS="${MMP_RESOURCE_DOWNLOAD_TIMEOUT_MS:-30000}"
export ELECTRON_CACHE="${ELECTRON_CACHE:-$HOME/.cache/electron}"
mkdir -p "$ELECTRON_CACHE"

ELECTRON_DIR="$ROOT/apps/desktop/node_modules/electron"
ELECTRON_BIN="$ELECTRON_DIR/dist/Electron.app/Contents/MacOS/Electron"
if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Electron binary missing; installing via mirror..."
  if [[ ! -f "$ELECTRON_DIR/install.js" ]]; then
    pnpm --filter @mammoth-ai/mmp-desktop add -D electron@44.7.0
  fi
  (cd "$ELECTRON_DIR" && node install.js)
fi

# HTTP diagnostics: stdout `[http] ...` + "$MMP_HOME/logs/http.log" (set MMP_HTTP_LOG=0 to disable).
export MMP_HTTP_LOG="${MMP_HTTP_LOG:-1}"
echo "desktop: HTTP log file -> ${MMP_HOME:-$HOME/.mmp}/logs/http.log"

MODE="${1:-start}"
case "$MODE" in
  start|--start|"")
    exec pnpm --filter @mammoth-ai/mmp-desktop run start
    ;;
  build|--build|dev|--dev)
    exec pnpm --filter @mammoth-ai/mmp-desktop run dev
    ;;
  *)
    echo "usage: $0 [start|build]" >&2
    exit 2
    ;;
esac
