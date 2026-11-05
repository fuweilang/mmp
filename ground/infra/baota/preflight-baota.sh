#!/usr/bin/env bash
# preflight-baota.sh — 猛犸宝塔发版前检查（中台快发 / 冻结轨）
# 用法:
#   ./preflight-baota.sh [--track fast|freeze]
# 默认 --track fast。失败非 0 退出。
# 密保: 禁止宝塔盘留 ground/Octop 明文源码；compose 禁止 build:；镜像在本地 build。
# 远程: ssh root@124.223.179.250
set -euo pipefail

TRACK="fast"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --track) TRACK="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

if [[ "$TRACK" != "fast" && "$TRACK" != "freeze" ]]; then
  echo "ERROR: --track 必须是 fast 或 freeze，当前=$TRACK" >&2
  exit 2
fi

SSH_HOST="${BAOTA_SSH_HOST:-root@124.223.179.250}"
REMOTE_ROOT="${BAOTA_REMOTE_ROOT:-/www/mammoth}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROUND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM_ROOT="$(cd "$GROUND_ROOT/.." && pwd)"
GROUND_DIR="$PLATFORM_ROOT/ground"
OCTOP_DIR="$PLATFORM_ROOT/Octop"

echo "== preflight-baota track=$TRACK =="
echo "PLATFORM_ROOT=$PLATFORM_ROOT"

fail=0
ok() { echo "OK  $*"; }
warn() { echo "WARN $*"; }
err() { echo "ERROR $*"; fail=1; }

if [[ ! -d "$GROUND_DIR" ]]; then err "本地 ground 不存在: $GROUND_DIR"; else ok "本地 ground: $GROUND_DIR"; fi
if [[ ! -d "$OCTOP_DIR" ]]; then err "本地 Octop 不存在: $OCTOP_DIR"; else ok "本地 Octop: $OCTOP_DIR"; fi
if [[ -f "$GROUND_DIR/infra/baota/Dockerfile.api" ]]; then ok "本地 Dockerfile.api"; else err "缺本地 Dockerfile.api"; fi
# Octop 已废弃：不再校验 Dockerfile.octop / mammoth-octop 镜像
ok "Octop 发版路径已停用（仅中台 api/web/pg）"
if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
  if grep -qE '^\s*build:' "$SCRIPT_DIR/docker-compose.yml"; then
    err "仓库 compose 仍含 build:（生产必须 image-only）"
  else
    ok "仓库 compose 为 image-only（无 build:）"
  fi
fi

print_git() {
  local d="$1" name="$2"
  if ! git -C "$d" rev-parse --git-dir >/dev/null 2>&1; then
    warn "$name: 非 git 工作树"
    return
  fi
  local br sha dirty
  br="$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  sha="$(git -C "$d" rev-parse --short HEAD 2>/dev/null || echo '?')"
  dirty="$(git -C "$d" status --porcelain 2>/dev/null || true)"
  echo "  $name branch=$br SHA=$sha"
  if [[ -n "$dirty" ]]; then
    echo "  $name 工作区有未提交改动 ($(printf '%s\n' "$dirty" | wc -l | tr -d ' ') files)"
  fi
}

if [[ "$TRACK" == "fast" ]]; then
  echo "-- fast 轨：本地当前分支 build 镜像（不 rsync 源码）--"
  print_git "$GROUND_DIR" ground
  print_git "$OCTOP_DIR" Octop
else
  echo "-- freeze 轨：断言 mm-release-1.0 在 1.0 且干净 --"
  RELEASE_ROOT="${MM_RELEASE_ROOT:-$HOME/Documents/code/mm-release-1.0}"
  RG="$RELEASE_ROOT/ground"
  RO="$RELEASE_ROOT/Octop"
  if [[ ! -d "$RG" || ! -d "$RO" ]]; then
    err "冻结 worktree 不存在: $RELEASE_ROOT/{ground,Octop}"
  else
    for pair in "ground:$RG" "Octop:$RO"; do
      name="${pair%%:*}"
      d="${pair#*:}"
      br="$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
      sha="$(git -C "$d" rev-parse --short HEAD 2>/dev/null || echo '?')"
      dirty="$(git -C "$d" status --porcelain 2>/dev/null || true)"
      echo "  $name branch=$br SHA=$sha @ $d"
      if [[ "$br" != "1.0" ]]; then err "$name 不在 1.0（当前 $br）"; else ok "$name 在 1.0"; fi
      if [[ -n "$dirty" ]]; then err "$name 工作区不干净"; else ok "$name 工作区干净"; fi
    done
  fi
fi

echo "-- 远程 $SSH_HOST:$REMOTE_ROOT --"
REMOTE_OUT="$(ssh -o ConnectTimeout=15 -o BatchMode=yes "$SSH_HOST" "bash -s" <<REMOTE || true
set +e
ROOT='$REMOTE_ROOT'
COMPOSE="\$ROOT/docker-compose.yml"
fail=0
ok() { echo "OK  \$*"; }
err() { echo "ERROR \$*"; fail=1; }
warn() { echo "WARN \$*"; }

if [[ ! -f "\$COMPOSE" ]]; then
  err "缺少 \$COMPOSE"
  echo "__FAIL__=\$fail"
  exit 0
fi

grep -q 'OCTOP_HOME' "\$COMPOSE" && ok "compose 含 OCTOP_HOME" || err "compose 缺 OCTOP_HOME"
grep -qE './data/octop|/data/\.octop' "\$COMPOSE" && ok "compose 含 data/octop 挂载" || err "compose 缺 ./data/octop 挂载"
grep -qE './secrets:/app/secrets' "\$COMPOSE" && ok "compose 含 secrets:/app/secrets" || err "compose 缺 ./secrets:/app/secrets"

if grep -qE '^[[:space:]]*build:' "\$COMPOSE"; then
  err "生产 compose 仍含 build:（禁止在宝塔 build；请同步 image-only 模板）"
else
  ok "生产 compose 无 build:（image-only）"
fi

# 明文源码树禁止
if [[ -d "\$ROOT/src/apps" || -f "\$ROOT/src/package.json" ]]; then
  err "禁止明文源码: \$ROOT/src 仍在（先跑 cleanup-baota-source-trees.sh）"
else
  ok "无 \$ROOT/src 明文 ground 树"
fi
if [[ -d "\$ROOT/Octop/src" || -f "\$ROOT/Octop/pyproject.toml" ]]; then
  err "禁止明文源码: \$ROOT/Octop 仍在（先跑 cleanup-baota-source-trees.sh）"
else
  ok "无 \$ROOT/Octop 明文源码树"
fi

SECRETS="\$ROOT/secrets"
if [[ ! -d "\$SECRETS" ]]; then
  err "缺目录 \$SECRETS"
else
  pem_count=\$(find "\$SECRETS" -type f \( -iname '*alipay*' -o -iname '*wechat*' -o -iname '*wx*' -o -iname '*.pem' -o -iname '*.key' \) 2>/dev/null | wc -l | tr -d ' ')
  if [[ "\${pem_count:-0}" -ge 1 ]]; then
    ok "secrets 下存在支付宝/微信相关密钥文件 (count=\$pem_count，内容不打印)"
  else
    err "secrets 下未找到支付宝/微信相关 PEM/密钥文件"
  fi
fi

if docker image inspect mammoth-api:local >/dev/null 2>&1; then
  ok "镜像 mammoth-api:local 存在"
else
  warn "镜像 mammoth-api:local 尚不存在（首次发版由本地 build+load 写入）"
fi
# mammoth-octop 镜像不再要求
ok "跳过 mammoth-octop 镜像检查（Octop 已废弃）"

if [[ -f "\$ROOT/.env" ]]; then
  pay=\$(grep -E '^PAY_PROVIDER=' "\$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [[ -z "\$pay" ]]; then
    warn ".env 未设置 PAY_PROVIDER（生产通常应为 real，且需 secrets）"
  else
    ok "PAY_PROVIDER=\$pay（real 时必须挂载 /app/secrets 且 PEM 齐全；local 可用 mock）"
  fi
else
  warn "缺 \$ROOT/.env，无法核对 PAY_PROVIDER"
fi

echo "__FAIL__=\$fail"
REMOTE
)"

printf '%s\n' "$REMOTE_OUT" | grep -v '^__FAIL__=' || true
REMOTE_FAIL="$(printf '%s\n' "$REMOTE_OUT" | grep '^__FAIL__=' | tail -1 | cut -d= -f2 || echo 1)"
if [[ "${REMOTE_FAIL:-1}" != "0" ]]; then
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "== preflight FAILED =="
  exit 1
fi
echo "== preflight PASSED (track=$TRACK) =="
exit 0
