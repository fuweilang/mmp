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
node "$root/scripts/library-test-target.mjs"
node "$root/scripts/library-docker-local.mjs"
export DATABASE_URL="$LIBRARY_TEST_DATABASE_URL"
pnpm --filter @mammoth/backend build
node --test scripts/library-backup.unit.test.mjs
pnpm --filter @mammoth/backend exec prisma migrate deploy
pnpm --filter @mammoth/backend test:library
pnpm --filter @mammoth/backend test:library:db
pnpm --filter @mammoth/backend test:library:http
pnpm --filter @mammoth/backend test:library:backup
pnpm --filter @mammoth/frontend typecheck
pnpm --filter @mammoth/frontend build
agent="$root/../mammoth-agent"
(cd "$root/apps/frontend" && "$agent/node_modules/.bin/vitest" run --config tests/library-upload.vitest.config.mjs)
cd "$agent"
pnpm exec vitest run packages/client/ui-enterprise-library/tests \
  packages/credentials/deepseek-account-platform/tests/ground-library.spec.ts \
  packages/client/ui-primitives/tests/markdown-application-links.client.spec.tsx \
  packages/client/ui-primitives/tests/markdown-file-links.client.spec.tsx \
  packages/client/ui-chat/tests/apply-inject.client.spec.tsx \
  packages/client/ui-chat/tests/chat-view.client.spec.tsx
pnpm run build:artifacts
pnpm run build:check
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/enterprise-library.e2e.ts
echo "资料库自动化与隔离恢复演练通过。模型回复在端到端测试中是 replay，不计作真实云模型验收。"
echo "Web / 桌面 / Console / Admin 人工矩阵与真实云模型需单独登记；未执行项不能计为通过。"
echo "测试账号由 fixture 正常登录创建并清理。专用 55439 数据库由调用方管理；55440 恢复容器由演练创建并清理。"
