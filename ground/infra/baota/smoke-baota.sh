#!/usr/bin/env bash
# smoke-baota.sh — 发版后生产冒烟（API 级）
# 用法:
#   ./smoke-baota.sh [--expect-version x.y.z] [--base-url https://www.mmai.vip]
# shell≠portable 时醒目 WARN，仍 exit 0（避免误伤只发壳）。
# latest 断言委托 assert-latest-json.sh。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROUND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BASE_URL="${BAOTA_BASE_URL:-https://www.mmai.vip}"
EXPECT_VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-version) EXPECT_VERSION="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# 未传 --expect-version 时读 SSOT
if [[ -z "${EXPECT_VERSION}" && -f "$GROUND_ROOT/config/version.json" ]]; then
  if [[ -x "$SCRIPT_DIR/resolve-mammoth-version.sh" ]]; then
    EXPECT_VERSION="$("$SCRIPT_DIR/resolve-mammoth-version.sh")"
  else
    EXPECT_VERSION="$(python3 -c "import json; print(json.load(open('$GROUND_ROOT/config/version.json'))['version'])")"
  fi
  echo "smoke --expect-version 默认 SSOT: $EXPECT_VERSION"
fi

TMPDIR_SMOKE="$(mktemp -d /tmp/baota-smoke.XXXXXX)"
trap 'rm -rf "$TMPDIR_SMOKE"' EXIT

fail=0
warn_n=0
ok() { echo "OK  $*"; }
warn() { echo "WARN $*"; warn_n=$((warn_n+1)); }
err() { echo "ERROR $*"; fail=1; }

check_get() {
  local path="$1" code
  code="$(curl -sS -o "$TMPDIR_SMOKE/body" -w "%{http_code}" --max-time 20 "${BASE_URL}${path}" || echo "000")"
  if [[ "$code" == "200" ]]; then ok "GET $path → $code"
  else err "GET $path → $code (期望 200)"; fi
}

echo "== smoke-baota base=$BASE_URL =="

check_get "/console/api/health"
check_get "/console/api/version"
check_get "/login"
# Octop /agent 已废弃，不再 smoke

CE_BODY='{"source":"smoke-baota","message":"baota smoke ping","level":"info"}'
CE_CODE="$(curl -sS -o "$TMPDIR_SMOKE/ce" -w "%{http_code}" --max-time 20 \
  -X POST "${BASE_URL}/api/client-error" \
  -H 'Content-Type: application/json' -d "$CE_BODY" || echo "000")"
if [[ "$CE_CODE" == "200" ]]; then
  ok "POST /api/client-error → 200"
else
  CE_CODE2="$(curl -sS -o "$TMPDIR_SMOKE/ce2" -w "%{http_code}" --max-time 20 \
    -X POST "${BASE_URL}/agent/api/client-error" \
    -H 'Content-Type: application/json' -d "$CE_BODY" || echo "000")"
  # /agent 已废弃；/api/client-error 若未实现则 warn
  warn "POST /api/client-error → $CE_CODE（Octop fallback 已停用）"
fi

SCRIPT_DIR_SMOKE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSERT_SH="$SCRIPT_DIR_SMOKE/assert-latest-json.sh"
LATEST_FILE="$TMPDIR_SMOKE/latest.json"
if curl -sS --max-time 20 -o "$LATEST_FILE" "${BASE_URL}/downloads/mammoth-latest.json"; then
  ok "拉取 mammoth-latest.json"
  if [[ -x "$ASSERT_SH" ]]; then
    ASSERT_ARGS=(--file "$LATEST_FILE")
    [[ -n "$EXPECT_VERSION" ]] && ASSERT_ARGS+=(--expect-version "$EXPECT_VERSION")
    set +e
    ASSERT_OUT="$("$ASSERT_SH" "${ASSERT_ARGS[@]}" 2>&1)"
    ASSERT_RC=$?
    set -e
    printf '%s\n' "$ASSERT_OUT"
    if printf '%s\n' "$ASSERT_OUT" | grep -q '^ERROR '; then fail=1; fi
    if printf '%s\n' "$ASSERT_OUT" | grep -q '^WARN '; then warn_n=$((warn_n+1)); fi
    : # ASSERT_RC: 0=ok, 非0 已按 ERROR/WARN 计入
  else
    warn "无 assert-latest-json.sh，跳过 latest 断言"
  fi
else
  err "无法拉取 mammoth-latest.json"
fi

if [[ -n "$EXPECT_VERSION" ]]; then
  CV="$(curl -sS --max-time 15 "${BASE_URL}/console/api/version" || true)"
  echo "console/api/version → $CV"
  if echo "$CV" | grep -q "$EXPECT_VERSION"; then
    ok "version API 含期望版本 $EXPECT_VERSION"
  else
    err "version API 与 --expect-version $EXPECT_VERSION 不一致"
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "== smoke FAILED =="
  exit 1
fi
echo "== smoke PASSED (warns=$warn_n) =="
exit 0
