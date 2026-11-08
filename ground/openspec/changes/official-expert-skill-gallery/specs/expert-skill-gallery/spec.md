## ADDED Requirements

### Requirement: Ground supplies enabled official content to both clients
系统 SHALL 从 Ground 向 Web 与客户端提供同一套「专家广场」专家 / 技能两 Tab 目录，所有有效登录用户 SHALL 看到已启用官方内容，且 SHALL NOT 因企业 grant、安装或用户私有状态而额外过滤。公开目录 SHALL NOT 包含专家系统提示词、技能正文或私有知识库内容。搜索 SHALL 仅覆盖名称、简介和少量分类，并 SHALL 支持加载、空和失败可重试状态。

#### Scenario: Two users open the same enabled directory
- **GIVEN** 两名来自不同企业的有效登录用户
- **WHEN** 分别打开专家和技能 Tab
- **THEN** 两个客户端看到的启用条目由同一 Ground directory 决定

### Requirement: Each expert or skill selection opens a new session
系统 SHALL 为每次有效专家或技能卡片选择新建会话，保留原会话原文；专家会话顶栏 SHALL 显示专家名称，技能会话顶栏 SHALL 显示技能名称。停用或包不可用时 SHALL 阻止创建且不丢失输入，但 SHALL NOT 改写历史会话。

#### Scenario: Start a skill without replacing an expert session
- **GIVEN** 用户已有专家会话
- **WHEN** 用户点击一张启用技能卡片
- **THEN** 标准模式新会话显示「技能 · 当前技能」，旧专家会话仍在历史中


### Requirement: Skill capability and industry discovery are independent
技能目录 SHALL 为已精选内容提供一个主能力和可选多行业展示投影；能力筛选为主，行业为次级紧凑选择。筛选 SHALL 只展示有条目的选项，搜索/能力/行业 SHALL 组合且切类不清搜索，无结果 SHALL 可清除筛选。投影 SHALL NOT 修改包内容、许可、revision、启用状态或历史会话。

#### Scenario: Combine a capability with an industry
- **GIVEN** 目录中一条技能有一个主能力及可选行业标签
- **WHEN** 用户输入搜索词并选择能力和行业
- **THEN** 只出现同时满足条件的去重卡片；空结果可清除；总数不是多行业计数之和

### Requirement: Skill cards are accessible direct actions with scoped polish
技能 Tab SHALL 复用 Web/桌面共用界面，采用主题 tokens、轻圆角和容器响应式布局；整卡原生按钮 SHALL 直接沿用新会话行为，保留 loading/disabled 并防连点。卡只含图标、名称、两行用途和轻分类，不增加安装、评分、热度或购买。专家 Tab 样式与行为 SHALL NOT 被技能样式覆盖。

#### Scenario: Activate a skill by keyboard
- **GIVEN** 用户焦点在启用技能的整卡按钮上
- **WHEN** 按 Enter 或 Space
- **THEN** 调用现有新建标准会话路径；启动期间阻止重复创建，旧会话不变

### Requirement: Legacy directory consumers retain their wire contract
无 taxonomy 的旧四类 REST/Remote 读取和 `taxonomy=industry` 消费者 SHALL 保持原响应形状。新技能 UI SHALL 显式 opt-in `taxonomy=facets` / `listSkillFacets`，同步相关 Remote 描述符；新展示字段 SHALL NOT 注入会话冻结数据。


### Requirement: t128 additive paged discovery
The active shared gallery SHALL fetch20 visible resources per server page using a catalog-kind/filter-bound unique-key cursor. Search and capability/industry filtering SHALL execute before cursor paging, and independent facet queries SHALL aggregate the whole visible directory using metadata only. Legacy list contracts SHALL remain available unchanged.

#### Scenario: Tab filters and page continuation
- **WHEN** a user switches tab or changes search/capability/industry
- **THEN** each tab retains its own query/items/scroll, changed criteria restart from page1, stale responses cannot append, and continuation has loading/retry/end/manual fallback without full-catalog preload.

### Requirement: t128 compact cards and independent icons
The shared expert and skill cards SHALL use existing theme fonts/tokens,14px card and8px controls, functional role/use icons, accessible full-main-card new-session action and separate skill disclosure. Experts SHALL be compact; skills SHALL allow2–3 purpose lines. Uploaded and legacy images take priority, with bounded functional fallback on failure.

#### Scenario: Draft taxonomy isolation
- **WHEN**46 experts include22 published and24 draft
- **THEN** all46 may have internal discovery mappings, but public cards/facets/counts include only the22 published; empty categories are hidden.


## t146 增量：公开详情与暂不开放执行
- Public detail MUST use explicit allowlist, never Admin detail or raw prompt/tool/source/path metadata; expert MUST read exact currently published version, skill MUST be enabled. Drafts MUST NOT leak. Existing list/industry/facets/page contracts MUST remain compatible.
- Admin detail save MUST compare resource updatedAt and displayRevision transactionally; no package rebuild, enable or expert publish by saving display text. Empty fields MUST hide; new starter MUST NOT auto-send or replace an existing draft. Expert publication snapshots the new metadata only on an explicit publish.
- Shared card body SHALL open optional details; independent CTA SHALL bypass details, but MUST respect current execution admission. Input/header source SHALL describe bound origin only, never imply loaded/success.
- As shipped in this delta, enhanced gallery execution MUST remain unavailable (`gallery-v2-closed-1`), including continuation of existing bound expert/skill sessions, until P0 enforcement and mandatory-load/receipt constraints are verified. Current code closes create/pre-step/tools; it does not certify all Host entry points or implement the proposed v2 standard/load/event engine. Do not infer full permission safety from a UI state or an admission unit check.
