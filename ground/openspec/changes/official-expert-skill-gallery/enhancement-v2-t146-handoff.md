# t146 八任务实际交付（部分 blocked；不是8/8验收）

## 核心结果
- t146 已批准开发；只在指定Mac本地 WIP 实施，没有 clone/cloud/commit/push/publish/reset/clean，未杀或重启用户dev。
- 详情数据/Admin/公开DTO/双端卡片与必要资源已实现并通过有界类型编译；没有扩充专家/技能或启用草稿。
- **真实增强执行没有开放。** 当前 Seatbelt builder shape 的无秘密夹具探查证实 workspace-write 对工作区外读取并非强制拒绝；没有证明网络隔离、可信Host握手、范围grant与跨入口执行约束。不能先解绑专家限制再补门禁。
- 当前安全策略是 `gallery-v2-closed-1`：新 expert/skill Remote create 在任何 Ground bind/会话创建前拒绝。已冻结的专家/技能会话在 agent/pre-step 拒绝业务步骤，同时本模块的 tools.guard 与 tools/pre-execute 拒绝工具动作。普通未绑定广场增强的标准会话不被此模块新分支收口。**旧专家/技能会话仍可看历史，但本轮策略会阻断它们继续执行；这是可见限制，不是新功能全部完成。** 尚未做真实Host跨入口集成验收，不能把这三条接线说成整个平台无绕过保证；对应能力继续关闭。

## 八任务真实状态
|任务|状态|实际范围与未做|
|---|---|---|
|一 字段/兼容/基线/OpenSpec|完成本轮增量|现查六表基线；新增skill发现JSON列；不改旧内容/启用/版本；本文记录契约。|
|二 P0可实施性与门禁|部分，真实执行blocked|完成无秘密shape探查、创建入口拒绝、原生步骤/工具拒绝接线；未实现/验真可信Host、scope grant、打开句柄TOCTOU、进程网络/redirect及并发审批契约。|
|三 Admin详情/开场白|源码完成，未浏览器点检|专家/技能现有列表新增“广场详情”独立编辑/预览；新建资源先用原表单保存再编辑详情，不是新建弹窗内联字段。原ZIP/图标/关联技能路径保留，默认10。|
|四 Public list/detail|源码完成，未HTTP集成验收|新的catalog-detail显式白名单、published/enabled前置；专家读精确在线version；旧分页20/facets/taxonomy不改；private,no-store。|
|五 双端详情/直达入口|UI/资源完成，执行受阻|卡主体详情、独立CTA、详情底部CTA；native dialog焦点/关闭；starter只写详情草稿，已有草稿不替换；未来可放行时用原生初始化keep，不auto-send。实际新会话目前安全拒绝。|
|六 standard组合/load barrier|blocked，未实现|未去掉complete:true/原专家白名单；未挂v2 standard、未实现最终request-context/budget/hash屏障、压缩恢复回落重检；没有用绑定/下载冒充已加载。|
|七 真实事件/取消/artifact|仅来源UI完成；主要blocked|header与input.left展示冻结来源“已绑定·执行未开放”；未实现新事件envelope/单终态/审批消费/外部副作用幂等/Host对象产物验真，不展示虚假技能执行成功。|
|八 资源/有界核对/交付|完成允许范围，非全验收|相关Host/UI单包产物、backend dist已发射；8项窄检查与六表保全通过；未全build/E2E/browser/QA/review/真实危险执行验收。|

## 实际字段与兼容
|公开字段|真实保存点|缺省与公开策略|
|---|---|---|
|名称/短用途|原expert parent/version的name/summary；skill name/summary|不改原值；沿既有安全发现summary overlay。|
|图标|原expert/skill customAvatarPath及已有受管上传链路|继续原公共avatarUrl；不回传磁盘路径；expert图标为既有资源展示属性，不声称新增图标发布snapshot。|
|介绍/产出/材料/边界/新starter|expertDefinition.discoveryDetail（parent编辑、future explicit publish冻结到version）|schemaVersion1/displayRevision独立；旧值缺省空；草稿不改变在线版本。|
|同上，技能|official_skill.discovery_detail JSONB NOT NULL DEFAULT '{}' / Prisma discoveryDetail|资源级可见文案，独立于manifest/包revision；仅enabled资源公开；空段隐藏。|
|旧expert开场白|已冻结公开openingQuestions|没有显式starters字段时最多3条兼容为label/text；显式[]可清除fallback；不把旧openingQuestion自动发送作为新UI行为。|
|专家关联技能|现有linkedSkillSummaries与启用校验|公开仅{id,name,summary}，不带正文/path/tools；旧绑定和内容不更新。|

`discoveryDetail`允许 introduction≤2000字；outputs/materials/boundaries各≤5项、每项≤300字；starters≤3，label≤40/text≤500；总JSON UTF-8≤16KB；拒绝未知字段。父updatedAt+displayRevision双重乐观检查、事务updateMany CAS，取消不保存；不以改展示文案自动publish或enable。

### API / UI 调用路径
- Admin GET/PUT `/api/admin/official-agents/:id/discovery`；skills同理（沿现有管理controller前缀及权限）。保存只改发现文案，audit仅字段/ID；旧管理详情不暴露到public。
- shared GalleryPage → `ctx.remote.officialAgentGallery.catalogDetail(kind,id)` → additive Typert Remote → Ground client fixed `/api/official-agents/:id/catalog-detail`或skills → 原JWT/activeAccount + published/enable过滤 → 显式DTO。
- expert public从catalogCard的精确versionId读取当前onlineFor published版本，版本变更则404要求刷新，不读mutable draft；skill public不读取SKILL.md。
- 保留旧list/industry/facets/page strict codecs；新详情用新Remote，单包生成Typert；没有改public-api-base或新增前端直连。
- 卡片主体和CTA分离，不嵌套button；搜索/两维筛选/每次20分页/Tab状态沿原实现。missing详情不造内容。

## 迁移与保全
- `20261107030000_gallery_discovery_detail` 已 `prisma migrate deploy` 成功；`prisma generate`成功。只有非破坏新增列，无资料导入/文案批量回填/启用操作。
- fresh BASELINE/RESULT在 `apps/backend/src/official-agent/assets/managed/enhancement-v2/`，六表counts与原字段哈希全部一致。canonicalizer只忽略新增discoveryDetail键，旧expertDefinition等其余字段/时间均纳入；不把新列默认值说成“数据库零变化”。
- before=after：experts46/published22/draft24/versions47/skills115/enabled115/packages115/links44/grants14；preserved=true，mismatches=[]。
- P0-SPIKE.json是当前builder shape的本地合成夹具证据，outsideReadSucceeded=true；不是实际宿主全链路或网络验证。
- FOCUSED-CHECK.json记录8项窄检查及全部未验；RUNTIME-MANIFEST.json记录本轮源和运行产物hash。

## 实际校验命令与退出码
1. `pnpm --filter @mammoth/backend exec prisma migrate deploy` → 0；`prisma generate` →0（未安装或升级依赖）。
2. `pnpm --filter @mammoth/backend exec tsc -p tsconfig.build.json --noEmit --incremental false` →0；同配置去掉noEmit发射dist→0。
3. `pnpm --filter @mammoth/frontend typecheck` →0。
4. M内 `pnpm exec tsc -p packages/preset/official-agent-gallery/tsconfig.json` →0；client/ui-official-agent-gallery同样→0。
5. 仅gallery的WorkspaceTypertGenerator（checkDiagnostics:false）生成 →0；生成不是类型验收，上述tsc另行通过。
6. 各gallery Host/UI目录 `pnpm exec tsdown` →0；未触发prebundle的tsc -b --force或mono build。Host lib/index.js、Typert JS/d.ts、UI lib/client.js/map均最新；Admin由Vite读取Vue源码。
7. `M/node_modules/.bin/tsx G/apps/backend/scripts/gallery-enhancement-focused-check.mjs` →0（8项）：真实已构建create/createSkill方法在上下文访问前拒绝；白名单/未知字段/长度schema/旧revision/幂等revision/旧开场白兼容。**不证明真实Host隔离、load barrier或cancel安全。**
8. `node apps/backend/scripts/gallery-enhancement-preservation.mjs` →0，preserved=true。
- 过程中的composite --incremental false参数和检查脚本.mts被backend CJS glob纳入的问题均已修正；最终上面四项编译为0。最初泛backend tsconfig还含既有测试fixture编译错误（官方agent admin/avatar/version-presentation fixtures），未扩scope修改它们；本轮业务build tsconfig为0。

## 本地点检与限制
- 运行中的Host缓存旧ESM须用户按原方式重启DevHost，再刷新Web/桌面；仅浏览器刷新不能保证新Remote出现。Backend非watch或未自动重载时需用户重启现有后端；本轮不kill/restart它们。Admin Vite refresh即可加载新Vue源码。
- **加载新Host后，专家/技能增强新会话创建及旧绑定会话继续执行都明确closed，不能期待现在生成文件。** 详情/Admin可点检；普通未绑定标准会话本轮未增工具/权限。
- 没有实现完整可信Host/grant/审批/进程网络隔离，所以任务六与七的主要运行部分blocked。不能仅取消这道阻断或改UI提示就交付安全标准增强；不以用户最终点检替代P0证明。
- 未做public鉴权HTTP、三种Host拓扑、真实上下文预算/压缩/回落、cancel竞争或artifact对象验证；不承诺稳定或已验收。

## 本轮实际文件
- G/apps/backend/prisma/schema.prisma
- G/apps/backend/prisma/migrations/20261107030000_gallery_discovery_detail/migration.sql
- G/apps/backend/scripts/gallery-enhancement-preservation.mjs
- G/apps/backend/scripts/gallery-enhancement-focused-check.mjs
- G/apps/backend/src/official-agent/discovery-detail.ts
- G/apps/backend/src/official-agent/expert-definition.ts
- G/apps/backend/src/official-agent/official-agent.service.ts
- G/apps/backend/src/official-agent/official-agent.controller.ts
- G/apps/backend/src/official-skill/official-skill.service.ts
- G/apps/backend/src/official-skill/official-skill.controller.ts
- G/apps/backend/src/admin/admin-official-agents.controller.ts
- G/apps/backend/src/admin/admin-official-agents.service.ts
- G/apps/backend/src/admin/admin-official-skills.controller.ts
- G/apps/backend/src/admin/admin-official-skills.service.ts
- G/apps/backend/src/admin/dto/official-agent.dto.ts
- G/apps/backend/src/admin/dto/official-skill.dto.ts
- G/apps/frontend/src/components/CatalogDiscoveryEditor.vue
- G/apps/frontend/src/views/admin/AdminOfficialAgents.vue
- G/apps/frontend/src/views/admin/AdminOfficialSkills.vue
- M/packages/preset/official-agent-gallery/src/admission.ts
- M/packages/preset/official-agent-gallery/src/index.ts
- M/packages/preset/official-agent-gallery/src/ground.ts
- M/packages/preset/official-agent-gallery/src/types.ts
- M/packages/client/ui-official-agent-gallery/src/client/index.ts
- M/packages/client/ui-official-agent-gallery/src/client/GalleryPage.tsx
- M/packages/client/ui-official-agent-gallery/src/client/GalleryPage.module.css
- M/packages/client/ui-official-agent-gallery/src/client/GallerySourceLabel.tsx
- M/packages/client/ui-official-agent-gallery/src/client/locales.ts

运行资源详见 RUNTIME-MANIFEST.json；本交接及design/tasks/spec末尾为本轮增量，不改历史记录结论。


> t148/t149 follow-up: blanket closure in this historical t146 report is superseded for NEW managed-document sessions. See [business-v3-t149-handoff.md](./business-v3-t149-handoff.md). The original unsafe Seatbelt shape evidence is not revoked; arbitrary execution remains unavailable.
