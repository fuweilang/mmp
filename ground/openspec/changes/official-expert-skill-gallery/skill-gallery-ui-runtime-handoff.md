# t116 技能广场：能力 / 行业分维与 UI 本地交接

## 范围与状态
- 只改 Web / 客户端共用技能 Tab；专家 Tab 保持原逻辑/样式。AdminOfficialSkills.vue 由并行任务负责，本任务未触碰。
- 沿用猛犸 tokens / 字体：卡片 10px、控件 6px、淡边框、无重阴影；最大内容 1200px、24/16px 页边、16px gap、自适应 3/2/1 列。
- 整卡是原生 button，沿用既有新会话路径；保留 disabled/loading，增加同步防连点锁。没有安装、评分、热度、购买或额外使用按钮。
- 能力为主要筛选（收起最多两行，可展开）；行业为紧凑 select。搜索与两维 AND 组合，切类保留搜索；清除、空态、失败重试、同几何骨架及键盘 focus 均在共用面板。
- 本轮没有新增技能、更新 DB、迁移、修改正文/许可/revision/启用状态/agent 绑定/旧会话 snapshot。

## 115 条逐项元数据
Ground 源码 sidecar `apps/backend/src/official-skill/skill-discovery.ts` 是单一 key → 主能力 + 可选多行业来源；不覆盖数据库用户字段或包 manifest。UI 仅维护中文/英文标签和图标。
静态证据：包目录 115、唯一映射 key 115、inventory 115；797 个包文件 SHA256 与本轮前记录一致，差异 0。此为内容保全记录，不是运行测试；本轮未重新查 DB，既有导入结果见 assets/v1/IMPORT-RESULT.json。
详细逐项依据及文件哈希：`skill-discovery-inventory.json`；可读清单：`skill-discovery-inventory.md`。

### 主能力（每条唯一，合计 115）
- 代码开发 `code-development`：10
- 调试排障 `debugging`：4
- 代码审查 `code-review`：6
- 界面设计 `interface-design`：5
- 视觉创作 `visual-design`：4
- 视频创作 `video-production`：5
- 安全分析 `security`：2
- 测试验证 `testing`：2
- 部署运维 `devops`：3
- 文档处理 `file-processing`：5
- 数据分析 `data-analysis`：8
- 内容写作 `writing`：9
- 翻译本地化 `translation`：1
- 检索研究 `research`：9
- 规划协作 `planning`：7
- 运营增长 `marketing`：9
- 客户服务 `customer-service`：3
- 经营管理 `business-operations`：6
- 人事管理 `people-operations`：4
- 财税分析 `accounting`：7
- 法律合规 `legal-compliance`：4
- 知识整理 `knowledge`：1
- 知识学习 `learning`：1

### 行业（可多选，不与总数相加）
- 软件与 IT `it`：47
- 财税金融 `finance-tax`：7
- 法律服务 `legal-services`：4
- 电商零售 `ecommerce`：2
- 人力资源 `hr`：4
- 内容传媒 `media`：11
- 教育学习 `education`：2
- 具身智能 `robotics`：1
- 无行业：39 条。没有为覆盖率硬套行业；0 项类不会显示。未知后续 key 显示通用能力、无行业，不冒充已人工分类。

## API / 旧客户端兼容
- `GET /api/official-skills`：保持旧四分类 payload，不新增 discovery。
- `GET /api/official-skills?taxonomy=industry`：保持上一轮扩展 category payload，不新增 discovery。
- **新** `GET /api/official-skills?taxonomy=facets`：扩展 category + 可选 `discovery: { capability: string, industries: string[] }`。
- Host 旧 Remote `listSkills()` 仍走 legacy 端点；新 Remote `listSkillFacets()` 才走 facets。这样不让已发行旧客户端的严格 codec 被新增字段/扩展分类破坏。
- 共用 UI `src/client/index.ts` 调新 Remote；Host Ground client 保留既有 API origin / 鉴权 / request 路径机制。未改 public-api-base；dev-gateway 原有 `/api/*` 路由透传查询参数，未引入前端直连或第二个竞争分类请求。
- 会话创建、指令加载、旧 summaries / frozen payload 不投影新 discovery。
- Admin 如需显示新维度，可读取 facets 的 discovery；它是本轮只读衍生展示元数据，不是现有 category 字段的新取值，也不是本轮新增的 Admin 写入字段。

## 实际代码与资源
源码：
- Backend：`apps/backend/src/official-skill/{skill-discovery.ts,official-skill.service.ts,dto/official-skill.dto.ts}`。
- Host：`mammoth-agent/packages/preset/official-agent-gallery/src/{index.ts,ground.ts,types.ts}`。
- 共用 UI：`mammoth-agent/packages/client/ui-official-agent-gallery/src/client/{index.ts,GalleryPage.tsx,GalleryPage.module.css,SkillPanel.tsx,SkillPanel.module.css,skill-facets.ts,locales.ts}`。
- 当前 change 的 `design.md`、`specs/expert-skill-gallery/spec.md`、上述 inventory 与本交接。

已同步本机资源，不只是改 src：
1. 对 `@mammoth-ai/mmp-official-agent-gallery` 单包运行仓库既有 WorkspaceTypertGenerator，`checkDiagnostics:false`，只写该包 Host / Remote artifacts；生成成功。没有跑全仓生成或类型检查。
2. 既有 dev:web watcher 已发射 Host `lib/types`、共用 UI `lib/client.js` / map 以及 Backend `dist`。产物中已包含 `listSkillFacets` / `discovery` / 新筛选界面文本。
3. Host 包内只运行 `pnpm exec tsdown`，使用现有 lib/types，完成 `lib/index.js` 44.37 kB，同步新方法及 codec。未运行带强制 prebundle 的整包 build / monorepo build。
4. 实际 Host 资源包括 `lib/typert.host.{js,d.ts}`、`lib/typert.remote-client.{js,d.ts,d.ts.map}`、`lib/types/*` 与 `lib/index.js`；UI 主资源为 `lib/client.js` / map。生成产物可能受现有 ignore 规则管理，本轮没有改 ignore 或提交它们。

## 如何本地点检 / 边界
- 资源已就绪；**运行中的 Host 若缓存旧 ESM，需用户重启 DevHost，再刷新 Web / 客户端广场技能 Tab**，以同时加载新 `listSkillFacets` 方法与 UI。仅刷新浏览器不能保证旧 Host 进程出现新 Remote 方法。Backend 若不是现有 watcher 托管，同样需按原开发方式重启该服务。
- 未启动浏览器、未发鉴权 API / 会话请求、未跑测试、E2E、QA、review 或全构建；因此没有声称视觉/功能已验收、稳定或旧客户端实机已回归。
- 7 个既有包原用途字段仅为 `>` 等空占位：academy-guide、novel-game、bailian-model-recommend、discernment-nudge、bailian-docs-llm-wiki、vox-video-director、daily-hot-news。保持原字段不变，界面中性显示“用途说明待补充”，不编造用途；其他名称/用途沿用原数据。
- 本任务未运行 git 写操作，没有 commit / push / publish / reset / clean，没有覆盖并行 Admin 文件。
