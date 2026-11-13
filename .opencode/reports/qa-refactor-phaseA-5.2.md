# 阶段 A 复验 · 5.2（秋池）

- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`（重构改动均未提交）
- 时间：2026-11-13 12:54–13:05 America/Los_Angeles
- 只读：未改源码、未 commit/push、未读 `.env`/凭据、未连库；新增仅为本地构建产物与 `/tmp/qa-probe` 探针
- 对照基线：`git show a01b1d59:ground/apps/frontend/src/views/admin/AdminOfficialAgents.vue`（2244 行）、`.../api/admin.ts`（1414 行）

## 结论表

| 项 | 判定 | 证据（命令 + 摘要） | 未通过：path:line + 修法 |
|---|---|---|---|
| 1 AdminOfficialAgents 拆分行为等价 | **通过（2 处行为差异 + 1 新问题）** | 筛选/防抖 350ms/空态/分页切片/状态统计/发布确认文案/回滚/删除/批量下架/预览路径+过期/脏值离开/请求序号逐项对照原文件一致；差异见 F2–F5 | 见 F2/F3/F4/F5 |
| 2 `api/admin.ts` barrel | **通过** | 导出符号 86=86 完全一致；65 个 URL 字面量一致；114 箭头函数/12 个 `admin*Api` 一致；`from '@/api/admin'` 41 文件（33 旧 + 8 新），旧文件 import 路径 `git diff` 0 处变更；`from '@/api/admin/` 深引用 0 处 | — |
| 3 `useAdminTable` 6 页套用 | **通过（1 处偏差）** | 防抖保留原值：Users 350/Enterprises 350/Skills 300/AdminRoles 500/Agents 350/Roles 500；空态文案逐字未变；`filteredRows.slice((p-1)*size, ...)` 与原公式一致；requestSequence/finally 语义一致；`AdminRoles` 仍无序号守卫（原样） | F2（Agents pageSize 变更时页码重置） |
| 3b `AdminModels` 未套用理由 | **通过** | `AdminModels.vue:30-45`：`filteredRows` 直接进表、无 pagination、空态基于 `flatRows.length` 而非筛选结果（`无匹配结果` vs 首屏空态），套用会改语义；确认无分页/无防抖 | — |
| 4 构建/类型/门禁 | **未通过（字面指标达成，首屏载荷超基线）** | `pnpm --filter @mammoth/frontend build` exit 0：`index-BkQFU0FL.js` **1,079.98 kB / 356.39 gzip**，>500kB 仅 1 个；`vue-tsc --noEmit` 0 errors；`cd ground && pnpm run verify` **EXIT=0**（/tmp/qa-verify-phaseA.log） | F1 |
| 5 测试断言强度 | **通过（1 条空转断言 + 覆盖缺口）** | `admin-table` 2 files/11 pass；`expert-editor` 2 files/41 pass。抽查强度：`expert-editor.client.spec.ts:126` 断言 `update('expert-one', {systemPrompt})` + 文案 + 无 iframe；`:307` 断言发布失败 toast + 输入未丢。空转：`admin-table.client.spec.ts:177` | F6/F7/F9 |
| 6a `brokenAvatarIds` 风险 | **成立（低）** | 原 `AdminOfficialAgents.vue:1233` 保存后 `delete brokenAvatarIds[next.id]`；现仅 `AdminOfficialAgentsList.vue:210,218` 与 `AgentViewerDialog.vue:176,207` 各自置 true，无清理点 | F5 |
| 6b `manualChunks` 风险 | **成立（中）** | 见 F1（首屏新增 11.37 kB preload + 1 请求） | F1 |

## 命令与结果

| 命令 | exit | 结果 |
|---|---|---|
| `ground && pnpm --filter @mammoth/frontend build` | 0 | index 1,079.98 kB / 356.39 gzip；`admin-api-C1tx8YYh.js` 11.37/3.11；>500kB 仅 index |
| `ground && pnpm run verify` | 0 | shared build + vue-tsc(0 errors) + vite build + nest build 全通过；日志 0 行 `error TS` |
| `apps/frontend && ../../../mammoth-agent/node_modules/.bin/vitest run --config tests/admin-table.vitest.config.mjs` | 0 | 2 files / 11 tests passed |
| 同上 `--config tests/expert-editor.vitest.config.mjs` | 0 | 2 files / 41 tests passed |
| 只读探针：同配置**去掉 manualChunks** 临时构建（`/tmp/qa-probe/vite.config.mjs`，未落仓库） | 0 | index **1,081,721 B / 355,930 B gzip**，`index.html` **无 modulepreload** |

## 发现

### F1（中，新引入）manualChunks 使首屏多预载 admin-api，报告数字口径有误

- 实际：`dist/index.html` 有 `<link rel="modulepreload" href=".../admin-api-*.js">`；`index-*.js` 从该 chunk 导入 `api/http.ts` 的请求函数（chunk 内 `function k(e,t){return $(P(e),t)}` 并被 entry 引用）。首屏 JS 合计 **1,079.98 + 11.37 = 1,091.35 kB（gzip 356.39 + 3.11 = 359.50）**、**1 个额外首屏请求**；基线 1,081.51/357.00 单请求。
- 预期：首屏载荷不高于基线。
- 探针（无 manualChunks）：index 1,081,721 B / gzip 355,930 B，且无 preload —— 说明当前 index 变小只是把 11.37 kB 挪到**同样首屏加载**的 chunk，报告「首屏反而低于基线」不成立。
- 证据：`ground/apps/frontend/vite.config.ts:8-19`；`dist/index.html`；`dist/assets/admin-api-C1tx8YYh.js`；`/tmp/qa-probe/dist-nochunk/index.html`。
- 修法：删除 `manualChunks`（代价仅 index +1.7 kB 原始/gzip 反而 -0.46 kB、少 1 请求），或仅在确认不会被 entry 静态引用时再分块，且不得把 `src/api/http.ts` 拉进 `admin-api`。

### F2（低，改了行为）官方专家页改 pageSize 会重置到第 1 页

- 原：`git show a01b1d59:...AdminOfficialAgents.vue:159-164` 只用 `v-model:current-page/page-size`，Element Plus 只在越界时 clamp，不重置页码。
- 现：`AdminOfficialAgentsList.vue:156` `@size-change` → `useAdminTable.ts:62-65` 无条件 `resetPage()`。
- 影响：第 2 页（10/页）切 20/页，原来停第 2 页，现在跳第 1 页。其余 5 页原本就重置，无需改。
- 修法：给 `useAdminTable` 加 `resetPageOnSizeChange?: boolean`，官方专家页传 `false`；或该页改回 `v-model:page-size`。

### F3（低，改了行为）新建/保存后不回读服务端归一化行 + “保存并发布”用 props 快照状态

- 原 `:1230-1243` 新建后 `focusCreatedAgent` + `await load()` + 重取行；`:1323` 用 `rows.value` 的最新 status 判断“已下架”。
- 现 `AgentEditorDrawer.vue:581` 仅 `emit('created', id)`（容器异步 `load()`），`current` 用创建响应；`:639` 用 `props.agent?.status` 快照。
- 影响：保存后编辑器内开场白不回填归一化结果；若列表状态在打开编辑器后变化，“保存并发布”的确认文案可能判错下架态。仅文案/回填，无数据错误。
- 修法：`created` 后由容器回传最新行（`replaceRow` + 更新 `editorAgent`），或 drawer 内 `await` 详情回读。

### F4（低，防御降级）列表操作守卫比原实现少

- 原 `:1363` `if (publishingId.value || saving.value) return;`；`:609` 预览 `if(!canAuthor.value)return;`；`:614` 回滚 `if(!canAuthor.value || !agent)return;`。
- 现 `useOfficialAgents.ts:123`（仅 publishingId）、`:234` 预览、`:328` 回滚（仅 agent）。
- 影响：按钮均 `v-if="canAuthor"`，UI 不可达；数据层缺纵深防御。
- 修法：三处补回 `canAuthor`/`saving` 守卫（`canAuthor` 由容器传入或 composable 接 `canAuthor: () => boolean`）。

### F5（低，新引入）头像加载失败缓存保存后不清理，换头像成功仍显示占位图标

- 原 `AdminOfficialAgents.vue:1233` 保存/换头像后 `delete brokenAvatarIds[next.id]`。
- 现 `AdminOfficialAgentsList.vue:210,218` 只写不清；查看弹窗 `AgentViewerDialog.vue:176,207` 同理（组件常驻）。
- 影响：确认只影响行内/查看弹窗的头像占位（`<img>` 被 `v-if` 拦截，改显 `UserRound`），不涉及接口/数据；但用户换头像成功后看到旧占位图标，会误判“上传失败”，需刷新页面。
- 修法：缓存键改 `id + ':' + avatarUrl`；或在 `replaceRow(next)` 时清 `next.id` 的 key（容器→列表 expose 一个 `resetAvatarError(id)`）。

### F6（低，测试空转）企业页筛选断言恒真

- `tests/admin-table.client.spec.ts:177` `expect(rowsOf('.enterprise-table').length).toBeLessThan(25);` —— 每页固定 20，任何情况都 <25。
- 修法：输入 `企业1` 后断言 `toHaveLength(11)`（企业1/10–19），或断言请求参数/首批可见行文本。

### F7（信息，死代码/文档偏差）技能页 `emptyText` 未使用

- `AdminOfficialSkills.vue:296` 解构 `emptyText` 但模板 `:102` 仍用内联 `pageError ? '技能加载失败' : ...`；行为未变，但报告里“emptyText 优先技能加载失败”与实现不符。修法：删解构或改模板用 `emptyText`（注意保留 `pageError` 重试按钮条件）。

### F8（信息，口径纠正）审计报告写 agents 防抖 450ms，实际原码 350ms

- `git show a01b1d59:...AdminOfficialAgents.vue:1042-1045` 为 350ms；`:1015-1017` 的 4500ms 是高亮消除。实现 `useOfficialAgents.ts:46-47` 保留 350ms ✓——按原码而非审计数字验收。

### F9（信息，覆盖缺口）

- 列表级“发布/回滚/批量下架/不可变预览”只有 composable 拆出后的间接覆盖（编辑器链路 41 例），无容器级断言；`pageSize 变更页码` 无测试。建议后续补（交李庚/王总实现，测试方案我可给）。

## 等价搬迁确认（逐项）

- 筛选：服务端 `list({keyword: trim, status})` 与原一致；空态 `hasFilters` 判定（`keyword.trim() || status!=='ALL'`）一致。
- 分页：`rows.length` 为 total、`(page-1)*pageSize` 切片、page-sizes `[10,20,50]`、skills 的 `clampPage` watch（flush sync）一致。
- 状态统计：`statusCounts` 直接取 list 响应，文案“全部/未发布/已发布/已下架”一致。
- 发布/回滚/下架/删除/批量下架：确认文案、按钮 loading 绑定、成功后 `replaceRow + load`、失败 toast 逐字一致；批量下架 `clearSelection` 通过 `expose` 接回。
- 预览路径过期：列表预览弹窗文案/到期时间/`previewHostLaunchUrl` 异常提示一致；编辑器试聊的 epoch/expired 判定/排队重发 `AgentEditorDrawer.vue:345-397` 与原 `:679-730` 逐字一致。
- 脏值离开 + beforeunload：`requestEditorClose` 与 `warnUnsavedEditor` 原样迁到 drawer，监听仍挂载（drawer 常驻）。
- 请求序号守卫：`runLoad` 与各页原 `sequence !== requestSequence` 逐分支对应；`AdminRoles` 原本无守卫，现状保持。
- 样式/类名：`.official-agents-page` 逐字一致；列表/弹窗各自 scoped 复制，类名未改。

## 未验与阻塞

1. 真实 GUI/登录态链路（筛选、翻页、编辑器滚动、移动端折叠）：无可用浏览器身份与会话，仅 jsdom 挂载 + 构建。
2. 后端 DB/HTTP 级测试（`test:library:db` 等）：需确认隔离库；本次未跑，不记通过。
3. `mammoth-agent`/桌面端：不在本阶段范围，未验。
4. 环境告警（非本次改动）：复验期间工作区出现他人的后端改动 `ground/apps/backend/src/library/{library.service.ts,library.admin.service.ts,library-domain.module.ts}`、`test/library/*.spec.ts` 及新文件 `library.context.ts`；我未触碰，`pnpm verify` 的 nest build 结果可能受其当时状态影响。

## 剩余风险

1. F1 不修则首屏多 11.37 kB 与 1 请求，且 `admin-api` 变更会让登录页也重新拉取该 preload。
2. F2/F3/F4 属轻微 UX/防御差异，已有报告记录但未修；不阻断本阶段。
3. F5 若不修，运营换头像后需刷新才能看到新图标（易被误报“头像上传失败”）。
4. `AdminOfficialAgents` 路由 chunk 109 kB；列表/编辑器/查看弹窗各自复制样式，后续统一样式需按组件边界合并，避免规则漂移。

## 交接

- 主会话 DeepSeek：F1 决定是否回退 `manualChunks`（建议回退）；F2–F6 是否本阶段修由你定。
- 李庚：F1（vite 配置）、F2/F4（composable 守卫与分页）、F5（头像缓存）、F7（死代码）。
- 浪哥：可复核 F3 编辑器状态快照与 F1 chunk 归属。
