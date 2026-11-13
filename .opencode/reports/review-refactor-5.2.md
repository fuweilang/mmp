# 重构 5.2 · 只读终审（浪哥）

- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，审计基线 `a01b1d59`
- 日期 2026-11-13（America/Los_Angeles）
- 方式：纯静态阅读（`read`/`grep`/`glob`）；**未执行任何 shell**（本会话无 shell 工具，也未绕道），因此 `git diff` / `git show` / 测试 / 构建 / 覆盖率均未跑；未改业务源码、未读 `.env`、未连库
- 对照材料：`refactor-audit-5.2.md`、`refactor-phaseA/A2/B1/B2/C1/C2/D`、`qa-refactor-phaseA-5.2.md`，以及 `.superpowers/library-chat-attachments/baseline/working-tree.patch`（含 HEAD 附近 `library.service.ts` 的 `write()`/`purge`/`uploadOwned` 旧版片段，仅用于这三处交叉核对）

## 结论

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 | 0 | 未发现阻断 |
| P1 | 1 | 前端新护栏未接入任何自动门禁（流程，不阻断代码正确性） |
| P2 | 8 | 2 条拆分引入（P2-1 编辑器快照、P2-4 死配置）+ 6 条既有债/门禁口径/文档债 |

**合入判断：代码可合入。** 合入前建议先做 P1-1（把新测试接进门禁）并在合入说明/PR 里登记 P2-1/2/3（F3 残留、基线 `test:library` 红、purge 非事务）；其余不阻断。

---

## P0

无。事务入口、鉴权顺序、错误码、批量部分成功语义、幂等守卫逐项核对后未见「搬丢/搬错」。

---

## P1

### P1-1 本轮新建的前端护栏不在任何脚本/CI 里，拆分的安全网实际不生效

- 触发：任何人改 7 个 admin 列表页、`useAdminTable`/`useAdminSearch`、`AdminOfficialAgents` 容器或编辑器抽屉
- 影响：`admin-table.client.spec.ts`（6 页挂载）+ `expert-editor.client.spec.ts`（41 例）是 A/A2 阶段唯一的行为护栏，但 `pnpm run verify` 永远不会跑它们；回归只会在人工记得跑那两条长命令时暴露
- 依据：`ground/apps/frontend/package.json:6-11` 只有 `dev/build/typecheck/preview`，无 `test` 脚本、无 vitest/jsdom devDependency；`ground/package.json:15-17` 的 `verify` = `shared build + vue-tsc + vite build + nest build`；A 报告 §4 与 A2 §验证命令均用 `../../../mammoth-agent/node_modules/.bin/vitest` 手工执行
- 修法（最小）：在 `ground/apps/frontend/package.json` 增加 `"test": "vitest run --config tests/*.vitest.config.mjs"`（或两个 `test:*`），补 `vitest`/`jsdom` devDependency，并把 `test` 串到 `verify:web` 或 CI（`.github/workflows/*` 里 Ground 的 job）。不要求本轮补覆盖，只要求「存在即可红」。

---

## P2

### P2-1 拆分引入的轻量行为偏差：列表 `replaceRow` 不刷新编辑器快照（F3 根因）

- path:line：`ground/apps/frontend/src/composables/useOfficialAgents.ts:86-90`（`replaceRow` 只换 `rows` 与 `viewerAgent`）、`:106-118`（`editorAgent` 为一次性快照）、`components/admin/official-agents/AgentEditorDrawer.vue:639`（`props.agent?.status`）
- 触发：编辑器打开时，从列表执行发布/下架/回滚/批量下架；或保存后服务端归一化字段与提交值不同
- 影响：编辑器内 `props.agent` 仍是旧行对象 → 「保存并发布」的已下架判断/确认文案可能判错（F3 后半段）；原实现 `editorAgent` 由行数组派生，始终新鲜。**不涉及数据写错，仅提示文案/回填**
- 依据：QA F3；`replaceRow:89` 只同步 `viewerAgent`；`openEdit:114-118` 存入快照后不再更新
- 修法：`replaceRow` 内在 `editorAgent.value?.id === next.id` 时一并替换（一行）；或把 `editorAgent` 改成按 `editingId` 从 `rows` 取的 computed。合并前做不做由 DeepSeek 定，但需在合入说明登记

### P2-2 基线红被长期接受：`retryParse` 对 `DOWNLOAD_ONLY` 是静默 no-op

- path:line：`ground/apps/backend/src/library/library.media.ts:164-196`（只对 READY 早退，DOWNLOAD_ONLY 会继续解析）、`library.store.ts:191-218`（`:200` 对 `DOWNLOAD_ONLY` 返回 `unchanged`）、`library.prisma-store.ts:148`（同）
- 触发：PDF 转 OCR/解析器升级后，对 `DOWNLOAD_ONLY` 版本点「重新解析」
- 影响：接口 200 返回未解析的同一版本，`parseStatus` 仍是 `DOWNLOAD_ONLY`，用户以为重试成功；`library.flow.spec.ts:354-357` 的失败就是这个
- 依据：`library.media.ts:171-173` 注释明确「Download-only versions have no chunks, so a later parser may read them」，与两个 store 的 `unchanged` 早退直接矛盾；B1/A 报告把该失败登记为基线既有（69/68/1 → 73/72/1），**不是本轮引入**
- 修法：修 `commitParseResult` 只对 `READY` 返回 `unchanged`（两处 store 同步），或 `retryParse` 先把状态改回 `PENDING` 再提交；修完把 `test:library` 目标改为 0 fail。**不要在合入时继续以「1 fail 是基线」放行**

### P2-3 `purge` 是 library 唯一没有 `writing` 守卫的写路径（既有不对称，但拆分后更难发现）

- path:line：`ground/apps/backend/src/library/library.mutate.ts:277-291`；对照 `:233`/`:253` 都有 `if (!this.ctx.writing) return this.write(...)`
- 触发：HTTP `DELETE /nodes/:id` 或 `batch(action:'purge')`
- 影响：`purgeStored` 的多次 `updateNode`/`deleteBlob`/`replaceChunks` 不在 `withTenantWrite` 内，中途失败会留下部分 PURGED 节点且无审计；`batch` 逐项如此
- 依据：`.superpowers/library-chat-attachments/baseline/working-tree.patch:549-553` 显示旧版 `purge` 同样没有 `writing` 守卫（该 patch 里 recycle/restore 是新增守卫、purge 是未改上下文）→ **既有行为，不是本轮回归**
- 修法：本轮不改行为；至少在 `purge` 上方注明「故意非事务：blob 删除不可回滚」，并补一条「purge 中途 updateNode 失败」的用例；要改成事务需产品确认部分失败语义

### P2-4 `AdminOfficialSkills` 残留死配置（A2 修 F7 时只删了解构）

- path:line：`ground/apps/frontend/src/views/admin/AdminOfficialSkills.vue:304`（仍传 `errorText`）、`:102`（模板改用内联 `pageError`）、`composables/useAdminTable.ts:53-57`（`emptyText` 已无消费者）
- 触发：改技能页空态
- 影响：`errorText`/`emptyText`/`hasFilters` 在该页是死参数，读者会以为空态由 composable 决定；改错地方不会生效
- 依据：grep 该页无 `emptyText` 绑定
- 修法：删 `errorText` 传参（保留 `hasFilters`/`empty*` 若将来要用也可，但要注释），或把模板改回 `:description="emptyText"`（注意保留 `pageError` 重试按钮条件）

### P2-5 B2 把 8 个原 `private` 成员变成公开 internal，公开面扩大

- path:line：`ground/apps/backend/src/official-skill/official-skill.service.ts:303-399`（`requireSkill` `presentAdmin` `publicCard` `readInstruction*` `requireActiveAccount` `audit` `auditTx`）
- 触发：同包任意代码/测试/控制器可直接调用这些内部成员
- 影响：绕过生命周期与鉴权封装（例如直接 `auditTx`），Nest 注入的 facade 公开面被扩大；专家侧没有同类变化
- 依据：B2 报告 §5.1 自认；仓内除 `official-skill-*` 职责簇外无调用方（本机 grep 复核一致）
- 修法：保留现状可接受；建议加 `/** @internal */` 并在后续引入窄 `SkillHost` 接口（`host.prisma/requireSkill/presentAdmin/...`）替代把整个 service 传给子服务

### P2-6 `AdminOfficialAgentPresenter` 承载非展示逻辑，职责边界再次变模糊

- path:line：`ground/apps/backend/src/admin/admin-official-agent.presenter.ts:132-189`（`assertPublishable` `requireAgentRow` `auditOfficialAgent` `frozenStringList`）、`admin-official-agent.publish.service.ts:14`（反向 import `discovery` 的 `syncOfficialAgentKb`）
- 触发：后续再拆/改发布校验或审计
- 影响：presenter 变成 shared util；发布→发现→presenter 的语义边不直观，容易在下次拆分时形成环
- 依据：B2 报告 §5.3 自认；当前 import 仍是单向（`publish/discovery/grant/draft → presenter`）
- 修法：后续把 `auditOfficialAgent`/`requireAgentRow`/`frozenStringList` 迁 `admin-official-agent.shared.ts`；`syncOfficialAgentKb` 迁 `official-agent-kb-sync.ts`

### P2-7 基线 `ui-trajectory` 覆盖门禁与 AGENTS 规则冲突，新拆文件实际不在门禁内

- path:line：`mammoth-agent/vitest.config.ts:276`、`mammoth-agent/AGENTS.md`（client 在 per-file 100% 门禁内）、`refactor-phaseC1-5.2.md:27-38`（新文件 64–89%）
- 触发：任何人按 AGENTS 修正排除，或用 `--coverage.exclude` 覆写跑覆盖率
- 影响：`test:coverage` 可能从绿变红（6 个新文件 <100%）；当前拆分事实上无 per-file 约束
- 依据：C1 实测「仓库原配置下报告无 ui-trajectory 行」；同款写法 `vitest.config.ts:288`（`ui-renderer/src/client/*` 整目录排除）说明本仓确实用 `src/*` 表达整目录
- 修法：把 `:276` 收窄到真正缺测的具体文件（并补 `trajectory-table-*` 的 100%），或明确把「ui-trajectory 免门禁」写成已知债并在 AGENTS 里豁免；不要留「看起来在门禁、其实不在」

### P2-8 jsonl 半拆状态需要明确边界（不是回归，但要防止零散再搬）

- path:line：`mammoth-agent/packages/session/session-persistence-jsonl/src/index.ts`（1695 行）、`stored-log.ts`、`fs-helpers.ts`、`encoding.ts`
- 触发：下一个人继续「顺手」把读写成员搬出去
- 影响：读写依赖 `this.root/compression/config/tracker/memo` 的私有状态机，零散搬迁会复制恢复/租约语义（C2 报告 §4 已判定需要 `JsonlContext`）
- 依据：776 tests 通过、无环（新模块不 import `index`）；但 `encoding.ts` 已发生「`this.x` → 显式参数」的签名调整（行为等价）
- 修法：在 `index.ts` 头部/README 写明「读写拆分需先抽 `JsonlContext`，禁止逐方法外移」，并把该项留在 backlog

---

## 已验证的等价点（支持「无 P0」）

| 检查 | 证据 | 结论 |
|---|---|---|
| 事务唯一入口 | `library.mutate.ts:45-47` 是唯一 `withWrite` 调用；`library.context.ts:44-51` 只在 `withTenantWrite` 内构造 `{...ctx, store, writing:true}`；`grep withTenantWrite` 仅 store/context/commitParseResult | 与旧 `write()`（`new LibraryService(store, limits, now, true)`）等价；`limits/now/writing` 都随 ctx 透传（`library.context.spec.ts:94-107`） |
| 外层事务复用 | `library.prisma-store.ts:44-53`（`'$transaction' in prisma` 时直接 `work(prisma)`）、`library.store.ts:93-112`（ALS 重入） | admin `$transaction` 内 `createLibraryService({store: tx})` 不会嵌第二个事务；`library.context.spec.ts:72-92` 覆盖 |
| 鉴权顺序 | `library.read.ts:71-74`（tenant→members 权限）、`library.mutate.ts:50/69/84`（requireMember 在写前）、`library.auth.ts:101-110`（grantCustody 顺序与错误码）、`admin-official-agent.grant.service.ts:31-41`（assertSuperAdmin→agent→tenant） | 未见前移/后移 |
| bulkGrant 部分成功 | `admin-official-agent.grant.service.ts:99-206` 逐企业串行、`continue`、末尾单条 bulk 审计；`test/official-agent-admin-bulk-grant.unit.test.ts:124-178` 断言 `upserts=['t-ok']`、summary/审计 | 与审计 P1-2 要求一致；无整体事务 |
| 幂等/乐观锁 | `library.admin.service.ts:75-88`（requestId 去重+requestHash 冲突）、`library.mutate.ts:361-369`（treeRevision）、`replaceVersion:130-135`（VERSION_CONFLICT 复检） | 未动 |
| 错误码 | `library.errors` 用法、`official-skill` 的 `skillPackageError`、admin 的 `BadRequest/Conflict/NotFound` 逐处保留 | 未见类型变化 |
| 构造签名兼容 | `admin-official-agents.service.ts:41-55` 5 参不变 + `deps()` getter；`official-skill.service.ts:68-79` 2 参不变；`official-skill-links.ts:82-107` 保留 `tx?` | 7 处按位置 `new` 与 `(service as any).officialKb` 覆写均仍可用 |
| import 方向 | `library`：auth←read/media/stats/ask，mutate→(type)read/media/stats；`official-skill`：子服务→facade 仅 `import type`；`admin`：各簇→presenter；`ui-trajectory`：types←format←{view-state,columns,rows}←details←shell；`plugin-manager`：format←list/detail←page，install 叶子；`stats-table-*` 仅 `import type` 回 `StatsTable` | 无新增运行期环 |
| 构建配置 | `vite.config.ts` 无 `manualChunks`（F1 已回退）；`tsconfig.host.json:8-20` +5 文件、`tsconfig.ground-library.json:12-33` +8 文件 | 必要且最小（D 已用闭包脚本核对） |
| 死代码 | `DesktopUpdateIndicator`/`openDesktopUpdate` 全仓 0 引用（仅 `.tsx` 自身保留 `updateCopy`/`Badge`）；CSS 仅剩 `.badge`；`desktop.update.*` locale 仍被 152 处消费 | 删除干净，无残留引用/CSS 垃圾 |

---

## 测试有效性（变异推断，未实操）

1. **`test/library/library.context.spec.ts:62-70`（回滚）** — 把 `withWrite` 改成「不开事务、直接 `work({...ctx, writing:true})`」，Memory store 不再 snapshot → `rename` 落库、`library_rename` 审计留存 → 断言 66/67 必红；把 `withTenantWrite` 换成每次新开事务 → `:72-92` 的 `opens===1` 必红。
2. **`test/official-agent-admin-bulk-grant.unit.test.ts:124-178`（部分成功）** — 给 `bulkGrant` 套 `prisma.$transaction`（harness 无 `$transaction`）→ 直接 TypeError；把 `continue` 改成 `throw` → `results` 长度/`upserts`/summary 三处红；跳过 `skipped` 分支重复 upsert → `upserts` 变 `['t-skip','t-ok']` 红。
3. **`test/official-skill/display-translation.unit.test.ts:54-66`（dryRun）** — 删掉 `if (opts.dryRun) return report` → `calls.length`/`updates.length` 非 0 红；把 `tenantId` 从 `null` 改成 `actor.tenantId` → `:76` 红；把 `data.instruction` 加进 update → `:83` 红。

**抓不到的三处（需补）**：
- `useAdminTable.onPageSizeChange` 的 `resetPageOnSizeChange:false`（A2 F2 修复）无任何用例；改成 `true` 仍全绿（`admin-table.client.spec.ts:235-285` 只测列表组件的 emit，不测 composable 翻页）
- `avatarCacheKey`（A2 F5）无断言；改回只按 `id` 缓存仍绿
- `library.items.openLibraryBytes` 合并前后差异（media/ask 两份原件）无对比测试；建议补 `markUsed` 对 LINK/回收站的状态码断言

---

## 未验与原因

1. **`git diff`/`git show` 未执行**：本会话无 shell 工具；未用其他方式绕过。因此「是否借搬迁改行为」的结论是：新代码静态阅读 + 各阶段报告 + `.superpowers/library-chat-attachments/baseline/working-tree.patch` 的 library 旧版片段。报告里凡声称「逐字一致」而我无法复核的（`openLibraryBytes` 合并、`trajectory-table-format` 纯函数搬移），均按「待验证」对待，未据此下结论。
2. 未跑 `test:library` / `test:official-*` / `pnpm verify` / `vite build` / `test:coverage`：只读红线；上文数字全部转引自实施/QA 报告，未独立复现。
3. 未开 DB/HTTP fixture：`library.admin.service` 的 `pg_advisory_xact_lock`、`Serializable`、并发语义仅静态判断。
4. 未验真实 GUI/Electron：F2/F5/F3 的可见行为只有 jsdom 与 QA 的手工结论。
5. C1 的覆盖率门禁口径未复跑：`vitest.config.ts:276` 的单星号是否整目录排除，我采信 C1 的实测与同款 `:288` 写法；若该口径有变，P2-7 升级为 P1（`test:coverage` 会红）。

## 剩余风险（按影响排序）

1. `test:library` 的 1 条基线红（P2-2）会掩盖后续真正的 library 回归；建议本轮后立即修。
2. 前端护栏未接门禁（P1-1）→ 本轮 A/A2 的成果没有持续保护。
3. `purge` 非事务（P2-3）在真实 HTTP 下可能留下半删状态。
4. B2 公开面扩大（P2-5）与 presenter 职责漂移（P2-6）属可维护性，不影响当前正确性。

## 交接

- DeepSeek：合入裁决；P1-1 是否要求本轮接线；P2-1/P2-2/P2-3 是否进合入说明。
- 李庚：P1-1 脚本接线、P2-1 一行修复、P2-3 注释/用例、P2-2 由谁修（store 两处）。
- 王总：P2-7 门禁口径、P2-8 jsonl 边界注记。
- 秋池：复跑 `test:coverage`（验证 P2-7 是否真红）+ 补「测试有效性」小节列的三条盲区用例。
- 浪哥：本轮结论仅覆盖静态证据；待 `git diff` 与 `test:coverage` 可用时做一次逐 hunk 复核。
