# 企业资料库前端审查（Console / Admin / 终端 Web / desktop 插件）

- 时间：2026-11-08（America/Los_Angeles）
- 性质：静态只读审查；未改业务源码，未执行 shell，未跑测试/类型检查
- 审查人：浪哥（代码审核）

## 1. 范围

| 面 | 文件 |
|---|---|
| Console 页面 | `ground/apps/frontend/src/views/Library.vue`、`layouts/AppShell.vue`、`router/index.ts`、`utils/libraryNavigation.ts` |
| Console 组件 | `components/LibraryCustodyApproval.vue`、`components/LibraryManagedBrowser.vue` |
| Admin | `views/admin/AdminLibrary.vue` |
| Console API | `api/library.ts` |
| 终端插件 | `mammoth-agent/packages/client/ui-enterprise-library/src/client/{LibraryPanel.tsx,index.ts,api.ts,selection.ts,locales.ts}` |
| 多选 UI | `mammoth-agent/packages/client/ui-commands/src/client/{popup.ts,PopupSelectView.tsx,contract.ts}` |
| Host 代理 | `mammoth-agent/packages/credentials/deepseek-account-platform/src/ground-library.ts` |
| 注册链路 | `mammoth-agent/packages/bundle/web-app/{cordis.patch.yml,package.json}`、`tsconfig.client.json` |
| 后端契约（仅核对调用面） | `ground/apps/backend/src/library/{library.service.ts,library.ask.ts,library.parse.ts,library.types.ts}` |
| 测试 | `ground/apps/frontend/tests/library-navigation.test.ts`、`mammoth-agent/packages/client/ui-enterprise-library/tests/*`、`ui-commands/tests/popup-selection.spec.ts` |
| 设计约束 | `ground/openspec/changes/enterprise-library-local/{design.md,tasks.md,local-handoff.md}` |

## 2. 基线

- 分支：`3.0`（`.git/HEAD` 内容 `ref: refs/heads/3.0`）
- HEAD：`964dfca2f5528737a23977047a110eb982736aa5`（`.git/refs/heads/3.0`）
- 工作区是否 clean：**未验证**（无 shell，不执行 git 命令）；handoff 里的“未提交 37 路径”是历史状态，不能作为当前依据。
- handoff 记录的 `95a1a61e` / `88656a65` 与当前 HEAD 不一致，已按当前 HEAD 审查。

## 3. 结论

- **P0：0 项**
- **P1：1 项**（代管授权重复提交，撤销后仍有有效授权）
- **P2：7 项**（搜索请求风暴、视图内新建不可见、取消/撤销确认、截断未明示、预览串内容、可维护性/测试）

---

## 4. P1

### P1-1 代管批准无去重，重复点击会产生多条有效授权；撤销一条后另一条仍生效

- 证据：
  - `ground/apps/frontend/src/components/LibraryCustodyApproval.vue:22` 批准按钮仅在 `busy` 时禁用，成功后 `busy` 立即复位。
  - `ground/apps/frontend/src/components/LibraryCustodyApproval.vue:32-36` `approve()` 成功后只 `await show()`，**不清空表单、不清空 `expiresAt`、不关闭对话框**。
  - `ground/apps/backend/src/library/library.service.ts:598-642` `grantCustody` 只校验权限/原因/到期，**没有“相同 grantor+grantee+scope+owner 且未撤销”去重**，每次 `insertCustody` 都是新记录（`:619-632`）。
- 触发：用户点“明确批准只读代管”成功后，再次点击（或慢网下连点）。
- 影响：产生两条或多条内容相同、到期时间相同的有效授权，且各自独立 `revokedAt`。撤销列表中一条后，另一条仍允许代管读取；审计里出现多条 grant，管理员容易误判“已撤销干净”。属于授权生命周期正确性问题，不构成越权（grantee/scope 相同）。
- 依据：`listCustody`（`library.service.ts:671-675`）会返回全部未过滤记录，UI 也逐行展示；`revokeCustody`（`:644-649`）只改单行。设计文档要求“明确批准、可撤销、审计可追溯”，重复有效授权与该语义冲突。
- 建议（交主会话决策）：前端成功后重置 `form.reason`/`expiresAt` 或直接关闭对话框；后端在 `grantCustody` 内对同键未撤销记录做幂等返回或显式 409，并在测试中覆盖“连续批准两次→只一条有效”。

---

## 5. P2

### P2-1 搜索每输入一个字符即发一次列表请求（Console 还每键写一次路由）

- 证据：
  - `ground/apps/frontend/src/views/Library.vue:17-25` 有显式“搜索”按钮，输入框只绑定 `v-model="keyword"`，未做防抖/回车提交。
  - `ground/apps/frontend/src/views/Library.vue:178-181` `keyword` 是写路由的 computed，每次输入 `router.replace`。
  - `ground/apps/frontend/src/views/Library.vue:204-209` `watch([view, parentId, keyword])` 每次变化 `reload()`；`:217-232` 无防抖。
  - `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx:196` `onChange` 直接 `setQuery`；`:80-90` `query` 在 effect 依赖里，每次输入重新请求。
- 触发：连续键入关键词。
- 影响：N 个字符 = N 次列表请求 + N 次路由 replace；大租户/慢网下请求堆积、历史记录噪声，与“搜索按钮”语义不符。已有 `listSequence`（`Library.vue:203,218-229`）和 `AbortController`（`LibraryPanel.tsx:81-89`）避免旧响应覆盖，故非数据错误。
- 建议：前端 300ms 防抖或改为回车/按钮提交后再同步 query；路由 `replace` 同样延后。

### P2-2 “最近使用/企业共享”视图内上传或新建链接后，新资料不出现在当前视图，且与新建文件夹行为不一致

- 证据：
  - `ground/apps/frontend/src/views/Library.vue:261` 上传、`:286-288` 新建链接均直接在当前 `parentId` 下创建。
  - 后端新建默认私人：`library.service.ts:755-764`（`scope: 'PRIVATE'`）。
  - 列表过滤：`library.service.ts:123-130`，`shared` 只返回 `ENTERPRISE`，`recent` 只返回 `recentAt` 命中项；新上传/新链接尚未被 `touch`，不会命中。
  - 对比：新建文件夹成功后 `Library.vue:279` 会 `router.push('/console/library/mine')`，而上传/新建链接不跳转（`:264-266`、`:288-292` 只 `reload()`）。
- 触发：在“企业共享”或“最近使用”视图点上传/新建链接。
- 影响：操作成功但列表无变化，用户误以为失败并重复上传；同类操作行为不一致。
- 建议：统一策略——要么成功后跳“我的资料”并提示“已保存为私人，可在我的资料查看”，要么在当前视图给出明确引导；若产品要求“共享视图内新建即共享”，则需显式确认后传 `scope=ENTERPRISE`，不能隐式改变默认私人语义。

### P2-3 确认框取消产生未处理 rejection；Admin / 代管撤销无二次确认

- 证据：
  - `ground/apps/frontend/src/views/Library.vue:326-329` `share()` 的 `await ElMessageBox.confirm(...)` 在 try 外，取消即 reject。
  - `ground/apps/frontend/src/views/Library.vue:347-355` `purgeOne()`、`runBatch('purge')` 同样在 try 外。
  - `ground/apps/frontend/src/views/admin/AdminLibrary.vue:92-101` 撤销单击即执行，无确认。
  - `ground/apps/frontend/src/components/LibraryCustodyApproval.vue:18,37` 表格“撤销”按钮无确认，单击即 `revokeLibraryCustody`。
- 触发：确认框点“取消”；或误点撤销。
- 影响：取消路径产生 unhandled promise rejection（控制台报错、监控噪声）；撤销是一次不可逆的授权终止（`revokeCustody` 只写 `revokedAt`），误点后只能重新批准。无数据破坏。
- 建议：确认框统一 `try/catch` 静默取消；撤销加二次确认并提示“已发生的阅读不会抹掉”。

### P2-4 提交给模型的资料摘录被截断时，前端丢弃 `truncated/truncationNote`，只给泛化提示

- 证据：
  - 后端 `openCitation` 明确返回 `truncated` 与 `truncationNote`：`ground/apps/backend/src/library/library.service.ts:426-437`。
  - 插件 `mammoth-agent/packages/client/ui-enterprise-library/src/client/api.ts:97-106` 只取 `name/versionId/locator/quote`，**丢弃 `truncated/truncationNote`**。
  - `selection.ts:113-121` 的 `librarySourceText` 固定写 “This is a bounded stored excerpt…”，不区分本次是否截断。
- 触发：文件正文超过 `askMaxChars` 或解析阶段已 `extractTruncated`，而用户仍引用该版本。
- 影响：设计 `design.md` 要求“截断必须明示”，当前只泛化说“bounded”，模型无法判断“是否读完全文”，可能给出覆盖全文的结论；用户也看不到本次摘录不完整。
- 建议：`api.ts` 保留 `truncated`/`truncationNote` 并校验类型；`librarySourceText` 在 `truncated` 时输出后端给定的明确提示（或等价固定文案）；补一条截断场景测试。

### P2-5 手动预览失败时保留上一个文件的内容；版本号展示用原始 `versionId` 而非 `versionNo`；预览标题用列表缓存名覆盖服务端名

- 证据：
  - `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx:143-146` `openSource` 请求前不 `setSource(undefined)`；失败由 `run`（`:108-113`）设置 `error`，但 `source` 仍是上一次的值。弹窗由 `source !== undefined` 控制（`:249`），因此会继续显示上一个文件的标题/正文，同时主区报错。
  - `LibraryPanel.tsx:250` 显示 `source.versionId`（原始 id），而 `preview` 已返回 `versionNo`（`library.service.ts:336`）且 `Source` 类型已有 `versionNo`（`:23`）。
  - `LibraryPanel.tsx:145` 用列表缓存 `item.name` 覆盖服务端 `result.name`。
- 触发：先预览 A，再预览 B 且 B 失败；或查看版本预览。
- 影响：弹窗内容与用户点击的目标不一致，容易误读来源；“版本”一行显示无意义 ID 而非 vN。引用链路的固定版本校验在 `api.ts:98-100` 仍在，故不影响提交正确性，属展示/交互缺陷。
- 建议：请求前清空 `source`（或只在成功时切换并有 loading）；版本行改用 `versionNo`，缺失时回退；标题使用服务端返回名，缓存名仅作为 fallback。

### P2-6 代管浏览单次预览失败即清空整张列表

- 证据：`ground/apps/frontend/src/components/LibraryManagedBrowser.vue:25` `catch` 中 `items.value = []`。
- 触发：某一条预览因权限撤销/到期/文件不可读失败。
- 影响：一次预览错误让整个授权范围列表变空，用户无法继续浏览其它资料；与“仅当前项不可读”的实际语义不符。`load()`（`:24`）清空列表是合理的（授权整体失效），但 `preview()` 复用了同一处理。
- 建议：`preview` 失败只清 `source` 并显示错误，不动 `items/breadcrumb`；仅列表接口失败时清空。

### P2-7 可维护性与测试覆盖

- 证据与说明：
  - `ground/apps/frontend/tests/library-navigation.test.ts:19-38` 用 `readFileSync` + 正则断言源码字符串（`AppShell`、`perm`、`redirect`、`<aside>` 不存在），并未执行路由或菜单逻辑；改写法即可能假红/假绿，`query/hash` 保留与切换行为没有行为级测试。
  - `mammoth-agent/packages/client/ui-enterprise-library/tests/draft-send.client.spec.ts:15-19` 跨仓库直接 import `ground/apps/backend/src/library/*`；测试与另一仓库源码路径强耦合，后端移动文件即断。
  - `mammoth-agent/packages/client/ui-enterprise-library/src/client/selection.ts:54-56` `stageLocalFile` 仅测试使用，生产无调用（死代码）。
  - `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx` 单文件混合列表/面包屑/上传/替换/新建/重命名/移动/版本/预览/选择/弹窗（约 250+ 行），状态多且相互影响，单测只能整体驱动。
  - `LibraryPanel.tsx:60-77` 十余个独立 `useState` 与多个 `useEffect` 依赖叠加（`:80-107`），新增视图/操作时容易漏依赖。
- 影响：回归保护偏弱；文件大本身不是缺陷，但职责耦合提高了修改风险。
- 建议（是否拆分交主会话）：导航测试改为调用路由/工具函数的行为断言；跨仓库依赖改为本仓库 fixture 或明确的测试契约；删除或内联 `stageLocalFile`；`LibraryPanel` 可按“列表/浏览”“编辑/新建”“预览/版本”“选择”拆子组件，状态仍由面板持有。

---

## 6. 已核对无问题的关键点

| 项 | 证据 |
|---|---|
| Console 二级菜单为子路由，权限 `portal.console.access` | `router/index.ts` 中 `/console` children + `consoleLibraryViews.map`；`AppShell.vue` 菜单 `children: consoleLibraryViews` |
| 旧 `/library` 兼容且保留 query/hash，不可任意外跳 | `router/index.ts` `redirect: to => ({ path: consoleLibraryEntry(to.query.view), query: to.query, hash: to.hash })`；`libraryNavigation.ts:16-18` 白名单回退 mine |
| 父菜单只展开、不重复页内分类栏 | `AppShell.vue` `toggleLibraryGroup` / `aria-controls`；`Library.vue` 无 `<aside>` |
| 各分类切换保留 query | `Library.vue:170-181` 以路由 query 为唯一来源；`libraryLocations`/watch 按 view 重载 |
| 单/多选 chips 可移除、不自动发送、保留输入文字 | `LibraryPanel.tsx:208-210`；`ui-commands/popup.ts` `confirmSelection` 仅回调；`draft-send.client.spec.ts` 覆盖 |
| 多选需显式确认，失败保留选择可重试 | `PopupSelectView.tsx` 底栏确认；`popup-selection.spec.ts` |
| 无会话时创建真实 Session | `index.ts` `workspaceForNewSession()` + `sessions.create({ workspaceId, agentPreset: 'standard' })` + `retain`；`apply.client.spec.ts` 覆盖 |
| 提交前经 codec `/open` 重新授权，不信任 chip 里的文本 | `index.ts:185-196` 按 `parseLibraryRef` 重新 `fetchLibrarySource`；`api.ts:98-100` 校验 `versionId` 与请求一致 |
| `/open` 失败保留草稿 | codec 抛错路径不清 draft；`draft-send.client.spec.ts` 覆盖“open 前不请求”“失败保留文字” |
| v1 替换 v2 后仍提交 v1 | `draft-send.client.spec.ts` 固定版本场景；后端 `openCitation` 严格校验 `version.nodeId/tenantId`（`library.service.ts:419-420`） |
| 来源点击固定版本预览 | `LibraryPanel.tsx:143-146` 传 `versionId`；版本列表逐版本传 `version.id`（`:247`） |
| 无权/撤销时清空预览、不显示缓存标题/URL | `LibraryPanel.tsx:99-107` 先 `setSource(undefined)`，失败只留 error；`401/403/409` 时清 items/source/versions（`:85-88`）；`panel.client.spec.tsx` 覆盖 |
| 临时附件不入库 | 附件与资料库引用是两条路径；插件仅在用户“用于对话”时 `attach` 引用，未发现上传临时文件到 `/files` 的自动调用 |
| Host 同源代理白名单/连接鉴权/账号切换冲突 | `ground-library.ts` 路由白名单、`/ground-library` 连接鉴权、409 账号切换；55MB 上限 |
| 终端 `origin=''` 走 Host 同源 | 设计选择，与 desktop `watchBundles:false` 一并判定为设计内行为，不报缺陷 |
| Console 列表请求竞态 | `Library.vue:203,218-229` 序号守卫；插件 `AbortController`（`LibraryPanel.tsx:81-89`） |

## 7. 未覆盖与原因

| 未覆盖 | 原因 |
|---|---|
| 真实浏览器 GUI、窄屏/折叠菜单、Element Plus 弹窗焦点 | 无 shell、未启动服务；只做静态审查 |
| 真实 Web / Electron desktop 窗口与窄屏布局 | 同上 |
| 正式 Session 持久化与重放 | 未运行应用；仅有测试文件证据 |
| 真实 Ground 云模型回答与云池解析 | 未调用模型，不读凭据 |
| 真实浏览器 cookie、SSO、账号切换 409 | 未启动服务 |
| 测试/类型检查/lint 实际结果 | 未执行命令；报告不声称测试通过 |
| 工作区是否 clean、未提交文件 | 无 shell，未执行 git 状态 |
| 后端完整授权矩阵（仅核对前端调用到的路径） | 超出本次前端范围 |

## 8. 实际动作

- 使用 `read` / `grep` 读取上表文件与 `.git/HEAD`、`.git/refs/heads/3.0`；未执行 shell，未修改业务源码。
- 本报告为唯一写入文件：`.opencode/reports/review-library-frontend.md`。

## 9. 剩余风险与交接

- P1-1 修复涉及前端表单复位 + 后端幂等/去重，需主会话决定后端是否改契约并补测试；本报告未改代码。
- P2 中 P2-4（截断明示）与设计文档直接冲突，建议优先于其它 P2。
- 测试替身、源码正则断言、静态阅读均不能替代真实 GUI / 持久会话 / 真实模型验收；上线前仍需真实环境走查。
- 是否拆分 `LibraryPanel.tsx` 及模块化 `Library.vue`，交主会话按排期决定。