# Design：专家广场＋技能

## 1. Content Authority

Ground 是专家、技能、启用状态、分类和包内容的唯一权威。Web 与客户端使用同一组公开读取 response，不各自维护卡片副本或提示词。`enabledAt` 为空表示停用；启用不是企业私有权或安装状态。

| Record | Admin 可编辑 | 公开目录返回 | 新会话提交/保存 |
|---|---|---|---|
| Expert | id、稳定 key、名称、简介、分类、启用状态、既有执行配置、关联 skill id、officialDocumentIds、knowledgeReferenceIds | id/key、名称、简介、分类、开关；不含 prompt、完整包、受保护知识内容 | expert id、发布 revision、关联且启用的 skill 摘要 |
| Skill | id、稳定 key、名称、简介、分类、启用状态、manifest、指令、引用资源 | id/key、名称、简介、分类、开关；可选含短引用提示，不含正文或包内路径 | 显式 source skill id、包 revision；关联技能仅开放摘要目录 |
| Association | expert→skills；expert→officialDocumentIds / knowledgeReferenceIds | 仅 `hasKnowledge`，不返回私人文档或公开 ID 列表 | 创建时保存当前绑定，后续冻结并遵从现行知识读取权限；技能内容加载检查有效 revision |

`category` 保留 Admin / 旧客户端单选契约，不改已导入技能字段。当前批准的技能展示改用下述 §7「单主能力 + 可选多行业」投影；不是通过改包或会话 revision 重分类。旧四类、`taxonomy=industry` 原响应继续兼容。保留分类 id 与原文本用于重命名而非建立复杂 taxonomy。名称限 40 个可见字符，简介限 140 个可见字符，key 限定小写字母、数字、短横线且全局唯一；不做 key 的自动改写或覆盖。

单一分类栏与少量搜索仅匹配名称、简介和分类，不匹配包正文、manifest 或系统提示词。筛选以 Ground 的 `q`、`category`、`type` 为入参，空结果返回空数组与明确无内容状态。

## 2. Managed Skill Package

ZIP 为超管主入口，表单为超管第二条入口，两者落到同一规范包存储。同 key 的内容编辑必须走既有 Admin「编辑」入口并显式替换包内容；ZIP 同 key 默认冲突拒绝，不隐式覆盖。替换在单请求内原子失败。第一版保留当前内容快照与历史 revision 供固定会话使用，不做发布审批、回滚编排或版本市场。管理列表展示已上传/更新/停用状态与按时间排序的最近内容修改，并防误点删除：停用为先，删除需二次确认且被专家或历史会话引用时仅可停用。

```text
<safe-key>/
  skill.json    # 必需，UTF-8 JSON manifest
  SKILL.md      # 必需，UTF-8 纯文本指令
  resources/    # 可选，仅普通文件与相对路径
```

`skill.json` 是 Ground Hub 的最小 manifest，不是运行沙箱声明，也不注册工具。必填 `key`、`name`、`description`、`entry`（固定 `SKILL.md`），可选 `category`、`references`。`references` 形如 `{ "path": "references/example.txt" }`；ZIP 实现统一将上层 `resources/` 映射为 manifest 的 `references/`，可仅使用 `resources/` 而不在 Admin 展示细节。表单必填 key、名称、简介、分类、指令正文；manifest 与包封装在服务端完成，不要求管理员上传无扩展名的文件或手写内部路径。

第一版约束：ZIP 解压总量不超过 10 MiB，最多 50 个常规文件，`SKILL.md` 不超过 100 KiB，单引用文件不超过 1 MiB；文件类型第一版仅接受 manifest 声明的 `.md`、`.txt`、`.json`、`.csv`、`.png`、`.jpg`、`.jpeg`、`.webp` 普通资源；其他扩展名拒绝。不借由 ZIP 声明可执行能力。拒绝加密包、绝对路径、`..`、软链接、特殊文件、重复目标文件、额外的顶层目录及 entry 缺失；可有一个与 key 同名的顶层目录，或多文件扁平包根。不将出错的包转为启用状态。出错返回稳定错误 code 与可显示信息，不回到默认空包。导入、表单保存与启用都重新验证同一规范。

通过现有角色管理补必要管理点：平台超级管理员与获授权平台管理员可读写专家、技能和启用状态；无权限返回拒绝。Admin 公开列表 SHALL NOT 返回 system prompt、完整技能正文或包资源；编辑详情仅在管理授权下返回。

## 3. Public Read and New Session API

沿用现有 `/api/official-agents` 读路径与 `/api/official-agents/:id/resolve` 启动路径扩展，不宣告已经改代码：

| Purpose | Method / logical URL | Key fields | Failure |
|---|---|---|---|
| 专家目录 | `GET /api/official-agents?view=experts&q=&category=` | `id` / `key` / `name` / `summary` / `category` / `enabledAt` / `linkedSkills[]` 最小摘要；无 prompt 或包 | 401 回登录；服务端错误通用文案并允许重试 |
| 技能目录 | `GET /api/official-skills?q=&category=` | 以上展示字段 + `packageRevision`，不含指令正文 | 同上；停用不返回 |
| 专家创建 | `POST /api/official-agents/:id/resolve` | 当前 authenticated session 身份、`target=new`、`expectedVersion`；返回 `sessionSource`、`expertVersion`、有效 skill manifest 摘要 | 停用或读取失效不可创建；原会话不受影响 |
| 技能创建 | `POST /api/official-skills/:id/sessions` | 当前身份、`expectedRevision` 做有效性校验；返回 `sessionSource`、通用会话能力配置与最小技能描述，不含整个包 | 停用、不存在、包不可用返回明确错误 |
| 技能需要时读取 | `GET /api/official-skills/:id/content?revision=` | 指定 skill 指令正文和按需资源导引；包 revision 必须匹配 | 停用或 revision 不可用返回明确错误；不静默替换 |
| 引用资源读取 | `GET /api/official-skills/:id/resources/*?revision=` | 已验证的相对路径、正确类型、允许范围大小 | 未声明、越界、包失效均拒绝 |

读取响应应使用 ETag/revision。错误结构保留现有认证错误与业务错误包装；确定的错误码为 `OFFICIAL_CONTENT_DISABLED`、`SKILL_PACKAGE_INVALID`、`SKILL_REVISION_UNAVAILABLE`、`SKILL_RESOURCE_NOT_FOUND`。同一授权错误不能回退为公开未授权数据或自动改用其他技能。启停、编辑与关联变更不修改已存在会话的冻结绑定；如果处在开关/编辑与新建之间的竞态，以 resolve 成功返回的 revision 为准，失败由 UI 保存当前输入并刷新目录。

Knowledge association uses existing id/reference only: 官方知识引用由平台管理与专家上下文服务端读取，企业引用继续受 Console 的企业和成员读取范围限制。启用官方内容的全员可见不能穿透企业知识读取权限；两者不互查、不回退、不迁移。

## 4. Host Skills and Sessions

复用 `mammoth-agent` 的标准模式和 session-bound provider，而非改 Agent loop。技能是受 Ground 管理的整包，Host 负责包 manifest、正文和资源引用；`tool-skill` 继续承担按需加载。普通与专家会话保留现有标准能力及已允许的文件/终端/联网；通用专家禁用工具的既有条件不被本次技能引入悄悄放开。

专家会话：Ground 在启动时返回当前 expert revision 与仅关联且启用的 skill 摘要，Host 注册该固定的 summary set。模型可运行 `tool-skill` 的 `skill` 工具选择具体名称时，才请求对应该 revision 的正文；不将关联每个 SKILL.md 放入初始会话，不让模型自动加载不在会话开放集合中的关联包。无关联技能返回空目录，不注入全量包目录。

技能会话：点击广场技能卡片即创建通用标准会话，固定 `source.type=skill`、`source.id` 与 package revision，并只开放此技能的名/描述。`/name` 或模型 `skill` 工具命中时才加载该 skill 正文，其他工具保持。首条普通 prompt 不自动等同于 SKILL.md 全文加载。专家与该技能并存时，专家会话只允许专家关联集，不自动含全部 Hub skills。

会话头只显示来源卡标题和小标签：专家「专家 · {name}」，技能「技能 · {name}」；不展示长正文或内部 key。显示「已启用技能」仅指此会话开放集合，不表示模型已加载每条正文。历史会话恢复其冻结字段；现实现 `official-agent/bound` 对旧专家事件继续使用原配置，新技能绑定另加显式事件/元数据，绝不覆盖旧 `agentId` 会话内容。后期 Admin 更新仅影响新创建的会话；既不静默切走正在使用的内容也不需要自动兼容旧 Hub 格式。

加载失败时保留用户输入、来源头与会话状态，显示具体可重试错误，不创建替代空会话；模型没有收到未加载正文时禁止声称已使用技能。初始模型请求只附带短目录摘要不附指令正文；资源只有被读取才增加上下文。编译、缓存实现遵照既有 session。Usage attribution follows existing official expert version path；新增 skill id/revision 仅用于溯源不另建立计费。

## 5. PRD User Flow, UI, and Acceptance

用户从「专家广场」选择 Tab，浏览启用的官方内容。有数据卡片展示名称、简介、分类和明确的新建按钮；空/加载/失败分开显示，失败可重试。可输入名称/简介查询或点少量分类，切换 Tab 保留各自筛选但返回内容以服务端为准。

点击专家 -> 创建固定该专家 revision 与关联技能摘要的新会话 -> 顶栏显示专家来源 -> 使用标准交互、文件与终端；模型需要关联技能时才读取技能。点击技能 -> 创建固定该技能 revision 的通用会话 -> 顶栏显示技能来源 -> 在实际调用 `skill` 或显式 `/name` 时才读取指令。

Admin 在官方智能体页使用既有完整 CRUD，补分类、启停、关联技能与知识引用提示；技能页支持 ZIP、表单、启停、必要内容编辑和删除限制。ZIP 成功后回到新的未启用记录；启用前台后出现在双端。保留完整包不在目录公开。关联不增加安装概念。

`甜甜` 负责共用卡片、Tab、来源头和四种状态的 UI 说明：与现有工作区共用元素、密度和字号，不引入第二个 Admin 主题。具体验收步骤记录于 tasks.md，经协调方决定后执行；本次只写文档不验证。

## 6. Legacy Boundary and Risks

旧系统仅供人工挑选名称/专家结构，无 imports、adapter、SSO/permission mapping、package/parser 兼容。当前 MMP 自身已建立的官方智能体会话保存行为保留，不是承诺兼容老平台。

主要 implementation risks：鉴权与过期目录切换导致未授权访问；ZIP 路径穿越；创建时启停竞态；全部技能误入初始上下文；官方与企业 knowledge 权限串联；已创建会话漂移；公共读 API 泄漏 prompt 或包正文。用给定的 resolve revision、包限制、冻结事件和权限检查处理，不能以客户端筛选项视为鉴权。


## 7. Approved skill discovery facets and light UI polish (t116)

本节取代技能 Tab 的旧四类单栏与方角卡片说明；专家 Tab 的卡片/分类/启动行为不在本次变更范围。

### 7.1 Ground-owned display projection, not package state

- Ground `official-skill/skill-discovery.ts` 对现有 115 个稳定 key 逐项维护 **一个主能力** 和 **零至多个行业**；以真实指令/用途为依据，行业无关可不标。没有重复卡片，不为覆盖行业制造条目。
- 不改 DB、用户字段、manifest、SKILL.md、许可证、包 revision、启用状态或旧会话 snapshot。未知 key 没有强加行业，客户端回落到通用协作。
- 能力示例：代码开发、调试排障、代码审查、界面设计、文档处理、数据分析、内容写作；行业另列软件与 IT、财税金融、法律服务、电商零售、人力资源、内容传媒、教育学习、具身智能。
- `GET /api/official-skills` 保留旧四类响应；`?taxonomy=industry` 保留上一版行业 category 的原字段/形状；仅新 `?taxonomy=facets` 在目录卡片附加可选 `discovery: { capability: string, industries: string[] }`，不附正文/资源/权限。
- Host 保留 `listSkills` → 旧四类 API；新 UI 显式走 `listSkillFacets` → `taxonomy=facets`。同步本包 Typert Host/Remote 描述符，不能只更新 bundle 而遗漏 wire schema。创建会话 API 和冻结事件不增加 discovery 字段。
- 前端只维护分类 ID 的显示翻译/图标，不维护另一份按 key 分配的技能目录；公开目录仍以 Ground 启用状态为准。筛选不是鉴权。

### 7.2 Capability-first combined filters

能力为主行，折叠时最多两行，更多能力可展开；行业为次级紧凑下拉。仅从当前返回的启用条目生成有内容的选项，数字为该目录下实际条目数，行业多标计数不相加当作总数。搜索、能力、行业按 AND 组合，切能力/行业不清搜索；空结果可一键清除搜索和筛选。结果总数为去重后的卡片数。检索不读技能正文，覆盖名称/用途/key/可见分类标签。

### 7.3 Shared Web and desktop skill surface

- 使用现有猛犸主题 tokens 和字体；不引入 PeecAI / Element Plus 主题，不硬编码新蓝色。
- 内容上限约1200px，边距24/窄16，卡 gap16、内距20、圆角10px，按钮/搜索/筛选约6px。无大阴影。
- 卡片只有图标、名称(16/600)、用途(14/22两行)、轻分类。整张原生 button 卡片直接复用既有新会话链路；无重复“使用”按钮，不加安装、评分、热度、购买、详情页。
- 基于实际容器宽度 3/2/1 列，避免侧栏或窄窗压缩；原生按钮支持 Enter/Space，主题 focus-visible/hover，启动 loading/disabled 保留并加同步防连点锁。
- 加载显示同尺寸骨架；失败保留重试；空目录和组合筛选无结果区分。没有修改专家 Tab 的原卡片启动按钮。

### 7.4 Delivery boundary

不新增依赖；不运行测试、浏览器、E2E、全量构建或 review。允许对本包生成 Remote 描述符、使用既有 watcher 更新共用 UI、做 Host 单包 tsdown 以同步运行资源。产物同步不等于界面或稳定性已经验收；现有 Host 缓存旧 ESM 时仍需用户刷新/重启 DevHost。


本轮本地资源交接、精确维度数量与未验边界：参见 [skill-gallery-ui-runtime-handoff.md](./skill-gallery-ui-runtime-handoff.md)。既有缺失用途仅显示中性占位，不在 UI 层编造或回写原字段。


## 8. t122 unified managed expert import (approved implementation)

保留 OfficialAgent / official_agent / official-agents 路由和旧20位结构；专家以角色 profile + systemPrompt + workflow/deliverables + 可选 skills + 现有 tools/KB 组成，不把技能重命名当专家。Agent 和 Version 仅增量增加 expertDefinition JSON（默认空对象），承载 schemaVersion、profile/workflow/deliverables、source/license/upstream version、dependency/adaptation 与 extensions；旧字段/ID/指令/状态/版本不回填覆盖。统一 normalize pipeline 供资产、Admin 和 CLI 使用，保留外部专有元数据。新发布版本冻结定义与 linkedSkillSummaries；旧会话事件不重写，旧版本保留兼容路径。

复用官方专家多对多技能与当前工具/KB范围，不要求每位专家都有技能，不增加权限体系或KB管理页。Admin保留原表单与仓内资产导入（当前源码未发现专家ZIP入口，不虚构已有ZIP）；名称/用途/角色必填，key 可生成安全默认；关联技能可多选、详情可读摘要。公开卡片仅轻摘要/数量，不灌指令。新外部专家采用许可清楚的独立角色定义或明确标注 plugin-to-expert 改编，不执行来源脚本/hooks/MCP，不把外部模型字段映射到 BYOK；全部模型遵守云端超管模型池。

目标新增精选20–30位，约业务10–12/开发设计8–10/研究数据4–6；版本化资产、immutable ref、逐文件license evidence、原始版权、中文流程/交付改编。按同源115技能去重复用，零散流程不硬拆。新导入只能 DRAFT，无自动发布/授权；已存在任意同 key 记录跳过，不覆盖管理员草稿。每批记录原有专家/版本/115技能及其关联的保全哈希。

业务可见名称统一“专家 / Expert”，仅触达专家配置、广场、会话来源及相关权限文案；保留底层类/URL/第三方原文/许可证的 Agent。Admin遵循相邻技能页白容器15px、20条分页、居中限高滚动弹窗。不跑测试/E2E/browser/QA/review/全构建；仅必要migration deploy/generate、幂等导入、数量保全核验和目标资源同步。


§8实施与本机保全/资源同步证据见 [managed-experts-t122-handoff.md](./managed-experts-t122-handoff.md)。当前Host文件/终端限制保留，工程角色明确咨询/代码稿模式，不能误宣传为已连接执行工具。


## 9. t128 approved gallery paging/icons/display workstream
New additive paged endpoints and Remote methods return20 items with stable filter-bound key cursor, total/hasMore/nextCursor; independent facets aggregate only visible metadata. Old list/4-category/industry/facets and strict legacy Remote payloads stay unchanged. Server filters visibility before search/cursor. New sessions fetch individual expert independently of page cache. Shared UI keeps per-tab filters/items/scroll, stale request generations, dedup, intersection cleanup and accessible load-more/retry.

Expert discovery maps all46 roles to one of9 approved job capabilities plus optional industries; public counts only22 published. Skills retain23 capabilities/8 industries. Display descriptions use an audited expected-original guarded sidecar, never mutate package bodies/revisions or published/session snapshots.

Cards use14px/controls8px theme tokens: experts compact with28–30px action height and up to2 specialties, skills20px padding with2–3 purpose lines. Stable local SVG functional icons replace letters; uploaded images first, bounded fallback, no generated avatars/brand impersonation.

Reuse expert upload/storage/public route; add independent skill icon path metadata. Admin stages file/remove until Save, cancel preserves existing icon. PNG/JPEG/WebP <=2MB; client/server check size, extension, mime and signatures; UUID filenames, no SVG/URLs/traversal. Explicit remove uses fallback without auto enabling/publishing. Admin default10 is preserved. No new experts or enabled changes; no tests/browser/QA/review/fullbuild, only bounded resources/migration/preservation evidence.

§9实际实现、唯一icon迁移、46/115保全与新分页端到端代码路径见[gallery-v2-t128-handoff.md](./gallery-v2-t128-handoff.md)。Admin默认10沿用t123并覆盖历史20条说明。未作运行验收。


## t146 implementation delta — public discovery and fail-closed admission
Actual schema: expert parent/version expertDefinition.discoveryDetail; skill official_skill.discovery_detail JSONB default '{}' (20261107030000 migration applied). New typed public allowlist and separate admin CAS editor; never serialize original expertDefinition or instructions. Future explicit expert publish snapshots detail; skill display metadata is independent of package revision. Existing icon upload/customAvatarPath remains resource display metadata. Empty fields hide; old public openingQuestions falls back only when no explicit starters exists.
Actual execution policy `gallery-v2-closed-1`: creation rejects before bind/create; replayed expert and selected-skill sessions reject pre-step and tools through existing native hooks. Current sandbox builder shape allowed reading outside granted workspace; Host identity/scoped grants/cross-entry network constraints were not proven. This is a conservative closure, not a new universal sandbox or completed standard composition. Do not remove old expert restrictions or claim standard tools/load barrier until P0 is enforced. No final-context load barrier, receipt reducer, approval concurrency or artifact identity verification is implemented in this delta. Ordinary unbound standard sessions are outside this new branch.
Details and evidence: enhancement-v2-t146-handoff.md; assets/managed/enhancement-v2/{BASELINE,RESULT,P0-SPIKE,FOCUSED-CHECK,RUNTIME-MANIFEST}.json. Real counts preserved46 experts/22published/24draft,47versions,115enabled skills,44links14grants; original-column hashes equal.


## t148/t149 implementation delta — usable managed documents (supersedes blanket t146 closure)
New gallery sessions explicitly mount native standard with frozen composition v3/managed-documents, then append roles/methods. Only official skill, admitted UTF-8 session objects, immutable text document outputs and allowlisted skill references are executable. No arbitrary fs/shell/network/MCP/subtask/install/external actions. Standard automatic AGENTS/local skill discovery is denied for this profile via narrow default-neutral native hooks. Native final-request and actual Ground post-budget serialized-wire method/hash/budget checks gate business inference; auxiliary cloud inference has no tools and does not claim business method loading. Current Ground auth rechecked; immutable output callId and serial quota prevent duplicate file commits; native receipts/reducer/download UI show real facts. Ordinary standard unchanged, legacy bindings do not gain tools. This is NOT universal OS sandbox/verified Host handshake/new expiry-grant/approval framework. Full arbitrary execution remains unavailable. 9 focused native-loop/store/wire-mock checks passed, live cloud and full standard deployment not run. See business-v3-t149-handoff.md and assets/managed/business-v3. No migration/DB mutation this round; full-field preservation hashes equal.


## t160 当前聊天引用入口收敛
本轮以现有＋菜单“引用企业资料”可勾选行及仅选中时的小可取消tag取代常驻企业知识库按钮。使用per-Session draft boolean及attempt捕获，不再用文本前缀；原检索/授权/引用业务保留。详见[实现交付](enterprise-reference-t160-handoff.md)，11项聚焦检查通过但无真实云/浏览器验收。
