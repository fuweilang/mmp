# 猛犸多端资料库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Console 和终端交付同等的文档、原生数据表和网页创建编辑能力，超管沿现有权限管理，所有端及 Agent 共用同一资料服务。

**Architecture:** 按推荐方案 B 新建共享 React 工作台，由 Vue Console 和 Cordis 终端各自适配。Ground 保留身份与权限，增加内容命令、修订、任务、检索和协作模块；PostgreSQL 和私有对象存储承载权威数据。旧 API 和旧引用保留兼容，新增内容使用 v2 协议。

**Tech Stack:** 现有 NestJS、Prisma、PostgreSQL、Vue、React、Electron；建议新增 Tiptap/ProseMirror、Yjs、经过 P0 验证的协作适配、TanStack Table/Virtual、Monaco、pgvector、pg-boss 和对象存储适配。具体版本在 P0 锁定，当前未安装。

**Spec:** [完整复刻方案](../specs/2026-11-09-workbuddy-library-design.md)。本计划与该方案同时提供为评审稿，不表示实施已经启动。

## Global Constraints

- Console 和终端均完整支持文档、表格、网页的创建与编辑；超管沿用现有管理和代管规则；所有端访问同一套云端资料。
- 不合并 Ground 与 mammoth-agent 的 workspace 和锁文件；统一根目录 Node.js >=24.9.0；Ground 现有 pnpm 10.32.1、mammoth-agent 11.28.5 保持独立。
- 现有 canSee/canManage、登录态租户、所有者与有效代管是授权来源；不默认新增匿名访问、只读成员编辑或超管正文权限。
- 修改只有得到服务器 durableRevision 回执才显示“已保存”；旧引用固定历史，不自动转最新。
- 保留 FILE、原 LibraryVersion 与旧链接；先发布兼容底座，再允许新种类；不对不可识别内容静默空保存。
- 不修改 Agent 主循环；原生插件按 Cordis 注册/释放、宿主凭据、locale 与客户端分层约定接入。
- 当前目录无 .git；本任务仅写方案文档，不 git init、不擅自 commit/push，不安装依赖、迁移数据库或部署。

## Review Focus

1. 编辑中撤销代管、切换企业或回收资料：后续 REST、协作消息、任务和网页绑定必须拒绝，旧客户端状态不能继续写入；归 T02、T14。
2. UI 已显示“已保存”后杀死协作服务/worker：重启能还原原文及 revision，重放没有重复副作用；归 T03、T06、T14。
3. 粘贴、公式、关联资料、网页脚本及模型建议携带越权或可执行内容：只能在授权目标及隔离环境处理；归 T07、T08、T09、T10、T13。
4. 老终端未知对象、旧 KB 定向授权、旧引用、重复或中断迁移：不得丢文或扩权；归 T01、T02、T15。
5. 中文长文后部命中、查询大表、批量导入和导出截断：正确定位、分页、解释转换损失，不假装全文和完整兼容；归 T08、T11、T12、T16。

---

## 1. 路径与协议约定

所有工程路径相对统一根目录 `/Users/luoxiaojun/Documents/mmp/mmp`。Create 是未来拟新增，不代表当前存在；Modify 表示现有入口。未来测试文件及命令由对应任务建立后才可执行。本轮不运行实施命令。

| 目录 | 职责 |
| --- | --- |
| `shared/library-workbench/` | 独立浏览器库；纯协议、客户端资源、React 工作台、文档/数据表/网页组件、mount 入口；无 Cordis/Vue/Electron 依赖 |
| `ground/apps/backend/src/library-v2/` | 原生内容业务、事务、权限适配、工作状态、修订、工具入口 |
| `ground/apps/backend/src/library-v2/{documents,tables,pages,search,jobs,collab,migration}/` | 按内容领域分模块，各自拥有 DTO、服务与测试 |
| `ground/apps/frontend/src/components/library/` | Vue 宿主、主题/语言和路由适配，管理台授权集成 |
| `mammoth-agent/packages/client/ui-enterprise-library/` | 现有入口、＋和 @、来源展示、共享工作台适配 |
| `mammoth-agent/packages/credentials/deepseek-account-platform/` | 身份绑定的 v2 HTTP 及协作通道代理 |
| `mammoth-agent/packages/workspace/{library,library-ground,tool-library}/` | 拟新增的工具 Definition / Provider / Consumer；按现有包分类规则注册，不形成随意跨 feature 值导入 |

跨 workspace 的共同协议以版本化 tarball 的 `./contracts` 输出为准。服务端仍做输入验证；客户端不能把共享 TypeScript 类型当授权。后端不得运行浏览器组件。共享协议的 Node 入口应保持纯数据定义和验证，不带 React 或 DOM。

### 1.1 各任务共同采用的拟定接口

下列是本方案确定的名称和语义，不是已经存在的 API。完整字段验证在 T02 建立，后续任务从该模块导入，不能各自复制一个不兼容版本。

```text
LibraryActor = 服务端登录态产生的 userId/tenantId/role/custody 上下文
LibraryRefV2 = { kind: 'library-v2', nodeId, revisionId, locator? }
CommandEnvelope = { requestId, nodeId?, precondition, action, payload }
Precondition = create | head(expectedHeadCommitRev:number)
             | rows(expectedSchemaRev:number, expectedRows:[{rowId, rowRevision:number}])
             | crdt(documentEpoch:number, updateId:string)
CommandResult = { nodeId, headCommitRev:number, durableRevision:number, changedIds, replayed }
RevisionResult = { nodeId, revisionId, headCommitRev, schemaVersion, contentKind }
TaskResult = { jobId, state: queued|running|done|failed|cancelled, result?, error? }
SearchHit = { nodeId, revisionId, locator, title, snippet, score, truncated }
```

- `LibraryAuthorizationService.authorize(actor, action, target): Promise<AuthorizedTarget>`：调用现有规则并校验资料状态；提交时重新验证。
- `LibraryCommandService.execute(actor, envelope): Promise<CommandResult>`：唯一业务写入口，事务内校验权限/基线/请求幂等，持久后回执。
- `LibraryRevisionService.freeze(actor, nodeId, atCommitRev): Promise<RevisionResult>`：固定可引用内容；不存在的提交序号拒绝，不悄悄取当前最新。
- `LibrarySourceService.read(actor, ref, budget): Promise<SourceExcerpt>`：返回真实名称、revision、稳定定位、正文和截断状态。
- `LibrarySearchService.search(actor, { query, targets?, cursor?, limit }): Promise<{ items: SearchHit[], nextCursor? }>`：在授权集合内查询并复核来源。
- `LibraryJobService.enqueue(actor, { requestId, type, target, input }): Promise<TaskResult>`：登记任务，不假装已完成文件。
- `WorkbenchBridge`：版本、主题、语言、固定资料 API 回调、订阅回调、打开会话及本地文件选择回调；没有 JWT、任意 URL、数据库连接或整个宿主服务对象。

create 动作由服务端生成/复用目标 nodeId，其余动作必须传既有 nodeId。precondition 由 action 的判别类型限定，不由客户端任意选择较弱的检查方式。head 用于直接正文/网页及数据表结构修改；rows 用于记录修改，不因无关记录变化而失败；crdt 用于可合并文档更新。durableRevision 等于本次已持久提交的 headCommitRev；freeze 返回的 revisionId 才是不可变快照 ID。恢复文档必须递增 documentEpoch，旧离线更新不得自动重入。

v2 REST 在 `/api/library/v2/*`；原生同源代理在 `/ground-library/v2/*`。协作使用独立受控端点和一次性连接票据，不把长期 JWT 放进地址。超管 v2 内容写操作仍通过现有管理授权和事务执行框架，不接受客户端自称超管或所有者。

## 2. 阶段依赖和可交付成果

| 阶段 | 任务 | 可审阅成果 | 放行条件 |
| --- | --- | --- | --- |
| P0 | T01 | 功能/兼容/授权/技术验证记录和工作量预算 | 双端挂载、持久确认、权限撤销、格式样例验证后锁定方案 |
| P1 | T02、T03 | v2 协议、统一授权、内容修订与命令服务 | 原接口/引用保持；冲突、幂等、越权和事务故障通过 |
| P2 | T04、T05 | 双端工作台、目录、空间、文件和任务流水线 | 同节点双端可见、文件重试/取消/配额正确 |
| P3 | T06、T07 | 双端文档及评论/修订/历史 | 编辑、重开、历史引用、提案冲突全部可验 |
| P4 | T08、T09 | 双端原生数据表及视图/转换 | 结构、行、公式、关联权限和大表分页通过 |
| P5 | T10、T11 | 双端网页编辑、预览、数据绑定及发布 | 草稿/发布隔离、脚本隔离、表单权限与发布回退通过 |
| P6 | T12 | 统一检索和固定来源 | 中文/长文、权限变化、旧入口一致 |
| P7 | T13 | Agent 工具、会话引用和本地产物入库 | 两端真实模型完成三类内容操作并给可核对回执 |
| P8 | T14 | 多人、重连、撤权、通知与故障恢复 | 并发和杀进程实验满足保存语义 |
| P9 | T15、T16 | 迁移、跨端全量验收、灰度及回滚记录 | F01–F18 有逐项证据；未完成项不得标为完整复刻 |

P1 后可开始 T04/T05；P2 完成后文档和数据表领域可在接口固定后并行。网页数据绑定依赖数据表，Agent 最终验收依赖三类内容和检索。协作格式和持久设计在 P0/P1 确立，不能等 P8 再改变正文格式。每阶段均含 Console 与终端，不接受单端完成代替双端交付。

## 3. 实施任务

### T01 P0 功能基线与技术验证

**Files:**
- Create: `docs/superpowers/acceptance/library-parity-matrix.md`
- Create: `docs/superpowers/acceptance/library-permission-matrix.md`
- Create: `docs/superpowers/acceptance/library-compatibility-and-capacity.md`
- Create: 独立临时验证目录中的双宿主编辑、持久确认与格式转换实验；不写入产品源码和真实客户库。

**Interfaces:** Consumes：本方案和 WorkBuddy 现有证据。Produces：F01–F18 对照、现权限测试身份、锁定依赖与格式范围、测试机器/数据集/容量目标、逐任务工程量预算。

- [ ] **Step 1:** 列出 Console、终端、超管、Agent 四条路径；对 WorkBuddy 未实测项补读取/授权样例实验。保存程序出处和实际操作证据，不把教程文案当运行结果。
- [ ] **Step 2:** 用工作台最小样例分别挂载 Vue 与 Cordis；验证 React 不重复冲突、CSS 隔离、语言/主题、卸载释放、Monaco worker 和打包。产品依赖不安装前先在隔离目录验证。
- [ ] **Step 3:** 用候选协作适配验证“收到同步消息但还没写库”与“持久回执”的区别。保存回执后终止进程，重开必须恢复全部确认内容；撤权和只读连接写入都必须拒绝。未通过不得继续选用该适配。
- [ ] **Step 4:** 用中文、图片、文内表格、公式、CSV、XLSX、网页源码样例列出导入导出保真和损失；明确原生数据表与工作簿区别。Tiptap 付费评论、Univer 商业服务均不默认采购。
- [ ] **Step 5:** 固定函数集合、样例、协议版本和支持平台，形成 P1–P9 人员/工作量预算与关键依赖。输出“通过/不通过/尚未观察”的基线，不能用模糊 TBD 进入建设。

验证：检查三个记录的每个需求都有观察、测试或明确适配结论；失败的协作/转换方案先修订设计，不用未知状态推进。

### T02 P1 统一协议 权限和旧端兼容

**Files:**
- Create: `shared/library-workbench/src/contracts/{content,commands,source,host}.ts`
- Create: `ground/apps/backend/src/library-v2/{library-v2.module,library-v2.controller,library-actor.service,library-authorization.service,library-v2.dto}.ts`
- Modify: `ground/apps/backend/src/library/{library.controller,library.admin.service,library.module}.ts`
- Modify: `ground/apps/backend/prisma/schema.prisma`；Create：新增 migration，不能改已应用迁移。
- Create: `ground/apps/backend/test/library-v2/{permissions,legacy-compatibility}.spec.ts`

**Interfaces:** Consumes：现有 policy、custody 和 Actor；Produces：第 1.1 节协议、`LibraryAuthorizationService.authorize`、原生类型与版本能力协商。此任务只建协议/权限和最小创建读取，不把未来功能伪装为空实现。

- [ ] **Step 1:** 写失败测试：`member_cannot_edit_other_shared_doc`、`platform_admin_requires_active_custody`、`legacy_items_never_returns_unknown_kind`、`switched_tenant_cannot_read_source`。断言 403/404 按现有策略；新对象不出现在 v1 items；旧 FILE/versionId 仍能读取。
- [ ] **Step 2:** Run：`pnpm --dir ground/apps/backend exec node --import tsx --test test/library-v2/permissions.spec.ts test/library-v2/legacy-compatibility.spec.ts`；确认缺失功能导致失败，不以环境失败当有效红灯。
- [ ] **Step 3:** 建统一服务端 Actor，复用原权限；补全策略动作映射；兼容服务先落地，再开启新枚举写入。超管内容入口调用原 grant 锁、冲突、审计框架。
- [ ] **Step 4:** 重跑上述测试及 `pnpm --dir ground/apps/backend run test:library`。实际迁移仅在专用本地验收库执行；输出新旧客户端兼容样例和权限差分。

### T03 P1 持久修改 修订和幂等

**Files:**
- Create: `ground/apps/backend/src/library-v2/{library-command.service,library-revision.service,library-source.service,library-operation.store,library-outbox.service}.ts`
- Modify: `ground/apps/backend/prisma/schema.prisma`；Create：Head/Revision/Operation/Outbox 迁移。
- Create: `ground/apps/backend/test/library-v2/{commands,revisions,durability}.spec.ts`

**Interfaces:** Consumes：T02 协议和授权；Produces：execute、freeze、read、不可变引用、outbox 事件。文件旧版本通过适配读取，不改成新 ID。

- [ ] **Step 1:** 写失败测试：同 requestId 同 payload 两次仅一个修改和一个回执；同 requestId 不同 payload 拒绝；旧基线返回 409；先 freeze 再编辑，旧 source 文本不变；事务失败没有“已保存”回执和广播。
- [ ] **Step 2:** Run：`pnpm --dir ground/apps/backend exec node --import tsx --test test/library-v2/commands.spec.ts test/library-v2/revisions.spec.ts test/library-v2/durability.spec.ts`，确认红灯。
- [ ] **Step 3:** 在同一事务内写入工作状态、操作、审计和 outbox；按节点序列化写入。freeze 固定指定 commit，不存在即拒绝；source 返回实际定位及截断状态。回执和广播在提交之后。
- [ ] **Step 4:** 重跑测试；在专用 PostgreSQL 验收库用中断/重启测试验证持久化，不以纯内存单测代替。验收库沿用现有专用 URL 限制，不触碰业务库。

### T04 P2 共享工作台和双端宿主

**Files:**
- Create: `shared/library-workbench/{package.json,src/index.ts,src/mount.tsx,src/client.ts,src/Workbench.tsx,src/locales.ts}`
- Create: `shared/library-workbench/tests/{host,document-roundtrip}.spec.tsx`；Create：`shared/library-workbench/e2e/dual-host.spec.ts`。
- Create: `ground/apps/frontend/src/components/library/LibraryWorkbenchHost.vue`
- Modify: `ground/apps/frontend/src/views/Library.vue`、`ground/apps/frontend/package.json`
- Modify: `mammoth-agent/packages/client/ui-enterprise-library/src/client/index.ts`、`src/client/api.ts`、`src/client/LibraryPanel.tsx`。
- Modify: `mammoth-agent/packages/credentials/deepseek-account-platform/src/ground-library.ts`
- Test: 现有 `mammoth-agent/packages/credentials/deepseek-account-platform/tests/ground-library.spec.ts`，新增共享工作台挂载测试。

**Interfaces:** Consumes：T02/T03；Produces：WorkbenchBridge、mount(element, props) 返回 destroy/update 的句柄、共享 React 入口、白名单 v2 代理。宿主传回调和数据，不传服务或长期凭据。

- [ ] **Step 1:** 写失败测试：相同 nodeId 在 Console 创建后终端可读；切换账号终止旧请求；mount/unmount 三次没有遗留订阅；新代理拒绝任意 URL、admin 路径及不允许的动作。
- [ ] **Step 2:** 在新包建立 `test`、`test:e2e`、`build`、`pack:verified` 脚本，再运行 `pnpm --dir shared/library-workbench test` 与 `pnpm --dir shared/library-workbench test:e2e -- dual-host.spec.ts`，确认功能失败。
- [ ] **Step 3:** 构建固定版本私有 tarball，两个 workspace 各锁定同一版本及校验值。Console 提供 Vue mount 包装；终端通过现有 slots 和注入约定提供宿主回调，补 v2 HTTP/订阅白名单，不复用无限制桥接。
- [ ] **Step 4:** 重跑单测和双宿主浏览器验收；执行 Ground 前端 typecheck/build 及原生相关 Vitest 测试。保留两端截图、同一 nodeId 和网络结果；打包产物实测，不能只靠源码挂载。

### T05 P2 空间 文件 附件和后台任务

**Files:**
- Create: `ground/apps/backend/src/library-v2/{library-space.service,library-blob.store,library-upload.service}.ts`
- Create: `ground/apps/backend/src/library-v2/jobs/{library-job.service,library-worker,library-gc.worker,link-clip.worker}.ts`
- Modify: 现有 library 文件适配、limits、production compose 的未来配置；部署操作留 P9。
- Create: `shared/library-workbench/src/{navigation,uploads}/` 下的空间导航、进度和失败处理组件。
- Create: `ground/apps/backend/test/library-v2/{uploads,jobs,spaces}.spec.ts`

**Interfaces:** Consumes：T03 outbox 与命令；Produces：申请上传会话、确认资产、enqueue、查询/取消任务、BlobStore 的 put/get/delete 接口与磁盘/私有对象存储实现。

- [ ] **Step 1:** 写失败测试：取消后不挂接文件；重复确认不重复占配额；上传后杀进程只形成可核对孤儿；两个并发上传不能超租户配额；任务身份撤销后不继续发布结果；每个端显示相同 jobId 状态。
- [ ] **Step 2:** Run：`pnpm --dir ground/apps/backend exec node --import tsx --test test/library-v2/uploads.spec.ts test/library-v2/jobs.spec.ts test/library-v2/spaces.spec.ts`，确认红灯。
- [ ] **Step 3:** 上传会话绑定用户/租户/节点/字节上限，确认后提交元数据和 outbox，worker 做可重试解析、索引和导出。链接剪藏保留原 URL 与确定快照，获取器逐次检查重定向、地址和容量，拒绝私网/元数据地址；不执行网页脚本。保留现有配额口径和个人默认可见范围；目录查询下推过滤和分页。
- [ ] **Step 4:** 重跑测试和双端批量文件验收；用故障注入验证补偿/孤儿核对/取消，不删除未经核实原件。

### T06 P3 双端文档编辑和持久保存

**Files:**
- Create: `shared/library-workbench/src/documents/{DocumentEditor,DocumentToolbar}.tsx`、`document-schema.ts`、`document-codec.ts`
- Create: `ground/apps/backend/src/library-v2/documents/{document.service,document.schema,document-import.worker,document-export.worker}.ts`
- Create: `ground/apps/backend/src/library-v2/collab/{document-room.service,document-durability.adapter}.ts`
- Create: `ground/apps/backend/test/library-v2/documents/{roundtrip,durability,unknown-block}.spec.ts`
- Create: `shared/library-workbench/e2e/documents.spec.ts`

**Interfaces:** Consumes：execute/freeze、T05 资产和任务；Produces：文档 schemaVersion、稳定 blockId、Yjs 工作状态/快照编解码、持久回执、MD/HTML 及 DOCX/PDF 转换结果。

- [ ] **Step 1:** 写失败测试：中文输入法提交文字不丢；复制块产生新 ID；旧客户端不能空保存未知块；Console 保存后关闭进程，终端重开内容一致；历史快照不随新输入变化。
- [ ] **Step 2:** Run：后台 documents 测试及 `pnpm --dir shared/library-workbench test:e2e -- documents.spec.ts`，确认红灯。
- [ ] **Step 3:** 接开源编辑核心，形成标题/文本/列表/图片/代码/引用/文内表格/公式/图示的类型映射，资产走授权接口。建立服务端权威 Ydoc 与只读快照；按 P0 验证过的方式发 durableRevision，UI 区分编辑中、待同步、已保存、失败。
- [ ] **Step 4:** 两端跑同一输入/粘贴/导入/导出样例；在数据库提交前后分别杀协作进程，校验已确认修改恢复。基础协作保存不延后到 T14。

### T07 P3 评论 修订建议和版本恢复

**Files:**
- Create: `ground/apps/backend/src/library-v2/documents/{document-comment.service,document-proposal.service}.ts`
- Create: `shared/library-workbench/src/review/{CommentsPanel,ProposalDiff,RevisionHistory}.tsx`
- Create: `ground/apps/backend/test/library-v2/documents/{comments,proposals,restore}.spec.ts`

**Interfaces:** Consumes：blockId/revision、authorize/execute；Produces：createProposal(actor, baseRevision, operations)、accept/reject、块锚定评论、追加式恢复。评论/修订同样是有权限的写操作。

- [ ] **Step 1:** 写失败测试：只读成员不能评论写入；建议建立后正文变化，接受返回 409 并保留建议；删除块后旧评论标记锚点失效；恢复 revisionA 创建新 revisionC，revisionB 仍可引用；恢复前的旧 epoch 离线更新被拒绝并保留差异。
- [ ] **Step 2:** Run：后台 comments/proposals/restore 测试，确认红灯。
- [ ] **Step 3:** 实现自有建议和评论领域对象及双端面板；接受/拒绝/恢复走同一命令与审计。拒绝不改正文，接受不抹掉他人后续修改。
- [ ] **Step 4:** 双端交叉提案和接受，验证权限、差异、冲突及旧引用；不以 UI diff 存在当后端冲突已解决。

### T08 P4 原生数据表与并发记录

**Files:**
- Create: `ground/apps/backend/src/library-v2/tables/{table-schema.service,table-record.service,table-query.service,table-revision.service}.ts`
- Create: `shared/library-workbench/src/tables/{TableEditor,FieldEditor,RecordEditor}.tsx`
- Create: 数据表 schema/row/field/history 迁移。
- Create: `ground/apps/backend/test/library-v2/tables/{records,query,concurrency,citations}.spec.ts`

**Interfaces:** Consumes：命令和修订；Produces：queryRows(actor, nodeId, query)、mutateRows(actor, envelope)、fieldId/rowId、记录基线、历史读和精确引用。sort/filter/group 是经过验证的查询 AST，不是客户端 SQL。

- [ ] **Step 1:** 写失败测试：排序后引用仍指同 rowId；两用户改同一基线记录，第二个得到冲突；改不同记录可成功；100000 行查询只回当前页；隐藏字段/关联资料不泄露；冻结查询版本不随之后改值变化。
- [ ] **Step 2:** Run：tables/records、query、concurrency、citations 测试，确认红灯。
- [ ] **Step 3:** 建服务端字段/记录模型和事务历史，前端用表格/虚拟化工具呈现。批量粘贴、增删行列、排序和过滤都接真实命令及错误回执，不把所有行先拉进浏览器。
- [ ] **Step 4:** 两端同表编辑、历史读取和并发验收，记录查询计划、传输行数与 p95；未测量不声称大表性能达标。

### T09 P4 公式 关联 视图和格式转换

**Files:**
- Create: `ground/apps/backend/src/library-v2/tables/{table-formula.service,table-relation.service,table-import.worker,table-export.worker,table-view.service}.ts`
- Create: `shared/library-workbench/src/tables/{TableViews,FormulaEditor,RelationPicker,ImportPreview}.tsx`
- Create: `ground/apps/backend/test/library-v2/tables/{formulas,relations,views,formats}.spec.ts`

**Interfaces:** Consumes：T08；Produces：有界表达式 AST、依赖图、计算结果/错误、关联/汇总、多视图配置及 CSV/XLSX 格式报告。默认函数集合沿方案第 8.2 节；P0 如增加，必须同步测试清单。

- [ ] **Step 1:** 写失败测试：IF/SUM/AVERAGE/COUNT/CONCAT/日期样例；循环和除零明确错误；关联不能引用另一租户；删除字段返回公式/网页影响；CSV 中文引号换行可往返，XLSX 不支持项报告损失。
- [ ] **Step 2:** Run：formulas/relations/views/formats 测试，确认红灯。
- [ ] **Step 3:** 使用受限解析和函数表实现公式，禁止 eval/网络。提供网格/看板/日历/画廊/表单。XLSX 转换候选为经 P0 评估的 ExcelJS worker；不以它承诺完整工作簿公式重算、宏、图表和打印兼容。
- [ ] **Step 4:** 双端演示同一底层表切视图和关联联动，检查没有复制第二份数据。恶意公式、外部链接和超大压缩包进入转换测试。

### T10 P5 网页项目 双模式编辑和受限预览

**Files:**
- Create: `ground/apps/backend/src/library-v2/pages/{page-project.service,page-asset.service,page-preview.service}.ts`
- Create: `shared/library-workbench/src/pages/{PageEditor,PageSourceEditor,PageVisualEditor,PagePreview}.tsx`
- Create: `ground/apps/backend/test/library-v2/pages/{project,sandbox,assets}.spec.ts`
- Create: `shared/library-workbench/e2e/pages.spec.ts`

**Interfaces:** Consumes：修订/资产/授权；Produces：固定项目文件及组件树 schema、源码/模板转换报告、无宿主凭据的预览通道。源码编辑是完整路径，不依赖任意 HTML 可无损转成组件。

- [ ] **Step 1:** 写失败测试：任意 HTML 导入后原源码仍在；可视化模板编辑保存后两端相同；脚本不能读父窗口 cookie/localStorage 或调用宿主 IPC；外部网络和未授权资源请求被拒绝。
- [ ] **Step 2:** Run：pages/project、sandbox、assets 和双宿主 pages e2e，确认红灯。
- [ ] **Step 3:** 提供 HTML/CSS/JS 源码和模板组件编辑；隔离来源、iframe、CSP 和资源清单共同限制执行。预览代码仅取得受限消息通道，不取得 JWT 和任意 fetch 代理。
- [ ] **Step 4:** 真实浏览器分别验证 Console、终端；以实际网络与脚本结果验证隔离，不能只检查 sandbox 属性字符串。

### T11 P5 页面数据绑定 认证发布和导出

**Files:**
- Create: `ground/apps/backend/src/library-v2/pages/{page-binding.service,page-publication.service,page-build.worker}.ts`
- Create: `shared/library-workbench/src/pages/page-data-sdk.ts`、`src/pages/PageBindings.tsx`、`src/pages/PagePublishDialog.tsx`。
- Create: `ground/apps/backend/test/library-v2/pages/{bindings,publications,publish-rollback}.spec.ts`

**Interfaces:** Consumes：T08 query/mutate、T10 项目、当前身份；Produces：resourceAlias 绑定、读写方法允许集合、immutable publication、已发布版本回退。发布链接要求登录并按现有权限访问。

- [ ] **Step 1:** 写失败测试：合法页面读绑定表成功，换表 ID 或访问未绑定字段拒绝；只读用户提交表单拒绝；草稿修改不影响已发布源码；回退只改变发布指针不删除历史；撤销代管后旧 iframe 不再读新数据。
- [ ] **Step 2:** Run：pages/bindings、publications、publish-rollback 测试，确认红灯。
- [ ] **Step 3:** 每次页面 Data SDK 调用解析实际访问者和绑定白名单；发布包关联固定修订；标明实时数据/快照模式；构建和导出走 job，不返回尚未生成的链接。代码构建过程同样使用隔离 worker。
- [ ] **Step 4:** Console 改表、终端看页面，反向重复；验收表单写入、版本冻结、发布撤回和授权拒绝。匿名公开模式保持关闭。

### T12 P6 统一检索和来源

**Files:**
- Create: `ground/apps/backend/src/library-v2/search/{library-search.service,library-index.worker,library-chunker,library-embedding.provider,library-query-normalizer}.ts`
- Modify: `ground/apps/backend/src/knowledge/knowledge.service.ts` 的兼容入口。
- Modify: `mammoth-agent/packages/client/ui-conversation/src/client/input/enterprise-knowledge.ts` 及旧请求适配。
- Create: `ground/apps/backend/test/library-v2/search/{retrieval,authorization,index-rebuild}.spec.ts`

**Interfaces:** Consumes：确定修订、模型网关和来源服务；Produces：第 1.1 节 search，来源块，索引模型/维度/schema 身份，旧 retrieve 响应适配。检索模型更换采用新索引而非混写向量。

- [ ] **Step 1:** 写失败测试：问题命中文档最后一段；中文同义表达样例；私人资料不能在标题/数量/摘要中泄露；资料编辑后旧回答 source 不变；重建中断和模型维度变化不返回错版本；显式目标搜索不扩大范围。
- [ ] **Step 2:** Run：search/retrieval、authorization、index-rebuild，确认红灯；固定真实检索评估集，不用只含题面原词的样例证明语义质量。
- [ ] **Step 3:** 建中文处理、权限内全文/向量召回与合并排序，worker 从不可变修订建立索引，结果再次授权；失败真实显示索引/模型不可用。旧 KB 完整迁移后逐租户切兼容入口。
- [ ] **Step 4:** 用真实 embedding 服务和固定样例测质量/耗时/费用；用替身单测只能证明流程。执行删除、回收、撤权后的检索拒绝测试。

### T13 P7 Agent 工具 会话来源和显式入库

**Files:**
- Create: `ground/apps/backend/src/library-v2/{library-tool.controller,library-tool.service}.ts`
- Create: `mammoth-agent/packages/workspace/{library,library-ground,tool-library}/` 的定义、实现、模型工具和各自 README/tests；修改包注册/依赖/类型构建清单及对应 workspace 文档。
- Modify: `mammoth-agent/packages/client/ui-enterprise-library/src/client/{index,selection,api}.ts`
- Modify: `mammoth-agent/packages/credentials/deepseek-account-platform/src/ground-library.ts` 的明确工具白名单。
- Create: `ground/apps/backend/src/library-v2/agent/library-tool-run.service.ts`、`shared/library-workbench/src/assistant/LibraryAssistantPanel.tsx`。
- Modify: Ground 既有 `library.llm.ts`/模型网关调用适配以支持 Console 同等工具流程；新增 LibraryToolRun/操作事件迁移。工具提供层共用，不再建独立内容数据库。
- Create: `ground/apps/backend/test/library-v2/agent/{tools,model-output}.spec.ts` 与归属包的 keyless 会话 snapshot、真实模型验收样例。

**Interfaces:** Consumes：T03/T06–T12；Produces：方案第 9 节工具名称/输入 schema/回执，`library-v2:` 前缀的稳定引用编码，旧 nodeId@versionId 仍可解码。工具 Provider 与 Consumer 分开，模型只能看到结构化目标和操作结果。

- [ ] **Step 1:** 写失败测试：只读 Agent 写入被拒；伪造 nodeId/tenantId/本地路径不能绕过授权；旧基线提案不得覆盖；本地附件没有显式保存不上传；导出 pending 不产生下载链接；来源中的命令不成为系统行为。
- [ ] **Step 2:** Run：agent/tools、model-output 及包内 keyless snapshot，确认红灯；现有 draft-send/Host proxy 测试覆盖旧引用仍工作。
- [ ] **Step 3:** 两端使用同一内容工具服务，注册按类型读写和修订流程；新增模型可见输入/结果在终端按现有会话事件记录，Console 持久记入 LibraryToolRun。Console 复用已有模型网关并实现资料操作面板和工具运行，终端遵循 Cordis 生命周期。每个工具给出真实对象、修订和任务回执。
- [ ] **Step 4:** 两端分别用真实模型完成“创建并改文档”“建表改字段/行”“生成绑定表的网页”，再从另一端打开核对；测试不能绕过账号权限或用固定回答代替真实模型。

### T14 P8 完整多人协作 撤权 重连和通知

**Files:**
- Create: `ground/apps/backend/src/library-v2/collab/{library-collab.gateway,library-room-access,library-event-cursor,library-presence}.ts`
- Create: `shared/library-workbench/src/collab/collab-client.ts`、`src/collab/PendingChanges.tsx`、`src/collab/PresenceBar.tsx`。
- Modify: 现有权限/成员/代管修改入口写出策略变更 outbox；Modify：两端身份切换和卸载适配。
- Create: `ground/apps/backend/test/library-v2/collab/{revocation,reconnect,process-failure}.spec.ts`

**Interfaces:** Consumes：P0 通过的文档适配、commit rev、策略事件；Produces：有序事件游标、合法在线成员、补齐/快照重连、持久回执和权限中断。表格冲突仍遵循 T08，不套用文档 CRDT。

- [ ] **Step 1:** 写失败测试：Console 与终端同时改文档可合并；同记录冲突可见；授权撤销事务之后的读写/广播被拒；丢事件后从 cursor 补齐；已保存后杀进程不丢；缓存不能跨账号重放。
- [ ] **Step 2:** Run：collab/revocation、reconnect、process-failure 及真实双端多用户场景，确认红灯。
- [ ] **Step 3:** 建房间生命周期、持续鉴权、事件补齐和持久确认；离线操作重新登录/授权后才可提交，冲突或无权保留本地待处理说明。补评论提及、修订、任务失败等站内通知，不暗中发送外部消息。
- [ ] **Step 4:** 在方案规定的测试环境跑 20 人同文档、两端并发、断网、后台标签页、切租户、撤销代管和重启实验，记录服务器与客户端证据。UI 单测不能代替过程验收。

### T15 P9 旧数据迁移 兼容切换和恢复

**Files:**
- Create: `ground/apps/backend/src/library-v2/migration/{library-migration.service,legacy-kb.adapter,library-migration.audit}.ts`
- Create: `ground/apps/backend/scripts/library-migrate-v2.ts`，仅显式参数运行；dry-run 默认。
- Create: `docs/superpowers/acceptance/library-migration-runbook.md`
- Create: `ground/apps/backend/test/library-v2/migration/{resume,grants,old-links,rollback}.spec.ts`

**Interfaces:** Consumes：旧文件/KB/grants、LegacyMapping、新 API 和索引；Produces：逐项摘要核对、权限等价、断点/重放、只读迁移清单、逐租户切换标识和最低兼容服务版本。

- [ ] **Step 1:** 写失败测试：中途退出重跑不重复节点；旧 FILE/versionId 不变；旧 KB 指定用户 grants 不变成企业公开；原件摘要和旧链接一致；未迁完不切换检索；回滚保持所有新原生内容可恢复和导出。
- [ ] **Step 2:** Run：migration/resume、grants、old-links、rollback，确认红灯；数据库与对象存储使用专用验收副本。
- [ ] **Step 3:** 实现默认只读盘点、显式迁移、校验、冻结旧写入口和切换流程。只有核对成功的租户切换；失败停止，不自动覆盖源数据或删除旧库。
- [ ] **Step 4:** 在测试副本完整演练备份恢复和回滚；产出文件数、版本数、授权差分、摘要、索引数和旧链接核对报告。生产操作单独准备精确目标、备份及回退步骤，本任务不执行。

### T16 P9 全量功能验收与发布资料

**Files:**
- Create: `docs/superpowers/acceptance/library-final-report.md`
- Modify: `docs/superpowers/acceptance/library-parity-matrix.md` 的证据状态。
- Modify: 两仓库受影响模块 README、用户使用文档、升级说明；按各仓库文档规则维护，不改生成文档来绕检查。
- Create: 统一项目的 `e2e/library-workspace/` 跨端场景、性能样例及报告产物配置；不替代已有测试启动约束。

**Interfaces:** Consumes：T01–T15 的可运行成果；Produces：F01–F18 的双端/Agent/超管证据、迁移与回滚记录、依赖清单、已知限制和可发布构建身份。

- [ ] **Step 1:** 从 F01–F18 和 Review Focus 逐项生成场景，不接受仅测文件上传的缩减矩阵；未取得证据标为未完成。
- [ ] **Step 2:** 执行 Ground `pnpm verify:api`、`pnpm verify:web`、现有 library 测试和新增 v2 专项；原生执行相关包测试和最新 `build:artifacts` 后的 `build:check`，遵守现有 snapshots/平台规则。新增共享包执行 test/build/双宿主 e2e。记录现有基线失败，不将其覆盖为新功能通过。
- [ ] **Step 3:** 在测试环境验真实模型、Mac/Windows 终端、Console 支持浏览器、容量目标、20 人协作、备份恢复和灰度回退。发布构建使用固定源码及依赖身份，验证版本兼容与打包产物。
- [ ] **Step 4:** 汇总通过项、失败项、剩余格式损失和权限例外。仅当全部核心能力与两端同等功能验收完成，才提交完整复刻结论；采购、生产切换和正式发布作为后续明确操作处理。

## 4. 质量和依赖选择的额外约束

1. 不用“文档用了 Yjs”代替持久化证明；P0 与 T06/T14 必须覆盖同步先于落库、存储失败和服务重启。
2. TanStack Table 只提供表格展示/状态工具，T08/T09 的编辑、计算和视图工作量必须计入预算。
3. 共享包仅导出必要的 browser/React/mount/contracts 入口；类型、schema、React 版本、CSS、worker 资产和 CSP 都纳入双 workspace 包测试。
4. 现有超管能看租户统计或资料元信息，不等于能看正文；新增正文编辑和实时订阅不扩大这个规则。
5. 网页自身代码和构建步骤都可能执行不可信代码，二者均隔离；父页面受限桥接每次仍做资源/身份检查。
6. 数据表关系、网页绑定、搜索索引和离线缓存都可能间接泄漏资料，测试覆盖标题、计数、片段和字段，不能只测试下载接口。
7. 旧 API、新 API、后台 worker 和超管都调用同一个业务写入口；不得各自更新 currentVersion 或工作正文。
8. 模型、转换组件、对象存储和商业 SDK 的实际价格未核算；P0 才确认预算，不把免费试用或评估水印组件计为生产交付。

## 5. 计划自查与交付状态

F01/F14/F16 由 T02/T04/T05/T14 覆盖；F02/F09/F10 由 T03/T06/T07 覆盖；F03/F04/F08 由 T08/T09 覆盖；F05/F06 由 T10/T11 覆盖；F07 贯穿上传和三类导入；F11 由 T06/T08/T14 覆盖；F12 由 T12 覆盖；F13/F15 由 T13 覆盖；F17 在 T02/T03 及所有授权测试执行；F18 由 T01/T15/T16 覆盖。

当前完成的是方案与分阶段计划；T01–T16 均未实施。计划交付后不自动开始安装、代码修改、迁移或上线。独立设计审读已核对共享包挂载、现有权限、Host 白名单和旧种类过滤，没有需要用户补充才能继续编计划的重大产品决策；技术实验仍必须在 P0 取得证据。
