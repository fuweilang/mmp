#!/bin/sh
# 资料库集中验收。只连调用方自己导出的本地库，不读生产凭据，也不打印连接串。
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"
if [ -z "${LIBRARY_TEST_DATABASE_URL:-}" ]; then
  echo "请先导出 LIBRARY_TEST_DATABASE_URL，指向已安装 pgvector 的本地 Postgres。" >&2
  echo "不要把生产库地址写进这个脚本。" >&2
  exit 2
fi
export DATABASE_URL="$LIBRARY_TEST_DATABASE_URL"
pnpm --filter @mammoth/backend exec prisma migrate deploy
pnpm --filter @mammoth/backend test:library
pnpm --filter @mammoth/backend test:library:db
echo "迁移和资料库测试已跑完。启动 API：在 ground 目录执行 DATABASE_URL 已导出的 pnpm dev:api，前端 pnpm dev:web。"
echo "测试账号由 library.postgres.spec.ts 临时创建并在结束时删除，没有固定口令。"
