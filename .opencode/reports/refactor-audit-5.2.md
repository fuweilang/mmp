# 代码瘦身与拆分 · 只读审计（5.2）

- 审计对象：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，工作树干净
- 审计方式：纯静态阅读（`read`/`grep`/`glob`），未执行任何 shell、未改业务源码、未连库、未起服务
- 日期：2026-11-13（America/Los_Angeles）
- 结论范围：仅为「是否拆、怎么拆、拆之前先解什么」提供依据；是否拆分与优先级由主会话裁决
- 重要前提：以下行号均来自本机当前工作树快照；`api-catalog.ts` / `slot-catalog.ts` 为生成文件，只评估目录噪音，不建议手改

---

## 0. 总览

| 编号 | 优先级 | 文件 | 拆成几个 | 关键风险 |
|---|---|---|---|---|
| P0-1 | P0 | `ground/apps/backend/src/library/library.service.ts` | 拆分前必须先抽「事务上下文」，否则不可拆 | `write()` 自实例化 + 外部 tx 注入，拆类即改变 store/writing 语义 |
| P0-2 | P0 | `llm/llm-chat.gateway.service.ts` | 两条主路径**禁止合并** | 两条路径已行为漂移（timeout/abort/header/错误码），"顺手统一"会改线上计费与重试 |
| P0-3 | P0 | `billing/wallet.service.ts` | 资金入账骨架可抽，但有前置条件 | 幂等键 + `updateMany` 余额守卫 + audit 位置，改动即资损风险 |
| P0-4 | P0 | 7 个 admin 列表页 | 抽 composable 前需先补行为测试 | 前端这些页面**零组件测试**，无护栏即无法证明"只搬代码" |
| P1-1 | P1 | `library/library.service.ts`（1465/68 方法） | 10 | god service，6 类职责混装 |
| P1-2 | P1 | `admin/admin-official-agents.service.ts`（1186） | 6 | 构造签名被 7 处测试按位置实例化 |
| P1-3 | P1 | `official-skill/official-skill.service.ts`（1141） | 5（含断环 1） | 唯一 LLM 依赖造成 `official-skill ↔ llm` forwardRef 环 |
| P1-4 | P1 | 前端 7 个 admin 列表页 | 2 composable + 1 展示组件 | 防抖 300/350/450/500ms 不一致，统一即改行为 |
| P1-5 | P1 | `client/ui-trajectory/.../TrajectoryTable.tsx`（3607） | 7 | 100% per-file 覆盖率门禁，搬文件即需补覆盖 |
| P1-6 | P1 | `frontend/api/admin.ts`（1414） | 1 目录 + 9 文件 | 33 个 import 点，必须 barrel 重导出 |
| P1-7 | P1 | `official-kb.service.ts` ↔ `knowledge.service.ts` | 1 共享模块 | 60 行**逐字重复**，已有对比测试 |
| P2-1 | P2 | `billing/enterprise-token-stats.service.ts`（708） | 4 | detail 内部再调 overview，全表扫两遍 |
| P2-2 | P2 | `llm/llm-providers.service.ts`（717） | 4 | probe/listRemoteModels 凭据解析重复 |
| P2-3 | P2 | `billing/wallet.service.ts`（609） | 3 | 见 P0-3 |
| P2-4 | P2 | `library.admin.service.ts` ↔ `library.service.ts` | — | `brief()`/`fileType()` 与库内实现重复且有字段分歧 |
| P2-5 | P2 | `frontend/src/main.ts:3-5` | — | Element Plus 全量注册 + 全量 CSS |
| P2-6 | P2 | 4 处 `formatDateTime` 重实现 | — | `utils/format.ts:7` 已存在 |
| P2-7 | P2 | `official-agent/official-kb.service.ts` | — | 请求路径里同步 `readFileSync` |
| P2-8 | P2 | `session/session-persistence-jsonl/src/index.ts`（1874） | 6 | 单类 1550 行，持久化关键路径 |
| P2-9 | P2 | `typert/generator/src/analyzer.ts`（3468） | 5 | `FaceAnalyzer` 2140 行，AST 语义 |
| P2-10 | P2 | `api/gateway/src/index.ts`（1749） | 5 | 传输/RPC/远端事件三套协议 |
| P2-11 | P2 | `PluginManagerPage.tsx`(1902)、`StatsTable.tsx`(1908) | 各 4 | StatsTable 属 experimental，非默认出货 |
| P2-12 | P2 | `api-catalog.ts` ×2、`slot-catalog.ts` ×1 | — | 生成产物，只做搜索噪音治理 |
| P2-13 | P2 | 4 个「仅内部使用」的导出符号 | — | 扩大公开面，无消费者 |

---

## 1. P0（拆分前必须先解，否则会改行为）

### P0-1 `LibraryService` 的事务上下文是自实例化，直接拆类会丢语义

- 证据
  - `ground/apps/backend/src/library/library.service.ts:152-155`
    ```ts
    private write<T>(actor: Actor, work: (service: LibraryService) => Promise<T>) {
      this.requireTenantActor(actor);
      return this.store.withTenantWrite(actor.tenantId, store => work(new LibraryService(store, this.limits, this.now, true)));
    }
    ```
  - 外部同样 `new` 出实例并把 tx store 塞进去：
    - `library/library.admin.service.ts:38`（只读 `limitsView()`）
    - `library/library.admin.service.ts:66`（tx 内 `scopeImpact`）
    - `library/library.admin.service.ts:82`（tx 内写操作，且注入单调时钟 `() => Math.max(Date.now(), before.updatedAt+1)`）
    - `library/library.admin.service.ts:116`（tx 内 `download/preview`）
    - `library/library-domain.module.ts:10`（Nest 工厂）
  - 测试按位置构造 17 处：`test/library/library.postgres.spec.ts:100,172,237,238,258,280,291,319,342`、`library.custody.spec.ts:11`、`library.flow.spec.ts:85,455`、`library.sharing.spec.ts:10`、`library.member-isolation.spec.ts:17`、`library/library.backup.test.cjs:77`、`test/knowledge-core/library-source.unit.test.ts:10`
- 影响：把方法搬到 `LibraryMutationService` / `LibraryReadService` 后，`write()` 里 `new LibraryService(...)` 会构造出**只拥有一半依赖**的新对象；`writing` 标志、`limits`、`now` 三个隐式参数一旦漏传，行为从"事务内可重入"变成"重复开事务或漏事务"。
- 依据：`writing` 只在这个私有工厂与 `createOwnedFolder:351` 分支使用；`now` 决定 `updatedAt` 单调性，admin 侧靠它做乐观锁比较（`library.admin.service.ts:101`）。
- 拆法（只搬不改）
  1. 先新增 `library/library.context.ts`：`type LibraryContext = { store; limits; now; writing }`，把 `write()` 改成自由函数 `withWrite(ctx, actor, fn)`。
  2. `LibraryService` 构造函数**保持不变**（`store, limits?, now?, writing=false`），内部把四元组组成 `ctx`，公共方法一行转发。
  3. 子模块全部接收 `ctx` 而不是 `this`；禁止子模块互相 `new`。
- 预估：1.5 人日（只做 P0-1 抽取与回归）
- 回归护栏：已有 `library.postgres.spec.ts`（真实 PG）、`library.flow/sharing/custody/member-isolation.spec.ts`、`library.http.test.cjs`、`library.sharing.http.test.cjs`。**够用**，但需新增一条"admin tx 路径 + 普通 HTTP 路径对同一操作等价"的断言。

### P0-2 `proxyChatCompletions` 与 `completeOnce` 已漂移，禁止"顺手合并"

- 证据（同文件 `llm/llm-chat.gateway.service.ts`）
  - 流式/HTTP 入口：`:262-367`；服务端一次性补全：`:374-531`
  - 相同骨架约 130 行：并发租约 `:277/388`、attribution 校验 `:279-284`/`:389-394`、`billing.precheck` `:287/397`、候选路由 `:288-291`/`:398-408`、健康检查 `:296-297`/`:411-412`、定价+冻结 `:298-308`/`:413-437`、`releaseFrozen` 闭包 `:309-312`/`:438-454`、上游 4xx 分支 `:337-347`/`:492-509`
  - 已存在的**行为差异**（不是笔误，不能合并掉）：
    | 维度 | proxyChatCompletions | completeOnce |
    |---|---|---|
    | 上游超时 | `600000`（`:326`） | `180000`（`:472`） |
    | 客户端中断 | `res.once('close', abort)`（`:321`） | 无 AbortController |
    | 响应头 | `X-MMP-Model`（`:348`） | 无 |
    | 固定模型不支持时文案/码 | `'所选模型不支持当前任务…'`（`:291`） | `FIXED_MODEL_TASK_UNSUPPORTED`（`:408`） |
    | 冻结键 | 含 `attempt`，无 `once` 后缀（`:302`） | 追加 `|once`（`:422`） |
    | 结算调用 | `:355`（含 stream 分支 `:594`） | `:511` |
- 影响：合并成一个泛型流水线最容易把"冻结幂等键后缀""超时值""中断处理"错配，直接改变重试与计费结果；且 `completeOnce` 被官方专家编排调用（`official-skill.service.ts:1083`）。
- 依据：两段代码是复制后各自演进，`FIXED_MODEL_TASK_UNSUPPORTED` 与中文文案并存说明前端对二者分别处理。
- 拆法：只抽**无分支语义**的公共段到 `llm/chat-invocation.ts`：
  - `resolveRequestedModel(body, policy)`、`assertAttribution(attribution)`、`buildBillingKeys({user,tenant,resolved,attempt,suffix})`、`makeReleaseFrozen(billing, log, …)`、`mapUpstreamFailure(upstream, {automatic, reroutable})`。
  - 两条路径的 `for` 循环、超时、header、中断**保持原地不动**。
  - 输出一张"差异表"作为代码注释锚点（上表）。
- 预估：2 人日（含差异表落地与双路径回归）
- 回归护栏：`test/model-routing.test.cjs`、`test/freeze-settle.test.cjs`、`test/token-usage-settlement.test.ts`、`test/charge.test.cjs`、`test/official-agent-execution.api.test.ts`。**需补**：一条同时命中两条路径的结算快照。

### P0-3 钱包入账骨架可抽，但幂等/守卫/审计顺序不可变

- 证据：`billing/wallet.service.ts`
  - `adjustWallet:144-241`：先按 `idempotencyKey` 查重 `:151-162` → `$transaction` `:164` → 无钱包则建 `:167-170` → 入账 `increment` `:173-179` → 写 ledger `:180-193`；扣减走 `updateMany({balanceCoins:{gte:debit}})` `:198-207` 并在 0 行时抛 402 `:205-207` → 事务外 audit `:226-233`
  - `creditQrTopup:275-346`：同样的查重 `:294-303` → 建钱包 `:305-310` → `increment` `:311-317` → 写 ledger `:318-339`，但**接受外部 txClient** `:287,292`，且幂等键前缀不同（`recharge:${orderNo}:confirm`）
- 影响：抽公共 `postLedgerEntry()` 时若把 `updateMany` 换成 `update`，并发扣减会超扣；若把 audit 挪进事务，失败回滚会丢审计；若忘记 `idempotencyKey` 唯一约束语义，重放会双记账。
- 依据：两处都是"查幂等键 → 建钱包 → 改余额 → 写流水"，是同一资金原语；差异在方向、类型、备注、tx 归属。
- 拆法：`billing/wallet-ledger.ts` 导出 `creditWallet(db, {tenantId, coins, type, direction, idempotencyKey, remark, meta, operatorUserId})` 与 `debitWalletGuarded(...)`，**保留** `updateMany` 守卫与调用方审计位置；`adjustWallet` 的 402 映射留在原处。
- 预估：1 人日
- 回归护栏：`test/charge.test.cjs`、`test/freeze-settle.test.cjs`、`test/official-price-refresh.test.ts`。**需补**：并发双花（余额 10 币并发扣 8+8）用例。

### P0-4 前端 admin 列表页零组件测试，抽 composable 前必须先补护栏

- 证据
  - 前端测试仅有 util 级：`apps/frontend/tests/*.test.ts`（10 个，覆盖 navigation/presentation/upload-contract/form-errors）、`src/utils/skill-form.unit.test.ts`
  - 7 个目标页**没有任何** `.vue` 挂载测试；`AdminOfficialAgents.vue`、`AdminUsers.vue`、`AdminRoles.vue`、`AdminEnterprises.vue`、`AdminOfficialSkills.vue` 的分页/筛选/空态只由手测保障
- 影响：抽 composable 后若顺序/防抖/翻页 clamp 改变，无自动化信号；而这几页是运营高频入口。
- 拆法：先为 `useAdminListPage`（P1-4 产物）写纯函数单测（`clampPage` 已有 `utils/skill-form.ts:66` 可直接复用），再为 1 个代表页（`AdminUsers.vue`）加挂载测试，最后才动其余 6 页。
- 预估：1 人日（护栏）+ 后续 P1-4
- 回归护栏：新增；现有 `tests/admin-official-agent-form-errors.test.ts` 只能覆盖表单错误映射。

---

## 2. P1（应修）

### P1-1 `library.service.ts`：68 方法 / 1465 行，6 类职责

方法计数：public 33 + private 35（含 `constructor` 计 69）。分簇（行段为当前文件）：

| 簇 | 职责 | 代表成员:行 | 说明 |
|---|---|---|---|
| A 鉴权与代管 | Actor 校验、custody 过滤、读审计 | `requireMember:1313` `requireTenantActor:1318` `requireVisible:1292` `requireManage:1301` `requireVisibleFolder:1284` `custodiesFor:1322` `auditCustodyRead:1327` `touch:1332` `writeAudit:1343`；代管 CRUD `grantCustody:942` `revokeCustody:1004` `managedActor:1025` `listCustody:1031` `custodyView:1038` | 与 `library.policy.ts` 的纯判权函数是两层，容易被误认为重复 |
| B 读与呈现 | 目录/列表/检索/面包屑/条目投影 | `catalog:195` `list:221` `searchQuotes:305` `versions:719` `breadcrumb:1452` `catalogPath:1438` `isRootForView:1404` `toItem:1368` `brief:1354` `versionStatus:1432` | `list:221` 单方法 81 行，8 个筛选维度 |
| C 写与树/可见域语义 | 创建/上传/替换/移动/共享/回收/彻底删/批处理 | `createFolder:343` `createOwnedFolder:350` `createLink:362` `upload:377` `uploadOwned:382` `replaceVersion:413` `rename:446` `move:456` `setScope:505` `scopeImpact:491` `recycle:526` `restore:546` `purge:571` `batch:880`；树工具 `scopeTree:1125` `treeRevision:1160` `checkTreeRevision:1166` `applyScope:1170` `creationTarget:1115` `assertCreation:1177` `blankNode:1186` `scopeOrThrow:1205` `isDescendant:1272` `recycledSubtree:1250` `purgeStored:1236` | 乐观锁（`treeRevision`/`parentRevision`）只在这一簇 |
| D 问答/引用 | RAG 引用与一次性补全 | `ask:783` `openCitation:726` `readRetrievalVersion:762` `markUsed:772`；模块级 `joinedExcerpt:68` `citationExcerpt:96` `quotableInChat:132` `excerptAround:138` | 与 `library.ask.ts`（prompt 构造，已拆）分居两文件 |
| E 媒体与解析 | 打开字节/预览/下载/重解析 | `openBytes:1052` `preview:621` `download:703` `zipPreviewEntries:693` `retryParse:587` `prepareVersion:1070` `chunkRows:1103` | `preview:621` 单方法 71 行、返回 20 个字段 |
| F 运维统计 | 平台总览/容量 | `adminStats:903` `usedBytes:1220` `assertQuota:1213` `limitsView:157` `config:167` `ownerCounts:183` | `adminStats` 对每个租户再 `listNodes` + 逐文件 `listVersions`（N×M 查询） |

- 影响：6 类职责共享一个 4 参数构造与一个 `store`，任何一簇的改动都要重跑整包读写测试；`list()` 与 `AdminLibraryService.items()` 已出现同逻辑分家（见 P2-4）。
- 拆法（不动行为，只搬代码）：见 §4 表格。
- 预估：6 人日（含 P0-1）
- 回归护栏：见 P0-1；另外 `library.http.test.cjs` 覆盖 HTTP 面。

### P1-2 `admin-official-agents.service.ts`：1186 行，5 类职责

| 簇 | 职责 | 行段 |
|---|---|---|
| A 列表/详情/展示映射 | `list:128` `detail:173` `load:829` `presentMany:839` `present:957` `presentVersion:1097` `loadPublisherNames:848` `avatarExplicitByKey:1008` `resolveAvatarUrl:1018` `hasUnpublishedChanges:916` `stableJson:901` | 128-176, 823-1034 |
| B 创建/编辑/发布/下线/回滚/删除 | `create:178` `update:537` `publish:579` `offline:680` `remove:702` `createPreview:651` `rollback:669` `assertPublishable:860` `normalizeDraft:1126` | 178-216, 537-755 |
| C 租户授权（批/单） | `bulkGrant:376` `bulkRevoke:484` `grant:756` `revoke:803` | 376-536, 756-822 |
| D 资产导入 | `listAssetCatalog:217` `importAssets:249` `bulkOffline:322` | 217-374 |
| E 发现页/头像/KB 同步/审计 | `discovery:93` `saveDiscovery:101` `uploadAvatar:1034` `removeAvatar:1082` `syncOfficialKb:1156` `audit:1176` | 93-126, 1034-1186 |

- 影响：`bulkGrant:398-454` 是逐租户串行 upsert（无整体事务，部分成功语义），与 `grant:756` 的单租户逻辑重复；搬文件时极容易被"顺手加事务"改掉失败语义。
- 拆法：见 §4。
- 预估：4 人日
- 回归护栏：`test/official-agent-admin.service.test.ts`、`official-agent-admin-list.unit.test.ts`、`official-agent-publish-requirements.unit.test.ts`、`official-agent-admin.api.test.ts`、`official-agent-admin-delete.unit.test.ts`、`official-agent-avatar-upload.unit.test.ts`。构造签名被 7 处按位置实例化（如 `official-expert/config.unit.test.ts:18` 只传 4 个参数），**构造参数顺序不可变**。

### P1-3 `official-skill.service.ts`：唯一的 LLM 依赖造成模块环

- 证据
  - `official-skill/official-skill.service.ts:67` `constructor(private prisma, private llm: LlmChatGatewayService)`
  - 全文件只有一处用 `llm`：`:1083`（`translateDisplayBatch:1018-1139`）
  - 模块环：`official-skill.module.ts:8` `forwardRef(() => LlmModule)`；`llm.module.ts:16` `forwardRef(() => BillingModule), OfficialAgentModule`；`official-agent.service.ts:26` 依赖 `OfficialSkillService`
- 影响：把 100 行的翻译任务拆出去，可以让 `OfficialSkillService` 变成纯 prisma 服务，**同时消掉一个 forwardRef 环**；不拆则拆 `official-skill.service` 的其余部分时会被 DI 环限制（不能在 `LlmModule` 之前注册）。
- 拆法：`official-skill/official-skill-display-translation.service.ts`（迁 `translateDisplayBatch` + `buildDisplayTranslationPrompt`/解析相关私有调用），`official-skill.service.ts` 保留 `presentAdmin/publicCard/...`。
- 预估：1 人日
- 回归护栏：`test/official-skill/*.unit.test.ts`（5 个）+ `adversarial-http.unit.test.ts`。翻译路径无测试，**需补** dryRun 快照。

### P1-4 7 个 admin 列表页的分页/筛选/加载/空态雷同

- 逐页证据

| 页面 | 分页状态 | 切片 | 加载（请求序号守卫） | 防抖 | 空态 |
|---|---|---|---|---|---|
| `AdminOfficialAgents.vue` | `:633-634` | `:838-842` | `:1021-1040` | `:1042-1057`（450ms，见 `:1018`） | `:150` |
| `AdminUsers.vue` | `:253` | `:306-319` | `:455-475` | `:325-339`（350ms） | `:304` |
| `AdminRoles.vue` | `:302-303` | `:359-372` | `:394-425`（**无**序号守卫） | `:394-404`（500ms，见 `:330`） | 模板 `:103/:119` |
| `AdminEnterprises.vue` | `:302` | `:338-343` | `:419-432` | `:372-381` | `:327` |
| `AdminOfficialSkills.vue` | `:293` | `:296-304` | `:430-448` | `:450-468`（300ms） | `:102` |
| `AdminEnterpriseTokenStats.vue` | `:310` | `:337-338` | `:455-462` | — | — |
| `AdminModels.vue` | 无分页 | — | `:325-341` | — | — |

- 影响：同一交互 7 份实现；`AdminRoles.vue:394` 缺 `requestSequence`，切 tab 时存在旧响应覆盖新 tab（现状缺陷，不是拆分引入，但抽 composable 会统一掉）。
- 依据：`onPageSizeChange → resetPage` 在 `:387-390`（AdminEnterprises）/`:640`（AdminRoles）逐字重复；`pagedRows = filteredRows.slice((page-1)*pageSize, …)` 在 5 个文件逐字相同。
- 拆法（可抽 composable 字段与方法清单）：
  - 状态：`rows`、`loading`、`pageError`（或 `loadError`）、`currentPage`、`pageSize`、`keyword`、`keywordDraft`、`searchTimer`、`requestSequence`
  - 计算：`filteredRows`、`pagedRows`、`hasActiveFilters`、`emptyText`
  - 方法：`load()`（序号守卫 + loading + error + finally）、`onSearchInput()`、`onSearchNow()`、`onReset()`、`resetPage()`、`onPageChange(page)`、`onPageSizeChange(size)`
  - 产物：`src/composables/useAdminListPage.ts`（新目录，当前仓库**没有** `src/composables`）、`src/composables/useAdminListLoad.ts`；展示层抽 `src/components/admin/AdminListEmpty.vue`
- 预估：3 人日（含 P0-4 护栏）
- 回归护栏：需新建（见 P0-4）。防抖值作为参数传入，**默认值按页保留现状**。

### P1-5 `TrajectoryTable.tsx`：3607 行，1 个容器 + 44 个纯函数/子组件

- 结构证据：`:1-47` imports；`:48-135` 常量与图标；`:136-400` 类型与布局/时长工具；`:504-1075` 纯记录变换；`:772-1075` 单元面板；`:1084-2094` 单元格渲染组件；`:2095-3607` 容器 `TrajectoryTable`（1512 行）
- 职责：①轨迹记录投影（flatten/filter/collapse/summarize）②行虚拟化与滚动锚定 ③详情面板与 tab 状态 ④载荷/工具 schema/程序输入输出渲染 ⑤Markdown/来源块渲染 ⑥列宽拖拽
- 影响：容器 1500 行里混了虚拟化、选中、键盘、详情 pane、resize；纯函数（`:504-1075`）与 UI 混在一起，无法单独快测。
- 拆法：见 §4；纯函数迁出后仍从原文件 `export`（供 `TrajectoryView.tsx:15` 与 `tests/*` 使用），避免改公开面。
- 预估：4 人日
- 回归护栏：`packages/client/ui-trajectory/tests/` 已有 15 个 spec（含 `table.client.spec.tsx`、`views.client.spec.tsx`、`layout.client.spec.tsx`、`virtual-rows.client.spec.ts`）。**但**仓库门禁是 per-file 100% 覆盖（`packages/client/AGENTS.md`「Client source packages are inside the per-file 100% coverage gate」），搬文件后每个新文件都要 100%；这是本项最大成本，需在拆分 PR 内同步补测。

### P1-6 `api/admin.ts`：1414 行，11 组 API + 42 个类型

- 证据：`adminUserApi:147`、`adminEnterpriseApi:183`、`adminRoleApi:193`、`adminPermissionApi:208`、`adminTenantRoleApi:226`、`adminBillingApi:461`、`adminAuditApi:627`、`adminLlmProviderApi:712`、`adminOfficialAgentApi:977`、`adminOfficialKnowledgeApi:1098`、`adminOfficialSkillApi:1185`、`adminKnowledgeCoreApi:1352`；类型散落 `:4-146,242-460,607-626,652-788,789-1046,1047-1127,1128-1220,1221-1351`
- 影响：任何模块改动都会让全仓 `vue-tsc` 重编译该文件；`import { adminKnowledgeCoreApi }` 也把 billing/official-agent 类型带进依赖图（类型可擦除，但 IDE/tsc 项目图仍耦合）。
- 拆法：`api/admin/index.ts`（barrel，`export * from './users'` …）+ `users.ts / enterprises.ts / roles.ts / billing.ts / audit.ts / llm.ts / official-agents.ts / official-skills.ts / knowledge.ts`；**保留** `@/api/admin` 与 `../../api/admin` 路径不变。
- 预估：2 人日（纯机械，风险低）
- 回归护栏：`vue-tsc --noEmit` 即可；33 个 import 点全部命中 barrel，无需改调用方。

### P1-7 `lexicalQueryVariants` / `snippetOf` 逐字重复

- 证据
  - `official-agent/official-kb.service.ts:606-665`（`lexicalQueryVariants`）与 `knowledge/knowledge.service.ts:423-482` **逐字相同**
  - `official-kb.service.ts:667-673` 与 `knowledge.service.ts:484-490` 的 `snippetOf` 相同
  - 已有测试专门对比两者：`test/official-kb-query.unit.test.ts:3-4,16-44`
- 影响：两份正则同源但无单一所有者，任一侧修 bug 必须手动同步（现有测试只证明"当前相同"）。
- 拆法：新建 `ground/apps/backend/src/knowledge/lexical-query.ts` 导出 `lexicalQueryVariants`、`snippetOf`；两处服务改为 import；原导出保留 `export { lexicalQueryVariants } from '../knowledge/lexical-query'` 以兼容测试导入点。
- 预估：0.5 人日
- 回归护栏：`test/official-kb-query.unit.test.ts` 直接可用。

---

## 3. P2（建议）

| 编号 | path:line | 现状 | 风险/影响 | 拆法 | 人日 |
|---|---|---|---|---|---|
| P2-1 | `billing/enterprise-token-stats.service.ts:159-442`、`:444-707` | `overview` 285 行单方法；`detail:456` 内部再调 `overview`，两次全量 `tokenUsageTurn.findMany`（`:179-190`、`:192-202`）+ `:476-486` | 平台统计页 P95 慢；两处日期解析/模型过滤重复（`:164-177` vs `:462-474`） | 拆 `token-stats.range.ts`（区间+过滤）、`token-stats.aggregate.ts`（企业/成员聚合）、`token-stats.overview.ts`、`token-stats.detail.ts`；`detail` 改为接收已算好的 overview 结果 | 3 |
| P2-2 | `llm/llm-providers.service.ts:485-528` vs `:601-627` | 从 `modelRowId`/`providerId` 解析 `baseUrl/apiKey/modelId` 的 43 行逐字重复（含两条错误文案） | 修一处漏一处；明文 key 解密路径分散 | 抽 `resolveProbeCredentials(prisma, dto)` 返回判别联合 | 0.5 |
| P2-3 | `billing/wallet.service.ts:144-346` | 见 P0-3 | 同 P0-3 | 先做 P0-3，再按"调账 / 扫码入账 / 查询"拆 3 文件 | 1.5 |
| P2-4 | `library/library.admin.service.ts:13-18` vs `library/library.service.ts:46-51,1354-1366` | admin 侧自带 `brief()`、`fileType()`；与库内 `brief`/`libraryFileTypeKey` 两套实现，字段各有出入（admin `brief` 带 `createdByUserId` 无 `extractTruncated`；`fileType` 用 `startsWith('image/')`，库内用 MIME 映射表） | 同一文件在管理端与用户端可能显示不同类型/版本字段 | 以库内实现为准，admin 仅追加自己的字段；`fileType` 统一到 `libraryFileTypeKey`（先核对 3 个 MIME 差异：`avif`、`csv`、`html`） | 1 |
| P2-5 | `frontend/src/main.ts:3-5` | `import ElementPlus from 'element-plus'` + `element-plus/dist/index.css` 全量注册 | 入口 chunk 携带全部组件与样式；路由已懒加载（`router/index.ts` 全 `import()`），包体收益仍在首屏 | 改 `unplugin-vue-components` + `ElementPlusResolver` 按需（需新增 devDependency）；或 `app.use(ElementPlus)` → 只注册实际用到的 17 个组件。**未验**：实际体积需 `vite build` 后对比，本次禁 shell | 1 |
| P2-6 | `AdminOfficialSkills.vue:422-428`、`AdminOfficialKnowledge.vue:270-274`、`:265-268`（`formatBytes`）、`AdminOfficialAgents.vue:950-952` | 3 处自写时间格式化，1 处自写字节格式化；`utils/format.ts:7 formatDateTime`、`:1 formatBytes` 已存在且被 11 个文件使用 | 输出格式不一致（`toLocaleString('zh-CN')` vs 手工 pad） | 删除本地实现，改 import | 0.5 |
| P2-7 | `official-agent/official-kb.service.ts:56,519`（`readFileSync`）、`:54`（`existsSync`） | 请求路径同步读盘（`syncFromAssets`、`indexDocument`） | 大文件阻塞 Node 事件循环，影响同进程所有请求 | 换 `fs/promises` + `await`；`indexDocument:515-547` 顺带可移出请求路径（现有 staging 语义已保证可异步） | 1 |
| P2-8 | `session/session-persistence-jsonl/src/index.ts:292-1841` | 单类 1550 行：generation 发现/解码、zstd 前缀读、迁移准备与发布、materialize/append/repair、租约、反向 artifact 拒绝、目录编码 | 持久化核心；任何搬动都要动 §「released Session data」约束 | `jsonl-generations.ts`（`:1115-1266`）、`jsonl-codec.ts`（`:1029-1114`、`:1409-1432`）、`jsonl-migrate.ts`（`:669-835`）、`jsonl-io.ts`（`:1300-1506`）、`jsonl-layout.ts`（`:1628-1841`）、`index.ts` 保留 class | 4（低优先，机械搬运） |
| P2-9 | `typert/generator/src/analyzer.ts:676-2818` | `FaceAnalyzer` 2140 行；`:2819-3468` 40+ 纯 helper | 生成器行为极难回归；文件大但职责是"类型图提取"一条主线 | `analyzer/face-analyzer.ts`、`analyzer/type-nodes.ts`（literal/keyword/modifier）、`analyzer/documentation.ts`（`:3123-3206`）、`analyzer/module-graph.ts`（`:3290-3370`）、`analyzer/config.ts`（`:2868-3016`） | 5（低优先） |
| P2-10 | `api/gateway/src/index.ts:214-1122` | `TypertGatewayService` 900 行混 RPC 分派、流、远端事件、参数校验；`:1123-1749` 为模块级 helper | 传输协议三套；但测试极全（17 个 spec） | `gateway-rpc.ts`、`gateway-stream.ts`、`remote-events.ts`（`RemoteEventQueue:1190`+`registerRemoteEvents:352`）、`gateway-validation.ts`（`:1539-1749`） | 4 |
| P2-11 | `PluginManagerPage.tsx:1009-1512`（`InstallDialog`）、`:277-820`（Rows/Cards/Detail）；`StatsTable.tsx:94-370`（类型）、`:559-1835`（单元格）、`:1836-1908`（`turnRows`/`TableButton`） | 单文件含安装向导、卡片、详情、终端日志；StatsTable 含 diff 渲染、图片灯箱、复制反馈 | StatsTable 属 `experimental`，仅 inspector profile 与测试 overlay 挂载（`experimental/inspector-profile/cordis.patch.yml:9`、`apps/web/tests/client-ui-stats-panel.overlay.yml:6`），非默认出货 | 各拆 `install-dialog.tsx` / `package-cards.tsx` / `stats-cells.tsx` / `stats-diff.tsx` | 3（低优先） |
| P2-12 | `extensions/cordis-client-runner/src/client/api-catalog.ts`、`extensions/tool-cordis/src/api-catalog.ts`、`extensions/cordis-client-runner/src/client/slot-catalog.ts` | 生成物（头部已注明 generator、`jscpd:ignore-start`），两份 catalog 内容高度重复 | 拖慢全仓搜索/dup 扫描；跨包复制由生成器保证一致 | **不手改**。可加 `.vscode/settings.json` `search.exclude` 与 `rg --glob '!**/*-catalog.ts'` 习惯；`pnpm run duplication` 已 ignore | 0 |
| P2-13 | `library.service.ts:46`（`libraryFileTypeKey`）、`wallet.service.ts:23`（`resolveLedgerTypeFilter`）、`llm-chat.gateway.service.ts:84`（`INSUFFICIENT_BALANCE_CODE`）、`official-kb.service.ts:16`（`OFFICIAL_KB_TENANT_SENTINEL`） | `export` 但仓内无外部消费者（仅本文件使用；测试未导入） | 扩大公开面、误导读者以为是对外契约 | 降为模块内 `const`/`function`；若前端需要，另建共享常量包 | 0.2 |

---

## 4. 每个大文件的目标文件清单（不动行为，只搬代码）

> 规则：搬动时**保持导出名与构造签名**；跨文件引用一律重导出（`export { X } from './x'`），调用方路径不改。

### 4.1 `ground/apps/backend/src/library/`（P1-1）

| 新文件 | 迁入成员 | 估算行数 |
|---|---|---|
| `library.service.ts`（保留） | `constructor` `write→withWrite 委托` `limitsView` `config` `ownerCounts` + 转发方法 | ~220 |
| `library.context.ts` | `LibraryContext`、`withWrite`、`custodiesFor`、`writeAudit`、`auditCustodyRead`、`touch` | ~130 |
| `library.guards.ts` | `requireMember` `requireTenantActor` `requireVisible` `requireManage` `requireVisibleFolder` | ~110 |
| `library.items.ts` | `toItem` `brief` `versionStatus` `libraryFileTypeKey` `joinedExcerpt` `citationExcerpt` `quotableInChat` `excerptAround` | ~140 |
| `library.read.ts` | `catalog` `list` `searchQuotes` `versions` `breadcrumb` `catalogPath` `isRootForView` | ~330 |
| `library.media.ts` | `openBytes` `preview` `download` `zipPreviewEntries` `prepareVersion` `chunkRows` `retryParse` | ~300 |
| `library.mutate.ts` | `createFolder` `createOwnedFolder` `createLink` `upload` `uploadOwned` `replaceVersion` `rename` `move` `recycle` `restore` `purge` `batch` | ~400 |
| `library.scope.ts` | `scopeImpact` `setScope` `scopeTree` `treeRevision` `checkTreeRevision` `applyScope` `creationTarget` `assertCreation` `blankNode` `scopeOrThrow` `isDescendant` `recycledSubtree` `purgeStored` | ~260 |
| `library.ask.service.ts` | `ask` `openCitation` `readRetrievalVersion` `markUsed` | ~230 |
| `library.custody.ts` | `grantCustody` `revokeCustody` `managedActor` `listCustody` `custodyView` | ~150 |
| `library.stats.ts` | `adminStats` `usedBytes` `assertQuota` | ~110 |

合计约 2000-2300 行（含头部 import，实际比 1465 增长 35-55%，属正常的“搬运税”）。

### 4.2 `admin/admin-official-agents.service.ts`（P1-2）

| 新文件 | 迁入成员 | 估算 |
|---|---|---|
| `admin-official-agents.service.ts`（保留） | `list` `detail` `load` + 构造 | ~120 |
| `admin-official-agent.presenter.ts` | `presentMany` `present` `presentVersion` `loadPublisherNames` `avatarExplicitByKey` `resolveAvatarUrl` `hasUnpublishedChanges` `stableJson` `assertPublishable` | ~300 |
| `admin-official-agent.draft.service.ts` | `create` `update` `normalizeDraft` `normalizeList` `frozenStringList` `requiredText` | ~180 |
| `admin-official-agent.publish.service.ts` | `publish` `offline` `rollback` `createPreview` `remove` | ~260 |
| `admin-official-agent.grant.service.ts` | `grant` `revoke` `bulkGrant` `bulkRevoke` | ~230 |
| `admin-official-agent.assets.service.ts` | `listAssetCatalog` `importAssets` `bulkOffline` `discovery` `saveDiscovery` `uploadAvatar` `removeAvatar` `syncOfficialKb` | ~320 |

注意：`bulkGrant` 的"逐租户串行、部分成功、失败进 `results`"语义必须原样保留（`:398-454`）。

### 4.3 `official-skill/official-skill.service.ts`（P1-3）

| 新文件 | 迁入 | 估算 |
|---|---|---|
| `official-skill.service.ts`（保留） | `adminList/adminDetail/discovery/saveDiscovery/availability/catalog*` + 转发 | ~250 |
| `official-skill-package.service.ts` | `validateZip` `createFromZip` `createFromForm` `updateMeta` `replaceZip` `persistNewSkill` `replacePackage` `mutateSkill` `syncCurrentManifestMeta` `applyCategories` `resolveCategories` `allocateKey` | ~420 |
| `official-skill-lifecycle.service.ts` | `enable` `disable` `remove` `setIcon` `assertEnabledStillComplete` `assertKeyAvailable` `assertPackageReady` | ~200 |
| `official-skill-public.service.ts` | `publicList` `publicContent` `publicResource` `beginSession` `catalogFacets` `catalogPage` `catalogDetail` `listEnabledOptions` | ~320 |
| `official-skill-display-translation.service.ts` | `translateDisplayBatch`（含 `buildDisplayTranslationPrompt` 调用） | ~140 |
| `official-skill-links.ts` | `summarizeEnabledSkills` `setAgentSkillLinks` `listAgentLinkedSkillIds` `snapshotLinkedSkills`（**保留 `tx?` 形参**，被 `admin-official-agents.service.ts:200` 传 tx 调用） | ~80 |

### 4.4 `official-agent/official-kb.service.ts`（P2-7）

| 新文件 | 迁入 | 估算 |
|---|---|---|
| `official-kb.service.ts`（保留） | `search` `file` `hasDocuments` + 转发 | ~120 |
| `official-kb-assets.ts` | `syncFromAssets` `loadAssetFiles` | ~150 |
| `official-kb-admin.ts` | `listAdminDocuments` `getAdminDocument` `readAdminContent` `adminDownload` `listAdminChunks` `uploadAdminDocument` `replaceAdminDocument` `reindexAdminDocument` `listBindableAgents` `canBindOfficialKb` `assertAgentAcceptsOfficialKb` `toAdminRow` | ~330 |
| `official-kb-index.ts` | `stageAndPromote` `activateDocument` `indexDocument` `requireUpload` | ~150 |

### 4.5 `official-agent/official-agent.service.ts`（646）

职责偏散但每条 20-40 行，**当前不建议拆**；若拆，只把工具调用面（`retrieve:218` `webSearch:255` `analyzeTabular:291` `fetchUrl:333` `delegate:368` `source:409`，共 ~190 行）移入 `official-agent.tools.service.ts`。

### 4.6 `llm/llm-chat.gateway.service.ts`（775）

| 新文件 | 迁入 | 估算 |
|---|---|---|
| `llm-chat.gateway.service.ts`（保留） | `proxyChatCompletions` `completeOnce`（两循环原地不动）+ `buildUpstreamUrl` `writeGatewayError` | ~300 |
| `chat-invocation.ts` | attribution 断言、候选/路由解析、billingKeys 构造、releaseFrozen 工厂、上游失败映射（见 P0-2） | ~180 |
| `chat-stream.ts` | `pipeStreamAndSettle` + SSE usage 提取 | ~120 |
| `chat-settlement.ts` | `settleUsage` `markUsageSettlement` | ~200 |
| `chat-models.ts` | `listModelsOpenAiShape` `candidates` `resolveModel` `toResolved` | ~150 |

### 4.7 `llm/llm-providers.service.ts`（717）

`llm-providers.service.ts`（CRUD ~300）/ `llm-providers.probe.ts`（`probe` `listRemoteModels` `resolveProbeCredentials` ~260）/ `llm-providers.view.ts`（`toModelView` `toProviderView` ~110）/ `llm-catalog.service.ts`（`listEnabledChatCatalog` ~40）。

### 4.8 `billing/enterprise-token-stats.service.ts`（708）
见 P2-1：`token-stats.range.ts`、`token-stats.aggregate.ts`、`token-stats.overview.ts`、`token-stats.detail.ts`。

### 4.9 `billing/wallet.service.ts`（609）
`wallet.service.ts`（`ensureWallet` `listWallets` `getWallet*` `userWalletAccessFlags` ~180）/ `wallet-ledger.ts`（`creditWallet` `debitWalletGuarded` ~120）/ `wallet.query.ts`（`walletDetail` `ledgerWhere` `countLedgers` `listLedgers` `normalizedLedgerAggregate` `enterpriseFundsReport` ~320）。

### 4.10 `frontend/views/admin/AdminOfficialAgents.vue`（2244）

| 新文件 | 迁入 | 估算 |
|---|---|---|
| `AdminOfficialAgents.vue`（保留容器） | 列表表格 + 编排 | ~450（template 1-160 + 状态/load/批量） |
| `AgentEditorDrawer.vue` | 模板 `:491-561` 区域（编辑器 drawer）+ `form`/`editorFields`/`persistEditorDraft`/`validateEditorForm`/`onSave`/`onSaveAndPublish`/`requestEditorClose`/`onEditorPreview` | ~700 |
| `AgentPublishRecordsDrawer.vue` | `openPublishRecords` `onRollback` `publishRecords*` | ~220 |
| `AgentViewerDrawer.vue` | `openViewer` `viewerDisplay` `viewerCapabilityLabels` | ~200 |
| `AgentAuditDrawer.vue` | `openAuditDrawer` `loadAudit` `goFullAudit` `auditMetaFields` `formatMeta` `auditActionLabel` | ~180 |
| `agent-display.ts` | `CATEGORY_LABELS` `TOOL_SCOPE_LABELS` `kindLabel` `categoryLabel` `toolScopeLabel` `buildCapabilityLabels` `statusLabel` `statusType` `formatDate` | ~140 |
| `useAgentEditorPreview.ts` | `editorPreview*` `invalidateEditorPreview` `requestEditorClose` 的预览段 | ~200 |

### 4.11 `frontend/api/admin.ts`（1414）
见 P1-6。

### 4.12 `mammoth-agent/packages/client/ui-trajectory/src/client/TrajectoryTable.tsx`（3607）

| 新文件 | 迁入成员（行） | 估算 |
|---|---|---|
| `trajectory-record-model.ts` | `flattenRecords:504` `filterRecords:531` `requestKey:556` `requestIdentity:560` `indexRequestBoundaries:566` `sectionLabel:581` `indexRequestNumbers:585` `indexRequestBoundaryRuns:595` `summarizeTurn:618` `collapseTurnRecords:639` `assistantToolCalls:674` `summarizeCalls:690` `collapseCallRecords:703` `stateOf:746` `statusLabel:757` `requestErrorMessage:763` `isMarkdownRecord:943` `parentRecords:949` `markdownSource:983` `detailTabs:993` `recordDisplayText:1030` `recordResultText:1048` `toolCallTextParts:1054` `isToolCallOnly:1069` | ~430 |
| `trajectory-metrics.ts` | `formatDurationMs:304` `formatStartedAt:311` `totalTime:350` `ttft:357` `generationTime:364` `throughput:370` `inputTotal:798` `clampDetailsWidth:286` `defaultToolRequestWidth:294` `clickSelectsText:322` | ~110 |
| `trajectory-glyphs.tsx` | `ToolWrenchIcon:65` `InformationIcon:84` `CompactedIcon:104` `KIND_ICON:126` `ToolGlyph:1357` | ~90 |
| `trajectory-usage-panel.tsx` | `TokenRows:772` `UsageRows:807` `RequestUsagePanel:855` `RequestOptions:878` `RecordTiming:1661` `RequestTiming:1679` `AssistantTimingPanel:382` `StartedAtValue:330` | ~200 |
| `trajectory-record-cell.tsx` | `MessageSource:921` `RecordPresentation:1084` `RecordListText:1120` `MarkdownFragment:1147` `SourceBlocks:1175` `recordAttachments:1236` `RecordAttachments:1258` `AssistantToolCalls:1298` `MarkdownRecordContent:1536` | ~520 |
| `trajectory-payload.tsx` | `ToolCatalog:1378` `promptDiffLines:1421` `PromptDiffSection:1438` `SystemPromptDiff:1464` `ToolOutputBlocks:1495` `RecordPayload:1721` `RecordSchema:1823` `parseToolSchema:1872` `parseJsonContainer:1894` `ProgramInput:1929` `ProgramOutput:2007` `InspectorCopyButton:1903` `OverviewSection:2035` | ~460 |
| `TrajectoryTable.tsx`（保留） | 容器 `:2095-3607` + `useStableVirtualRowStructure:159` + `virtual-rows` 接线 | ~1500（可二期再拆出 `TrajectoryDetailsPane.tsx`） |

约束：`@mammoth-ai/mmp-client-*` 的 `/client` 入口导出面不能因拆分而扩大；`TrajectoryView.tsx:15` 的导入名保持。

### 4.13 其余 mammoth-agent（P2-8/9/10/11）
见 §3 对应行的文件清单。

---

## 5. 拆分前必须先解的耦合

### 5.1 谁 import 谁（后端关键边）

```
library-domain.module ──new──> LibraryService(store)
library.admin.service ──new(tx store, now)──> LibraryService
library.controller ──DI──> LibraryService, LlmChatGatewayService
library.llm ──type+call──> LlmChatGatewayService.completeOnce

admin-official-agents.service ──DI──> OfficialKbService, OfficialSkillService, ExpertRuntimeService(optional)
admin-official-knowledge.service ──DI──> OfficialKbService
official-agent.service ──DI──> OfficialKbService, OfficialSkillService, KnowledgeService, web-search/fetch/tabular/orchestrate
official-skill.service ──DI──> LlmChatGatewayService        // 唯一 LLM 依赖，见 P1-3
llm-chat.gateway.service ──DI──> ExpertRuntimeService, BillingService, LlmHealth/Concurrency
llm-chat.controller ──DI──> OfficialAgentService
billing.module ──forwardRef──> LlmModule ; llm.module ──forwardRef──> BillingModule
official-skill.module ──forwardRef──> LlmModule
billing.service ──DI──> WalletService ; charge.service ──DI──> WalletService
token-stats.service ──DI──> EnterpriseTokenStatsService
billing-config.service ──DI──> LlmProvidersService
```

### 5.2 私有成员是否被跨模块调用

- 后端：**没有**跨模块调用私有方法（`private` 仅在同文件）；但存在"跨模块 new 出实例后调 public"的耦合：`library.admin.service.ts:66,82,116`。
- 前端：`AdminOfficialAgents.vue` 通过 `provide(expertEditorResourcesKey)` 向子组件暴露 `editorResources`（`:565-566`），拆 editor 时必须把 `provide` 一起搬或上提。
- mammoth-agent：`TrajectoryTable.tsx` 的 44 个纯函数**未被任何其他文件导入**（`grep` 仅 `TrajectoryView.tsx:15` 导入 `TrajectoryTable`/类型），因此搬动安全。

### 5.3 拆分必须先解决的三件事

1. `LibraryContext`（P0-1）—— 否则任何 library 拆分都会复制事务语义。
2. `LibraryService` 构造签名（4 参，22 处 new）—— 保持 facade；子服务不许出现在 DI 容器里，避免 Nest provider 顺序绑定 tx。
3. `OfficialSkillService` 的 `tx?` 形参（`setAgentSkillLinks(agentId, ids, tx?)` 被 `admin-official-agents.service.ts:200` 在事务内调用）—— 搬到 `official-skill-links.ts` 后签名必须一字不差。

---

## 6. 后端「分页 / 查询构造 / 权限校验」重复对照

### 6.1 权限校验（5 种写法，3 种语义）

| 写法 | 位置 | 语义 |
|---|---|---|
| `requirePlatformAdmin(actor)` | `wallet.service.ts:606`、`llm-providers.service.ts:69` | 平台管理员 |
| `support.requirePlatformAdmin(actor)` | `token-stats.support.ts:103`（被 `enterprise-token-stats.service.ts:32,163,448` 调用） | 平台管理员 |
| `support.adminScope(actor)` | `admin-support.service.ts:127`（被 `admin-official-agents.service.ts:94,129,174` 调用） | 管理范围（返回 tenant 列表或 null） |
| `assertSuperAdmin(prisma, actor.id)` | `admin-official-agents.service.ts:102,179,377,485` | 超管 |
| `this.platform(user)` | `library.admin.service.ts:22` | 平台管理员 |
| 内联 `if (!actor.isPlatformAdmin) throw` | `official-skill.service.ts:1022`、`library.service.ts:904` | 平台管理员 |

建议（P2）：收敛到 `auth/guards.ts` 的 3 个函数；但 `adminScope` 有返回值，不能与断言混用。

### 6.2 分页策略不一致（**不要顺手统一**）

- 服务端分页：`library.service.ts:289-292`（`page/pageSize`，上限 100）、`library.admin.service.ts:49`、`:27`（tenants）。
- 服务端**不**分页但前端 slice：`admin-official-agents.service.ts:142-150`（全量 + `groupBy`）、`official-skill.service.ts:133-151`（全量）。
- 大 `take` 兜底：`enterprise-token-stats.service.ts:44`（20000）、`:607`（50000）。
- 前端 client-side slice：见 P1-4 表。

依据：这是产品行为差异（专家/技能量小，全量返回供前端二次筛选），合并会改接口契约。

### 6.3 查询构造重复

| 重复片段 | 位置 |
|---|---|
| `where: {deletedAt:null, enabledAt:{not:null}, currentRevision:{gt:0}}` | `official-skill.service.ts:79,81,124,164` |
| `keyword OR[name,key,summary] contains insensitive` | `official-skill.service.ts:140-145`、`admin-official-agents.service.ts:131-139` |
| 日期区间 `occurredAt:{gte,lt}` + `tenantId:{not:null}` + `tenant.type!=PLATFORM` | `enterprise-token-stats.service.ts:172-177,193-197,470-473` |
| `baseUrl/apiKey/modelId` 回填 | `llm-providers.service.ts:485-528,601-627` |

---

## 7. 死代码 / 无消费者导出

| 符号 | 定义 | 引用点 | 判定 |
|---|---|---|---|
| `libraryFileTypeKey` | `library.service.ts:46` | 仅 `:282` 内部使用 | 可降为模块内 |
| `resolveLedgerTypeFilter` | `wallet.service.ts:23` | 仅 `:506` | 可降为模块内 |
| `INSUFFICIENT_BALANCE_CODE` | `llm-chat.gateway.service.ts:84` | 仅 `:247,:257` | 可降为模块内 |
| `OFFICIAL_KB_TENANT_SENTINEL` | `official-kb.service.ts:16` | 仅 `:116,118,143` | 可降为模块内 |
| `OfficialAgentExecution` | `official-agent.service.ts:42` | 仅 `:122` 返回类型 + `:124` 断言 | 保留（返回类型），但 `as unknown as`（`:124`）是可维护性债 |
| `OfficialSkillService.listCustody` 之外的 4 个 library 代管方法是唯一入口 | — | 有 controller 调用 | 非死代码 |

未发现「仅测试引用」的生产导出（`lexicalQueryVariants` 是测试引用**且**生产引用）。

---

## 8. 前端包体

| 项 | 证据 | 判定 |
|---|---|---|
| Element Plus | `main.ts:3` `import ElementPlus from 'element-plus'`；`:5` `import 'element-plus/dist/index.css'` | **全量**注册，组件与 CSS 均无法 tree-shake |
| 图标 | 无 `@element-plus/icons-vue` 依赖（`apps/frontend/package.json:12-20`）；图标走 `lucide-vue-next` 按名导入（如 `AdminOfficialAgents.vue:570` 11 个具名） | 已按需，无需改 |
| dayjs / lodash | `package.json` **无**这两个依赖；全仓 grep 无 import | 假设不成立，无需处理 |
| 路由 | `router/index.ts:19-132` 全部 `() => import(...)` | 已按路由切分 |
| 目标 | 入口 chunk 目前含全部 EP 组件 | 改按需（unplugin-vue-components 或手工注册 17 个组件）。**体积收益本次未验**，需 `vite build` 对比 |

---

## 9. 未验与原因

1. 未执行 `pnpm run build` / `vite build`，因此 Element Plus 按需改造的**实际 KB 收益**未测（本角色只读，禁 shell）。
2. 未跑 `pnpm run duplication`（`mammoth-agent` 有 jscpd 门禁），重复行数为人工比对结果，非工具报告。
3. 未跑任何测试；「护栏够用」判断基于 spec 文件名与用例覆盖面的静态阅读，未看断言细节。
4. 未打开数据库，`library.admin.service.ts` 中 `pg_advisory_xact_lock` 等并发假设只做静态判断。
5. 未核对 `ground` 是否有前端 bundle 体积门禁脚本（未搜到 `size-limit`/`bundlewatch`）。
6. `TrajectoryTable` 容器 1500 行的二期再拆（`TrajectoryDetailsPane`）未给行段级清单，需一次细读。

## 10. 剩余风险

- **P0-2 是最大行为风险**：两条补全路径的差异是"活语义"，任何"去重"都需先冻结差异表并加双路径结算快照。
- **mammoth-agent 的 per-file 100% 覆盖率门禁**会把"纯搬运"变成"搬运 + 补测"，P1-5 的实际成本可能高于 4 人日。
- **library 的 22 处 `new LibraryService`** 决定了它只能做 facade 式拆分，不能改成 Nest 多 provider（否则 tx 注入点全部失效）。
- **前端 7 页零测试**：在护栏建立前，任何 composable 抽取都属于"不可验证的改动"。
- 生成文件（catalog）虽已 `jscpd:ignore`，仍会持续污染全仓搜索结果，属工具配置问题而非代码问题。

## 11. 交接

- 拆分决策 / 优先级 / 是否分期：**DeepSeek 主会话**
- Ground 后端实施（P0-1、P0-3、P1-1/2/3/7、P2-1/2/4/7）：**李庚**
- 前端 composable 与页面拆分（P0-4、P1-4、P1-6、P2-5/6）：**甜甜**（UI）+ 李庚（api 层）
- mammoth-agent 拆分（P1-5、P2-8/9/10/11）：**王总**
- 拆分后回归验收（双路径计费、库事务、覆盖率门禁）：**秋池** → 复审 **浪哥**
