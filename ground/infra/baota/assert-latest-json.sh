#!/usr/bin/env bash
# assert-latest-json.sh — 检查 mammoth-latest.json（shell/portable 分裂警告）
# 用法:
#   ./assert-latest-json.sh [--url URL | --file PATH] [--expect-version V] [--strict]
# 默认拉取 https://www.mmai.vip/downloads/mammoth-latest.json
# 分裂 / expect 不符 → WARN（exit 0）；解析失败或 --strict 时 WARN 也失败。
set -euo pipefail

URL=""
FILE=""
EXPECT_VERSION=""
STRICT=0
DEFAULT_URL="${BAOTA_BASE_URL:-https://www.mmai.vip}/downloads/mammoth-latest.json"

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --file) FILE="${2:-}"; shift 2 ;;
    --expect-version) EXPECT_VERSION="${2:-}"; shift 2 ;;
    --strict) STRICT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -n "$URL" && -n "$FILE" ]]; then
  echo "错误: --url 与 --file 互斥" >&2
  exit 2
fi

TMP="$(mktemp /tmp/assert-latest.XXXXXX.json)"
trap 'rm -f "$TMP"' EXIT

if [[ -n "$FILE" ]]; then
  [[ -f "$FILE" ]] || { echo "ERROR 文件不存在: $FILE" >&2; exit 1; }
  cp "$FILE" "$TMP"
  echo "OK  使用本地文件 $FILE"
elif [[ -n "$URL" ]]; then
  curl -sS --max-time 20 -o "$TMP" "$URL" || { echo "ERROR 无法拉取 $URL" >&2; exit 1; }
  echo "OK  拉取 $URL"
else
  curl -sS --max-time 20 -o "$TMP" "$DEFAULT_URL" || { echo "ERROR 无法拉取 $DEFAULT_URL" >&2; exit 1; }
  echo "OK  拉取 $DEFAULT_URL"
fi

set +e
EVAL_OUT="$(EXPECT_VERSION="$EXPECT_VERSION" LATEST_FILE="$TMP" python3 - <<'PY'
import json, os, sys
path = os.environ["LATEST_FILE"]
expect = os.environ.get("EXPECT_VERSION") or ""
warn = 0
err = 0
try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except Exception as e:
    print(f"ERROR 解析 mammoth-latest.json: {e}")
    sys.exit(2)

def dig_version(node):
    if node is None:
        return None
    if isinstance(node, str):
        return node
    if isinstance(node, dict) and "version" in node:
        return node.get("version")
    return None

shell_v = dig_version(data.get("shell"))
portable_v = dig_version(data.get("portable"))
dashboard_v = dig_version(data.get("dashboard"))
code_v = dig_version(data.get("code"))

plats = data.get("platforms") or {}
if isinstance(plats, dict):
    for _p, meta in plats.items():
        if not isinstance(meta, dict):
            continue
        if shell_v is None:
            shell_v = dig_version(meta.get("shell"))
        if portable_v is None:
            portable_v = dig_version(meta.get("portable"))

print(f"OK  versions: shell={shell_v} portable={portable_v} dashboard={dashboard_v} code={code_v}")
if shell_v and portable_v and str(shell_v) != str(portable_v):
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    print(f"WARN  VERSION SPLIT: shell={shell_v} != portable={portable_v}")
    print("WARN  若本次只发壳，请在发版说明写明 portable 仍为旧版；否则请同步升 portable。")
    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    warn = 1
if expect and shell_v and str(shell_v) != str(expect):
    print(f"WARN  latest shell={shell_v} 与 --expect-version {expect} 不一致")
    warn = 1
# per-platform splits
if isinstance(plats, dict):
    for p, meta in plats.items():
        if not isinstance(meta, dict):
            continue
        sv = dig_version(meta.get("shell"))
        pv = dig_version(meta.get("portable"))
        if sv and pv and str(sv) != str(pv):
            print(f"WARN  platform {p}: shell={sv} != portable={pv}")
            warn = 1
sys.exit(2 if err else (1 if warn else 0))
PY
)"
rc=$?
set -e
printf '%s\n' "$EVAL_OUT"

if [[ "$rc" -eq 2 ]]; then
  echo "== assert-latest FAILED (parse/error) =="
  exit 1
fi
if [[ "$rc" -eq 1 ]]; then
  if [[ "$STRICT" -eq 1 ]]; then
    echo "== assert-latest FAILED (--strict, has WARN) =="
    exit 1
  fi
  echo "== assert-latest PASSED with WARN =="
  exit 0
fi
echo "== assert-latest PASSED =="
exit 0
