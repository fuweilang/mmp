# refactor-phaseE · 前端测试脚本接入（5.2）

时间：2026-11-13（America/Los_Angeles）
分支：5.2（未 commit/push；未动 `.github/workflows`；未读 `.env`）
来源缺陷：浪哥 P1-1「本轮新增/迁移的前端组件测试没有接进任何脚本」

## 结论

| 项 | 值 |
|---|---|
| 前端一条命令 | `pnpm --filter @mammoth/frontend test`（= `test:unit` + `test:ui`） |
| 根聚合 | `pnpm run test:web` |
| 组件测试 | 11 files / **97 passed** / 0 failed |
| node:test 工具测试 | 7 files / **34 passed** / 0 failed |
| 合计 | 18 files / 131 passed / 0 failed |
| 进 `verify` | **否**（单独脚本；理由见 §4） |
| `pnpm run verify` | exit 0，16s |

## 1. 改动清单

| path:line | 内容 |
|---|---|
| `ground/apps/frontend/vitest.config.mjs:1-42`（新增） | 前端组件测试统一配置：`root` = frontend，`environment: 'jsdom'`（:30），`include: ['tests/**/*.client.spec.ts']`（:32，glob 而非显式文件清单，后续新 spec 自动纳入）。别名 `@`、`@mammoth/shared`、`@upload-fixture`/`@library-fixture`/`@admin-library-fixture`/`@custody-fixture`，并复用 mammoth-agent 的 vitest 单实例（避免 `vi` 双份）。 |
| `ground/apps/frontend/scripts/run-vitest.mjs:1-22`（新增） | 启动器：从 sibling `mammoth-agent` 解析已存在的 `vitest` CLI（:13 `resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')`），默认 `run` 模式，转发额外参数（:17）。不新增任何依赖。 |
| `ground/apps/frontend/package.json:11-13` | `test` = `test:unit && test:ui`；`test:unit` = `node --import tsx --test "tests/*.test.ts" "test/*.test.ts" "src/utils/*.unit.test.ts"`；`test:ui` = `node scripts/run-vitest.mjs`。 |
| `ground/package.json:18-19` | `test:web` = `pnpm --filter @mammoth/frontend test`；`test:web:ui` = 仅组件测试（快路径）。 |
| `ground/apps/frontend/tests/library-upload-contract.test.ts:20` | **既有失败修正**：原断言 `doesNotMatch(AdminLibrary, /type="file"\|LibraryUploadDialog/)` 与现状矛盾——`src/views/admin/AdminLibrary.vue:51` 已改为复用共享 `LibraryUploadDialog`（:63 import），两个文件在 HEAD 均未改动，故属既有红。改为 `match(/<LibraryUploadDialog/)` + `doesNotMatch(/<input[^>]*type="file"/)`：与同文件其它视图断言方向一致，仍禁止原生 file input（不是放宽）。 |

未删除 `tests/admin-table.vitest.config.mjs` 等 4 个历史 config：仍可单独复现 phaseA/C 报告里的命令；新 config 为唯一的全量入口。

## 2. 验证命令与结果

```
$ cd ground && pnpm run test:web
> test:unit → node --import tsx --test ...
ℹ tests 34  ℹ pass 34  ℹ fail 0  ℹ skipped 0
> test:ui → node scripts/run-vitest.mjs
 Test Files  11 passed (11)
      Tests  97 passed (97)
 Duration  9.57s
 exit 0，总耗时 10.6s
```

覆盖的 11 个 `*.client.spec.ts`：`admin-table`、`admin-platform-membership`、`expert-editor`、`agent-web-url`、`knowledge-files`、`library-admin`、`library-dialog`、`library-members`、`library-purge`、`library-sharing`、`library-upload`。

其中 `library-members.client.spec.ts` 此前**不在任何 config 的 include 里**（旧 4 个 config 文件清单相加漏掉它），新 glob 已纳入。

```
$ cd ground && pnpm run verify
 exit 0（16.2s：shared build + vue-tsc + vite build + prisma generate + nest build）
```

## 3. 失败逐条

| 用例 | 归类 | 处理 |
|---|---|---|
| `tests/library-upload-contract.test.ts:20`「new and replacement upload entrypoints…」 | **既有**（测试与被测文件 HEAD 均未改，`AdminLibrary.vue` 早已改用共享组件） | 断言按当前契约对齐并保留「禁原生 input」；现通过 |

本轮新增/迁移的组件测试 0 失败。

## 4. 为什么不进 `verify`

- `verify` 现 16.2s，`test:web` 约 10.6s → **+65%**，且组件测试是 jsdom 全量挂载，会随 spec 增长继续变慢。
- `test:web` 依赖 sibling 工作区 `../mammoth-agent/node_modules`（本仓库既有 4 个 `*.vitest.config.mjs` 采用同一做法，未在本仓库安装 vitest）。只 checkout `ground` 的 CI 会直接失败，塞进 `verify` 会把"构建可用"与"外部工作区存在"绑死。
- 建议由 DeepSeek 决定是否在 CI 里作为**独立 job**（需连同 mammoth-agent 一起 checkout，且不得改 workflow 除非授权）。

## 5. 未验与风险

- 未验：CI 环境（本次只本机跑）。未验：`pnpm install --frozen-lockfile` 后新目录是否仍可解析（未改 `package.json` 依赖、未改 lockfile，理论上无影响）。
- 风险（低）：新入口仍耦合 sibling 路径 `../../../mammoth-agent`，与既有 config 一致；若将来 mammoth-agent 目录改名/移除，5 个 config + 1 个启动器需同步。
- 风险（低）：`test:unit` 只收 `tests/*.test.ts`、`test/*.test.ts`、`src/utils/*.unit.test.ts` 三类 glob，新增别处的 node:test 文件不会被自动纳入（vitest 侧已用 glob 兜住）。

## 6. 交接

- 浪哥：P1-1 是否可关；§4「独立 CI job」需 DeepSeek 决策（涉及 workflow 授权）。
- 秋池：复验 `cd ground && pnpm run test:web` → 131 passed / 0 failed；`pnpm run verify` exit 0。
