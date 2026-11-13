# 5.2 全量回归复验（秋池）

- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`（重构改动全部未提交）
- 时间：2026-11-13 13:12–13:42 America/Los_Angeles
- 只读：未改源码、未 commit/push/部署、未读 `.env`/凭据、未连库；仅写 `/tmp` 日志与本报告
- 运行前后 `git status --porcelain` 均为 **102** 项，未见他人并发改文件
- 对照基线：`.opencode/reports/baseline-5.2.md`

## 1. 硬指标对比

| # | 指标 | 基线 | 现状 | 判定 |
|---|---|---|---|---|
| 1 | `cd ground && pnpm run verify` | exit 0 | **exit 0**；`grep -c "error TS"`=0（`/tmp/qa-final-verify.log`） | ✅ |
| 2 | 前端首屏 | index ≤1,081,721 B；gzip ≤355,930 B；无 `admin-api` preload；>500 kB ≤1 | **1,081,721 B**（`index-hZCs5JYD.js`）；`gzip -6` **355,927 B**；`index.html` 无 `modulepreload`；`dist/assets` 无 `admin-api-*`；>500 kB **1 个** | ✅ |
| 3 | `test:auth` / `knowledge-core` / `knowledge-retrieval` | 51/51、34/34、18/18 | **51/51**、**34/34**、**18/18**（0 fail，0 skip） | ✅ |
| 4 | `test:library` | 68 通过 / 1 失败（69），失败仅 `flow.spec.ts:357` | **72 通过 / 1 失败（73）**；唯一失败仍为 `library.flow.spec.ts:357`（`DOWNLOAD_ONLY` vs `READY`） | ✅ |
| 5 | `vue-tsc --noEmit`；`tsc -p tsconfig.build.json` | 0；0 | **0**（日志 0 行）；**exit 0** | ✅ |
| 6 | 后端 `tsc -p tsconfig.json` | 46，全 `test/**` | **46**；分布 26+7+6+1+1+4+1，全 `test/**`；`src/**` **0** | ✅ |
| 7 | Agent 五包+settings 合跑 | ≥2056 通过 / ≤11 失败 / ≤1 skip | **2156 通过 / 11 失败 / 1 skip**（73 files：72 pass/1 fail）；11 失败全在 `ui-trajectory/tests/views.client.spec.tsx` | ✅ |
| 8 | `mammoth-agent build --profile local` | 9 passed / 1 failed | **9 passed / 1 failed / 0 skipped**；唯一失败 `scripts/ground-web-router.ts(98,63) TS2412` | ✅ |
| 9 | `mammoth-agent typecheck` | 4 passed / 1 failed（同 TS2412） | **4 passed / 1 failed**；`grep "error TS"` 仅 1 行（同 TS2412） | ✅ |

补充：6 个包单独 `tsc --noEmit`（ui-trajectory / ui-plugin-manager / client-ui-stats / gateway / jsonl / ui-settings-general）全部 **exit 0**。

## 2. 行为正确性抽查

| 项 | 结论 | 证据 |
|---|---|---|
| 1 事务语义（`LibraryContext`） | **正确** | `library.context.ts:44-51` 唯一入口 `withWrite`；`library.mutate.ts:40-47` `rebind` 后同一 ctx；`library.prisma-store.ts:47-53` 已包裹 `TransactionClient` 时复用不嵌套；`library.store.ts:93-110` 内存库 AsyncLocalStorage 重入 + 快照回滚。`library.context.spec.ts` 4 例全过（单事务、后步失败整体回滚、外层事务复用、ctx 透传）；`uploadOwned` 失败仍由外层 `deleteBlob` 清理（对照 HEAD `library.service.ts:396-410` 一致） |
| 2 admin 页 `useAdminTable` | **F2 确已修对** | `useAdminTable.ts:33,66-70` 默认重置、可用 `resetPageOnSizeChange:false` 关闭；`useOfficialAgents.ts:54` 传 `false`；`AdminOfficialAgentsList.vue:155-157` 只 emit，容器 `AdminOfficialAgents.vue:47-48` 回写。越界由 Element Plus `pagination.mjs:240-253` clamp 并 emit `current-change`（`:201` 判定有监听），容器 `onPageChange` 回写 → 与 HEAD `v-model` 语义一致。其余 5 页仍“改 pageSize 回第 1 页”（HEAD `AdminUsers.vue:361-364` 同）；Skills 仍 v-model + `clampOnShrink`（HEAD `:302-305` 同）；Roles 无分页、`onReset` 不重载同原 |
| 3 `bulkGrant` 部分成功 | **语义未改** | `admin-official-agent.grant.service.ts:99-190` 与 HEAD 同函数逐行 diff 仅 `this.prisma→prisma`、`this.audit→auditOfficialAgent`、`this.load→presenter.load`；串行/无整体事务/失败 continue/`skipped` 不重复 upsert/末尾汇总审计均在。专项测试 2/2 通过（`[error,error,error,skipped,granted]`、`upserts=['t-ok']`、summary 计数） |
| 4 组件拆分导出面 | **未变** | TrajectoryTable 导出 4=4；StatsTable 原 14 个符号全在（新增 44 个文件级再导出，均未进 `index.ts` 公共 barrel）；PluginManagerPage 原 2 个 + 新增 `RenderConfig/ResolveText`（未进 barrel）。四包 `index.ts` 与 HEAD diff 仅 ui-settings-general 删 `openDesktopUpdate`（C2 死码）。抽查 props：`TrajectoryTableProps` 与 HEAD 逐行相同、`TrajectoryTable` 函数头一致；`TotalsRowProps` 一致；`PluginManagerPageProps` 与 HEAD 逐字相同 |
| 5 死代码删除 | **无生产引用** | `grep DesktopUpdateIndicator`：仅保留的 `DesktopUpdateBadge`/`updateCopy`（`index.ts:36`、`DesktopUpdateSection.tsx:5`）、两个测试、旧 `lib/*.d.ts` 产物；`grep openDesktopUpdate`：**0 命中**。删除项确无生产消费 |
| 6 生成文件与头注释 | **生成物 0 改动，校验脚本不受影响** | `git diff a01b1d59` 三个 catalog 文件为空；`.gitattributes:11-15` 仅 `linguist-generated=true`（非构建输入）；头注释原本已含 gen+verify 命令。校验现状：`gen-client-catalog --check` stale、`gen-cordis-api --check` 21 条 JSDoc 违规——在 **HEAD 干净树副本**上复跑 client-catalog 同样 stale → **基线既有，非重构引入**；cordis-api 违规文件（`session-controller/src/commands.ts:675,677` 等）本次未改 |

## 3. 测试补证（本轮命令）

| 命令 | 结果 |
|---|---|
| `vitest --config tests/admin-table.vitest.config.mjs` | 2 files / **11 passed** |
| `vitest --config tests/expert-editor.vitest.config.mjs` | 2 files / **41 passed** |
| `node --import tsx --test library.context.spec.ts official-agent-admin-bulk-grant.unit.test.ts` | **6/6 passed** |

## 4. 未通过项（均为基线既有，无新增）

| 项 | path:line | 严重度 | 说明/修法 |
|---|---|---|---|
| retryParse 不落库 | `ground/apps/backend/src/library/library.store.ts:200`、`library.prisma-store.ts:148`；用例 `test/library/library.flow.spec.ts:357` | 中（既有） | `DOWNLOAD_ONLY` 时 store 返回 `unchanged`；需在 store 允许 download-only 重解析后写回。非本次重构引入，重构后结果未更差 |
| 11 例 locale 断言失败 | `mammoth-agent/packages/client/ui-trajectory/tests/views.client.spec.tsx:453,538,560,571,608,637,691,716,748,786,1596` | 低-中（既有） | 用例按默认 en 断言，产品默认 zh（`packages/client/locale/src/client/bootstrap.ts:7-11`）。属测试契约待改，非组件拆分回归 |
| 构建/typecheck 唯一红 | `mammoth-agent/scripts/ground-web-router.ts:98` | 低（工作区 WIP） | `slot.timer = undefined` 与 `exactOptionalPropertyTypes` 冲突；改 `Timeout \| undefined` 或 `delete slot.timer` 即绿 |
| doc-sync 基线红 | 生成物 `slot-catalog.ts` stale；`gen-cordis-api` 21 条 JSDoc | 低（既有） | HEAD 副本可复现。冻结后由归属方重生成 catalog / 补 JSDoc；本次不做 |

阶段 A 余项 F3（新建/保存后不回读归一化行、编辑器 status 快照）仍未修，仅影响回填/确认文案，无数据错误，列残余风险。

## 5. 未验 / 阻塞

| 项 | 原因 |
|---|---|
| `test:library:db`、`test:knowledge-*:db`、`test:*:http` | 需已确认隔离 DB/HTTP fixture，未连库，**不记通过** |
| 真实 GUI / 桌面端 / 真实云模型 | 无合法浏览器身份、Electron 打包身份与模型凭据，未验；pageSize 翻页仅代码级验证（Element Plus 源码 + jsdom），未手工点测 |
| 全仓 `test:coverage`（per-file 100%） | 未跑长跑覆盖率；拆分文件覆盖率沿用 C1/C2 报告，本轮未复测 |
| 完整 doc-sync 全绿 | 被上述基线红阻塞 |

## 6. 结论

- 9 项硬指标**全部达标**，无一项劣化；行为抽查 6 项全部通过（F2 确认修正正确）。
- 未发现本次重构引入的新缺陷；现存红项均可在 HEAD/基线复现或属工作区 WIP。
- **可以定稿**。放行条件：上述基线红按既有豁免；`slot-catalog` / cordis JSDoc 在冻结后由归属方补一次（不阻塞本次重构验收）；F3 余项另立单。
