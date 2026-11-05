#!/usr/bin/env bash
# 回滚 www.mmai.vip 到上一版：恢复 .env / 镜像 tag / 静态包 / nginx 配置。
# 用法：
#   ./rollback.sh --list
#   ./rollback.sh --release-id 2.0.0-20261105-1200 --yes
#   ./rollback.sh --env-backup .env.bak-20261105-123000 --yes
#   ./rollback.sh --release-id ... --restore-web --yes
set -euo pipefail
export TZ="${TZ:-Asia/Shanghai}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
HOST="${MMP_HOST:-root@124.223.179.250}"
PROD_DIR="${MMP_PROD_DIR:-/www/mmp-prod}"
ORIGIN="${MMP_ORIGIN:-https://www.mmai.vip}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15)

RELEASE_ID=""
ENV_BACKUP=""
NGINX_TS=""
RESTORE_WEB=0
ASSUME_YES=0
DRY_RUN=0
LIST_ONLY=0

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die()  { printf '[%s] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-id) RELEASE_ID="${2:?}"; shift ;;
    --env-backup) ENV_BACKUP="${2:?}"; shift ;;
    --nginx-ts) NGINX_TS="${2:?}"; shift ;;
    --restore-web) RESTORE_WEB=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --list) LIST_ONLY=1 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
  shift
done

sshq() { ssh "${SSH_OPTS[@]}" "$HOST" "$1"; }

if (( LIST_ONLY )); then
  log '服务器备份：'
  sshq "cd '$PROD_DIR' 2>/dev/null && ls -1dt .env.bak-* middle-web.bak-* 2>/dev/null | head -20"
  log 'nginx 备份：'
  sshq "ls -1t /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf.bak-* 2>/dev/null | head -10"
  log '现有镜像：'
  sshq "docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}' | grep -E '^mmp-(api|web):' | head -20"
  log '本地 state：'
  ls -1dt "$REPO_ROOT"/release/*/state.json 2>/dev/null | head -10 || true
  exit 0
fi

# 未指定 release 时取最近一次 state。
if [[ -z "$RELEASE_ID" && -z "$ENV_BACKUP" ]]; then
  latest="$(ls -1dt "$REPO_ROOT"/release/*/state.json 2>/dev/null | head -1 || true)"
  [[ -n "$latest" ]] || die '没有 release/*/state.json，请用 --list 选择备份'
  RELEASE_ID="$(basename "$(dirname "$latest")")"
  log "使用最近一次发版：$RELEASE_ID"
fi

STATE_FILE="$REPO_ROOT/release/$RELEASE_ID/state.json"
if [[ -n "$RELEASE_ID" && -f "$STATE_FILE" ]]; then
  eval "$(node - "$STATE_FILE" <<'JS'
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const r = s.rollback || {};
const p = r.previous_images || {};
const q = v => `'${String(v || '').replace(/'/g, "'\\''")}'`;
console.log(`STATE_ENV=${q(r.previous_env)}`);
console.log(`STATE_NGINX=${q(r.nginx_backup)}`);
console.log(`PREV_API=${q(p.api)}`);
console.log(`PREV_WEB=${q(p.web)}`);
JS
)"
fi

ENV_BACKUP="${ENV_BACKUP:-${STATE_ENV:-}}"
NGINX_TS="${NGINX_TS:-${STATE_NGINX:-}}"

if [[ -z "$ENV_BACKUP" ]]; then
  # 兜底：用服务器上最新的 .env.bak-*。
  ENV_BACKUP="$(sshq "cd '$PROD_DIR' && ls -1dt .env.bak-* 2>/dev/null | head -1" || true)"
  [[ -n "$ENV_BACKUP" ]] || die '找不到 .env 备份，无法回滚镜像'
fi
[[ "$ENV_BACKUP" == .env.bak-* ]] || ENV_BACKUP=".env.bak-$ENV_BACKUP"
ENV_BACKUP="$(basename "$ENV_BACKUP")"
NGINX_TS="${NGINX_TS:-${ENV_BACKUP#.env.bak-}}"

log "将回滚到：${ENV_BACKUP}（nginx 备份 ${NGINX_TS}）"
sshq "cd '$PROD_DIR' && test -s '$ENV_BACKUP'" || die "服务器缺少 $PROD_DIR/$ENV_BACKUP"

if (( ! ASSUME_YES )); then
  printf '确认回滚 %s？输入 release id 继续：' "$RELEASE_ID"
  read -r ans
  [[ "$ans" == "$RELEASE_ID" || "$ans" == "ROLLBACK" ]] || die '已取消'
fi

if (( DRY_RUN )); then
  log '[dry] 将恢复 .env、重启 compose、恢复 nginx'
  exit 0
fi

log '1/4 恢复 .env 并重启容器'
sshq "set -e; cd '$PROD_DIR'
cp -a .env .env.before-rollback-\$(date +%Y%m%d-%H%M%S)
cp -a '$ENV_BACKUP' .env
docker compose up -d
docker compose ps"

log '2/4 等待 api 就绪'
code=""
for _ in $(seq 1 40); do
  code="$(sshq "curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:33100/api/health || true")"
  [[ "$code" == 200 ]] && break
  sleep 3
done
[[ "$code" == 200 ]] || { sshq "cd '$PROD_DIR' && docker compose logs --tail=120 api" >&2 || true; die '回滚后 api 未就绪'; }

log '3/4 恢复 nginx'
sshq "set -e
EXT=/www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf
BAK=\"\$EXT.bak-$NGINX_TS\"
if [ -s \"\$BAK\" ]; then
  cp -a \"\$EXT\" \"\$EXT.before-rollback-\$(date +%Y%m%d-%H%M%S)\" 2>/dev/null || true
  cp -a \"\$BAK\" \"\$EXT\"
  nginx -t && nginx -s reload
else
  echo '没有 nginx 备份，跳过' >&2
fi"

if (( RESTORE_WEB )); then
  log '3.5 恢复静态包'
  sshq "set -e; cd '$PROD_DIR'
  test -d 'middle-web.bak-$NGINX_TS' || { echo '没有 middle-web 备份' >&2; exit 1; }
  cp -a middle-web \"middle-web.before-rollback-\$(date +%Y%m%d-%H%M%S)\"
  find middle-web -mindepth 1 -delete
  cp -a 'middle-web.bak-$NGINX_TS'/. middle-web/"
fi

log '4/4 验收'
"$SCRIPT_DIR/smoke.sh" "$ORIGIN"
log "回滚完成。旧镜像仍在服务器上：${PREV_API:-?} / ${PREV_WEB:-?}"