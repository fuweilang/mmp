#!/usr/bin/env bash
echo '旧版 Octop 发布入口已停用，请使用 ground/infra/production/build-local.sh 和生产交接文档。' >&2
exit 1
# NOTE: Octop 已废弃；--mid octop 无效，客户端/publish-desktop 已移除。只用 api|web|all(仅 api+web)。
# fast-release.sh — 并行快发编排（中台 ∥ 客户端）。默认 dry-run 只打印，不连生产。
# 默认 --no-client（只编排中台）；加 --dispatch 才启用客户端并真触发 CI。
# 用法:
#   ./fast-release.sh [--mid api|octop|web|all] [--platforms LIST] [--ref BRANCH]
#                     [--dispatch] [--no-client] [--hotfix] [--dry-run] [--help]
# 默认: --dry-run + --no-client；platforms=darwin-arm64,darwin-amd64,windows-amd64
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROUND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM_ROOT="$(cd "$GROUND_ROOT/.." && pwd)"
OCTOP_DIR="${PLATFORM_ROOT}/Octop"

MID=""
PLATFORMS="darwin-arm64,darwin-amd64,windows-amd64"
REF=""
DO_DISPATCH=0
NO_CLIENT=1
USE_HOTFIX=1
DRY_RUN=1

usage() {
  cat <<'EOFU'
用法: ./fast-release.sh [选项]

  --mid api|octop|web|all   中台要发的服务（必填才真正有用；缺省会提示）
  --platforms LIST          客户端平台，逗号分隔；默认 darwin-arm64,darwin-amd64,windows-amd64
                            正式大版本才填 all；单机 Mac 可 darwin-arm64
  --ref BRANCH              gh workflow --ref；默认读 Octop 当前分支，否则 3.0
  --dispatch                启用客户端并真跑 gh workflow（需本机已登录 gh）
                            隐含打开客户端编排；热修默认 desktop-hotfix.yml
  --no-client               只编排中台（默认已是；与 --dispatch 互斥时以最后出现为准）
  --hotfix                  客户端走 desktop-hotfix.yml（默认；矩阵写死三平台）
  --full-desktop            客户端走 octop-desktop.yml（正式/自定义 platforms）
  --dry-run                 只打印命令（默认开启）
  -h|--help                 本帮助

并行模型（墙上时钟）:
  T0 门禁绿后同时: A 中台 preflight→release→smoke  ∥  B gh dispatch（指定 platforms）
  T1 B 完成后: ./publish-desktop-baota.sh（gh download→scp→latest；默认 dry-run）
  墙上时间 ≈ max(中台, CI+上传)，不是相加。

默认不编排客户端；加 --dispatch 才触发。本脚本不自动 scp 生产。
EOFU
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mid)
      MID="${2:-}"
      shift 2
      ;;
    --platforms)
      PLATFORMS="${2:-}"
      shift 2
      ;;
    --ref)
      REF="${2:-}"
      shift 2
      ;;
    --dispatch)
      DO_DISPATCH=1
      NO_CLIENT=0
      DRY_RUN=0
      shift
      ;;
    --no-client)
      NO_CLIENT=1
      DO_DISPATCH=0
      shift
      ;;
    --hotfix)
      USE_HOTFIX=1
      shift
      ;;
    --full-desktop)
      USE_HOTFIX=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      DO_DISPATCH=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REF" ]]; then
  if [[ -d "$OCTOP_DIR/.git" ]] || git -C "$OCTOP_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    REF="$(git -C "$OCTOP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$REF" || "$REF" == "HEAD" ]]; then
    REF="3.0"
  fi
fi

case "$MID" in
  ""|api|octop|web|all) ;;
  *)
    echo "错误: --mid 必须是 api|octop|web|all，收到: $MID" >&2
    exit 2
    ;;
esac

mid_flags() {
  case "$MID" in
    api) echo "--api" ;;
    octop) echo "--octop" ;;
    web) echo "--web" ;;
    all) echo "--all" ;;
    *) echo "" ;;
  esac
}

echo "=============================================="
echo " 猛犸并行快发编排（默认 dry-run + no-client）"
echo " PLATFORM_ROOT=$PLATFORM_ROOT"
echo " ref=$REF  platforms=$PLATFORMS  mid=${MID:-<未选>}  dispatch=$DO_DISPATCH  no_client=$NO_CLIENT  hotfix=$USE_HOTFIX"
echo "=============================================="
echo
echo "【0】dispatch 前门禁必须绿（本地/CI）。红门禁禁止常态 dispatch。"
echo "  检查提醒:"
echo "    - gh run list / PR checks：octop-desktop 相关与仓库 CI 全绿"
echo "    - 本地: ./preflight-baota.sh --track fast"
echo "    - 热修 SHA 已在将发分支（$REF）；禁只改生产容器"
echo

if [[ "$NO_CLIENT" -eq 0 ]]; then
  echo "【B · 客户端】与中台并行启动（T0）"
  echo "  分层优先（能 zip 就别打 220MB）:"
  echo "    $OCTOP_DIR/scripts/mammoth-dashboard-release.sh <ver>"
  echo "    $OCTOP_DIR/scripts/mammoth-release.sh --version <ver> --dashboard|--code --runtime <rt> --dry-run"
  echo "  推荐热修三平台（勿无脑 all）：$PLATFORMS"
  if [[ "$USE_HOTFIX" -eq 1 ]]; then
    echo "  热修优先 workflow: desktop-hotfix.yml（矩阵写死三平台，默认 attach_release=false）"
    echo "  命令（可照抄）:"
    echo "    cd $OCTOP_DIR"
    echo "    gh workflow run desktop-hotfix.yml --ref $REF \\"
    echo "      -f attach_release=false"
    echo "  正式挂 Release: -f attach_release=true -f release_tag=vX.Y.Z"
    echo "  （自定义 platforms / 全量用 --full-desktop → octop-desktop.yml）"
    if [[ "$DO_DISPATCH" -eq 1 ]]; then
      if ! command -v gh >/dev/null 2>&1; then
        echo "错误: 需要 gh CLI" >&2
        exit 1
      fi
      echo "  → 正在 dispatch desktop-hotfix.yml…"
      (
        cd "$OCTOP_DIR"
        gh workflow run desktop-hotfix.yml --ref "$REF" \
          -f attach_release=false
      )
      echo "  已触发。可用: gh run list --workflow=desktop-hotfix.yml --limit 3"
      echo "  以及被它拉起的: gh run list --workflow=octop-desktop.yml --limit 3"
    else
      echo "  （dry-run：未执行 gh；加 --dispatch 才真跑）"
    fi
  else
    echo "  全量/自定义: octop-desktop.yml"
    echo "  命令（可照抄）:"
    echo "    cd $OCTOP_DIR"
    echo "    gh workflow run octop-desktop.yml --ref $REF \\"
    echo "      -f platforms=$PLATFORMS \\"
    echo "      -f attach_release=false"
    echo "  正式挂 Release 时再加: -f attach_release=true -f release_tag=vX.Y.Z"
    if [[ "$DO_DISPATCH" -eq 1 ]]; then
      if ! command -v gh >/dev/null 2>&1; then
        echo "错误: 需要 gh CLI" >&2
        exit 1
      fi
      echo "  → 正在 dispatch octop-desktop.yml…"
      (
        cd "$OCTOP_DIR"
        gh workflow run octop-desktop.yml --ref "$REF" \
          -f "platforms=$PLATFORMS" \
          -f attach_release=false
      )
      echo "  已触发。可用: gh run list --workflow=octop-desktop.yml --limit 3"
    else
      echo "  （dry-run：未执行 gh；加 --dispatch 才真跑）"
    fi
  fi
  echo
else
  echo "【B · 客户端】已跳过（默认 --no-client；要客户端请加 --dispatch）"
  echo "  分层热修仍可单独跑: mammoth-dashboard-release / mammoth-release --dashboard|--code"
  echo
fi

echo "【A · 中台】与客户端并行（T0）；末尾必须 smoke（禁常态 --skip-smoke）"
# 页眉：单一版本源（分支名 ≠ 版本号）
SSOT_VERSION=""
if [[ -x "$SCRIPT_DIR/resolve-mammoth-version.sh" ]]; then
  SSOT_VERSION="$("$SCRIPT_DIR/resolve-mammoth-version.sh" 2>/dev/null || true)"
fi
if [[ -n "$SSOT_VERSION" ]]; then
  echo "MAMMOTH_VERSION SSOT=$SSOT_VERSION  ← ground/config/version.json（AI 默认不问；发版成功后再 bump）"
else
  echo "WARN: 无法读取 ground/config/version.json" >&2
fi

if [[ -z "$MID" ]]; then
  echo "  ⚠ 未指定 --mid。请按改动选择其一后重跑，或照抄："
  echo "    ./preflight-baota.sh --track fast"
  echo "    ./release-baota-mid.sh --api|--octop|--web|--all   # 先 --dry-run；禁 --no-cache"
  echo "    ./smoke-baota.sh"
else
  FLAGS="$(mid_flags)"
  echo "  1) $SCRIPT_DIR/preflight-baota.sh --track fast"
  echo "  2) $SCRIPT_DIR/release-baota-mid.sh $FLAGS"
  echo "  3) smoke 已由 release-baota-mid 末尾调用；也可单独: ./smoke-baota.sh"
  echo "  干跑中台（推荐先看）:"
  echo "    ./release-baota-mid.sh $FLAGS --dry-run"
fi
echo

if [[ "$NO_CLIENT" -eq 0 ]]; then
  echo "【T1 · B 完成后】Actions 产物直传宝塔（默认 dry-run）"
  echo "  $SCRIPT_DIR/publish-desktop-baota.sh --run-id <id> --version <ver>"
  echo "  $SCRIPT_DIR/publish-desktop-baota.sh --run-id <id> --version <ver> --apply   # 真传；覆盖前 *.bak-<ts>"
  echo "  或已有本地包: --dir <artifacts> --version <ver> [--apply]"
  echo "  断言: ./assert-latest-json.sh [--expect-version <ver>]"
  echo "  墙上时间 ≈ max(中台, CI+上传)，不是串行相加。"
  echo
fi

echo "【反例】串行等中台完再 dispatch + platforms=all → 最慢。"
echo "【P0】挂载 OCTOP_HOME/secrets、本地 linux/amd64 build+save/load（禁宝塔源码/build）、禁 --no-cache、热修入库、杀本机 pnpm octop、client-error/bridge smoke、云端 sticky、单主操。"
echo "详见: ../../.opencode/skills/baota-release/SKILL.md 与 docs/release/fast-parallel.md"
echo "完成（本脚本未自动连生产做中台发版）。"
