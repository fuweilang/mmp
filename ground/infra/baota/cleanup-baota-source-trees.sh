#!/usr/bin/env bash
# cleanup-baota-source-trees.sh — 安全移除宝塔盘明文 ground/Octop 源码树
# 前提：运行中容器不 bind-mount ./src 或 ./Octop；compose 改为 image-only；镜像可独立跑。
# 用法:
#   ./cleanup-baota-source-trees.sh           # dry-run（默认）
#   ./cleanup-baota-source-trees.sh --apply  # 同步 image-only compose → bak → 移走源码树
set -euo pipefail

SSH_HOST="${BAOTA_SSH_HOST:-root@124.223.179.250}"
REMOTE_ROOT="${BAOTA_REMOTE_ROOT:-/www/mammoth}"
APPLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BAK_ROOT="${REMOTE_ROOT}/bak-source-${STAMP}"

echo "== cleanup-baota-source-trees apply=$APPLY =="

if [[ "$APPLY" -eq 1 ]]; then
  echo "-- 先同步 image-only docker-compose.yml（去掉 build:）--"
  scp -o BatchMode=yes "$SCRIPT_DIR/docker-compose.yml" "$SSH_HOST:$REMOTE_ROOT/docker-compose.yml"
fi

ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" "bash -s" <<REMOTE
set -euo pipefail
ROOT='$REMOTE_ROOT'
BAK='$BAK_ROOT'
APPLY='$APPLY'

ok() { echo "OK  \$*"; }
warn() { echo "WARN \$*"; }
die() { echo "ERROR \$*" >&2; exit 1; }

[[ -f "\$ROOT/docker-compose.yml" ]] || die "缺 compose"

for c in mammoth-api; do  # mammoth-octop 已废弃
  if ! docker inspect "\$c" >/dev/null 2>&1; then
    warn "容器 \$c 不存在，跳过挂载检查"
    continue
  fi
  mounts="\$(docker inspect "\$c" --format '{{range .Mounts}}{{.Source}} {{end}}')"
  echo "\$mounts" | grep -E "/www/mammoth/src(/|\$)|/www/mammoth/Octop(/|\$)" >/dev/null 2>&1 \
    && die "\$c 仍 bind-mount 了 src/Octop，禁止清理: \$mounts"
  ok "\$c 未挂载明文源码树"
done

docker image inspect mammoth-api:local >/dev/null 2>&1 || die "缺镜像 mammoth-api:local"
ok "跳过 mammoth-octop 镜像（已废弃）；仅检查中台"
docker image inspect mammoth-api:local >/dev/null 2>&1 || die "缺镜像 mammoth-api:local"
ok "mammoth-api:local 存在"

if grep -qE '^[[:space:]]*build:' "\$ROOT/docker-compose.yml"; then
  if [[ "\$APPLY" == "1" ]]; then
    die "compose 仍含 build:（--apply 应已先 scp 模板；检查失败）"
  else
    warn "compose 仍含 build:；--apply 会先同步 image-only 模板"
  fi
else
  ok "compose 无 build:"
fi

docker inspect -f '{{.State.Status}}' mammoth-api 2>/dev/null | grep -qx running || die "mammoth-api 非 running"
# mammoth-octop 不再要求 running
ok "api/octop 容器 running"

need=0
[[ -d "\$ROOT/src" ]] && need=1
[[ -d "\$ROOT/Octop" ]] && need=1
if [[ "\$need" -eq 0 ]]; then
  ok "盘上已无 src/ 与 Octop/，无需清理"
  exit 0
fi

echo "将处理:"
[[ -d "\$ROOT/src" ]] && du -sh "\$ROOT/src" || true
[[ -d "\$ROOT/Octop" ]] && du -sh "\$ROOT/Octop" || true

if [[ "\$APPLY" != "1" ]]; then
  echo "DRY-RUN: 会 mkdir \$BAK 并将 src/Octop mv 进去（保留可回滚）"
  echo "真执行: ./cleanup-baota-source-trees.sh --apply"
  exit 0
fi

mkdir -p "\$BAK"
[[ -d "\$ROOT/src" ]] && mv "\$ROOT/src" "\$BAK/src" && ok "已移走 src → \$BAK/src"
[[ -d "\$ROOT/Octop" ]] && mv "\$ROOT/Octop" "\$BAK/Octop" && ok "已移走 Octop → \$BAK/Octop"

sleep 2
docker inspect -f '{{.State.Status}}' mammoth-api | grep -qx running || die "清理后 mammoth-api 异常"
docker inspect -f '{{.State.Status}}' mammoth-octop | grep -qx running || die "清理后 mammoth-octop 异常"
ok "清理后容器仍 running"
echo "备份目录: \$BAK （确认无问题后可手工 rm -rf）"
echo "== cleanup DONE =="
REMOTE
