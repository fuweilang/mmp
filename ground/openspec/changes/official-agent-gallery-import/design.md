# 设计：官方智能体广场货架导入

## 映射原则

| MMP 字段 | latest 来源 |
|----------|-------------|
| key | agent key（保留 `c3274112ed041`） |
| name | name |
| summary | roleDesc |
| systemPrompt | prompt.md / 模板一行 |
| openingQuestions | 产品补写（latest 出厂无） |
| toolScope | skills 转换；无对等工具则 `[]` |
| kind | 有专属 KB → KNOWLEDGE，否则 GENERAL |

详见 `apps/backend/src/official-agent/assets/index.json`。

## 导入与发布

1. 资产落在 `src/official-agent/assets/`（agents/*.json + prompts/*.md），可进 git。
2. 导入按 key 幂等 upsert **草稿**：
   - 不存在 → 创建 DRAFT
   - 仅 DRAFT（无 onlineVersion）→ 可用资产更新草稿
   - 已有 PUBLISHED/OFFLINE → **不覆盖**线上草稿字段；跳过并打日志（缺字段才补空）
3. 发布仍走现有 `POST /admin/official-agents/:id/publish` → 冻结 `official_agent_version`。
4. 开通仍走 `PUT /admin/official-agents/:id/grants`，固定 `version_id`。

## 批次

- **A（本迭代）**：mammoth、c3274112ed041
- **B**：模板类补 prompt 后迁
- **C**：带 KB 六个，跟知识库产品
- **D（任务10）**：data / spy / boss（真工具后上架）

## 广场

`publicCard` 已含 name/summary/openingQuestions。客户端卡片与详情直接展示；无 avatar 字段时用占位或名称首字，不阻塞开聊。

### Admin 列表头像与只读详情（2026-11-06）

- Admin `GET /admin/official-agents` / `GET /admin/official-agents/:id` 的 `present` 增加只读 `avatarUrl`：复用 `gallery-avatars` 解析与公开 `/api/official-agents/avatars/<file>`；无文件则为 `null`（UI 首字回退）。不放开 Admin 列表鉴权。
- Admin 页表格在名称旁展示 36px 头像；操作列「查看」打开只读弹窗，默认看草稿，可切换已发布版本（展示版本号/发布时间/是否线上）。与编辑、发布隔离，查询不修改。
- 不把公开广场接口当作 Admin 草稿详情；systemPrompt 仅 Admin 详情可见。


## 工具（任务 7）

- toolScope 名称：`enterprise_knowledge`（资料型）、`web_search`（联网；对应 latest `skills.search`）。
- 执行路径：Host 按冻结 version.toolScope 注册工具 → 每次执行前 Ground resolve → 工具调用走 Ground API（检索 `/retrieve`，联网 `/search`）。
- 联网实现：Ground `OfficialWebSearchService` 使用平台已启用的 DeepSeek 厂商 Key 调用 Tools Search API；不引入新付费源、不把 key 下发桌面。
- 发布策略：需要联网的官方智能体发新 version；企业 grant 不自动漂移，试点需显式升级。


## 运营批量（任务 8）

- 导入：沿用 `POST /admin/official-agents/import-assets`；Admin 用 `GET asset-catalog` 勾选 keys；结果含 created/updated/filled/skipped/errors。
- 下架：新增 `POST /admin/official-agents/bulk-offline`；OFFLINE 后广场不可见且 resolve 拒绝。
- 授权：新增 `POST :id/grants/bulk` 与 `bulk-revoke`；version_id 规则与单条一致（默认线上版本，可显式指定）。
- 审计：写操作逐条 + 批量汇总；`/admin/audit` 可按 action / actionPrefix 查；绝不落 systemPrompt / 搜索词 / 文档正文。

## 全员可见公共目录（历史拍板 2026-11-06 上午 · 已部分废弃）

> **状态：历史**。当时只拍板「全员可见」。其中「执行仍按权益 / grant」一条已被下方「任务9全员可聊」**正式废弃**，勿再当现行产品口径。浏览侧与公开字段约定仍有效。

- **第一阶段（仍有效）**：所有已登录用户（平台超管/平台管理员、企业管理员/成员、平台工作区 tenantId=null）均可浏览全部 `PUBLISHED`（非 OFFLINE）官方智能体卡片；**不按 tenant grant 过滤**。
- ~~**执行仍按权益**：`resolve` / `retrieve` / `search` / Host `create` 继续要求当前企业 ACTIVE grant；浏览 ≠ 可开聊。~~ **（已废弃 → 见下节）**
- 卡片增加 `executionGranted`；公开 JSON 不含 `systemPrompt` / `toolScope` / `kbFolderIds`。（字段保留；任务9后已发布卡恒为 true）
- 前端未开通展示「暂未开通」分支仍保留，供第二阶段定价复用。
- **第二阶段**才做价格/会员/套餐绑定；grant 表语义保留、不做计费。


## 任务9全员可聊 + 官方知识库（2026-11-06 · 现行）

- **可见+可聊（现行）**：全体有效登录用户（平台超管/管理员、企业管理员/成员）可浏览并 resolve/开聊所有 `PUBLISHED` 官方智能体；不要求企业 ACTIVE grant；平台工作区 `tenantId=null` 亦可。覆盖并废止上节「执行仍按权益」。
- **grant 保留**：`official_agent_tenant_grant` 与 Admin 开通/撤销仍可用，作为第二阶段套餐/定价数据结构，当前不拦截开聊。
- **仍拦截**：账号停用、智能体 OFFLINE/非 PUBLISHED、版本不属于该 agent、未声明的 `web_search`。
- **官方 KB**：落在 `official_kb_*` + `uploads/official/<agentId>/`，按 `agentId` 隔离；不进企业 `kb_*`；Console `kbFolderIds` 不适用于有官方文档的智能体。
- **企业私库**：无官方文档的 KNOWLEDGE 智能体仍走 grant.`kbFolderIds` + 企业成员可见性；全员可聊不会放开跨企业私库。
- **Host 检索响应**：官方检索 `tenantId` 固定哨兵值 `"official"`（满足既有 Zod，非真实租户）。


## 任务10 高级能力（2026-11-06）

- **数据分析师 `data`**：`toolScope=["tabular_analyze"]`。仅内联 CSV/JSON；服务端计算列类型/汇总/分组/IQR；不读企业库、不执行公式。
- **竞品情报官 `spy`**：`toolScope=["web_search","web_fetch"]`。搜索复用 DeepSeek Tools Search；网页读取防 SSRF；答案需带来源 URL / accessedAt，禁止编造售价库存。
- **猛犸大总管 `boss`**：`toolScope=["delegate_official_agent"]`。单层路由 allowlist=`mammoth|copy|data|spy|growth|xhs`；子智能体工具在 Ground 执行后云端汇总；禁止委派 boss / 多层递归。
- Host 仅按冻结 toolScope 暴露工具；密钥与抓取均在 Ground。
- 第一阶段仍全员可看可聊；套餐定价第二阶段。


### 表格分组推断（复核）

- `tabular_analyze` 可选 `goal`：未显式 `groupBy` 时按任务文案匹配列名/别名/`按X|各X`；无命中不强行分组。
- 对已发布 v1 亦兼容（仅新增可选字段与服务端推断）；提示词加强后发 **data/boss v2**。

## 广场分类展示（2026-11-06）

- 分类与内容能力标签属于**父级可编辑展示字段**，不写入 `OfficialAgentVersion`；改分类不发布新 prompt。
- 工具能力标签只从冻结 `toolScope` 派生，禁止 UI 硬编码 key→分类名单。
- 能力文案存中文；分类 key 在客户端做 i18n。
