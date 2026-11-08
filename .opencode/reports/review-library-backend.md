# 企业资料库 后端/鉴权链路 只读审查

- 审查时间：2026-11-08（America/Los_Angeles）
- 角色：代码审核（只读）。未改业务源码，未执行 shell/测试/构建。
- 报告落点：`.opencode/reports/review-library-backend.md`（非业务源码）

## 1. 范围

| 层 | 文件 |
|---|---|
| 后端业务 | `ground/apps/backend/src/library/{controller,service,policy,prisma-store,store,parse,files,llm,ask,limits,dto,module,errors,types}.ts`、`README.md` |
| 数据模型 | `ground/apps/backend/prisma/schema.prisma`（Library* 模型）、`prisma/migrations/20261108040000_enterprise_library/migration.sql` |
| 鉴权链 | `src/auth/{jwt.guard,current-user,auth.service}.ts`、`src/permissions/effective.ts`、`src/main.ts`、`src/tenant/tenant.service.ts`、`src/admin/admin-users.service.ts` |
| 测试 | `test/library/{library.flow.spec.ts,library.custody.spec.ts,library.postgres.spec.ts,library.http.test.cjs,library.http-fixture.cjs}`、`package.json` |
| 客户端/Host 接线 | `mammoth-agent/packages/credentials/deepseek-account-platform/src/{ground-library.ts,index.ts,protocol.ts}` |
| 部署 | `ground/infra/production/{nginx-mmai.conf,compose.yml,Dockerfile.api,release.sh}`、`ground/scripts/dev-gateway.mjs` |
| 规格/交接 | `openspec/changes/enterprise-library-local/{design.md,tasks.md,specs/library/spec.md,local-handoff.md}`、`openspec/changes/enterprise-library/{design.md,proposal.md}` |

明确不做：Harness 内部模型/工具、OIDC/billing 实现细节、前端逐页 UI、旧 Octop 代码。

## 2. 基线

- 目标版本 3.0；HEAD `964dfca2`；工作区 clean——**按任务给定记录，未用 shell 核实**（本角色不执行 shell）。
- 文档漂移：`ground/openspec/changes/enterprise-library-local/local-handoff.md` 仍写 HEAD `95a1a61e` + 37 个未提交路径，与任务基线不一致，仅作记录，不影响下述结论。
- 结论均来自源码静态阅读与既有测试文件；未运行任何测试，不能当作运行证据。

## 3. 结论摘要

| 级别 | 数量 | 主题 |
|---|---|---|
| P0 | 0 | 未发现越权读写、跨租户泄漏、未鉴权入口 |
| P1 | 2 | 生产原件不持久化、生产 `/api/library` 路由不可达 |
| P2 | 13 | 回收链接 URL 残留、代管审计缺口、代管权限语义、并发/原子性、错误映射、N+1、配置同源、截断语义、测试接线等 |
| P3 | 6 | 边界校验、统计过滤、DB 约束、测试替身语义 |

核心鉴权模型（租户来自签名 JWT、owner/成员/共享/代管四路判定、撤共享后不可见、成员移除后旧 JWT 失效）**成立**，见第 7 节。

---

## 4. P0

无。未发现以下任一情形：跨租户读/写、非成员凭平台身份读正文、客户端传入 tenantId 生效、代管越权、未鉴权访问。

---

## 5. P1

### P1-A 生产原件未持久化，容器重建即丢文件

- **path:line**
  - `ground/apps/backend/src/library/library.prisma-store.ts:20`：`process.env.LIBRARY_DIR || resolve(process.cwd(), 'library-data')`
  - `ground/infra/production/Dockerfile.api:24`：`WORKDIR /app/apps/backend`
  - `ground/infra/production/compose.yml:25-28`：仅挂 `uploads`、`api-state`、`secrets`
  - `ground/infra/production/release.sh:446`：只 `mkdir data/uploads data/api-state`
  - `ground/apps/backend/src/library/README.md:3`：明确要求部署挂载持久存储
- **触发**：生产 compose 启动 api（未设 `LIBRARY_DIR`）→ 上传文件 → 容器重建 / 镜像更新 / 宿主机迁移。
- **影响**：原件写入容器可写层 `/app/apps/backend/library-data`。重建后文件消失，但 `LibraryVersion`/`LibraryChunk` 仍在：下载 410、预览空、问答引用指向不存在的来源；备份只覆盖 `/app/apps/backend/uploads` 与 `/app/state`，原件不在备份范围。
- **证据**：compose 无 `LIBRARY_DIR` 环境变量，也无对应 volume；`uploads` 挂载点与默认 `library-data` 不是同一路径；README 与实现自相矛盾。
- **建议**：在 compose 增加 `./data/library:/app/library-data` 并设 `LIBRARY_DIR=/app/library-data`；`release.sh` 同步建目录；备份脚本纳入该目录。是否改默认值由主会话决定，最小修复是部署侧挂载。

### P1-B 生产 `/api/library` 被 nginx 路由到 agent，前端/Host 代管请求 404

- **path:line**
  - `ground/mammoth-agent/.../ground-library.ts:18-24`：Host 侧代理目标固定 `'/api/library' + path`
  - `ground/infra/production/nginx-mmai.conf:34`：Ground 白名单仅 `auth|billing|v1|session-history|oidc`
  - `ground/infra/production/nginx-mmai.conf:53-54`：其余 `/`（含 `/api/library`）落到 `127.0.0.1:33080`（agent）
  - `ground/infra/production/compose.yml:37`：`GROUND_PUBLIC_ORIGIN=https://www.mmai.vip`
- **触发**：生产 Web/桌面打开资料库，或平台管理员走代管浏览；Host 以 `https://www.mmai.vip/api/library/...` 请求。
- **影响**：请求进入 agent 的 33080，而非 Ground 33100 → 404/非预期响应，资料库在生产不可用。本地 `dev-gateway.mjs` 有独立路由，故本机联调正常，问题被掩盖。
- **证据**：nginx 正则未含 `library`，`location /` 兜底到 33080；同一个 origin 上桌面的 Host 代理与 Web 前端都按 `/api/library` 拼路径。
- **建议**：nginx 白名单加 `library`（`^/api/(auth|billing|v1|session-history|oidc|library)(/|$)`）；发布后用 `curl -i https://www.mmai.vip/api/library/items` 验证落在 33100（未执行）。

---

## 6. P2

### P2-1 回收后的 LINK 仍向同租户成员返回 URL

- **path:line**：`library.service.ts:340`（blocked 分支返回 `linkUrl`）、`:944`（`toItem` 对 LINK 无条件带 `linkUrl`）、`:350-358`（ACTIVE 分支）
- **触发**：企业共享链接被 owner 回收（`state=RECYCLED`）→ 任一成员 `GET nodes/:id/preview`。
- **影响**：`openBytes` 对 RECYCLED 返回 blocked，但 blocked 响应仍带 `linkUrl`；列表 `toItem` 也不看 state。回收的语义是"停止访问"，URL 属内容，等于回收不生效。
- **证据**：`:340` 无 state 判定；`:944` 仅判 `kind === 'LINK'`。既有测试只覆盖"撤销共享后不返回 URL"（`library.http.test.cjs:109-120`），未覆盖回收链接。
- **建议**：blocked/DELETED 分支 `linkUrl: null`；`toItem` 增加 `node.state === 'ACTIVE'` 条件；补一条回收链接的 HTTP 用例。

### P2-2 代管读取审计不完整，`ask`/`versions` 无 `library_custody_read`

- **path:line**：`library.service.ts:880-883`（仅 `auditCustodyRead` 一处）、`:348`、`:392`、`:423`（preview/download/openCitation 有）、`:401-406`（`versions` 无）、`:443-534`（`ask` 无，`:496-499` 的 `library_ask` meta 不含 `custodyId`）
- **触发**：平台管理员持有效代管授权，调用 `/api/library/ask` 或 `/api/library/nodes/:id/versions`。
- **影响**：正文/版本元数据已被读取，但审计里没有"代管读取"记录，只留 `library_ask`（含版本 ID 集合，可反推读了哪些资料），无法按 custodyId 归因；撤销代管后的追溯与合规举证不完整。
- **证据**：`grep` 全库仅 4 处 `auditCustodyRead` 调用，均在 preview/download/openCitation/list；`ask`/`versions` 不在其中。
- **建议**：`ask` 对每个实际纳入 `ready` 的 node 记 `library_custody_read`，并在 `library_ask` meta 加 `custodyId`；`versions` 同样记一次。代管视图列表已按项记录，注意批量端点会放大写入量。

### P2-3 代管 `CRUD` 与"平台仅汇总/撤销"的产品口径冲突，且普通端点会合并全部授权

- **path:line**：`library.dto.ts:116-117`（接受 `powers:'CRUD'`）、`library.policy.ts:69-70`（CRUD 可 manage/purge）、`library.service.ts:667`（`managedActor` 只绑定单个 custodyId）、`library.service.ts:875-878`（`custodiesFor` 在无 `custodyId` 时返回该用户全部授权）、`LibraryCustodyApproval.vue:12`（文案称只读）
- **触发**：企业管理员批准 `CRUD` 给平台管理员；该管理员随后用普通 `/api/library/*` 端点（非 `/admin/custody/:id/*`）操作。
- **影响**：普通端点的 `actor()` 不带 `custodyId`，`custodiesFor` 返回该管理员在同租户的**全部**授权，`canManage` 因此对任一 CRUD 覆盖节点为真。多笔授权时，单笔授权的"范围"在普通端点上失效；与前端"只读"文案不一致，属语义/授权边界缺口（仍限同租户、仍限授权覆盖范围，不构成跨租户越权）。
- **证据**：`managedActor` 的 `custodyId` 只在 `/admin/custody/:id/*` 路由注入；`controller.actor()`（`:319-332`）不注入。
- **建议**：产品侧先确认 CRUD 是否存在真实需求；若保留，普通端点也应绑定单一 custody，或 `canManage` 仅对代管专用路由开放。文案与 DTO 二选一改齐。

### P2-4 `touchRecent` 读后写竞态导致 500

- **path:line**：`library.prisma-store.ts:182-202`
- **触发**：同一用户并发打开同一 node（双击、列表+预览并发、下载与预览同时）。
- **影响**：`findUnique` 未命中后两个请求都 `create`，`(userId,nodeId)` 唯一索引冲突 → preview/download 500。读接口被非关键副作用打挂。
- **证据**：唯一键在 `schema.prisma` 的 `LibraryRecent`；实现非 `upsert`、无冲突兜底。
- **建议**：改 `upsert`（`where: { userId_nodeId }`），或捕获 P2002 忽略。

### P2-5 `retryParse` 跨两次提交，失败留下 READY+0 chunks 且不可自愈

- **path:line**：`library.service.ts:314-326`（`:320` `updateVersion`、`:325` `replaceChunks` 分开）
- **触发**：`updateVersion` 成功后 `replaceChunks` 抛错（DB 抖动/约束/进程退出）。
- **影响**：版本变 READY 但无 chunk → 预览空、`openCitation` 空摘录、问答无证据；`:314` 对 READY 直接返回，重试无法修复，只能换版本。
- **证据**：两写不在同一事务；`LibraryChunk` 与 `LibraryVersion` 无原子提交路径。
- **建议**：存层加 `commitParseResult(versionId, patch, chunks)` 单事务；或先写 chunk 再置 READY。

### P2-6 `purgeStored` 非原子，部分失败后节点仍 ACTIVE 但正文不可读

- **path:line**：`library.service.ts:805-816`（逐版本 `deleteBlob` + `replaceChunks`，最后才改 state）
- **触发**：多版本删除中途失败（磁盘/DB 错误、进程重启）。
- **影响**：blob 已删、chunk 已清，但 `state` 仍 ACTIVE：下载 410、预览空、问答静默丢证据，且列表仍显示"使用中"。用户看到的是数据损坏而非删除失败。
- **证据**：`deleteBlob` 与 `updateNode` 无事务包裹，blob 删除不可回滚。
- **建议**：先置 `PURGING`/`PURGED` 再清 blob（或记录 `purgeStartedAt`），失败可重入；至少把"state 先落库"作为幂等前置。

### P2-7 `purge` 不要求 RECYCLED，ACTIVE 可直接彻删

- **path:line**：`library.service.ts:297-303`（仅 `canManage` + `assertNoLiveChildren`）、`controller.ts` 单删/`batch` 同路径
- **触发**：owner 或 orgAdmin 对 ACTIVE 文件/空文件夹直接 `DELETE nodes/:id`，或 `batch action=purge`。
- **影响**：绕过回收站与保留期，误操作不可恢复；批量端点可在一次请求内批量彻删。与"回收→彻删"两段式设计不一致。
- **证据**：`purge` 无 `state === 'RECYCLED'` 校验；`restore` 反而校验了（`:275`）。
- **建议**：要求 `state === 'RECYCLED'`；若产品确需"立即彻底删除"，用显式参数/独立端点并审计。

### P2-8 文件夹回收被回收站子项阻塞

- **path:line**：`library.service.ts:264`、`:818-822`（`state !== 'PURGED'` 视为 live child）
- **触发**：先回收子文件/子文件夹，再回收父文件夹。
- **影响**：父目录报 `FOLDER_NONEMPTY`，只能先把子项彻删才能回收父目录。回收站里出现"子项已回收、父项回收不了"的死角。
- **证据**：判定未区分 `RECYCLED` 与 `ACTIVE`；`restore` 已处理父项在回收站的情况（`:276-281`），回收侧没有对称处理。
- **建议**：`assertNoLiveChildren` 只拦 ACTIVE 子项，或提供级联回收（递归置 RECYCLED + 审计）。

### P2-9 列表/批量/统计的 N+1 与全表扫描

- **path:line**：`library.service.ts:138-141`（逐项 `toItem`，内部 `getNode`/`getVersion`/`userName`）、`:140`（每项 `auditCustodyRead` → `custodiesFor` → `prisma-store.ts:204-207` 全表 `findMany`）、`:536-557`（batch 每 id 重查 custodies）、`:561-596`（每租户遍历节点+版本）
- **触发**：大目录列表、代管视图、批量操作、平台统计。
- **影响**：`listCustodies()` 无 where，每次调用拉全表；列表页 N 项 × (若干查询 + 全表代管) → 延迟随租户数与授权数线性增长；`adminStats` 对全平台节点/版本做嵌套查询，租户多时不可用。
- **证据**：`listCustodies` 无过滤参数；`custodiesFor` 在循环内被反复调用；`adminStats` 双重循环 + 每 node `listVersions`。
- **建议**：`listCustodies` 支持 `tenantId/granteeUserId` 过滤；列表前一次取 custodies 传入 `toItem`；统计改聚合 SQL。属性能问题，不阻塞正确性。

### P2-10 上传大小上限两个来源不一致

- **path:line**：`library.dto.ts:148`（`Number(process.env.LIBRARY_MAX_FILE_BYTES || 20MB)`）、`library.limits.ts:31-36,41`（`positiveInt` 回落默认）
- **触发**：`LIBRARY_MAX_FILE_BYTES` 设为非法值（`abc`/`0`/负数）或空串。
- **影响**：multer 侧得到 `NaN`/`0`，行为随 multer 版本而异（可能不限流或全拒）；业务侧 `maxFileBytes` 回落 20MB。两处判定不一致 → 出现"拦截在 multer"或"放行到业务层"的偏差。`0` 在 multer 中通常被当作无限制。
- **证据**：`libraryUploadLimit` 直接 `Number()`，未复用 `positiveInt`；`limits.ts` 已导出唯一的合法解析。
- **建议**：`libraryUploadLimit` 改为 `libraryLimitsFromEnv().maxFileBytes`，或导出共用 `positiveInt` 并复用。

### P2-11 上传/批量的任意错误消息直返客户端，500 被映射成 400

- **path:line**：`library.controller.ts:115-119`（每文件 `error.message`）、`:552-554`（批量失败 `error.message`）、`:342-348`（`http()`：仅 403/404/409/410 有分支，其余含 500 全落 400）
- **触发**：Prisma 约束错误、磁盘错误、`SCOPE_DRIFT`（`service.ts:243`）、任何非预期异常。
- **影响**：客户端收到内部错误文本（表名/约束/路径等），可被用于探测；状态码 400 掩盖服务端故障，监控与重试策略失真。
- **证据**：两处 `error instanceof Error ? error.message`；`http()` 无 500 分支。
- **建议**：非 `LibraryError` 统一 `500` + 通用文案，详细错误只进日志；`http()` 增加 `status === 500` 分支（`InternalServerErrorException`）。

### P2-12 预览静默截断，`ask` 未纳入 `extractTruncated`

- **path:line**：`library.service.ts:369`（`slice(0, 20_000)`，响应无 `truncated` 字段）、`:493-533`（`ask` 的 `truncated` 只来自 prompt 拼接，未并入 `version.extractTruncated`）、对比 `:434-436`（`openCitation` 已并入）
- **触发**：大文档预览；解析阶段已标记 `extractTruncated` 的文档走 `ask`。
- **影响**：用户以为看到了全文/模型读了全文；`openCitation` 与 `ask` 对同一版本给出不一致的截断提示。
- **证据**：预览返回值无截断标记；`ask` 返回的 `truncated` 未引用 `version.extractTruncated`。
- **建议**：预览响应加 `truncated: text.length === 20_000`（或按实际切割判定）；`ask` 的 `truncated` 与 `truncationNote` 并入 `extractTruncated`，与 `openCitation` 对齐（设计文档要求截断明示）。

### P2-13 测试接线缺失，关键用例未进脚本

- **path:line**：`ground/apps/backend/package.json:12-13`（仅 `test:library`=flow、`test:library:db`=postgres）
- **触发**：CI/本地按脚本跑库测试。
- **影响**：`library.custody.spec.ts`（代管权限矩阵）与 `library.http.test.cjs`（真实 HTTP 鉴权矩阵）无 npm script，只靠 `local-handoff.md:28` 手工执行 → 回归时最关键的鉴权证据不被自动执行。
- **证据**：脚本清单无 custody/http 入口。
- **建议**：加 `test:library:custody`、`test:library:http`，并纳入统一 `test:library`（或 CI 任务）。

---

## 7. P3（小项，不影响主结论）

| # | path:line | 问题 | 建议 |
|---|---|---|---|
| P3-1 | `library.controller.ts:225` | `nodes/:id/source` 的 `versionId` 是必填 query，缺失时传 `undefined` 给 `getVersion`，Prisma 校验错 → 500 | 加 `@IsString()`/DTO 或显式 400 |
| P3-2 | `library.dto.ts:138-145`；`controller.ts:102,113` | `parentId` 仅 `@IsString()`，无长度/格式；`versionIds` 数组无上限 | 加 `@MaxLength`/`@ArrayMaxSize`，避免超长 ID 打 DB |
| P3-3 | `library.service.ts:587-589` | `recycledFiles`/`purgedFiles` 未过滤 `kind === 'FILE'`，文件夹被计入"文件"统计 | 加 kind 过滤 |
| P3-4 | `schema.prisma:902`（`current_version_id` 无 FK） | 版本删除/迁移后可能悬挂 | 评估加 FK 或清理任务；当前业务路径不会删 version，风险低 |
| P3-5 | `schema.prisma`（`LibraryChunk.tenantId` vs `LibraryVersion.tenantId`） | chunk 的 tenant 与 version 的 tenant 无 DB 级一致约束 | 写入侧已同源（`replaceChunks` 传 `version.tenantId`），可加复合唯一/触发器兜底 |
| P3-6 | `library.store.ts:122-156` vs `library.prisma-store.ts:89-115` | `MemoryLibraryStore` 不校验唯一、不重算 `versionNo`，测试替身语义弱于生产 | 测试替身对齐生产约束，或标注仅用于单元逻辑 |

### 维护性观察（不判定是否拆分）

- `library.service.ts` 单文件承载列表/上传/版本/回收/恢复/彻删/共享/代管/问答/统计/审计，职责宽；但控制器已薄、store 已抽象，拆分收益主要在**测试性与变更隔离**（如把 custody 编排、ask 编排独立）。是否拆由主会话决定。
- 重复实现：`library.limits.ts:31-36` 与 `library.dto.ts:148` 是同一 env 解析的两份实现（见 P2-10）；`store.ts` 与 `prisma-store.ts` 是同一接口的两套语义（见 P3-6）。
- 错误处理分散在 `controller.http()`、`service` 的 `LibraryError`、`parse.ts` 的返回状态三处，语义可读但边界不够单一。

---

## 8. 已核对无问题

| 项 | 证据 |
|---|---|
| 租户来自签名 JWT，客户端 tenantId 被拒 | `auth/jwt.guard.ts:59-60`；`main.ts:67` `forbidNonWhitelisted`；`test/library/library.flow.spec.ts:419-424` |
| 跨租户/非成员/他人私有一律 404，不泄漏标题正文 | `library.policy.ts:30-56`；`library.http.test.cjs:23-36` |
| 成员移除后旧 JWT 失效 | `controller.ts:319-332`（每次查 `orgMember`，`activeMember=false`）；`library.http.test.cjs:121-124` |
| 平台管理员默认只有统计，不继承成员读权；平台自授权被拒 | `service.ts:607-609`；`controller.ts:305-306`；`library.http.test.cjs:47-71` |
| 共享需 `confirmShare`；撤销后标题与正文都消失 | `service.ts:249-260`；`library.http.test.cjs:37-46` |
| 版本不可变，替换只追加；v1 替换 v2 后仍读 v1 | `service.ts:192-218`、`prisma-store.ts:102-115`；`library.flow.spec.ts:159-193`、`library.http.test.cjs:72-84` |
| 上传 node→version→chunk 同事务，失败删 blob | `prisma-store.ts:89-100`；`library.postgres.spec.ts:162-233` |
| 企业配额并发：advisory lock 串行 + 复核 aggregate | `prisma-store.ts:117-123`；`library.postgres.spec.ts:234-243` |
| ZIP 不解压、仅下载；HTML 纯文本渲染；DOCX 实体拒绝 + 16MB 展开上限；PE/ELF magic 拒绝 | `library.parse.ts`、`library.files.ts:24-42`；`library.flow.spec.ts:225-252` |
| 回收/恢复/彻删语义；彻删后 410 且不跳到新版本 | `service.ts:262-303`、`:408-441`；`library.flow.spec.ts:100-108` |
| 审计：grant/revoke/read 有 `AuditLog`；meta 不含标题/正文 | `service.ts:633-657`、`:880-883`；`adminStats` 仅汇总 |
| 平台统计不泄漏标题/正文/URL | `service.ts:559-596` 仅计数与字节 |
| Host 代理：连接鉴权先于取 token，白名单排除 admin，仅 Host 侧 Bearer，`no-store`，账号切换前后比对，401 触发 reject | `mammoth-agent/.../ground-library.ts:67-99` |

---

## 9. 未覆盖与原因

| 未覆盖 | 原因 |
|---|---|
| 运行测试/构建/HTTP 实测/真实 GUI/真实模型 | 角色禁用 shell；既有测试结论来自源码与测试文件阅读，不能冒充运行证据 |
| git 分支/HEAD/clean/迁移状态 | 无 shell；基线按任务声明，`local-handoff.md` 漂移仅记录 |
| 生产环境实际路由与卷挂载 | P1 为静态配置证据，未在生产验证 |
| 前端 Console/Admin 全量 UI | 仅抽查 `api/library.ts`、`Library.vue`、`LibraryCustodyApproval.vue`、`LibraryManagedBrowser.vue` |
| OIDC/billing/非 library 鉴权实现 | 作为依赖阅读，未扩 scope |
| Harness 内部模型调用链 | 超出本次"后端+鉴权"范围 |

## 10. 交接

- 建议主会话优先决策：**P1-A/P1-B 是否随本次发布修复**（部署侧两处小改，可独立于业务代码）。
- P2 中与安全语义最相关：**P2-1（回收链接 URL）**、**P2-2（代管审计）**、**P2-3（CRUD 边界）**；建议先定产品口径再改。
- P2-4/5/6 属一致性/可恢复性，建议合并为一个"资料库写入原子性"改动。
- P2-9/10/11/12/13 属工程质量，可按迭代处理。
- 是否拆分 `library.service.ts`、是否统一 `store` 语义，由主会话决定；本报告只给职责/耦合/测试性依据。