# 阶段 A 重构 · 5.2 实施报告

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`（未 commit/push）
- 日期：2026-11-13（America/Los_Angeles）
- 范围：前端 `ground/apps/frontend`（admin 列表公共层、`AdminOfficialAgents.vue` 拆分、`api/admin.ts` 拆分）
- 未触碰：`mammoth-agent/`、后端业务源码、`.env`、数据库、已应用迁移

## 0. 结论

| 项 | 状态 | 新增文件 | 行数变化 | 验证 |
|---|---|---|---|---|
| 1) admin 列表公共层 | 完成（6/7 页；AdminModels 不适用） | `composables/useAdminTable.ts` | 6 页净 -159 行 | 11 组件测试通过；vue-tsc 0 |
| 2) 拆 `AdminOfficialAgents.vue` | 完成 | list + 5 组件 + 1 display + 1 composable | 2244 → 319（其中新增 8 文件 2470 行） | expert-editor 41 测试通过 |
| 3) 拆 `api/admin.ts` | 完成（barrel 保留） | `api/admin/` 11 文件 | 1414 → 16 + 1443 | vue-tsc 0；build 通过 |

验证汇总：`cd ground && pnpm run verify` **exit 0**；`vue-tsc --noEmit` **0 errors**；前端首屏 chunk **1,079.98 kB / 356.39 kB gzip**（基线 1,081.51 / 357.00，未回涨）；`test:library` **68 pass / 1 fail**（仅既有 `library.flow.spec.ts:357`）。

## 1. admin 列表公共层

### 1.1 新增
- `src/composables/useAdminTable.ts`（159 行）
  - `useAdminTable<T>`：`rows` 源 + 可选 `filter` → `filteredRows` / `pagedRows`（`(page-1)*pageSize` 逐字切片）、`hasActiveFilters`、`emptyText`（含 `errorText` 覆盖）、`resetPage` / `onPageChange` / `onPageSizeChange`；`clampOnShrink` 仅在技能页开启（保持原 `clampPage` watch 语义）。
  - `useAdminSearch`：`debounceMs` **按页传参**（350/300/500 保持原值）、`beforeSearch`（提交 draft 关键词）、`clearFilters`、`resetPage`、`runLoad`（与原“请求序号守卫 + finally 关 loading”同构）、`dispose`。
  - `useDebouncedCallback`：仅防抖（Roles.vue 无 loading/序号守卫，保持原样）。
- 未抽 `components/admin/table/AdminTableShell.vue`：7 页工具栏/空态/分页器 DOM 与类名各不相同（`user-toolbar`/`enterprise-toolbar`/`agent-toolbar`…），抽壳必须改类名或样式作用域，违反“不改样式类名”。已按“条件不成立”不建。

### 1.2 逐页改动
| 页面 | 防抖 | 接入 | 说明 |
|---|---|---|---|
| `AdminUsers.vue` | 350ms | table(20, name/phone filter) + search | `hasActiveFilters` 仍按 draft 判定 |
| `AdminEnterprises.vue` | 350ms | table(20, name/slug/status) + search | `onFilterChange` 仅 `resetPage`（原样） |
| `AdminOfficialSkills.vue` | 300ms | table(10, category, clamp) + search | `emptyText` 优先“技能加载失败”；`pageError` 行清空保持 |
| `AdminRoles.vue` | 500ms | table(10, keyword) + search | `reload` 仍无序号守卫（现状不改） |
| `AdminOfficialAgents.vue` | 350ms | table(10, 服务端筛选) + search | `pagedRows` 切 `rows`、`:total=rows.length` 原样 |
| `views/Roles.vue` | 500ms | table(paginate:false) + `useDebouncedCallback` | 无分页、`onReset` 不重载（原样） |
| `AdminModels.vue` | — | **不动** | 无分页/无防抖；空态基于 `flatRows` 而非筛选结果，套用会改语义 |

行数（git numstat，含 import 调整）：
`AdminUsers` +63/-78、`AdminEnterprises` +48/-63、`AdminOfficialSkills` +54/-55、`AdminRoles` +41/-51、`Roles.vue` +17/-14。

### 1.3 测试
`tests/admin-table.client.spec.ts`（312 行）+ `tests/admin-table.vitest.config.mjs`（13 行）
- 每页 4 断言（渲染行数 / 翻页切片 / 筛选请求或客户端过滤 / 空态文案）：
  `AdminUsers`、`AdminEnterprises`、`AdminOfficialSkills`、`AdminRoles`、`AdminOfficialAgentsList`、`Roles`
- 同配置并入既有 `admin-platform-membership.client.spec.ts`
- 结果：**Test Files 2 passed，Tests 11 passed**（新 6 + 既有 5）

## 2. `AdminOfficialAgents.vue` 拆分

### 2.1 文件与契约
| 文件 | 行数 | 职责 / 契约 |
|---|---|---|
| `views/admin/AdminOfficialAgents.vue` | 319 | 薄容器：页头、列表接线、批量下架确认、审计抽屉、Discovery 编辑、`provide(expertEditorResourcesKey)` 保留在此（provide 层级仍覆盖子树） |
| `views/admin/official-agents/AdminOfficialAgentsList.vue` | 413 | 纯展示列表（工具栏/状态统计/表格/空态/分页）。props：`rows,total,loading,statusCounts,keyword,statusFilter,hasFilters,currentPage,pageSize,canAuthor,highlightedId,selectedCount,bulkOfflineLoading,publishingId,previewingId,offlineId,deletingId`；emits：`update:keyword,update:statusFilter,search-input,search,reset,create,bulk-offline,viewer,discovery,edit,publish-records,preview,publish,offline,delete,selection-change,page-change,page-size-change`；`expose.clearSelection()` |
| `components/admin/official-agents/AgentEditorDrawer.vue` | 781 | 编辑器全量（个性化/元数据弹窗/执行配置/技能/草稿预览/试聊/校验/保存与保存并发布/脏值离开确认/beforeunload/技能详情）。props：`modelValue,agent(null=新建)`；emits：`update:modelValue,saved,created,published,discovery`；`expose.focusMissingField(), applyOpeningQuestions()` |
| `components/admin/official-agents/AgentVersionDialog.vue` | 109 | 发布记录/冻结依赖/回滚。props：`modelValue,agent,versions,loading,canAuthor,rollbackId`；emits：`update:modelValue,rollback` |
| `components/admin/official-agents/AgentPreviewDialog.vue` | 29 | 不可变预览（路径/过期/错误）。props：`modelValue,path,expiresAt,error` |
| `components/admin/official-agents/AgentViewerDialog.vue` | 401 | 只读查看（原页内 viewer 弹窗，为了让容器变薄一并迁出）。props：`modelValue,agent,discovery,loading` |
| `components/admin/official-agents/AgentAuditDrawer.vue` | 220 | 运营审计抽屉（原页内）。props：`modelValue,rows,loading`；emits：`refresh,full-audit` |
| `components/admin/official-agents/agent-display.ts` | 107 | `CATEGORY_LABELS/TOOL_SCOPE_LABELS/kindLabel/categoryLabel/toolScopeLabel/buildCapabilityLabels/statusLabel/statusType/formatDate/splitLines/collectPublishMissing`（原页面逐字搬移） |
| `composables/useOfficialAgents.ts` | 410 | 数据面：`rows/statusCounts/keyword/statusFilter/pagedRows/load`、`replaceRow`、`focusCreatedAgent`、`discoveryId/discoveryAgentStatus`、`highlightedId`、列表级预览、viewer、发布记录/回滚、`publish/offline/remove`、编辑器开合（`editorOpen/editorAgent/editingId/openCreate/openEdit`） |

行数：`AdminOfficialAgents.vue` +182/-2107（2244 → 319）；新增 8 文件合计 2470 行（含模板/样式搬运税）。类名与文案未改；`description`/`emptyText`/确认文案逐字保留。

### 2.2 状态归属
- `discoveryId`、`highlightedId`、`preview*`、`publishRecords*`、`viewer*`：全部在 `useOfficialAgents`（跨区状态上提，无全局 store）。
- 编辑器私有状态（`form`/`editorPreview*`/`iconDraft`/`metadataOpen`…）留在 `AgentEditorDrawer`；列表发布缺字段时由容器 `openEdit` + `nextTick` + `editorRef.focusMissingField()` 复现原“打开编辑器并定位字段”。
- `provide(expertEditorResourcesKey)` 保留在容器（provide 沿组件树向下，编辑器子组件仍能取到）。

### 2.3 测试
`tests/expert-editor.client.spec.ts`（既有，挂载真实 `AdminOfficialAgents` 容器）+ `agent-web-url`：
**Test Files 2 passed / Tests 41 passed**（覆盖打开编辑器、保存、保存并发布、试聊失败/重置/重发、头像暂存同步、知识文件刷新等原页面链路）。

## 3. `api/admin.ts` 拆分

### 3.1 结构
`src/api/admin.ts` → 16 行 barrel（`export * from './admin/*'`，33 个 import 点零改动）。
`src/api/admin/`：
| 文件 | 行数 | 内容 |
|---|---|---|
| `types.ts` | 18 | 跨域共享 `ExpertExecutionConfig` |
| `users.ts` | 102 | 用户类型 + `adminUserApi` |
| `enterprises.ts` | 55 | 企业类型 + `adminEnterpriseApi` |
| `roles.ts` | 87 | 角色/权限目录类型 + `adminRoleApi/adminPermissionApi/adminTenantRoleApi` |
| `billing.ts` | 364 | 计价/用量/钱包类型 + `adminBillingApi` |
| `audit.ts` | 45 | 审计类型 + `adminAuditApi` |
| `models.ts` | 137 | LLM 厂商/模型类型 + `adminLlmProviderApi` |
| `official-agents.ts` | 260 | 官方专家类型 + `adminOfficialAgentApi` |
| `official-knowledge.ts` | 81 | 官方知识库类型 + `adminOfficialKnowledgeApi`（`OfficialAgentKind` 从 official-agents 引入） |
| `official-skills.ts` | 93 | 技能类型 + `adminOfficialSkillApi` |
| `knowledge-core.ts` | 185 | knowledge-core 类型 + `adminKnowledgeCoreApi` |

偏差说明：任务列了 9 个域文件，实际导出中 `adminKnowledgeCoreApi` 与 14 个 `Knowledge*` 类型自成一体，硬塞 `official-knowledge.ts` 会混域，故按“按实际导出归位，不硬凑”拆为第 10 个域文件。

### 3.2 打包
`vite.config.ts` 增加 `build.rollupOptions.output.manualChunks`：把 `src/api/admin/**` 归并到单一 `admin-api` chunk。原因：barrel 拆分后 rollup 会为每个被多页共享的域各出一个 preload 文件（首屏 module map 变大，实测 +0.21 kB），归并后首屏反而**低于基线**且请求数不增加。

## 4. 验证（命令与结果）

| 命令 | exit | 结果 |
|---|---|---|
| `cd ground && pnpm run verify` | 0 | shared build + `vue-tsc` + `vite build` + `nest build` 全通过 |
| `cd ground/apps/frontend && npx vue-tsc --noEmit` | 0 | 0 errors（日志 0 行） |
| `cd ground && pnpm --filter @mammoth/frontend build` | 0 | `index-BkQFU0FL.js` **1,079.98 kB / gzip 356.39 kB**；`admin-api-*.js` 11.37 kB / 3.11 kB；>500 kB chunk 仍为 1（仅 index）；基线 1,081.51 / 357.00 |
| 新增/迁移前端测试（mammoth-agent vitest 4.1.11 + jsdom） | 0 | `admin-table.vitest.config.mjs`：2 files / 11 tests passed；`expert-editor.vitest.config.mjs`：2 files / 41 tests passed |
| `cd ground && pnpm --filter @mammoth/backend run test:library` | 1 | 68 pass / 1 fail，唯一失败仍为 `test/library/library.flow.spec.ts:357`（`DOWNLOAD_ONLY` vs `READY`，基线既有）；后端未改动 |

复现测试命令（必须从 `ground/apps/frontend` 运行，vitest 可执行文件复用 mammoth-agent）：
```
cd ground/apps/frontend
../../../mammoth-agent/node_modules/.bin/vitest run --config tests/admin-table.vitest.config.mjs
../../../mammoth-agent/node_modules/.bin/vitest run --config tests/expert-editor.vitest.config.mjs
```
环境注意：`pnpm --filter … build` 必须在 `ground/` 下执行；在仓库根执行会触发 pnpm 自身 OOM（与本次改动无关，根目录无 pnpm workspace）。

## 5. 未验与原因

1. 真实 GUI / 登录态页面链路（筛选、翻页、编辑器滚动、移动端折叠）：无可用浏览器身份与会话，仅做 jsdom 挂载 + 构建。
2. 桌面端 / `mammoth-agent` 门禁：本阶段禁止动该目录，未跑。
3. `test:*:db` / `test:*:http`：需隔离 DB/HTTP fixture，未跑（与基线一致）。
4. Element Plus 按需（P2-5）：不在本阶段范围。

## 6. 剩余风险

1. `manualChunks` 是新增构建配置（唯一非“搬运”改动）；若后续有人删掉，首屏会 +0.21 kB 且域 chunk 变多。已在 `vite.config.ts` 注释原因。
2. 头像加载失败缓存：原页面在保存后用 `delete brokenAvatarIds[next.id]` 清缓存；拆出后列表与查看弹窗各自持有 `brokenAvatarIds`（列表缓存仅在该行换 URL 后仍可能显示占位图标，需刷新页面）。影响面小，未改。
3. 新建专家保存后不再回读服务端归一化后的行（原实现 `await load()` 后取最新行）；现使用保存响应并交由列表刷新。试聊链路测试已覆盖，未见回归。
4. `AdminRoles.vue` 切 tab 时旧响应可能覆盖新 tab（既有缺陷，本次保持原样，未顺手修）。
5. 拆分的子组件各自复制了原页面 scoped 样式（类名未改）；若后续统一样式，需按组件边界合并，避免重复。

## 7. 交接
- 验收：秋池（组件挂载 + 构建体积 + 后端基线）
- 复审：浪哥（props/emit 契约、composable 语义、barrel 完整性）
- 主会话定稿：DeepSeek
