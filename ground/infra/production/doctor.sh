#!/usr/bin/env bash
# 发版前体检：本地工具、服务器、磁盘、镜像源、基础镜像、锁状态。
# 用法：./doctor.sh [--network] [--json]
#   --network  额外做一次真实 docker pull（会联网，约 10-60s）
set -uo pipefail
export TZ="${TZ:-Asia/Shanghai}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GROUND_ROOT="$REPO_ROOT/ground"
HOST="${MMP_HOST:-root@124.223.179.250}"
PROD_DIR="${MMP_PROD_DIR:-/www/mmp-prod}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=15)
DO_NETWORK=0
JSON=0

for a in "$@"; do
  case "$a" in
    --network) DO_NETWORK=1 ;;
    --json) JSON=1 ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

PASS=0; WARN=0; FAIL=0
ROWS=""
row() { # row status name detail
  local st="$1" name="$2" detail="${3:-}"
  case "$st" in
    PASS) PASS=$((PASS+1)) ;;
    WARN) WARN=$((WARN+1)) ;;
    FAIL) FAIL=$((FAIL+1)) ;;
  esac
  if (( JSON )); then
    ROWS+=$(printf '{"status":"%s","name":"%s","detail":"%s"}\n' "$st" "$name" "${detail//\"/\\\"}")
  else
    printf '%-4s %-28s %s\n' "$st" "$name" "$detail"
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }
sshq() { ssh "${SSH_OPTS[@]}" "$HOST" "$1" 2>/dev/null; }

# macOS 默认没有 timeout；有就用，没有就用后台看门狗。
run_timeout() {
  local secs="$1"; shift
  if have timeout; then timeout "$secs" "$@"; return $?; fi
  if have gtimeout; then gtimeout "$secs" "$@"; return $?; fi
  "$@" & local pid=$!
  ( sleep "$secs"; kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null ) & local wd=$!
  wait "$pid"; local rc=$?
  kill "$wd" 2>/dev/null || true
  return "$rc"
}

log_hdr() { (( JSON )) || printf '\n== %s ==\n' "$1"; }

log_hdr '本地'
for c in node pnpm docker git ssh rsync tar gzip curl; do
  if have "$c"; then row PASS "$c"; else row FAIL "$c" '未安装'; fi
done

if have node; then
  row PASS 'node 版本' "$(node -v)"
fi
if have pnpm; then
  row PASS 'pnpm 版本' "$(pnpm -v 2>/dev/null || echo '?')"
fi

if have docker && docker info >/dev/null 2>&1; then
  row PASS 'docker daemon' "$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}' 2>/dev/null || echo ok)"
else
  row FAIL 'docker daemon' '未运行（Colima / Docker Desktop）'
fi

ARCH="$(uname -m)"
if [[ "$ARCH" == arm64 ]]; then
  row PASS '本机架构' 'arm64（web 镜像必须服务器构建）'
else
  row PASS '本机架构' "$ARCH"
fi

AVAIL_KB="$(df -Pk "$REPO_ROOT" | awk 'NR==2{print $4}')"
if (( AVAIL_KB > 20*1024*1024 )); then
  row PASS '本机磁盘' "$((AVAIL_KB/1024/1024))G 可用"
else
  row WARN '本机磁盘' "$((AVAIL_KB/1024/1024))G 可用（建议 >20G）"
fi

if [[ -f "$GROUND_ROOT/config/version.json" ]]; then
  row PASS '版本文件' "$(node -p "require('$GROUND_ROOT/config/version.json').version" 2>/dev/null || echo '?')"
else
  row FAIL '版本文件' "缺少 $GROUND_ROOT/config/version.json"
fi

log_hdr '本地网络（短超时）'
code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://registry.npmmirror.com/pnpm || echo 000)"
[[ "$code" == 200 ]] && row PASS 'npm npmmirror' '200' || row WARN 'npm npmmirror' "$code"

code="$(curl -sI -L -m 12 -o /dev/null -w '%{http_code}' https://npmmirror.com/mirrors/electron/44.7.0/electron-v44.7.0-darwin-arm64.zip || echo 000)"
if [[ "$code" == 200 ]]; then
  row PASS 'Electron npmmirror' '200'
else
  row WARN 'Electron npmmirror' "$code"
fi

code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://mirrors.aliyun.com/debian/ || echo 000)"
[[ "$code" == 200 || "$code" == 301 || "$code" == 302 ]] && row PASS 'apt 阿里云' "$code" || row WARN 'apt 阿里云' "$code"

code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://mirrors.cloud.tencent.com/npm/pnpm || echo 000)"
[[ "$code" == 200 ]] && row PASS 'npm 腾讯云（包路径）' '200' || row WARN 'npm 腾讯云（包路径）' "${code}（根路径 404 属正常）"

if (( DO_NETWORK )); then
  if run_timeout 120 docker pull hub.rat.dev/library/alpine:3.20 >/dev/null 2>&1; then
    row PASS 'docker 拉取 hub.rat.dev' 'alpine:3.20 成功'
  elif run_timeout 120 docker pull dockerhub.icu/library/alpine:3.20 >/dev/null 2>&1; then
    row WARN 'docker 拉取 hub.rat.dev' '失败，dockerhub.icu 可用'
  else
    row FAIL 'docker 拉取镜像' '两个源都失败'
  fi
fi

log_hdr '服务器'
if sshq 'true'; then
  row PASS 'SSH' "$HOST"
else
  row FAIL 'SSH' "$HOST 连不上"
fi

if sshq 'true'; then
  row PASS '服务器 docker' "$(sshq 'docker --version' | sed 's/Docker version //;s/,.*//')"
  row PASS '服务器 compose' "$(sshq 'docker compose version --short' || echo '?')"
  SAVAIL="$(sshq "df -Pk '$PROD_DIR' | awk 'NR==2{print \$4}'")"
  if [[ "$SAVAIL" =~ ^[0-9]+$ ]]; then
    if (( SAVAIL > 30*1024*1024 )); then
      row PASS '服务器磁盘' "$((SAVAIL/1024/1024))G 可用"
    else
      row FAIL '服务器磁盘' "$((SAVAIL/1024/1024))G 可用（<30G）"
    fi
  else
    row WARN '服务器磁盘' "读不到 $PROD_DIR"
  fi

  check_img() {
    local canonical="$1" mirror="$2"
    if sshq "docker image inspect '$mirror' >/dev/null 2>&1 || docker image inspect '$canonical' >/dev/null 2>&1"; then
      row PASS "基础镜像 $canonical" '已缓存'
    else
      row WARN "基础镜像 $canonical" '未缓存，release.sh 会预拉（首次慢 10-20 分钟）'
    fi
  }
  check_img node:24-bookworm hub.rat.dev/library/node:24-bookworm
  check_img node:24-bookworm-slim hub.rat.dev/library/node:24-bookworm-slim
  check_img docker:28-cli hub.rat.dev/library/docker:28-cli
  if sshq "docker image inspect 'pgvector/pgvector:pg16' >/dev/null 2>&1"; then
    row PASS '基础镜像 pgvector/pgvector:pg16' '已缓存'
  else
    row WARN '基础镜像 pgvector/pgvector:pg16' '未缓存，compose 启动会拉取'
  fi

  if sshq "test -f '$PROD_DIR/.release.lock'"; then
    row WARN '发版锁' "存在：$(sshq "tr '\n' ' ' < '$PROD_DIR/.release.lock'")"
  else
    row PASS '发版锁' '无'
  fi

  LIVE="$(sshq "docker ps --filter label=com.docker.compose.project=mmp-prod-v1 --format '{{.Names}}' | wc -l")"
  row PASS '运行中容器' "mmp-prod-v1: ${LIVE:-0} 个"

  if sshq "test -s '$PROD_DIR/.env'"; then
    row PASS '生产 .env' "$(sshq "grep -E '^MMP_(API|WEB)_IMAGE=' '$PROD_DIR/.env' | tr '\n' ' '")"
  else
    row FAIL '生产 .env' "缺少 $PROD_DIR/.env"
  fi
  if sshq "test -s '$PROD_DIR/production.env'"; then
    row PASS 'production.env' '存在'
  else
    row WARN 'production.env' '不存在（首次发版需填写）'
  fi

  if (( DO_NETWORK )); then
    if sshq "timeout 120 docker pull hub.rat.dev/library/alpine:3.20 >/dev/null 2>&1"; then
      row PASS '服务器 docker 拉取' 'alpine:3.20 成功'
    else
      row FAIL '服务器 docker 拉取' 'hub.rat.dev 失败'
    fi
  fi
fi

log_hdr '结论'
if (( JSON )); then
  printf '{"pass":%d,"warn":%d,"fail":%d,"checks":[%s]}\n' "$PASS" "$WARN" "$FAIL" "$(printf '%s' "$ROWS" | paste -sd, - 2>/dev/null || printf '%s' "$ROWS")"
else
  printf 'PASS=%d  WARN=%d  FAIL=%d\n' "$PASS" "$WARN" "$FAIL"
fi
(( FAIL == 0 )) || exit 1