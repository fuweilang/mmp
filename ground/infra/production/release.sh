#!/usr/bin/env bash
# 猛犸宝塔一键发版：只发布 www.mmai.vip / /www/mmp-prod。
# 详细规则见 .opencode/skills/baota-release/SKILL.md。
#
# 用法：
#   ./release.sh                     # 全流程（preflight -> smoke）
#   ./release.sh --dry-run           # 只打印计划，不执行
#   ./release.sh --yes               # 跳过交互确认
#   ./release.sh --from web          # 从某一步继续
#   ./release.sh --only deploy,smoke # 只跑指定步骤
#   ./release.sh --release-id 2.0.0-20261105-1200   # 续跑已有版本
#   ./release.sh --skip-nginx        # 不动 nginx（仅内部验证）
#
# 环境变量：MMP_HOST（默认 root@124.223.179.250）、MMP_PROD_DIR、MMP_ORIGIN
set -euo pipefail
export TZ="${TZ:-Asia/Shanghai}"
umask 022

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GROUND_ROOT="$REPO_ROOT/ground"
AGENT_ROOT="$REPO_ROOT/mammoth-agent"
INFRA_DIR="$SCRIPT_DIR"

HOST="${MMP_HOST:-root@124.223.179.250}"
PROD_DIR="${MMP_PROD_DIR:-/www/mmp-prod}"
ORIGIN="${MMP_ORIGIN:-https://www.mmai.vip}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

STEPS="preflight frontend api web deploy nginx smoke"
DRY_RUN=0
ASSUME_YES=0
FROM_STEP=""
ONLY_STEPS=""
KEEP_LOCK=0
SKIP_NGINX=0
FORCE_LOCK=0
RELEASE_ID="${RELEASE_ID:-}"
RELEASE_DIR="${RELEASE_DIR:-}"
LOCKED=0
STEP_STATUS=0

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
猛犸宝塔一键发版：只发布 www.mmai.vip / /www/mmp-prod

用法：
  ./release.sh                     # 全流程（preflight -> smoke）
  ./release.sh --dry-run           # 只打印计划，不执行
  ./release.sh --yes               # 跳过交互确认
  ./release.sh --from web          # 从某一步继续（preflight/frontend/api/web/deploy/nginx/smoke）
  ./release.sh --only deploy,smoke # 只跑指定步骤
  ./release.sh --release-id 2.0.0-20261105-1200   # 续跑已有版本
  ./release.sh --skip-nginx        # 不动 nginx（仅内部验证）

环境变量：MMP_HOST（默认 root@124.223.179.250）、MMP_PROD_DIR、MMP_ORIGIN
详细规则：.opencode/skills/baota-release/SKILL.md
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --from) FROM_STEP="${2:?}"; shift ;;
    --only) ONLY_STEPS="${2:?}"; shift ;;
    --release-id) RELEASE_ID="${2:?}"; shift ;;
    --release-dir) RELEASE_DIR="${2:?}"; shift ;;
    --keep-lock) KEEP_LOCK=1 ;;
    --skip-nginx) SKIP_NGINX=1 ;;
    --force-lock) FORCE_LOCK=1 ;;
    --no-lock) NO_LOCK=1 ;;
    -h|--help) usage ;;
    *) die "未知参数：$1（--help 查看用法）" ;;
  esac
  shift
done
NO_LOCK="${NO_LOCK:-0}"

# ---------- 通用执行封装 ----------
run() {
  if (( DRY_RUN )); then
    printf '  [dry] %s\n' "$*"
  else
    "$@"
  fi
}

run_in() {
  local dir="$1"; shift
  if (( DRY_RUN )); then
    printf '  [dry] (cd %s && %s)\n' "$dir" "$*"
  else
    ( cd "$dir" && "$@" )
  fi
}

# 远程执行一段脚本；脚本内用 $1/$2 接收参数，避免本地/远程变量转义。
rsh_script() {
  local script="$1"; shift
  if (( DRY_RUN )); then
    printf '  [dry] remote script on %s (%s args)\n' "$HOST" "$#"
    return 0
  fi
  printf '%s' "$script" | ssh "${SSH_OPTS[@]}" "$HOST" bash -s -- "$@"
}

rsh() {
  if (( DRY_RUN )); then
    printf '  [dry] ssh %s %s\n' "$HOST" "$1"
  else
    ssh "${SSH_OPTS[@]}" "$HOST" "$1"
  fi
}

# ---------- state.json ----------
state_update() {
  local step="$1" status="$2" note="${3:-}"
  local file="${STATE_FILE:-}"
  [[ -n "$file" && -f "$file" ]] || return 0
  (( DRY_RUN )) && return 0
  node - "$file" "$step" "$status" "$note" <<'JS'
const fs = require('fs');
const [file, step, status, note] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const now = new Date().toISOString();
let e = s.steps.find(x => x.name === step);
if (!e) { e = { name: step }; s.steps.push(e); }
e.status = status;
if (status === 'running') e.started_at = now;
if (status === 'done' || status === 'failed') e.ended_at = now;
if (note) e.note = note;
if (status === 'failed') s.failed_step = step;
if (status === 'done') { delete s.failed_step; }
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
JS
}

state_init() {
  [[ -f "$STATE_FILE" ]] && return 0
  (( DRY_RUN )) && return 0
  local gsha asha now
  gsha="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  asha="$(git -C "$AGENT_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  now="$(date +%Y-%m-%dT%H:%M:%S%z)"
  node - "$STATE_FILE" "$RELEASE_ID" "$VERSION" "$gsha" "$asha" "$now" <<'JS'
const fs = require('fs');
const [file, id, version, ground, agent, now] = process.argv.slice(2);
const s = {
  release_id: id, version,
  commits: { ground, 'mammoth-agent': agent },
  started_at: now, finished_at: null,
  operator: process.env.USER || 'local',
  steps: ['preflight','frontend','api-image','web-image','deploy','nginx','smoke']
    .map(name => ({ name, status: 'pending' })),
  images: { api: `mmp-api:${id}`, web: `mmp-web:${id}` },
  rollback: { nginx_backup: null, previous_env: null, previous_images: {}, previous_middle_web: null },
  notes: [],
};
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
JS
}

# ---------- 锁 ----------
lock_acquire() {
  (( NO_LOCK )) && { warn '按 --no-lock 跳过抢锁'; return 0; }
  (( DRY_RUN )) && { log '[dry] 将抢锁'; return 0; }
  local existing
  existing="$(ssh "${SSH_OPTS[@]}" "$HOST" "cat '$PROD_DIR/.release.lock' 2>/dev/null || true")"
  if [[ -n "$existing" ]] && (( ! FORCE_LOCK )); then
    printf '%s\n' "$existing" >&2
    die "发版锁已存在：$PROD_DIR/.release.lock。确认无人发版后再加 --force-lock"
  fi
  printf 'release=%s\nsession=%s\nstarted=%s\n' \
    "$RELEASE_ID" "${OPENCODE_SESSION_ID:-local}" "$(date -Is)" \
    | ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p '$PROD_DIR' && cat > '$PROD_DIR/.release.lock'"
  LOCKED=1
  log "已抢锁：$PROD_DIR/.release.lock"
}

lock_release() {
  (( LOCKED )) || return 0
  (( KEEP_LOCK )) && { warn '按 --keep-lock 保留发版锁'; return 0; }
  (( DRY_RUN )) && return 0
  ssh "${SSH_OPTS[@]}" "$HOST" "rm -f '$PROD_DIR/.release.lock'" >/dev/null 2>&1 || true
  LOCKED=0
}

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if (( rc != 0 )) && [[ -n "${CURRENT_STEP:-}" ]]; then
    state_update "$CURRENT_STEP" failed "exit=$rc" 2>/dev/null || true
  fi
  lock_release
  if (( rc != 0 )); then
    local resume="${CURRENT_STEP:-preflight}"
    case "$resume" in api-image) resume=api ;; web-image) resume=web ;; esac
    log "发版中断（exit=${rc}）；可续跑：--release-id ${RELEASE_ID:-} --from $resume"
  fi
  exit "$rc"
}
trap cleanup EXIT INT TERM

# ---------- 步骤选择 ----------
step_selected() {
  local s="$1" x
  if [[ -n "$ONLY_STEPS" ]]; then
    local IFS=,
    for x in $ONLY_STEPS; do [[ "$x" == "$s" ]] && return 0; done
    return 1
  fi
  if [[ -n "$FROM_STEP" ]]; then
    local seen=0
    for x in $STEPS; do
      [[ "$x" == "$FROM_STEP" ]] && seen=1
      [[ "$x" == "$s" && $seen -eq 1 ]] && return 0
    done
    return 1
  fi
  return 0
}

# ---------- preflight ----------
step_preflight() {
  log '预检：本地工具、版本、SSH、磁盘、镜像源'
  local c
  for c in node pnpm docker git ssh rsync tar gzip curl; do
    command -v "$c" >/dev/null 2>&1 || die "缺少命令：$c"
  done
  (( DRY_RUN )) || docker info >/dev/null 2>&1 || die 'Docker 未运行（Colima/Docker Desktop 没开）'

  run_in "$GROUND_ROOT" pnpm run version:check

  if grep -Eq 'octop|mmPlatform|:8088|/www/mammoth' "$INFRA_DIR/compose.yml" "$INFRA_DIR/nginx-mmai.conf"; then
    die '部署配置里出现旧运行时/旧目录（octop / mmPlatform / :8088 / /www/mammoth）'
  fi

  local dirty
  dirty="$(git -C "$REPO_ROOT" status --short 2>/dev/null | head -20 || true)"
  [[ -n "$dirty" ]] && warn "工作区有未提交改动（不阻塞发版，但请确认是你要发的代码）："$'\n'"$dirty"

  rsh 'true' || die "SSH 连不上 $HOST"
  local avail_kb
  avail_kb="$(rsh "df -Pk '$PROD_DIR' | awk 'NR==2{print \$4}'")"
  if [[ "$avail_kb" =~ ^[0-9]+$ ]]; then
    if (( avail_kb < 30*1024*1024 )); then
      die "服务器可用空间不足 30G：$((avail_kb/1024/1024))G"
    fi
    log "服务器可用空间：$((avail_kb/1024/1024))G"
  else
    log '[dry] 跳过服务器磁盘检查'
  fi

  if (( DRY_RUN )); then
    log '[dry] 跳过镜像源体检'
    log '预检通过'
    return 0
  fi

  # 冷缓存会拖慢构建；能预拉就预拉，并把 canonical 标签打成镜像站标签。
  ensure_image() {
    local canonical="$1" mirror="$2" fallback="$3"
    if rsh "docker image inspect '$mirror' >/dev/null 2>&1"; then
      log "基础镜像已缓存：$mirror"
      return 0
    fi
    if rsh "docker image inspect '$canonical' >/dev/null 2>&1"; then
      log "服务器已有 ${canonical}，补打标签 $mirror"
      rsh "docker tag '$canonical' '$mirror'" && return 0
    fi
    log "服务器缺少 ${mirror}，预拉（最多 5 分钟）"
    if rsh "timeout 300 docker pull '$mirror' >/dev/null 2>&1"; then
      return 0
    fi
    warn "hub.rat.dev 拉取失败，尝试 $fallback"
    if rsh "timeout 300 docker pull '$fallback' >/dev/null 2>&1" \
      && rsh "docker tag '$fallback' '$mirror'"; then
      return 0
    fi
    warn "无法预拉 ${mirror}；构建阶段可能再失败"
    return 1
  }
  ensure_image node:24-bookworm hub.rat.dev/library/node:24-bookworm dockerhub.icu/library/node:24-bookworm || true
  ensure_image node:24-bookworm-slim hub.rat.dev/library/node:24-bookworm-slim dockerhub.icu/library/node:24-bookworm-slim || true
  ensure_image docker:28-cli hub.rat.dev/library/docker:28-cli dockerhub.icu/library/docker:28-cli || true
  if ! rsh "docker image inspect 'pgvector/pgvector:pg16' >/dev/null 2>&1"; then
    warn '服务器缺少 pgvector/pgvector:pg16；尝试从镜像站拉取'
    rsh "timeout 300 docker pull hub.rat.dev/pgvector/pgvector:pg16 >/dev/null 2>&1 && docker tag hub.rat.dev/pgvector/pgvector:pg16 pgvector/pgvector:pg16" \
      || warn 'pgvector 预拉失败；如果有旧栈容器，通常本地已有该镜像'
  fi

  # 记录上一版镜像，供回滚。
  local prev_env
  prev_env="$(rsh "grep -E '^MMP_(API|WEB)_IMAGE=' '$PROD_DIR/.env' 2>/dev/null || true")"
  [[ -n "$prev_env" ]] && log "上一版镜像：$(echo "$prev_env" | tr '\n' ' ')"

  log '镜像源体检（只读/短超时）'
  local code
  code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://registry.npmmirror.com/pnpm || true)"
  [[ "$code" == 200 ]] || warn "npmmirror 不通（${code}）"
  code="$(curl -sI -L -m 10 -o /dev/null -w '%{http_code}' https://npmmirror.com/mirrors/electron/44.7.0/electron-v44.7.0-darwin-arm64.zip || true)"
  [[ "$code" == 200 ]] || warn "Electron 镜像不通（${code}）"
  code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://mirrors.aliyun.com/debian/ || true)"
  [[ "$code" == 200 || "$code" == 301 || "$code" == 302 ]] || warn "阿里云 apt 镜像异常（${code}）"
  log '预检通过'
}

# ---------- 前端 ----------
step_frontend() {
  log '构建前端 dist'
  run_in "$GROUND_ROOT" env VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/shared build
  run_in "$GROUND_ROOT" env VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/frontend build
  local dist="$GROUND_ROOT/apps/frontend/dist"
  (( DRY_RUN )) || [[ -f "$dist/index.html" ]] || die "前端产物不存在：$dist/index.html"
  if (( DRY_RUN )); then
    printf '  [dry] tar -C %s -czf %s/middle-web.tar.gz .\n' "$dist" "$RELEASE_DIR"
  else
    COPYFILE_DISABLE=1 tar -C "$dist" -czf "$RELEASE_DIR/middle-web.tar.gz" .
    [[ -s "$RELEASE_DIR/middle-web.tar.gz" ]] || die 'middle-web.tar.gz 为空'
  fi
  log "前端完成：$( ((DRY_RUN)) || du -h "$RELEASE_DIR/middle-web.tar.gz" | awk '{print $1}' )"
}

# ---------- api 镜像 ----------
step_api() {
  log "构建 api 镜像 mmp-api:$RELEASE_ID"
  run docker build --platform linux/amd64 \
    -f "$INFRA_DIR/Dockerfile.api" -t "mmp-api:$RELEASE_ID" "$GROUND_ROOT"
  log '校验 api 依赖'
  run docker run --rm --platform linux/amd64 "mmp-api:$RELEASE_ID" \
    node -e "require.resolve('express'); console.log('deps ok')"
  log '导出 api 镜像'
  run bash -c "set -o pipefail; docker save 'mmp-api:$RELEASE_ID' | gzip -1 > '$RELEASE_DIR/mmp-api-image.tar.gz'"
  (( DRY_RUN )) || [[ -s "$RELEASE_DIR/mmp-api-image.tar.gz" ]] || die 'api 镜像导出为空'
  log 'api 镜像完成'
}

# ---------- web 镜像（服务器原生 amd64） ----------
step_web() {
  local build_dir="/tmp/mmp-web-build-$RELEASE_ID"
  local commit
  commit="$(git -C "$AGENT_ROOT" rev-parse HEAD 2>/dev/null || echo 0000000)"
  log "同步源码到服务器：$build_dir"
  run rsync -az --delete \
    -e "ssh ${SSH_OPTS[*]}" \
    --exclude node_modules --exclude .git --exclude .desktop-build \
    --exclude '/apps/web/dist' --exclude '/apps/desktop/dist' \
    --exclude '/release' --exclude '/releases' \
    "$AGENT_ROOT/" "$HOST:$build_dir/"

  log '准备服务器 Dockerfile 并校验关键文件'
  rsh_script 'set -e
cd "$1"
sed -e "s|^FROM node:24-bookworm|FROM hub.rat.dev/library/node:24-bookworm|" \
    -e "s|^FROM docker:28-cli|FROM hub.rat.dev/library/docker:28-cli|" \
    infra/production/Dockerfile > Dockerfile.server
if grep -q "^\*\*/lib$" .dockerignore 2>/dev/null; then
  sed -i "s|^\*\*/lib$|# **/lib|" .dockerignore
fi
# The image build context is mammoth-agent/ only, so the Ground library sources the
# ui-enterprise-library project references are absent. Drop that project reference and the
# two specs that import Ground sources; the shipped client never imports them.
sed -i "/tsconfig.ground-library.json/d" tsconfig.client.json
rm -f packages/client/ui-enterprise-library/tests/draft-send.client.spec.ts
rm -f packages/credentials/deepseek-account-platform/tests/ground-history.integration.spec.ts
# Dependency layer input: manifests only, so a source-only change reuses the cached install.
rm -rf __manifests__ && mkdir -p __manifests__
find . -type d \( -name node_modules -o -name .git -o -name .desktop-build -o -name __manifests__ \) -prune \
  -o -type f \( -name package.json -o -name pnpm-lock.yaml -o -name pnpm-workspace.yaml -o -name .npmrc -o -path './patches/*' \) -print \
  | while read -r f; do mkdir -p "__manifests__/$(dirname "$f")"; cp "$f" "__manifests__/$f"; done
test -s __manifests__/package.json
test -s __manifests__/pnpm-lock.yaml
test -d __manifests__/patches
echo "manifest-files=$(find __manifests__ -name package.json | wc -l)"
test -s scripts/release/process.ts
test -s packages/llm/llm-ground/lib/types/index.js
test -s Dockerfile.server
echo source-ok' "$build_dir"

  log '启动服务器 web 构建（后台）'
  rsh_script 'set -e
cd "$1"
rm -f build.exit build.log
setsid bash -c "docker build --platform linux/amd64 --build-arg MMP_CLIENT_COMMIT_HASH=$2 -f Dockerfile.server -t mmp-web:$3 . > build.log 2>&1; echo \$? > build.exit" < /dev/null > /dev/null 2>&1 &
echo started' "$build_dir" "$commit" "$RELEASE_ID"

  (( DRY_RUN )) && { log '[dry] 跳过轮询'; return 0; }

  log '轮询构建进度（每 30s，最多 40 分钟）'
  local started now elapsed code
  started="$(date +%s)"
  while :; do
    sleep 30
    now="$(date +%s)"; elapsed=$((now - started))
    if ssh "${SSH_OPTS[@]}" "$HOST" "test -f '$build_dir/build.exit'"; then
      code="$(ssh "${SSH_OPTS[@]}" "$HOST" "cat '$build_dir/build.exit'" || echo 1)"
      if [[ "$code" == 0 ]] && ssh "${SSH_OPTS[@]}" "$HOST" "docker image inspect 'mmp-web:$RELEASE_ID' >/dev/null 2>&1"; then
        log "web 镜像构建完成（${elapsed}s）"
        break
      fi
      ssh "${SSH_OPTS[@]}" "$HOST" "tail -60 '$build_dir/build.log'" >&2 || true
      die "web 构建失败（exit=${code}），见上面的日志"
    fi
    if (( elapsed > 2400 )); then
      ssh "${SSH_OPTS[@]}" "$HOST" "tail -60 '$build_dir/build.log'" >&2 || true
      die 'web 构建超过 40 分钟，已停止等待（进程可能仍在跑，先看日志再决定）'
    fi
    if (( elapsed % 120 < 30 )); then
      log "  仍在构建：${elapsed}s"
    fi
  done
}

# ---------- 部署 ----------
step_deploy() {
  local stage_dir="/tmp/mmp-release-$RELEASE_ID"
  if (( DRY_RUN )); then
    log "[dry] 将上传发布包到 ${stage_dir}，部署 mmp-api:${RELEASE_ID} / mmp-web:${RELEASE_ID}，并更新 $PROD_DIR/.env"
    return 0
  fi
  [[ -s "$RELEASE_DIR/middle-web.tar.gz" ]] || die "缺少 $RELEASE_DIR/middle-web.tar.gz"
  [[ -s "$RELEASE_DIR/mmp-api-image.tar.gz" ]] || die "缺少 $RELEASE_DIR/mmp-api-image.tar.gz"

  # production.env 不在仓库；本地没有就从服务器拉，绝不覆盖服务器已有文件。
  if [[ ! -s "$RELEASE_DIR/production.env" ]]; then
    if rsh "test -s '$PROD_DIR/production.env'"; then
      log '从服务器拉取现有 production.env'
      run rsync -az -e "ssh ${SSH_OPTS[*]}" "$HOST:$PROD_DIR/production.env" "$RELEASE_DIR/production.env"
    else
      cp "$INFRA_DIR/production.env.example" "$RELEASE_DIR/production.env"
      die "首次发版：请先填好 $RELEASE_DIR/production.env 里的密钥再重跑"
    fi
  fi
  if grep -q 'REPLACE_WITH' "$RELEASE_DIR/production.env"; then
    die "production.env 仍是模板占位符：$RELEASE_DIR/production.env"
  fi

  cp "$INFRA_DIR"/{compose.yml,nginx-mmai.conf,proxy-common.conf,proxy-common-long.conf,init-db.sh} "$RELEASE_DIR/"
  log "上传发布包到 $stage_dir"
  rsh "mkdir -p '$stage_dir'"
  run rsync -az --partial -e "ssh ${SSH_OPTS[*]}" \
    "$RELEASE_DIR/middle-web.tar.gz" "$RELEASE_DIR/mmp-api-image.tar.gz" \
    "$RELEASE_DIR/compose.yml" "$RELEASE_DIR/production.env" "$RELEASE_DIR/nginx-mmai.conf" \
    "$RELEASE_DIR/proxy-common.conf" "$RELEASE_DIR/proxy-common-long.conf" "$RELEASE_DIR/init-db.sh" \
    "$HOST:$stage_dir/"
  rsh "chmod 600 '$stage_dir/production.env' 2>/dev/null || true"

  log '服务器备份并落位静态文件'
  local ts
  if (( DRY_RUN )); then
    ts=DRYRUN
  else
    ts="$(rsh_script 'set -e
cd "$1"
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p middle-web downloads data/uploads data/library data/api-state secrets
cp -a .env ".env.bak-$TS"
cp -a middle-web "middle-web.bak-$TS"
find middle-web -mindepth 1 -delete
tar -xzf "$2/middle-web.tar.gz" -C middle-web
cp "$2"/compose.yml "$2"/nginx-mmai.conf "$2"/proxy-common.conf "$2"/proxy-common-long.conf "$2"/init-db.sh .
if [ ! -s production.env ]; then cp "$2/production.env" production.env; fi
chmod 600 production.env 2>/dev/null || true
echo "$TS"' "$PROD_DIR" "$stage_dir")"
  fi
  log "备份完成：.env.bak-$ts / middle-web.bak-$ts"

  log '载入 api 镜像'
  if (( DRY_RUN )); then
    printf '  [dry] gunzip -c %s/mmp-api-image.tar.gz | ssh %s "docker load"\n' "$RELEASE_DIR" "$HOST"
  else
    gunzip -c "$RELEASE_DIR/mmp-api-image.tar.gz" \
      | ssh "${SSH_OPTS[@]}" "$HOST" 'docker load' >/dev/null
  fi
  rsh "docker image inspect 'mmp-api:$RELEASE_ID' >/dev/null 2>&1" \
    || die "服务器缺少 mmp-api:$RELEASE_ID"
  rsh "docker image inspect 'mmp-web:$RELEASE_ID' >/dev/null 2>&1" \
    || die "服务器缺少 mmp-web:${RELEASE_ID}（先跑 --from web）"

  log '更新 .env 并启动'
  local prev_api prev_web
  prev_api="$(rsh "grep -E '^MMP_API_IMAGE=' '$PROD_DIR/.env' 2>/dev/null | cut -d= -f2- || true")"
  prev_web="$(rsh "grep -E '^MMP_WEB_IMAGE=' '$PROD_DIR/.env' 2>/dev/null | cut -d= -f2- || true")"
  rsh_script 'set -e
cd "$1"
grep -q "^MMP_API_IMAGE=" .env || echo "MMP_API_IMAGE=" >> .env
grep -q "^MMP_WEB_IMAGE=" .env || echo "MMP_WEB_IMAGE=" >> .env
sed -e "s|^MMP_API_IMAGE=.*|MMP_API_IMAGE=$2|" \
    -e "s|^MMP_WEB_IMAGE=.*|MMP_WEB_IMAGE=$3|" \
    .env > .env.new && mv .env.new .env
docker compose up -d
echo started' "$PROD_DIR" "mmp-api:$RELEASE_ID" "mmp-web:$RELEASE_ID"

  # 记录回滚信息（如果 state 存在）。
  if [[ -f "$STATE_FILE" ]] && (( ! DRY_RUN )); then
    node - "$STATE_FILE" "$ts" "$prev_api" "$prev_web" <<'JS'
const fs = require('fs');
const [file, ts, api, web] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
s.rollback = s.rollback || {};
s.rollback.nginx_backup = ts;
s.rollback.previous_env = `.env.bak-${ts}`;
s.rollback.previous_middle_web = `middle-web.bak-${ts}`;
s.rollback.previous_images = { api, web };
if (s.steps.find(x => x.name === 'web-image')) {
  const w = s.steps.find(x => x.name === 'web-image');
  w.note = `server build: ${web || ''}`;
}
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
JS
  fi

  log '等待 api 就绪'
  local i code
  for i in $(seq 1 40); do
    code="$(rsh "curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:33100/api/health || true")"
    [[ "$code" == 200 ]] && { log 'api health 200'; break; }
    sleep 3
  done
  [[ "$code" == 200 ]] || {
    rsh "cd '$PROD_DIR' && docker compose logs --tail=120 api" >&2 || true
    die 'api 120 秒内未就绪'
  }

  local logs
  logs="$(rsh "cd '$PROD_DIR' && docker compose logs --tail=200 api 2>/dev/null || true")"
  if echo "$logs" | grep -qE 'MODULE_NOT_FOUND|Cannot find module'; then
    echo "$logs" | tail -40 >&2
    die 'api 日志出现模块缺失'
  fi
  echo "$logs" | grep -q 'Nest application successfully started' \
    || warn 'api 日志未见 "Nest application successfully started"（health 已 200，继续）'

  code="$(rsh "curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'Host: www.mmai.vip' http://127.0.0.1:33080/ || true")"
  [[ "$code" == 200 || "$code" == 302 || "$code" == 303 ]] \
    || die "web 端口 33080 异常（${code}）"
  log "web 端口正常（${code}）"
}

# ---------- nginx ----------
step_nginx() {
  if (( SKIP_NGINX )); then
    warn '按 --skip-nginx 跳过切流'
    return 0
  fi
  if (( DRY_RUN )); then
    log '[dry] 将备份并替换 nginx include，然后 nginx -t && reload'
    return 0
  fi
  log '切换 nginx（只 reload）'
  rsh_script 'set -e
cd "$1"
VH=/www/server/panel/vhost/nginx/www.mmai.vip.conf
EXT=/www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf
TS=$(date +%Y%m%d-%H%M%S)
cp -a "$VH" "$VH.bak-$TS" 2>/dev/null || true
cp -a "$EXT" "$EXT.bak-$TS" 2>/dev/null || true
cp nginx-mmai.conf "$EXT"
if nginx -t; then
  nginx -s reload
else
  cp -a "$EXT.bak-$TS" "$EXT" 2>/dev/null || true
  nginx -t || true
  echo "nginx 配置校验失败，已还原" >&2
  exit 1
fi
grep -q "location \^~ /console/api/" "$EXT"
grep -q "location \^~ /admin/api/" "$EXT"
echo "nginx_ts=$TS"' "$PROD_DIR"
  log 'nginx 已 reload'
}

# ---------- smoke ----------
step_smoke() {
  log '冒烟与验收'
  if (( DRY_RUN )); then
    log '[dry] 将执行 smoke.sh + 版本/JSON/容器检查'
    return 0
  fi
  run "$INFRA_DIR/smoke.sh" "$ORIGIN"

  local ver want got ct code
  want="$(node -p "require('$GROUND_ROOT/config/version.json').version")"
  got="$(curl -fsS -m 10 "$ORIGIN/api/version" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.version||j.data?.version||""))}catch{}})')"
  [[ "$got" == "$want" ]] || die "线上版本 $got ≠ 仓库版本 $want"

  check_json() {
    local path="$1" expect="$2"
    ct="$(curl -s -m 10 -o /dev/null -w '%{content_type}' "$ORIGIN$path")"
    code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$ORIGIN$path")"
    [[ "$code" =~ ^($expect)$ ]] || die "$path 期望 ${expect}，实际 $code"
    [[ "$ct" == application/json* ]] || die "$path 返回的不是 JSON（${ct}）"
  }
  check_json /console/api/version 200
  check_json /admin/api/users '401|403'
  log 'JSON 接口正常'

  if (( ! DRY_RUN )); then
    local total bad restarts
    total="$(rsh "docker ps --filter label=com.docker.compose.project=mmp-prod-v1 --format '{{.Names}}' | wc -l")"
    (( total >= 3 )) || die "mmp-prod-v1 容器数不足（${total}），期望 api/web/pg 三个"
    bad="$(rsh "docker ps --filter label=com.docker.compose.project=mmp-prod-v1 --format '{{.Names}} {{.Status}}' | grep -vc ' Up ' || true")"
    [[ "$bad" == 0 ]] || rsh "docker ps --filter label=com.docker.compose.project=mmp-prod-v1 --format '{{.Names}} {{.Status}}'" >&2
    restarts="$(rsh "for n in \$(docker ps --filter label=com.docker.compose.project=mmp-prod-v1 --format '{{.Names}}'); do docker inspect -f '{{.RestartCount}}' \$n; done" | awk '{s+=$1} END{print s+0}')"
    log "容器状态：总数=${total}，异常=${bad}，总 RestartCount=$restarts"
    (( restarts == 0 )) || warn "有容器重启过（RestartCount=${restarts}），请查日志"
  fi
  log 'smoke 通过'
}

# ---------- 主流程 ----------
resolve_release() {
  VERSION="$(node -p "require('$GROUND_ROOT/config/version.json').version")"
  [[ -n "$RELEASE_ID" ]] || RELEASE_ID="$VERSION-$(date +%Y%m%d-%H%M)"
  [[ -n "$RELEASE_DIR" ]] || RELEASE_DIR="$REPO_ROOT/release/$RELEASE_ID"
  STATE_FILE="$RELEASE_DIR/state.json"
  if (( DRY_RUN )); then
    printf '  [dry] 版本 %s / RELEASE_ID %s\n' "$VERSION" "$RELEASE_ID"
    printf '  [dry] 发布目录 %s\n' "$RELEASE_DIR"
    printf '  [dry] 步骤：%s\n' "$STEPS"
    return 0
  fi
  mkdir -p "$RELEASE_DIR"
}

main() {
  resolve_release
  log "RELEASE_ID=$RELEASE_ID  DIR=$RELEASE_DIR"

  if (( ! DRY_RUN )) && (( ! ASSUME_YES )); then
    if [[ -t 0 ]]; then
      printf '即将发布 %s（%s）到 %s。继续？[y/N] ' "$VERSION" "$RELEASE_ID" "$ORIGIN"
      local ans; read -r ans
      [[ "$ans" == y || "$ans" == Y ]] || die '已取消'
    else
      die '非交互环境请加 --yes'
    fi
  fi

  if [[ "$ONLY_STEPS" == "smoke" || "$ONLY_STEPS" == "preflight" ]]; then NO_LOCK=1; fi
  (( NO_LOCK )) || lock_acquire
  state_init

  CURRENT_STEP=preflight
  if step_selected preflight; then state_update preflight running; step_preflight; state_update preflight done; fi

  CURRENT_STEP=frontend
  if step_selected frontend; then state_update frontend running; step_frontend; state_update frontend done; fi

  CURRENT_STEP=api-image
  if step_selected api; then state_update api-image running; step_api; state_update api-image done; fi

  CURRENT_STEP=web-image
  if step_selected web; then state_update web-image running; step_web; state_update web-image done; fi

  CURRENT_STEP=deploy
  if step_selected deploy; then state_update deploy running; step_deploy; state_update deploy done; fi

  CURRENT_STEP=nginx
  if step_selected nginx; then state_update nginx running; step_nginx; state_update nginx done; fi

  CURRENT_STEP=smoke
  if step_selected smoke; then state_update smoke running; step_smoke; state_update smoke done; fi

  if (( ! DRY_RUN )); then
    rsh "rm -rf '/tmp/mmp-web-build-$RELEASE_ID' '/tmp/mmp-release-$RELEASE_ID' /tmp/mmp-web-build.log" || true
    if [[ -f "$STATE_FILE" ]]; then
      node - "$STATE_FILE" <<'JS'
const fs = require('fs');
const f = process.argv[2];
const s = JSON.parse(fs.readFileSync(f, 'utf8'));
s.finished_at = new Date().toISOString();
fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
JS
    fi
  fi

  CURRENT_STEP=""
  lock_release
  if (( DRY_RUN )); then
    cat <<EOF

[dry-run] 计划完成，未执行任何变更。
RELEASE_ID：$RELEASE_ID
发布目录：$RELEASE_DIR
EOF
    return 0
  fi
  if step_selected deploy && step_selected nginx && step_selected smoke; then
    cat <<EOF

上线完成：$ORIGIN
RELEASE_ID：$RELEASE_ID
发布目录：$RELEASE_DIR
回滚：./rollback.sh --release-id $RELEASE_ID --yes
EOF
  else
    cat <<EOF

所选步骤完成。
RELEASE_ID：$RELEASE_ID
发布目录：$RELEASE_DIR
EOF
  fi
}

main "$@"