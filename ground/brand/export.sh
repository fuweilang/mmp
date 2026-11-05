#!/usr/bin/env bash
# 从 mengma-mark.png 导出所有品牌位图。依赖 macOS 自带 sips。
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/mengma-mark.png"
out="$here/out"

mkdir -p "$out"

# resize <输出名> <边长>
resize() {
  sips -z "$2" "$2" "$src" --out "$out/$1" >/dev/null
}

resize brand-mark.png 128
resize logo-icon.png 512
resize apple-touch-icon.png 180
resize pwa-192.png 192
resize pwa-512.png 512
resize favicon.png 48

echo "已导出到 $out"