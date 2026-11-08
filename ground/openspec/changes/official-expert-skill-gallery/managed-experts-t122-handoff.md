# t122 unified experts — local implementation handoff

## 实际状态
- 原DB实际为22位已发布专家（不是估计20），47个历史版本。
- 本轮新增24位专家，全部DRAFT、onlineVersionId为空、没有新增发布版本。
- 当前DB总专家46 = 原已发布22 + 新草稿24；版本仍47。
- 技能仍115且115启用，包仍115；新技能0，复用38个已有技能形成44条仅属于新草稿的关联。
- 原22专家/47版本/115技能及包/既有授权/官方知识文档逐行保全hash差异0；115包797个源文件hash差异0。
- 第一次导入24；第二次幂等导入创建0/跳过24。第一批曾有一条不恰当Academy guide绑定，已仅对本批新草稿去除，保留单独更正记录。不要把首次45关联收据误作最终44关联。

## 统一结构与兼容
- 迁移 `apps/backend/prisma/migrations/20261107010000_managed_expert_definition/migration.sql` 已仅在本机deploy；Prisma generate完成。
- 只在 OfficialAgent / OfficialAgentVersion 增加默认{}的expertDefinition JSONB。未rename表/类/旧URL，无旧记录内容回填。
- `expert-definition.ts`统一规范化profile、workflow、deliverables、source/license/dependencies/adaptation/extensions，未知外部manifest字段存extensions.upstreamManifest，来源frontmatter仅作provenance。
- Admin表单与仓内资产/CLI使用统一内部结构与normalizer。任何已存在同key导入跳过，不覆盖管理员草稿或知识库。
- 新发布版本在Serializable事务中冻结定义和关联技能修订；新版本目录/resolve读冻结摘要并核验当前技能启用状态，不将后续草稿关联漂移到已发布版本。旧版本{}保持旧兼容路径；Host旧会话事件/快照不重写。
- 执行prompt只组合冻结的角色/使命/工作流程/交付标准，不执行source/extensions/tool/model元数据。关联技能仍经原生skill按需加载。
- 公开卡片不增加expertDefinition/源文件/完整提示词字段，既有严格Remote codec继续兼容；新增元数据仅Admin可见。

## Admin / 双端UI
- 专家配置保留原表单和仓内资产导入；原实现未发现专家ZIP上传入口，没有伪称保留不存在的专家ZIP，技能ZIP未改。
- 表单名称/用途/角色定位必填，key可自动生成；保留角色指令、工具与既有知识权限，增加工作流程/交付标准。保留来源/许可/外部扩展字段，不以编辑覆盖未知元数据。
- 修复原Admin返回缺少linkedSkillIds/linkedSkills的问题；创建/编辑草稿与关联技能同事务。可多选已有启用技能，保留既有已停用关联但不允许新增停用技能；预览显示摘要/修订/状态。
- 专家卡用details轻入口显示关联技能数量/名称/短摘要，不展示正文；既有专家启动按钮/技能整卡启动行为不变。
- Admin标题/菜单/路由标题/校验/toast/知识库关联/审计/权限/中英文Host业务错误与相关双端locale统一专家/Expert；技能仍叫技能。
- 保持底层Agent/subagent技术标识、API/DB名、客户端安装包/签名身份/旧安装路径，以及所有来源原文和许可证，不全仓替换。
- 专家页15px白容器、默认20条分页保留；弹窗居中、限高、body滚动，参照相邻技能页。AdminOfficialSkills.vue未修改。

## 选材与许可
- Agency Agents：11位，MIT，ref b859c515d813efcfc4755d3471dd9e7686c7706d。
- VoltAgent subagents：9位，MIT，ref ed74d115b7fb7026a22a4f816a8e3250f425e3b4。
- Anthropic knowledge-work-plugins：4位岗位plugin-to-expert组合改编，Apache-2.0，ref ab4cb1cd383b4eb87383be8cf4e70cb5b2a2348d；分别采用finance/legal/sales/data的局部LICENSE。
- 新鲜公共HTTP读取40份固定ref文本并留sha256；24位均有本地LICENSE、NOTICE、ORIGIN及实质中文指令/流程/交付标准。stars只作选材证据，不是本地实测/评分。
- 未采用WorkBuddy受限内容；未执行/安装第三方scripts/hooks/MCP配置、引入运行框架或新依赖。
- 所有模型只走原云端超管模型池；来源sonnet等固定值仅留原始metadata，不进入宿主模型选择。

## 重要能力边界（不要包装成“全自动工程执行”）
当前官方专家Host故意禁用继承的文件/终端工具，本轮没有扩权。9位开发设计专家明确是方案、代码/补丁稿和诊断咨询；不会声称修改本地仓库、跑命令、部署或训练。科研文献角色无BGPT MCP，仅公共检索/可读或用户提供论文，无法读全文时注明摘要证据。CRM/HRIS/ERP/邮箱/Figma等未连接SaaS只产出建议或草稿。原文里夸张已完成数字、硬p<0.05规则及特定Laravel示例均记录适配，没有当作本次成果。

## 新增名单

### 业务（10）
- 商业战略决策专家 `agency-business-strategy`
- 客户成功运营专家 `agency-customer-success`
- 员工入职规划专家 `agency-hr-onboarding`
- 流程运营改善专家 `agency-operations-manager`
- 项目范围与交付专家 `agency-project-planner`
- 供应链采购策略专家 `agency-supply-chain`
- 企业培训设计专家 `agency-training-designer`
- 大客户商机策略专家 `kw-account-strategy`
- 财务关账统筹专家 `kw-financial-controller`
- 合同与法律风险专家 `kw-legal-review-lead`

### 开发设计（9）
- 后端架构方案专家 `agency-backend-architect`
- 前端实现方案专家 `agency-frontend-advisor`
- 界面设计系统专家 `agency-ui-system`
- API契约设计专家 `volt-api-designer`
- 代码质量审查专家 `volt-code-reviewer`
- 数据库性能诊断专家 `volt-database-optimizer`
- 故障根因诊断专家 `volt-debugger`
- 交付与运维方案专家 `volt-devops-advisor`
- 安全审计顾问 `volt-security-auditor`

### 研究数据（5）
- 用户体验研究专家 `agency-ux-research`
- 数据分析质量复核专家 `kw-data-quality-lead`
- 科研文献证据专家 `volt-literature-evidence`
- 市场规模研究专家 `volt-market-sizing`
- 统计实验与建模顾问 `volt-statistical-modeling`

## 具体改动路径
Ground Backend：
- prisma/schema.prisma 与上述增量migration。
- src/official-agent/{expert-definition.ts,official-agent-assets.ts,official-agent.service.ts,official-kb.service.ts,orchestrate.service.ts}。
- src/admin/{admin-official-agents.service.ts,dto/official-agent.dto.ts,admin-support.service.ts}。
- src/official-skill/official-skill.service.ts（只增加可选事务与关联保留能力，无包内容/状态变更）。
- src/{llm/llm-chat.controller.ts,knowledge/storage.ts}（仅专家业务文案）。
- scripts/{import-official-agent-assets.mjs,expert-catalog-integrity.mjs}。
- src/official-agent/assets/managed/v1/ 下所有新manifest/instructions/upstream/provenance/来源与导入保全收据。
Ground 前端/共享：
- apps/frontend/src/views/admin/AdminOfficialAgents.vue、api/admin.ts、router/index.ts、layouts/AppShell.vue。
- views/{Knowledge.vue,Login.vue}、views/admin/{AdminAudit.vue,AdminEnterprises.vue,AdminOfficialKnowledge.vue}、components/admin/pricing/useAdminPricingConfig.ts、apps/frontend/index.html、packages/shared/src/index.ts（限定业务文案）。
Mammoth共享Host/UI：
- packages/preset/official-agent-gallery/src/{index.ts,ground.ts}（可见错误与工具文案）。
- packages/client/ui-official-agent-gallery/src/client/{GalleryPage.tsx,GalleryPage.module.css,locales.ts}。
- packages/client/{ui-client-download,ui-permission-presets,ui-conversation}/src/client/locales.ts（限定产品文案）。
OpenSpec：当前change的design.md、tasks.md、specs/official-expert-configuration/spec.md和本交接。

## 本地资源与用户点检
- 本机Backend既有watcher已增量发射dist及managed资产；CLI使用该同一dist loader成功导入。
- 既有dev:web watcher已更新广场、下载入口、权限提示、对话提示的lib/client.js；Host lib/types已更新。
- 仅运行Host包pnpm exec tsdown（44.39kB，14ms）同步lib/index.js，以及Ground shared单包tsc发射dist文案。没有启动monorepo/前端全build或独立QA/typecheck。
- Admin Vite直接加载当前.vue源码，不要求全前端构建。
- 用户重启DevHost后刷新Web/客户端和Admin；Backend非watcher托管时按原方式重启。未重新打包安装客户端；旧安装/签名标识保持兼容。
- 点检Admin“专家配置”状态筛选“草稿”可看到24位并查看角色、流程、关联技能、来源和适配说明。公开专家Tab仍只显示原22位，这是未批准发布的新草稿保护，不是漏导入。
- 本轮没有测试/E2E/browser/QA/review、鉴权API/新会话运行验证或全构建，不宣称稳定或已验收。没有commit/push/publish/生产动作/reset/clean/revert/clone/CloudAgent。
- 完成后等待用户审核及逐项发布批准，不自动启用这24位，不启动后续任务。

## 证据入口
`apps/backend/src/official-agent/assets/managed/v1/{SOURCE-MAP.md,SOURCE-MAP.json,FETCHED-FILES.json,CURRENT-CATALOG.json,IMPORT-RESULT.json,IMPORT-RERUN-RESULT.json,LINK-ADAPTATION-RESULT.json,PRESERVATION-BASELINE.json,PRESERVATION-RESULT.json,ASSET-PRESERVATION-RESULT.json}`。
