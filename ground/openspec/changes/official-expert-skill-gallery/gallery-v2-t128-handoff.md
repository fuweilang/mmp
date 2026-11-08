# t128共享广场分页/图标/展示元数据 — 本地交接

## 实际完成与保全
- 仍46专家=22发布+24草稿；47历史版本；115技能/115启用/115包；44专家技能关联；14既有授权。未新增、启用、发布或改任何正文/许可/revision/权限/旧会话。
- 唯一DB变更：新增`official_skill.custom_avatar_path`可空TEXT；本机已`prisma migrate deploy`与`prisma generate`。115新字段均null。原有1个专家上传头像保留。
- t128原记录hash差异0；额外复核原22专家含旧头像的全行旧证据，差异0；115包797源文件hash差异0。
- 26条有源证据、expected-original守卫的展示用途投影=19专家+7技能。真实DB原摘要不写；19条发布版本/7技能当前均满足守卫。用户之后修改摘要则自动不覆盖。审计见`assets/managed/gallery-v2/{SOURCE-MAP.md,DISCOVERY-INVENTORY.json,PRESERVATION-RESULT.json,PACKAGE-PRESERVATION.json}`。

## 调用路径（代码已接通，未作鉴权API/新会话实测）
`共享GalleryPage.CatalogPanel` → `client/index.ts` → Host新Remote `pageExperts/pageSkills/expertFacets/skillFacets` → `GroundOfficialAgentClient` → `/api/official-agents|official-skills/catalog-page|catalog-facets` → Prisma。
- 每页20，DB最多取21判断hasMore；key唯一升序游标绑定目录种类+q+能力+行业；返回items/total/hasMore/nextCursor，count与当页items同一RepeatableRead只读事务。
- 先按账号有效、已发布/启用及既有全员可见范围过滤，再服务端名称/用途/key关键词、能力和行业筛选，最后游标。专家只查onlineVersion的名称/用途，不拿草稿正文做公开检索。
- Facets只查全目录可见key元数据独立计数，不返回全量卡或正文；页面只初次请求当前Tab20条，不隐藏预取另外Tab，不调用旧全量list再slice。服务器21→20是有界页大小处理。
- 两Tab各自保留查询/筛选/已加载页/滚动位置；300ms搜索防抖、request generation防串页、同ID去重、同步inflight锁、近底IntersectionObserver使用本Tab真实滚动root且离开清理；追加失败保留卡片+重试，可手动加载，全部结束提示，空态清除筛选。
- 新专家会话改读`GET /api/official-agents/:id/catalog-card`后走原resolve/冻结；不从已加载页或全量list找id。技能仍原beginSession按需正文加载；旧会话不改。
- 旧list/listSkills/listSkillFacets及旧REST默认4分类/industry/facets端点保持原payload形状；新增分页协议/optional discovery与avatar不会注入旧严格响应。Remote host/client codec及声明均已单包生成。
- `SkillPanel.tsx`旧组件保留但已不在活动渲染/数据路径，新的共同CatalogPanel负责两Tab；不存在暗中通过旧组件全量加载。

## UI与图标
- 共用主题tokens/fonts；卡14px、控件8px；专家紧凑单句用途/最多2标签/28px视觉启动入口，技能padding20、用途2–3行，同排拉齐；布局最多3/2/1列，窄窗不挤压。
- 整张主卡是一个原生button，直接新会话；技能展开details为button外的独立兄弟节点，不触发启动。全局同步启动锁、disabled/busy、focus-visible保留；未增加安装、评分、热度、购买。
- 本地SVG按功能/岗位，key稳定柔和底色；上传图与既有头像URL优先，失败只回功能图标，不循环重试、不字母兜底。显式移除不再复活旧打包默认头像。

## Admin图标（默认分页10不变）
- 专家与技能新建/编辑（包括技能ZIP创建）复用CatalogIconEditor：选择、预览、替换、移除、恢复原图；暂存直到保存，取消不调用图片API。
- 客户端与后端独立校验PNG/JPG/WebP、<=2MB、扩展/MIME/魔数；结构/栅格尺寸保护；禁SVG/任意URL输入/路径穿越。UUID托管磁盘路径，DB只有path，不blob。
- 复用专家`POST/DELETE /api/admin/official-agents/:id/avatar`，新增技能`POST/DELETE /api/admin/official-skills/:id/icon`；均沿原adminScope。公开图片仍统一`/api/official-agents/avatars/:fileName`，固定图片MIME+nosniff，无需admin令牌，无绝对磁盘路径外泄。
- 图片是独立branding元数据，保存不发布/启用专家。仅换图跳过专家草稿/技能正文update，技能revision不变，不要求重传ZIP。内容保存成功、图片失败时保留编辑器，重试不重复创建或重导ZIP。
- 移除只清指针（专家空串标记抑制历史默认图，技能null），不自动删除旧文件；专家替换上传沿用原有best-effort旧文件清理，未另造系统。

## 分类数量
岗位主类对46条全部映射，但公开仅统计22发布；空类别不显示，所以现在广场只有下表非0公开类，而不是把24草稿露出来。

| 能力 | 全46 | 公开22 |
|---|---:|---:|
| 产品与项目 `product-project` | 1 | 0 |
| 开发与架构 `development` | 8 | 0 |
| 设计与创意 `design` | 2 | 1 |
| 营销与内容 `marketing` | 9 | 9 |
| 销售与客户 `sales-customer` | 5 | 3 |
| 经营与管理 `business` | 8 | 5 |
| 研究与数据 `research-data` | 9 | 4 |
| 财税与法律 `finance-legal` | 2 | 0 |
| 人力与培训 `people-learning` | 2 | 0 |

- 全专家可选行业：软件IT10、内容传媒9、人力1、电商1、教育1、财税金融1、法律1；公开专家仅内容传媒9有实际非空行业，其余不硬贴。
- 技能原23能力/8行业不回退；行业计数IT47、教育2、传媒11、具身智能1、财税金融7、电商2、人力4、法律4。能力逐项数量及全key映射见上述JSON证据。
- Admin旧category字段/旧筛选保留兼容；独立discovery不覆盖用户配置，也不修改46专家的版本正文。

## 实际源码文件
Ground Backend（均相对`ground/apps/backend/`）：
- `prisma/schema.prisma`
- `prisma/migrations/20261107020000_official_skill_icon/migration.sql`
- `src/official-agent/catalog-discovery.ts`
- `src/official-agent/official-agent.service.ts`
- `src/official-agent/official-agent.controller.ts`
- `src/official-agent/official-agent-assets.ts`
- `src/official-agent/gallery-avatars.ts`
- `src/official-agent/official-agent-avatar.controller.ts`
- `src/official-skill/official-skill.service.ts`
- `src/official-skill/official-skill.controller.ts`
- `src/admin/admin-official-agents.service.ts`
- `src/admin/admin-official-agents.controller.ts`
- `src/admin/admin-official-skills.service.ts`
- `src/admin/admin-official-skills.controller.ts`
- `src/knowledge/storage.ts`
- `scripts/gallery-v2-preservation.mjs`

Ground Admin（均相对`ground/apps/frontend/`）：
- `src/components/CatalogIconEditor.vue`
- `src/utils/catalog-image.ts`
- `src/views/admin/AdminOfficialAgents.vue`
- `src/views/admin/AdminOfficialSkills.vue`
- `src/api/admin.ts`

Framework（均相对`mammoth-agent/`）：
- `packages/preset/official-agent-gallery/src/types.ts`
- `packages/preset/official-agent-gallery/src/ground.ts`
- `packages/preset/official-agent-gallery/src/index.ts`
- `packages/client/ui-official-agent-gallery/src/client/index.ts`
- `packages/client/ui-official-agent-gallery/src/client/GalleryPage.tsx`
- `packages/client/ui-official-agent-gallery/src/client/GalleryPage.module.css`
- `packages/client/ui-official-agent-gallery/src/client/CatalogIcon.tsx`
- `packages/client/ui-official-agent-gallery/src/client/skill-facets.ts`
- `packages/client/ui-official-agent-gallery/src/client/locales.ts`

另有`assets/managed/gallery-v2/`审计证据及本change的design/tasks/spec增量说明。

## 资源同步与待用户点检
- 仅单包WorkspaceTypertGenerator（checkDiagnostics=false）生成官方广场Remote资源；Host包`pnpm exec tsdown`与共享UI包`pnpm exec tsdown`完成，已包含新分页方法/卡片UI；不是mono全构建。
- 既有watcher增量发射Backend dist与Host lib/types；Admin由现有Vite直接加载最新.vue，无需前端全build。`BUNDLE-SYNC-RESULT.json`记录真实产物路径、mtime/hash和静态marker，非端到端验收。
- 用户需重启DevHost以重载Host/Remote协议，然后刷新Web/客户端和Admin。Backend若不由现有watcher运行，也按原方式重启使新Prisma client/路由生效。未重新打包安装客户端。
- 未运行测试、全typecheck/全build、E2E、browser、QA、review、鉴权分页API/实际上传/新会话联调；没有评分或稳定验收承诺。上传与滚动/焦点效果需用户点检。
- 没有clone/cloud/commit/push/publish/生产/reset/clean/revert；未启动其他scope，24草稿仍待明确批准发布。
