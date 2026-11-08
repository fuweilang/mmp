# 专家广场（official-agent）全链路只读审查

- 审查时间：2026-11-08（America/Los_Angeles）
- 基线：`ground` 仓库分支 `3.0`，HEAD `964dfca2`（用户提供，本次未执行任何 git 命令复核）；工作区 clean（用户提供）
- 方式：只读静态审查；未执行 shell、未改业务源码、未连数据库、未调用真实模型
- 结论：无 P0；P1 1 项（跨企业管理员判定）；P2 9 项

## 范围

| 层 | 落点 |
|---|---|
| Admin 后端 | `ground/apps/backend/src/admin/admin-official-agents.{controller,service}.ts`、`admin-support.service.ts`、DTO |
| 广场/执行后端 | `official-agent/{official-agent.service,official-agent.controller,catalog-discovery,discovery-detail,expert-definition,gallery-presentation,gallery-avatars,official-kb,orchestrate}.ts` |
| Console 后端 | `official-agent/catalog-preference.controller.ts`、`tenant/tenant.service.ts`、`permissions/effective.ts` |
| 模型/计费 | `llm/llm-chat.gateway.service.ts` |
| Admin/Console 前端 | `views/admin/AdminOfficialAgents.vue`、`views/Knowledge.vue`、`official-agent-version-presentation.ts`、`api/{admin,console}.ts` |
| 数据 | `prisma/schema.prisma`、`20261107010000_managed_expert_definition`、`20261107030000_gallery_discovery_detail`、`20261107135000_catalog_user_preferences`、`scripts/expert-catalog-integrity.mjs` |
| 终端 | `mammoth-agent/packages/preset/official-agent-gallery/src/{index,ground,projection,types}.ts`、`llm/llm-ground/src/{adapter,index,config,attribution}.ts`、`core/agent/src/{model-selection,session-controller/agent}.ts` |

## P0

无。

## P1

### P1-1 企业管理员判定先用全局 `org_admin` 角色，第二企业成员可越权

- 证据
  - `ground/apps/backend/src/tenant/tenant.service.ts:441-444`：`assertOrgAdmin` 先查 `userRole` 中是否存在全局 `org_admin`，存在即 `return`；之后才查本租户 `orgMember.role in [ADMIN, OWNER]`（`:445-455`）。
  - `ground/apps/backend/src/permissions/effective.ts:85-96`：`ORG_PRESET` 角色（含 `org_admin`）的权限**不按租户过滤**，直接并入有效权限；`:39` 注释亦为“始终用全局预置包”。
  - `ground/apps/backend/src/tenant/tenant.service.ts:143-148`：把已有用户加入新企业时，仅当该用户 `userRole` 数为 0 才补预设角色；已是 A 企业 `org_admin` 的用户加入 B 企业不会得到 `org_member` 角色，仍保留全局 `org_admin`。
  - 禁调用链：`official-agent.service.ts:573-577`（`requireScopeAdmin` = `requireConsolePerm('portal.console.kb')` + `assertOrgAdmin`）→ `consoleList`（`:376-397`）、`updateScope`（`:399-443`）；同类还有 `tenant.service.ts:117-119/177-179/256-258/330-332`、`tenant-role.service.ts:111/134/195`、`pay/recharge-settle.service.ts:81`。
- 触发：用户在 A 企业为管理员（注册即授予全局 `org_admin`，`auth.service.ts:103-110`），随后被加入 B 企业且角色为成员；B 企业内任一需要“企业管理员”的写接口。
- 影响：可跨企业管理成员/角色/重置密码/充值查看与操作（`pay/recharge-settle.service.ts:75-86`）/专家知识库目录范围（专家广场侧为 `console/scopes`、`PUT :id/scope`）。前端 `Knowledge.vue:227-229` 仍按当前租户 `currentRole` 隐藏入口，造成“UI 不可见但接口可用”的不一致。
- 依据：`org_admin` 是 `user_role` 维度（`schema.prisma` `UserRole @@unique([userId, roleId])`），不带 `tenantId`；本租户校验被前置短路。
- 建议：`assertOrgAdmin` 去掉全局短路，统一按 `orgMember(userId, tenantId)` 的 ADMIN/OWNER 判定（平台管理员仍直通）；若产品确需“全局企业管理员”，必须在 `resolve`/写接口显式限定可作用租户，并让前端能力位与后端同源。修复决策交主会话。

## P2

### P2-1 `resolve` 不校验企业授权，`executionGranted` 恒为 true

- 证据：`official-agent.service.ts:110-132`（注释明确“不再要求企业 ACTIVE grant”）、`:135`/`:149`（`publicCatalogCard(..., true, ...)` 恒传 `executionGranted=true`）、`:462`（Console 卡片同样硬编码 true）；终端仅据此放行 `mammoth-agent/.../official-agent-gallery/src/index.ts:239`。
- 触发：Admin `revoke`（`admin-official-agents.service.ts:654` 起）撤销企业授权后，该企业用户仍可启动非 `KNOWLEDGE` 专家；`KNOWLEDGE` 专家只在 `retrieve` 时被 `loadActiveGrant` 拒绝（`:541-550`）。
- 影响：“开通/撤销企业”对可用性无语义，与 Admin UI“试点企业开通/撤销”表述不一致；撤销无法止损。
- 建议：明确一期语义（公共广场 vs 企业授权）；若授权应控可用，`resolve` 按 `tenantId` 校验 ACTIVE grant（平台租户豁免），或 Admin UI 明确标注“仅影响企业私库绑定”。

### P2-2 并发创建/发布的 Prisma 错误未映射，暴露 500

- 证据：`admin-official-agents.service.ts:139-160`（先 `findUnique` 再 `create`，并发同 key 触发 P2002）、`:536-575`（`Serializable` 发布，并发触发 P2034 无重试）；全仓库无统一 Prisma 异常过滤器（仅 `billing/*`、`llm-providers.service.ts` 局部处理 P2002）。
- 触发：双击“新建”或“发布”、两个管理员同时发布同一专家。
- 影响：返回 500 + Prisma 原始错误，前端只能显示“发布失败”。
- 建议：catch P2002 → 409；P2034 重试一次或返回 409“操作冲突，请刷新后重试”。

### P2-3 官方知识库并发激活可能留下多条 active

- 证据：`official-kb.service.ts:486-513`：事务内先 `updateMany` 置旧记录 `active=false`，再激活当前记录；`schema.prisma:279-281` 仅有普通 `@@index`，无 `(agentId, assetKey) WHERE active` 唯一约束。
- 触发：同一 `agentId+assetKey` 两个上传/重建并发完成激活（Admin 重复上传、重试）。
- 影响：两条 `active+READY`，`search`（`:120-129`）重复命中、排序权重失真；`file` 也可能取到旧文档。
- 建议：加部分唯一索引，或在激活事务内对目标行 `SELECT ... FOR UPDATE` / 使用 `Serializable`。

### P2-4 自定义头像文件缺失时不回退内置头像

- 证据：`gallery-avatars.ts:124-139`：`normalizeCustomAvatarPath` 成功但 `resolveUploadedOfficialAvatarFile` 返回空时直接 `return null`；与 `:125-126` 注释“missing custom files fall through to assets”不符。
- 触发：Admin 上传头像后文件被清理/迁移丢失。
- 影响：广场/详情无头像（空白），而非回退内置图。
- 建议：`uploaded` 为空时继续执行 `resolveOfficialAvatar(input.key, input.explicitAssetAvatar)`。

### P2-5 广场目录 N+1 查询

- 证据：`official-agent.service.ts:148-150`（一页 20 条）、`:154-161`（每条 `summarizeEnabledSkills(ids)`）；`catalogCard`（`:135`）同样每次多条。
- 触发：广场首页/筛选/详情加载。
- 影响：每次目录加载额外 20+ 次查询，P95 随条目线性增长。
- 建议：按页收集全部 skill id 一次 `findMany({ id: { in } })` 后在内存拼装，或对 `summarizeEnabledSkills` 加短 TTL 缓存（明确 owner）。

### P2-6 终端 Ground 客户端丢弃错误正文，401 不触发重登

- 证据：`mammoth-agent/packages/preset/official-agent-gallery/src/ground.ts:403-406`、`:423-426`：仅 `throw new Error('... HTTP ${status}')`，丢弃 Ground 返回的 code/message；对比 `llm-ground/src/adapter.ts:81-84`、`:255-258`（401/403 → `ACCOUNT_TOKEN_INVALID`，有明确“请重新登录”文案）。
- 触发：token 过期/账号停用后打开专家或启动会话。
- 影响：用户看到“HTTP 401/403”，无法区分登录失效与权限变更；该客户端本身不上报 token 失效码（是否触发刷新取决于注入的 `token()` 源，本次未核实）。
- 建议：401/403 映射为统一可重登错误码（与 `llm-ground` 对齐）；其余错误保留截断后的 Ground message。

### P2-7 专家会话硬编码 provider/model

- 证据：`official-agent-gallery/src/index.ts:258`、`:317` 固定 `{ provider: 'mammoth-ground', model: 'auto' }`；`llm-ground/src/config.ts:17` 默认值可被 cordis.yml 覆盖，`index.ts:32-46` 以配置值注册适配器。
- 触发：部署覆盖 `providerId`。
- 影响：专家会话指向未注册 provider，模型列表/解析失败；当前 bundle 配置一致，属耦合风险。
- 建议：注入已注册 provider 名，或加载时断言配置一致并 fail loud。

### P2-8 委派路径不处理子专家 `KNOWLEDGE` 工具

- 证据：`orchestrate.service.ts:147-237` 只处理 `WEB_SEARCH/WEB_FETCH/TABULAR_ANALYZE`；直接会话则有 `knowledgeTool`（`official-agent-gallery/src/index.ts:500`）与官方库检索（`official-agent.service.ts:176-198`）。
- 触发：`BOSS_DELEGATE_ALLOWLIST`（`:23-30`）中某专家被配置为 `KNOWLEDGE` 且带知识库。
- 影响：委派答案不含该专家知识库证据，与直接会话行为不一致。
- 建议：按 `childScope` 处理 `KNOWLEDGE_TOOL`，复用官方库检索（需 `tenantId` 与企业授权校验）。

### P2-9 Console 入口可见性与后端判定不同源

- 证据：`ground/apps/frontend/src/views/Knowledge.vue:227-229` 用 `currentRole`（当前租户 `OrgMember.role`，`auth.service.ts:356`）判断；后端 `assertOrgAdmin` 用全局 `org_admin`（P1-1）。
- 触发：多企业成员且全局角色与当前租户角色不一致。
- 影响：按钮隐藏但接口可用（或反之），管理入口不可发现。
- 建议：由会话接口下发 `canManageExpertScope` 能力位，前后端同源；随 P1-1 一并处理。

## 已核对无问题

| 点 | 证据 |
|---|---|
| 发布不可变版本 + 草稿/在线分离 | `admin-official-agents.service.ts:536-575`；`schema.prisma:226` `@@unique([agentId, version])` |
| 发布并发一致性（单次） | `:575` `Serializable`；DB 唯一约束兜底 |
| 每轮核验发布状态/账号/版本归属 | `official-agent.service.ts:524-536`；`mammoth-agent/.../index.ts:428-434` |
| 下架即刻生效 | `admin-official-agents.service.ts:590-599`（status=OFFLINE），`resolve` `:527-529` 拒绝 |
| 工具能力按冻结版 `toolScope` 校验 | `official-agent.service.ts:212-215/254-258/290-294`；`orchestrate.service.ts:108-111` |
| 公开字段白名单、不泄露 systemPrompt/内部路径 | `publicCatalogCard`/`catalogDetail`（`official-agent.service.ts:136-141/466+`）；`discovery-detail.ts` 只读 online definition |
| 头像/附件路径防穿越 | 头像：`gallery-avatars.ts:19-29/107-116/179-185`（basename + relative 校验）；官方附件：路径由服务端生成（`knowledge/storage.ts:56-62`），`officialKb.file` 按 `agentId+documentId` 查库取 `storagePath`（`official-kb.service.ts:146-152`），用户不控路径 |
| 知识库 staging→READY→activate，检索只读 active+READY | `official-kb.service.ts:345-367/448-513`；`search` `:120-129` |
| 企业私库检索强制 ACTIVE grant + 企业成员/状态 | `official-agent.service.ts:541-550/557-570` |
| Admin 侧仅平台管理员 | `admin-support.service.ts:90-92/122-125` |
| 批量开通/撤销校验企业类型与状态 | `admin-official-agents.service.ts:356-365/445+` |
| 收藏/最近作用域绑定用户+企业，拒绝越权写入 | `catalog-preference.controller.ts:22-44`（`expectedScope/expectedUserId` 校验） |
| 已下架模型不再用旧 ID 发请求 | `llm-ground/adapter.ts:176-193`（回落 preferred/auto）；`llm-chat.gateway.service.ts:106-124` 候选仅 enabled+provider enabled+有 key |
| 终端幂等/steering/scope 变化保护 | `mammoth-agent/.../index.ts:395-421/428-434` |
| 迁移 additive | 三个迁移仅新增表/列/索引，无破坏性改名或删列 |

## 未覆盖与原因

| 项 | 原因 |
|---|---|
| 真实 GUI（Admin/Console/Web/Electron）交互、按钮流转 | 只读静态审查，未启动应用 |
| 真实 Ground + 云池模型调用、计费冻结/结算实测 | 需凭据与运行环境 |
| 真实 DB 迁移执行、并发压测（发布/KB 激活） | 未连库、未跑脚本；P2-2/P2-3 为静态推导 |
| mammoth-agent 全量插件加载、Remote 协议、session projection 重建 | 仅抽查专家广场相关路径 |
| 官方技能（official-skill）全链路细节 | 仅抽查 catalog/beginSession 调用面 |
| `expert-catalog-integrity.mjs` 的实际执行结果 | 未运行脚本 |

## 交接

- 无业务源码改动；本次唯一写入为本报告 `mmp/.opencode/reports/review-expert-gallery.md`。
- 优先级建议：P1-1 需主会话确认“企业管理员”是否按租户建模（影响面超出专家广场）；P2-2/P2-3 是可直接修的健壮性项；P2-1/P2-9 需产品语义决策；其余为体验/性能/耦合。
- 拆分决策、是否修复及顺序由主会话决定。