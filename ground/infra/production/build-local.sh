#!/usr/bin/env bash
# Build only on the local machine. Never logs in, uploads, or changes a server.
set -euo pipefail
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"
GROUND_ROOT="$(cd "$TASK_DIR/../.." && pwd)"
AGENT_ROOT="$(cd "$GROUND_ROOT/../mammoth-agent" && pwd)"
OUTPUT="${1:?Usage: build-local.sh /absolute/release/directory [--skip-images]}"
case "$OUTPUT" in /*) ;; *) echo 'Release directory must be absolute' >&2; exit 2;; esac
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
mkdir -p "$OUTPUT"
cp "$TASK_DIR/compose.yml" "$TASK_DIR/production.env.example" "$TASK_DIR/nginx-mmai.conf" "$TASK_DIR/proxy-common.conf" "$TASK_DIR/init-db.sh" "$OUTPUT/"
(cd "$GROUND_ROOT" && VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/shared build && VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/frontend build)
tar -C "$GROUND_ROOT/apps/frontend/dist" -czf "$OUTPUT/middle-web.tar.gz" .
if [[ "${2:-}" != '--skip-images' ]]; then
  docker build --platform "$PLATFORM" -f "$TASK_DIR/Dockerfile.api" -t "mmp-api:$RELEASE_ID" "$GROUND_ROOT"
  docker build --platform "$PLATFORM" \
    --build-arg "MMP_CLIENT_COMMIT_HASH=$(git -C "$AGENT_ROOT" rev-parse HEAD 2>/dev/null || echo 0000000)" \
    -f "$AGENT_ROOT/infra/production/Dockerfile" -t "mmp-web:$RELEASE_ID" "$AGENT_ROOT"
  docker save "mmp-api:$RELEASE_ID" | gzip > "$OUTPUT/mmp-api-image.tar.gz"
  docker save "mmp-web:$RELEASE_ID" | gzip > "$OUTPUT/mmp-web-image.tar.gz"
  printf 'MMP_API_IMAGE=mmp-api:%s\nMMP_WEB_IMAGE=mmp-web:%s\n' "$RELEASE_ID" "$RELEASE_ID" > "$OUTPUT/images.env"
fi
(cd "$OUTPUT" && shasum -a 256 ./*.tar.gz > SHA256SUMS)
printf 'Local release directory: %s\n' "$OUTPUT"
