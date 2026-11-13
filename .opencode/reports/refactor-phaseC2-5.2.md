# 重构 Phase C2 · 5.2（mammoth-agent）

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`（工作区含他路在做改动，未触碰）
- 日期：2026-11-13（America/Los_Angeles）
- 未 commit/push/部署；未读 `.env`/凭据；未连库；未切分支
- 范围：mammoth-agent 的 `packages/api/gateway`、`packages/session/session-persistence-jsonl`、`packages/client/ui-settings-general`、`.gitattributes`、及两项只读核查。**未触碰** `ui-trajectory`、`ui-plugin-manager`、`experimental/client-ui-stats`

## 结果表

| 项 | 状态 | 行数变化 | 验证 | 风险 |
|---|---|---|---|---|
| 1 生成文件隔离 | 完成（gitattributes）；评估结论=不移出 src | `.gitattributes +6`；两个 catalog 文件 0 改动 | 头注释已含 gen+verify（未改）；check 脚本状态见下 | 低 |
| 2 抽测试支撑 | 核查完成，**不改代码**（结论：三者间已无跨文件重复） | 0 | jscpd 证据见 §2 | 无（未改） |
| 3 拆 gateway | 完成 | `src/index.ts 1749→1144（−605）`，新增 5 模块 777 行 | vitest `421/421`；`tsc -p tsconfig.host.json` 0 | 中（纯搬运，已逐符号核对） |
| 4 拆 session-persistence-jsonl | 部分完成（读/写类仍留类内，压缩/校验/存储类型/失败助手已分文件） | `src/index.ts 1874→1695（−179）`，新增 3 模块 252 行 | vitest `776 passed / 1 skipped`；`tsc` 0 | 中 |
| 5 死代码清理 | 部分完成（`DesktopUpdateIndicator` + 其 CSS + `openDesktopUpdate` 已删） | 组件 −35、CSS −38、contract −2、index −3、spec 净 −10 | vitest `100/100`；包内 `tsc` 0 | 低 |

## 1) 生成文件隔离

改：`.gitattributes:11-15`

```
packages/extensions/tool-cordis/src/api-catalog.ts linguist-generated=true
packages/extensions/cordis-client-runner/src/client/api-catalog.ts linguist-generated=true
packages/extensions/cordis-client-runner/src/client/slot-catalog.ts linguist-generated=true
```

- 头注释：三个文件均已写明「生成命令 + 校验命令（doc-sync gate）」，无需补：
  - `packages/extensions/tool-cordis/src/api-catalog.ts:2-4`（`pnpm run gen-cordis-api` / `verify-cordis-api`）
  - `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:2-4`（`gen-client-catalog` / `verify-client-catalog`）
  - `packages/extensions/cordis-client-runner/src/client/api-catalog.ts:2-4`（`gen-cordis-inspect-catalog` / `verify-cordis-inspect-catalog`）
- 内容/生成器逻辑：0 改动。

**是否移出 `src/`：不安全，不动。** 硬耦合清单：
1. 生成器 OUT 常量：`scripts/gen-cordis-catalog.ts:42`、`scripts/gen-client-catalog.ts:30`、`scripts/gen-cordis-inspect-catalog.ts:10`
2. 包导出通配 `"./src/*": "./src/*"`：`packages/extensions/tool-cordis/package.json`、`packages/extensions/cordis-client-runner/package.json`
3. 跨包按路径 import：`packages/typert/generator/tests/tools-catalog.spec.ts:8`
4. 生成器测试断言输出路径：`packages/typert/generator/tests/cordis-catalog.spec.ts:90`
5. vendor rescope 映射：`scripts/rescope-vendor.ts:152`
6. 文档链接：`docs/subsystems/slots.md:202`、`slots.zh.md:204`
7. per-file 100% 覆盖率门禁按 `packages/*/*/src` 取文件（`packages/client/AGENTS.md`），移出即改门禁口径
收益为 0（文件仍须在包内被 `tsdown` 入口引用），风险为 7 处联动改名 → 不做。

校验脚本当前状态（**基线已红，非本次引入**）：
- `npx tsx scripts/gen-client-catalog.ts --check` → `stale — slot-catalog.ts`（他路正在改 ui-trajectory / ui-plugin-manager / client-ui-stats，不能重生成，否则把他路半成品写进产物）
- `npx tsx scripts/gen-cordis-api.ts --check` → 报 21 条 JSDoc 违规，全在 `packages/api/session-controller/src/commands.ts:675,677`、`packages/preset/official-agent-gallery/src/{index.ts:917,919,task-composition.ts:71}`；`git status` 证明这些文件未被我修改

## 2) 抽测试支撑（核查结论：无需抽取）

- 目标三文件：`apps/web/tests/scaffold.ts`(1810)、`packages/experimental/liveshare/tests/viewer-fixture.client.ts`(4520)、`packages/test-support/session-snapshot/src/suite.ts`(1760)
- 实测 jscpd（绕过仓库配置里的 `**/tests/**` ignore，且不裁剪 ignorePattern）：
  - `minTokens=40`：3 文件 8090 行中仅 **6 处 clone / 45 行（0.56%）**，**全部是同文件内部孪生分支**（suite.ts:929↔1003、scaffold.ts:1501↔1511、viewer-fixture:984↔1074 / 1380↔1387 / 4112↔4191 / 4138↔4217）
  - `minTokens=25`：所有 clone 对的两端仍为同一文件，**跨文件 clone = 0**
- 原因：跨文件那层早已集中。`apps/web/tests/scaffold.ts:36-67` 直接从 `@mammoth-ai/mmp-session-snapshot` 引入 20 个 helper（`stabilizeRefreshLog` / `scrubSessionSnapshot` / `stabilizeFixtureMessageIds` / `redactSessionSnapshotIds` / `normalizeSessionSnapshots` / `formatSystemPromptSnapshot` / `parseSnapshotManifest` …）
- 未抽的两类残留及原因：
  - 同文件孪生分支（6-12 行，如 `preserveNormalizedVolatiles` 与 `collectNormalizedStringMappings` 的数组/对象遍历骨架）：抽出去只增加一层间接，两个函数语义不同（一个返回值、一个累积 map），不抽
  - 真正的跨文件「语义重复但不可直接并」：scaffold 的 `stableSessionFixture`（scaffold.ts:1190-1211）与 suite 的 record/refresh 写回链（suite.ts:1388-1402）。前者中间插了 web 专属变换（`normalizeWebSessionVolatiles`、`prepareSessionSnapshotFixtureForComparison`），并链顺序不同；合并需把变换做成参数，属行为敏感区（快照 oracle），本环境无浏览器/无可跑 `test:web` 与 `test:snapshot` 证据 → 不合并
- 结论：本项无可验证的收益，**未产生代码改动**；若主会话仍要降行数，应作为「web 断言模板迁入新 test-support 包」单列（迁移不是去重，且 scaffold 被 ~30 个 e2e 引用）

## 3) 拆 `packages/api/gateway/src/index.ts`

`1749 → 1144`，新增模块：

| 文件 | 行 | 内容（RPC 域） |
|---|---|---|
| `src/errors.ts` | 44 | `TypertGatewayError` + `GatewayErrorOptions` |
| `src/envelope.ts` | 124 | 成功结果编码（含 attachment 提取）、失败映射 `rpcFailure/rpcError`、`endpointOf`、`ConnectionRpcResult/Error` |
| `src/binding.ts` | 292 | `validateBinding/readBinding/originalOf`、SRC 参数名、`assertExactArguments/validateArguments`、`decode/assertJsonValue/isPlainObject/isObject` |
| `src/invocation.ts` | 290 | `methodSignal/assertPeerLive/isIterable`、`cancellableStream`、`UplinkDecoder`、`GatewayInvocation`、`releaseUplink`、`remoteCancelled` |
| `src/remote-event-queue.ts` | 57 | `RemoteEventQueue` + `RemoteEventWireFrame` |

- `index.ts` 保留：`Config`、`TypertGatewayService`（服务装配 + dispatch + 远端事件状态机）、事件帧校验、`remoteRequest`、`export default`；并新增 `export { TypertGatewayError } from './errors.ts'` 保持公共面不变
- `tsconfig.host.json` 是显式 `files` 白名单，已补 5 个新文件（否则 TS6307）
- 逐符号核对无遗漏：`originalOf`（index:353,362,852）、`readBinding`（index:856）、`releaseUplink`（index:492）、`remoteCancelled`（index:398,434）、`NEVER_ABORTED_SIGNAL`（index:784）均改为跨模块 import

## 4) 拆 `packages/session/session-persistence-jsonl/src/index.ts`

`1874 → 1695`，新增：

| 文件 | 行 | 内容 |
|---|---|---|
| `src/stored-log.ts` | 126 | `GenerationHeader` / `FrozenStoredEvents` / `StoredLogBase` / `CurrentStoredLog` / `PreparedStoredLog` / `StoredLog`、`ResolvedJsonlGeneration`、`MigrationPreparation`、`freezeStoredEvent(s)`、`fileRevision` |
| `src/fs-helpers.ts` | 100 | `isENOENT` / `isErrnoException` / `abortError` / `waitWithAbort` / `settleLimited` / `settledValues` |
| `src/encoding.ts` | 57 | 压缩/布局校验：`oppositeCompression`、`encodingMismatch`、`legacyLayout`、`assertUsableRoot`（签名改为显式 `(compression, path)` / `(root)`） |

- 读（`readStoredLog/stat/list`）、写（`persistBatch/persistHeader/acquireWriteLease/truncateTornTail`）仍是同一个类的成员：全部依赖 `this.root/this.compression/this.config/this.tracker/this.memo` 的私有状态机，直接搬会导致「事务/租约/恢复语义」跨文件重入。**剩余拆分未做**，需要先引入 `JsonlContext`（root/compression/config/tracker/limiter）再搬，属独立一批
- 未改任何行为：`settleLimited`/`waitWithAbort` 等函数体逐字搬运；`encoding.ts` 仅把 `this.x` 变参数

## 5) 死代码清理（证据 + 删除清单）

**删除项 1：`DesktopUpdateIndicator` 组件**
- 生产引用：0。`grep -rn "DesktopUpdateIndicator\b"`（ts/tsx/md）仅剩 `src/client/DesktopUpdateIndicator.tsx` 自身 CSS 导入，以及 `index.ts:36`（`DesktopUpdateBadge`）、`DesktopUpdateSection.tsx:5`（`updateCopy`）、两个 spec
- 改：
  - `src/client/DesktopUpdateIndicator.tsx`：删组件（原 53-82 行）与 `BUSY_PHASES`，删不再使用的 `IconDownloadOutlineRegular/IconLoadingOutlineRegular/DesktopUpdateView`；保留 `updateCopy`（`DesktopUpdateSection.tsx:5` 生产消费）与 `DesktopUpdateBadge`（`index.ts:36` 生产消费）
  - `...module.css`：删 `.indicator/.icon/.errorDot/.spinner/@keyframes spin/media query/.indicator[aria-disabled]`，保留 `.badge`（Badge 在用）
  - `tests/desktop-update.client.spec.tsx`：15 个用例改写为直接驱动 `DesktopUpdateSource` + `updateCopy`（保留全部用户可见文案断言：`新版本`/`Update`/`58%`/`0%`/`重试更新`/`下载更新失败，请重试。`/`安装更新失败，请稍后重试。`/全屏超时 inline snapshot 双语），用例数 15→15、通过 15，删除的只是随组件消失的几何/隐藏/连接优先级渲染断言

**删除项 2：`openDesktopUpdate`（契约成员 + 实现）**
- 生产引用：0。删前唯一实现 `src/client/index.ts:168-170`，唯一可能消费方是已删的 Indicator；`settings/open-section` 事件仍有生产 emitter（`packages/client/ui-workspace/src/client/index.ts:253`），故 `index.ts:259` 监听保留
- 改：`src/client/shell-contract.ts:42-43` 删成员+注释；`src/client/index.ts` 删实现；`tests/shell.client.spec.ts` 删 3 行断言（`row.openDesktopUpdate()` 与 `settings/open-section` 联动、legacy 分支调用）、`tests/settings-root.client.spec.tsx` 删 stub 1 行

**未删（有生产引用，审计 §7 里的其他项不属 mammoth-agent 或非死码）**：`updateCopy`、`DesktopUpdateBadge`、`desktop.update.*` locale 键（152 处仍在用）。

## 验证（实际命令 + 结果）

| 命令 | 结果 | 对照基线 |
|---|---|---|
| `npx vitest run packages/api/gateway` | 13 files / **421 passed** | 无失败 |
| `npx vitest run packages/session/session-persistence-jsonl` | 23 files / **776 passed / 1 skipped** | 无失败 |
| `npx vitest run packages/client/ui-settings-general` | 9 files / **100 passed** | 无失败 |
| 五包+settings 合跑（ui-trajectory / ui-plugin-manager / client-ui-stats / gateway / jsonl / ui-settings-general） | 73 files，**2060 passed / 11 failed / 1 skipped**；11 失败全部为 `ui-trajectory/tests/views.client.spec.tsx`（既有 locale 基线） | 通过 ≥2056 ✔、失败 =11（集合相同）✔ |
| `npx tsc --noEmit -p packages/api/gateway/tsconfig.host.json` | 0 errors | — |
| `npx tsc --noEmit -p packages/session/session-persistence-jsonl/tsconfig.json` | 0 errors | — |
| `npx tsc --noEmit -p packages/client/ui-settings-general/tsconfig.json` | 0 errors | — |
| `pnpm run typecheck` | 2 passed / **2 failed** / 1 skipped：①host aggregate = `scripts/ground-web-router.ts(98,63) TS2412`（既有基线）；②client compiler = 16 errors，**全部在 `../ground/apps/backend/src/library/*`**（`non-ground 错误数 = 0`） | ①=基线；②为他路在做的 Ground library 拆分（`ui-enterprise-library/tsconfig.ground-library.json` 未列新文件），非本次引入 |
| `pnpm run build --profile local` | **5 passed / 2 failed / 3 skipped**：host aggregate 仅基线 TS2412；client compiler 同上 16 个 `../ground/*` 错误 | 基线 9/1；新增失败项 100% 来自 `../ground/*`（证据：`npx tsc -b tsconfig.client.json` 过滤 `../ground/` 后剩余 0 条） |
| `npx oxlint`（gateway / jsonl / 改动的 spec） | 仅既有 `catalog-migration.ts:53 max-len`，新文件 0 问题 | — |
| jscpd（gateway+jsonl+settings+apps/web/tests） | 1 处 clone，位于未改动的 `desktop-update-source.ts`（HEAD 既有） | 无新增 |
| `npx tsx scripts/verify-export-jsdoc.ts` | 本次新增/搬运的导出符号 **0 违规**（已按 gate 补 `@param/@returns`）；仍报的 `update-locales.ts`、`SessionPersistence.remove`、`WorkspaceRegistry.*` 均为未改动文件的既有项 | 无新增 |
| 三包合跑（gateway+jsonl+ui-settings-general） | 45 files / **1297 passed / 1 skipped** | — |

**未验 + 原因**
- `test:coverage`（per-file 100%）：需全仓跑且当前工作区被他路改动污染（client-ui-stats 解析错误），未跑；新文件的行全部由既有/改写用例执行，但**没有覆盖率数字证据**
- `test:web` / `test:snapshot`：需构建产物与 Chrome/profile 启动，本次未跑；item 5 改的侧栏 update 胶囊在改动前已无生产渲染，故未触发快照变更（无快照文件被改）
- 生成文件校验：`verify-client-catalog` stale、`verify-cordis-api` 21 条 JSDoc 违规，均为基线红（他路改动），本次不能重生成

## 剩余风险

1. `gateway`/`jsonl` 新模块的 JSDoc 按 `verify-export-jsdoc` 补齐（该文件集合 0 违规）；但 `doc-sync` 其余 gate（`verify-cordis-api` 等）基线红，整套 doc-sync 未跑通
2. item 4 只搬了「压缩/校验/存储类型/失败助手」，读写仍在类内；主会话若要求彻底按读/写分文件，需先做 `JsonlContext` 抽取（独立一批）
3. item 5 删掉了侧栏 update 胶囊的最后一份实现；若产品后续要恢复该交互，需重写组件（已无源码），`updateCopy`/`Badge`/locale 键仍在，恢复成本低
4. 与他路并行：`client-ui-stats/src/client/StatsTable.tsx` 当前有重复 `Fragment` 导入（vitest 解析失败）、`ui-enterprise-library/tsconfig.ground-library.json` 缺 5 个 ground 新文件，二者都会让全仓 gate 变红，**归属他路**

## 交接

- 主会话：item 2 的「不抽取」结论、item 4 剩余拆分是否立独立单、item 5 是否要恢复侧栏更新胶囊（当前仅删码）
- 下一位改 gateway/jsonl 的人：新模块边界=errors/envelope/binding/invocation/queue（gateway）、stored-log/fs-helpers/encoding（jsonl），`tsconfig.host.json` 有显式 files 白名单，新增文件必须登记
