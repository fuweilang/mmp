# 重构前回归基线 · 5.2

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`
- 日期：2026-11-13（America/Los_Angeles）
- 只读测试：未改源码、未 commit/push/部署、未读 `.env`/凭据、未连生产库
- 工作区已有本地改动（未触碰）：`ground/infra/production/compose.yml`、`production.env.example`、`mammoth-agent/scripts/{ground-web-router.ts,ground-web-router.spec.ts,serve-ground-web.ts}`

## 结果表

| 目标 | 命令 | exit | passed/failed/skipped | 已知失败（文件:行 + 断言） | 是否既有 |
|---|---|---|---|---|---|
| Ground 总门 | `cd ground && pnpm run verify` | 0 | verify:web（shared build + vue-tsc + vite build）、verify:api（nest build）全通过 | 无 | — |
| Ground 鉴权单测 | `pnpm --filter @mammoth/backend run test:auth` | 0 | 51 / 0 / 0 | 无 | — |
| Ground 资料库 | `pnpm --filter @mammoth/backend run test:library` | 1 | 68 / 1 / 0（69 tests, 6 suites） | `apps/backend/test/library/library.flow.spec.ts:357` `retryParse` 后 `parseStatus` 实际 `DOWNLOAD_ONLY`、期望 `READY` | 是（HEAD 干净复现；源码/test 均未改） |
| Ground 知识库核心 | `... run test:knowledge-core` | 0 | 34 / 0 / 0 | 无 | — |
| Ground 知识检索 | `... run test:knowledge-retrieval` | 0 | 18 / 0 / 0 | 无 | — |
| Ground 前端构建 | `pnpm --filter @mammoth/frontend build` | 0 | 构建成功 | 1 个 >500kB chunk：`index-C5P7aMqJ.js` 1,081.51 kB（gzip 357.00 kB） | 是（现状事实） |
| Agent 客户端构建 | `cd mammoth-agent && pnpm run build --profile local` | 1 | 9 gates passed / 1 failed / 0 skipped | host aggregate check：`scripts/ground-web-router.ts(98,63)` TS2412 `undefined` 不可赋给 `Timeout`（exactOptionalPropertyTypes） | 是（由工作区未提交改动 `M scripts/ground-web-router.ts` 引入，非 HEAD 源码） |
| Agent 五包定向 vitest | `npx vitest run packages/client/ui-trajectory packages/client/ui-plugin-manager packages/experimental/client-ui-stats packages/api/gateway packages/session/session-persistence-jsonl` | 1 | files 63/1/0（64）；tests 2056 passed / 11 failed / 1 skipped（2068） | `packages/client/ui-trajectory/tests/views.client.spec.tsx` 11 例：默认 tab 标签实际 `轨迹`、期望 `Trajectory`（:453-455、:538、:560 等）；单文件重跑 11 failed / 35 passed 稳定复现 | 是（HEAD 干净复现） |
| Ground 后端 tsc | `pnpm --filter @mammoth/backend exec tsc --noEmit -p tsconfig.json` | 1 | 46 errors，全部在 `test/**`（未含进 nest build） | `test/knowledge-core/ingestion.unit.test.ts` 26、`test/library/library.flow.spec.ts` 7、`ingestion.postgres.test.ts` 6、`test/official-skill/*` 6、`provider-dimension.unit.test.ts` 1 | 是（测试目录历史未过 tsc） |
| Ground 后端 tsc（build 配置） | `npx tsc --noEmit -p tsconfig.build.json` | 0 | 0 errors | 无 | — |
| Ground 前端 tsc | `pnpm --filter @mammoth/frontend exec vue-tsc --noEmit` | 0 | 0 errors | 无 | — |
| Agent typecheck | `pnpm run typecheck` | 1 | 4 gates passed / 1 failed | 同 `scripts/ground-web-router.ts(98,63)` TS2412 | 是（工作区未提交改动） |

## 已知失败根因（只记录，不修）

1. **资料库 retryParse 无法从 DOWNLOAD_ONLY 转 READY**（严重度：中；可稳定复现）
   - 复现：`pnpm --filter @mammoth/backend run test:library`，或单跑 `node --import tsx --test test/library/library.flow.spec.ts`（2 次均失败）
   - 实际 `DOWNLOAD_ONLY` / 期望 `READY`，`apps/backend/test/library/library.flow.spec.ts:357`
   - 代码：`apps/backend/src/library/library.service.ts:600-601` 明确允许 download-only 版本重解析，但 `apps/backend/src/library/library.store.ts:200` 与 `apps/backend/src/library/library.prisma-store.ts:148` 在 `parseStatus` 为 `DOWNLOAD_ONLY` 时直接返回 `'unchanged'`，导致新解析结果不落库。
   - 影响：回收/重试链路的解析状态可能永久停留在 DOWNLOAD_ONLY（不影响本次重构判定，但重构后该用例应保持当前结果或转绿，不能更差）。

2. **ui-trajectory 默认语言契约不一致**（严重度：低-中；11 例稳定失败）
   - 产品默认 zh：`mammoth-agent/packages/client/locale/src/client/bootstrap.ts:7-11` 注释即"Chinese product default"
   - 用例仍按默认 en 断言：`packages/client/ui-trajectory/tests/views.client.spec.tsx:453-455`（`Trajectory`）、`:560`
   - 复现：`npx vitest run packages/client/ui-trajectory/tests/views.client.spec.tsx` → 11 failed / 35 passed

3. **Agent 本地构建/typecheck 红**：仅由未提交工作区改动 `scripts/ground-web-router.ts:98`（`slot.timer = undefined` 与 `exactOptionalPropertyTypes` 冲突）导致，属本地 WIP，不要当基线源码缺陷。

## 阻塞 / 未验

| 项 | 原因 |
|---|---|
| `test:library:db`、`test:knowledge-core:db`、`test:knowledge-retrieval:db`、`test:*:http` | 需要已确认隔离 DB/HTTP fixture；本机 5433 有服务但无法确认其非真实企业库（禁读 `.env`），按红线未跑。**未记通过** |
| 真实 GUI / 桌面端 / 真实模型 | 本环境无可用的合法 GUI 会话、Electron 打包身份与云模型凭据，未验 |
| 前端运行时页面链路（登录→资料库→回收→审批） | 需起服务与真实身份，本次范围仅为构建/单测/类型检查基线，未验 |
| Agent 构建产物 `--profile local` 完整通过 | 被本地未提交 WIP 阻塞（见上），清理该改动前无法得到绿色基线 |

## 重构后必须不劣化的硬指标

1. `ground && pnpm run verify` 必须 exit 0（当前 0）。
2. Ground 前端构建 exit 0，且 `index-*.js` 首屏主 chunk ≤ 1,081.51 kB（gzip ≤ 357.00 kB），>500kB chunk 数量 ≤ 1。
3. `test:auth` 51/51 通过；`test:knowledge-core` 34/34；`test:knowledge-retrieval` 18/18。
4. `test:library` 通过数 ≥ 68/69，失败数 ≤ 1，且失败集合仍仅为 `library.flow.spec.ts:357`（不得新增失败）。
5. Ground `vue-tsc --noEmit` 0 errors；`tsc -p tsconfig.build.json` 0 errors。
6. Ground 后端 `tsc --noEmit -p tsconfig.json` 错误数 ≤ 46，且不得新增源文件（非 `test/**`）错误。
7. Agent 五包 vitest：通过 ≥ 2056、失败 ≤ 11、skip ≤ 1（files 通过 ≥ 63/64），失败集合不得超出 `ui-trajectory/views.client.spec.tsx` 的既有 11 例。
8. Agent `pnpm run build --profile local` 在干净工作区（去掉 `ground-web-router.ts` WIP）必须 10/10 gates 通过；若保留 WIP，失败 gate 不得多于 1 个。
9. Agent `pnpm run typecheck` 除 `scripts/ground-web-router.ts:98` 外 0 错误。
10. 路由懒加载/拆 api 后，前端构建产物体积不得回涨到使首屏 chunk > 1,081.51 kB 或新增 >500kB chunk。

## 证据

- `/tmp/verify-ground-5.2.log`（EXIT=0）
- `/tmp/fe-build-5.2.log`（EXIT=0，chunk 表）
- `/tmp/be-test-{auth,library,knowledge-core,knowledge-retrieval}.log`
- `/tmp/be-libflow-rerun.log`（单文件复现）
- `/tmp/build-agent-5.2.log`（9/1）
- `/tmp/agent-vitest-5.2.log`（2056/11/1）
- `/tmp/agent-vitest-trajectory-single.log`（11/35）
- `/tmp/be-tsc-5.2.log`（46 errors）、`/tmp/be-tsc-build-5.2.log`（0）、`/tmp/fe-tsc-5.2.log`（0）、`/tmp/agent-tsc-5.2.log`（TS2412）
