#!/usr/bin/env bash
echo '旧版 Octop 发布入口已停用，请使用 ground/infra/production/build-local.sh 和生产交接文档。' >&2
exit 1
# release-baota-mid.sh — 中台快发主编排（镜像密保：本地 build → save → 宝塔 load）
# 用法:
#   ./release-baota-mid.sh [--api] [--octop] [--web] [--all]
#                          [--track fast|freeze] [--dry-run]
#                          [--expect-version x.y.z] [--skip-smoke]
# P0:
#   - 禁止 rsync ground/Octop 源码到宝塔
#   - 禁止在宝塔上 docker compose build
#   - 本地（或 CI）docker build --platform linux/amd64 → save/gzip → scp → load → up
#   - 前端仅同步 dist → /www/mammoth/web
#   - 末尾必跑 smoke（--skip-smoke 仅应急）
set -euo pipefail

SSH_HOST="${BAOTA_SSH_HOST:-root@124.223.179.250}"
REMOTE_ROOT="${BAOTA_REMOTE_ROOT:-/www/mammoth}"
DOCKER_PLATFORM="${BAOTA_DOCKER_PLATFORM:-linux/amd64}"
API_IMAGE="${BAOTA_API_IMAGE:-mammoth-api:local}"
OCTOP_IMAGE="${BAOTA_OCTOP_IMAGE:-mammoth-octop:local}"
TRACK="fast"
DRY_RUN=0
DO_API=0
DO_OCTOP=0
DO_WEB=0
EXPLICIT=0
EXPECT_VERSION=""
SKIP_SMOKE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) DO_API=1; EXPLICIT=1; shift ;;
    --octop) DO_OCTOP=1; EXPLICIT=1; shift ;;
    --web) DO_WEB=1; EXPLICIT=1; shift ;;
    --all) DO_API=1; DO_OCTOP=1; DO_WEB=1; EXPLICIT=1; shift ;;
    --track) TRACK="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --expect-version) EXPECT_VERSION="${2:-}"; shift 2 ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    -h|--help)
      sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROUND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM_ROOT="$(cd "$GROUND_ROOT/.." && pwd)"

if [[ "$TRACK" == "freeze" ]]; then
  RELEASE_ROOT="${MM_RELEASE_ROOT:-$HOME/Documents/code/mm-release-1.0}"
  PLATFORM_ROOT="$RELEASE_ROOT"
fi
GROUND_DIR="$PLATFORM_ROOT/ground"
OCTOP_DIR="$PLATFORM_ROOT/Octop"
DF_API="$GROUND_DIR/infra/baota/Dockerfile.api"
DF_OCTOP="$GROUND_DIR/infra/baota/Dockerfile.octop"

START_TS="$(date +%s)"
elapsed() { echo "$(( $(date +%s) - START_TS ))s"; }

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: $*"
  else
    echo "+ $*"
    eval "$@"
  fi
}

echo "== release-baota-mid track=$TRACK dry_run=$DRY_RUN platform=$DOCKER_PLATFORM =="
echo "PLATFORM_ROOT=$PLATFORM_ROOT"
echo "密保: 不 rsync 源码；不在宝塔 build；只传镜像 + web dist"

# 0) preflight
PRE_ARGS=(--track "$TRACK")
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY-RUN: would run $SCRIPT_DIR/preflight-baota.sh ${PRE_ARGS[*]}"
else
  "$SCRIPT_DIR/preflight-baota.sh" "${PRE_ARGS[@]}"
fi

# 推断改动范围
suggest_flags() {
  local need_api=0 need_octop=0 need_web=0
  if git -C "$GROUND_DIR" rev-parse --abbrev-ref HEAD >/dev/null 2>&1; then
    local br base
    br="$(git -C "$GROUND_DIR" rev-parse --abbrev-ref HEAD)"
    if git -C "$GROUND_DIR" rev-parse --verify "origin/$br" >/dev/null 2>&1; then
      base="origin/$br"
      if git -C "$GROUND_DIR" diff --name-only "$base"...HEAD 2>/dev/null | grep -qE '^(apps/backend|packages/|prisma/|infra/)'; then
        need_api=1
      fi
      if git -C "$GROUND_DIR" diff --name-only "$base"...HEAD 2>/dev/null | grep -qE '^apps/frontend/'; then
        need_web=1
      fi
      if git -C "$GROUND_DIR" status --porcelain 2>/dev/null | grep -qE 'apps/backend|packages/|prisma/|infra/'; then need_api=1; fi
      if git -C "$GROUND_DIR" status --porcelain 2>/dev/null | grep -qE 'apps/frontend/'; then need_web=1; fi
    fi
  fi
  if git -C "$OCTOP_DIR" rev-parse --abbrev-ref HEAD >/dev/null 2>&1; then
    local obr
    obr="$(git -C "$OCTOP_DIR" rev-parse --abbrev-ref HEAD)"
    if git -C "$OCTOP_DIR" rev-parse --verify "origin/$obr" >/dev/null 2>&1; then
      if git -C "$OCTOP_DIR" diff --name-only "origin/$obr"...HEAD 2>/dev/null | grep -q .; then
        need_octop=1
      fi
      if git -C "$OCTOP_DIR" status --porcelain 2>/dev/null | grep -q .; then need_octop=1; fi
    else
      if git -C "$OCTOP_DIR" status --porcelain 2>/dev/null | grep -q .; then need_octop=1; fi
    fi
  fi
  echo "$need_api $need_octop $need_web"
}

if [[ "$EXPLICIT" -eq 0 ]]; then
  read -r SUG_API SUG_OCTOP SUG_WEB <<<"$(suggest_flags)"
  echo "相对 origin 推断: api=$SUG_API octop=$SUG_OCTOP web=$SUG_WEB"
  if [[ "$SUG_API$SUG_OCTOP$SUG_WEB" == "000" ]]; then
    echo "ERROR: 无法判断改动范围。请显式传 --api / --octop / --web / --all" >&2
    exit 2
  fi
  DO_API=$SUG_API
  DO_OCTOP=$SUG_OCTOP
  DO_WEB=$SUG_WEB
fi

if [[ "$DO_OCTOP" -eq 1 ]]; then
  echo "WARN: Octop 已废弃，忽略 --octop / --all 中的 octop 构建" >&2
  DO_OCTOP=0
fi
echo "将执行: api=$DO_API octop=$DO_OCTOP(已停) web=$DO_WEB"
echo "耗时标记 T0 preflight done @ $(elapsed)"

stamp_prev() {
  local image="$1"
  local tag
  tag="prev-$(date +%Y%m%d-%H%M%S)"
  run "ssh -o BatchMode=yes \"$SSH_HOST\" \"docker image inspect $image >/dev/null 2>&1 && docker tag $image ${image%%:*}:$tag || true\""
}

push_image() {
  local image="$1"
  local safe
  safe="$(echo "$image" | tr '/:' '__')"
  local local_tar remote_tar
  local_tar="${TMP_BUNDLE}/${safe}.tar.gz"
  remote_tar="/tmp/${safe}.tar.gz"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: docker save $image | gzip > $local_tar"
    echo "DRY-RUN: scp $local_tar $SSH_HOST:$remote_tar"
    echo "DRY-RUN: ssh load $image from $remote_tar"
    return 0
  fi

  stamp_prev "$image"
  echo "-- docker save $image --"
  docker save "$image" | gzip -1 > "$local_tar"
  ls -lh "$local_tar"
  echo "-- scp → $SSH_HOST:$remote_tar --"
  scp -o BatchMode=yes "$local_tar" "$SSH_HOST:$remote_tar"
  echo "-- docker load on remote --"
  ssh -o BatchMode=yes "$SSH_HOST" \
    "set -euo pipefail; gunzip -c '$remote_tar' | docker load; rm -f '$remote_tar'; docker image inspect '$image' >/dev/null"
  rm -f "$local_tar"
}

# 1) 本地 build（禁止传到宝塔源码）
TMP_BUNDLE="$(mktemp -d "${TMPDIR:-/tmp}/baota-mid.XXXXXX")"
cleanup_tmp() { rm -rf "$TMP_BUNDLE"; }
trap cleanup_tmp EXIT

if [[ "$DO_API" -eq 1 ]]; then
  echo "-- local docker build api ($DOCKER_PLATFORM) --"
  if [[ ! -f "$DF_API" ]]; then
    echo "ERROR: 缺少 $DF_API" >&2
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: docker build --platform $DOCKER_PLATFORM -f $DF_API -t $API_IMAGE $GROUND_DIR"
  else
    if [[ "${BAOTA_FORCE_NO_CACHE:-0}" == "1" ]]; then
      echo "WARN BAOTA_FORCE_NO_CACHE=1"
      docker build --no-cache --platform "$DOCKER_PLATFORM" -f "$DF_API" -t "$API_IMAGE" "$GROUND_DIR"
    else
      docker build --platform "$DOCKER_PLATFORM" -f "$DF_API" -t "$API_IMAGE" "$GROUND_DIR"
    fi
  fi
  push_image "$API_IMAGE"
fi

if [[ "$DO_OCTOP" -eq 1 ]]; then
  echo "-- local docker build octop ($DOCKER_PLATFORM) --"
  if [[ ! -f "$DF_OCTOP" ]]; then
    echo "ERROR: 缺少 $DF_OCTOP" >&2
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: docker build --platform $DOCKER_PLATFORM -f $DF_OCTOP -t $OCTOP_IMAGE $OCTOP_DIR"
  else
    if [[ "${BAOTA_FORCE_NO_CACHE:-0}" == "1" ]]; then
      echo "WARN BAOTA_FORCE_NO_CACHE=1"
      docker build --no-cache --platform "$DOCKER_PLATFORM" -f "$DF_OCTOP" -t "$OCTOP_IMAGE" "$OCTOP_DIR"
    else
      docker build --platform "$DOCKER_PLATFORM" -f "$DF_OCTOP" -t "$OCTOP_IMAGE" "$OCTOP_DIR"
    fi
  fi
  push_image "$OCTOP_IMAGE"
fi
echo "耗时标记 T1 images transferred @ $(elapsed)"

# 2) 同步 compose 模板（无 build:；不含源码）
echo "-- sync image-only docker-compose.yml --"
run "rsync -az \"$SCRIPT_DIR/docker-compose.yml\" \"$SSH_HOST:$REMOTE_ROOT/docker-compose.yml\""

# 3) web dist only
if [[ "$DO_WEB" -eq 1 ]]; then
  echo "-- 本地 frontend build + rsync web dist only --"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: cd $GROUND_DIR && pnpm --filter @mammoth/frontend build"
    echo "DRY-RUN: rsync dist → $REMOTE_ROOT/web/"
  else
    (cd "$GROUND_DIR" && pnpm --filter @mammoth/frontend build)
    rsync -az --delete "$GROUND_DIR/apps/frontend/dist/" "$SSH_HOST:$REMOTE_ROOT/web/"
  fi
fi
echo "耗时标记 T2 web/compose done @ $(elapsed)"

# 4) up -d（只用已 load 的 tag；禁止 --build）
UP_SERVICES=()
[[ "$DO_API" -eq 1 ]] && UP_SERVICES+=(api)
[[ "$DO_OCTOP" -eq 1 ]] && UP_SERVICES+=(octop)
if [[ ${#UP_SERVICES[@]} -gt 0 ]]; then
  echo "-- docker compose up -d ${UP_SERVICES[*]} (no --build) --"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: ssh up -d ${UP_SERVICES[*]}"
  else
    ssh -o BatchMode=yes "$SSH_HOST" "cd $REMOTE_ROOT && docker compose up -d ${UP_SERVICES[*]}"
    if [[ "$DO_API" -eq 1 ]]; then
      ssh -o BatchMode=yes "$SSH_HOST" 'docker exec mammoth-api npx prisma migrate status' || true
    fi
  fi
fi
echo "耗时标记 T3 up done @ $(elapsed)"

# 5) smoke
if [[ "$SKIP_SMOKE" -eq 1 ]]; then
  echo "WARN --skip-smoke：应急跳过；Skill 写死常态必须 smoke"
  echo "-- skip smoke --"
elif [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY-RUN: would run smoke-baota.sh（含 assert-latest-json）"
else
  sleep 3
  SMOKE_ARGS=()
  if [[ -z "$EXPECT_VERSION" ]]; then
    if [[ -x "$SCRIPT_DIR/resolve-mammoth-version.sh" ]]; then
      EXPECT_VERSION="$("$SCRIPT_DIR/resolve-mammoth-version.sh")"
    elif [[ -f "$GROUND_ROOT/config/version.json" ]]; then
      EXPECT_VERSION="$(python3 -c "import json; print(json.load(open('$GROUND_ROOT/config/version.json'))['version'])")"
    fi
    [[ -n "$EXPECT_VERSION" ]] && echo "smoke --expect-version 默认 SSOT: $EXPECT_VERSION"
  fi
  [[ -n "$EXPECT_VERSION" ]] && SMOKE_ARGS+=(--expect-version "$EXPECT_VERSION")
  "$SCRIPT_DIR/smoke-baota.sh" "${SMOKE_ARGS[@]+"${SMOKE_ARGS[@]}"}"
fi

TOTAL="$(elapsed)"
echo "== release-baota-mid DONE total=$TOTAL (目标 ≤20min / 1200s) =="
echo "提醒: 宝塔盘禁止保留 /www/mammoth/src 与 /www/mammoth/Octop 明文源码；见 cleanup-baota-source-trees.sh"
