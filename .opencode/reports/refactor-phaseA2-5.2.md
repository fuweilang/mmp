# 阶段 A 复验修复 · 5.2（李庚）

- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，基线 HEAD `a01b1d59`（重构改动仍未提交）
- 时间：2026-11-13 13:02–13:10 America/Los_Angeles
- 范围：只改 Ground 前端（`ground/apps/frontend`）；未 commit/push/部署，未读 `.env`/凭据，未连库
- 依据：`.opencode/reports/qa-refactor-phaseA-5.2.md` F1/F2/F4/F5/F6/F7

## 结论表

| 编号 | 状态 | 文件:line | 验证 | 风险 |
|---|---|---|---|---|
| F1 回退 manualChunks | 已修 | `vite.config.ts`（删除原 8–19 行 `build.rollupOptions.output.manualChunks`，文件回到 HEAD 形态，`git diff` 为空） | 重建后 `dist/index.html` 仅 1 个 entry script、**无 modulepreload**、**无 admin-api chunk**；`index-hZCs5JYD.js` **1,081,721 B**、`gzip -6` **355,927 B**；>500 kB chunk **1** | 无（等于基线形态） |
| F2 改 pageSize 不再跳第 1 页 | 已修 | `composables/useAdminTable.ts:33,69`（新增 `resetPageOnSizeChange`，默认 true）；`composables/useOfficialAgents.ts:54` 传 `false` | 仅类型/构建验证；越界由 Element Plus clamp（`element-plus/es/components/pagination/src/pagination.mjs:249-251,263-265`：`pageCount` 缩小时 setter 收敛并 emit `current-change`，容器 `onPageChange` 回写） | 低：无自动化用例（QA F9 覆盖缺口），真实翻页未在 GUI 实测 |
| F4 恢复列表操作守卫 | 已修 | `useOfficialAgents.ts:135`（publish：`!canAuthor() \|\| publishingId \|\| isSaving()`）、`:247`（preview）、`:342`（rollback）；`AgentEditorDrawer.vue:688` 暴露 `isSaving`；`AdminOfficialAgents.vue:177-179` 传入 | `vue-tsc` 0；`expert-editor` 41 pass | 低：drawer `v-if="canAuthor"`，`isSaving` 缺省 false |
| F5 头像失败缓存 | 已修 | `official-agents/AdminOfficialAgentsList.vue:56,213-219,227`（键 `${id}:${avatarUrl}`）；`AgentViewerDialog.vue:17,179-185,216` 同法 | 构建/类型通过；换头像后 url 变化即重新尝试加载（不再需刷新） | 低：同一坏 url 仍不重试（与原行为一致） |
| F6 企业页筛选断言 | 已修 | `tests/admin-table.client.spec.ts:177-178` → `toHaveLength(11)` | 见下方变异证据：变异后红（14≠11），还原后 11 pass | 无 |
| F7 技能页 emptyText 死代码 | 已修 | `views/admin/AdminOfficialSkills.vue:291-297`（删除解构 `emptyText`，模板仍用内联 `pageError` 文案） | `vue-tsc` 0；`admin-table` 技能页用例 pass | 无 |

## 验证命令与结果

| 命令 | exit | 结果 |
|---|---|---|
| `ground/apps/frontend && pnpm run typecheck` | 0 | `vue-tsc --noEmit` 0 errors（无输出） |
| `ground && pnpm run verify` | 0 | shared build + vue-tsc + vite build + nest build 全通过；日志 `/tmp/refactor-phaseA2-verify.log`，`grep -c "error TS"` = 0 |
| `ground && pnpm --filter @mammoth/frontend build` | 0 | `index-hZCs5JYD.js` 1,081.72 kB / vite 报 357.11 kB gzip；`AdminOfficialAgents-DH-7dzfC.js` 109.63 kB |
| `stat -f %z dist/assets/index-*.js` | 0 | **1,081,721 B**（= 基线探针值） |
| `gzip -6 -c dist/assets/index-*.js \| wc -c` | 0 | **355,927 B**（≤ 355,930 目标；vite 控制台报 357.11 kB 为其自身 gzip 记账口径，原始字节与基线一致） |
| `grep -o 'assets/[A-Za-z0-9_-]*\.js' dist/index.html` | 0 | 仅 `assets/index-hZCs5JYD.js`，无 preload |
| `ls dist/assets \| grep -c '^admin-api'` | 0 | **0**；`find dist/assets -size +500k` → 仅 `index-*.js`（**1 个**） |
| `vitest run --config tests/admin-table.vitest.config.mjs` | 0 | 2 files / **11 passed**（与复验一致，未减） |
| `vitest run --config tests/expert-editor.vitest.config.mjs` | 0 | 2 files / **41 passed**（未减） |

### F6 变异证据

1. 变异：`AdminEnterprises.vue` 的 name 过滤改为 `if (name && row.name.toLowerCase().includes(name)) return false;`（反转）
2. 结果：`vitest ... -t "AdminEnterprises"` → **FAIL**：`AssertionError: expected [...(14)] to have a length of 11 but got 14`（spec:178）
3. 还原：恢复 `!row.name...`；`grep -rn "F6-MUTATION" src` 无残留；全量 `admin-table` **11 passed**

## 未验与原因

1. 真实 GUI（点翻页改 pageSize、头像 `@error` 后换图、非授权账号守卫）：无浏览器身份/会话，仅 jsdom + 构建，不记通过。
2. F2 无自动化用例（该页无容器级测试；QA F9 已记录覆盖缺口）。
3. 截图/DOM 级头像占位回归未验，改用键策略（`url` 变更即失效）保证语义。
4. `mammoth-agent`/桌面端不在范围。

## 剩余风险

1. vite 控制台 gzip 记账（357.11 kB）与 `gzip -6` 实测（355,927 B）口径不一致，验收以原始字节 1,081,721 B 与 `gzip -6` 为准；建议后续报告统一 `gzip -6`。
2. `saving` 守卫依赖 drawer `defineExpose().isSaving()`；drawer 若改为非 `v-if` 常驻也无影响，若移除 expose 则守卫静默退化为放行（有默认值兜底）。
3. F3（保存后不回读归一化行、“保存并发布”用 props 快照）按本次指令未修，仍在 QA 报告中。
4. 工作区仍有他人后端改动（`library/**` 等），本次未触碰；`verify` 的 nest build 结果基于当时状态。

## 改动清单（path:line）

- `ground/apps/frontend/vite.config.ts`：删除 manualChunks（回到 HEAD，git diff 空）
- `ground/apps/frontend/src/composables/useAdminTable.ts:27-34,67-70`
- `ground/apps/frontend/src/composables/useOfficialAgents.ts:20-35,44-56,135,247,342`
- `ground/apps/frontend/src/views/admin/AdminOfficialAgents.vue:177-180`
- `ground/apps/frontend/src/components/admin/official-agents/AgentEditorDrawer.vue:684-689`
- `ground/apps/frontend/src/views/admin/official-agents/AdminOfficialAgentsList.vue:55-60,209-219,226-228`
- `ground/apps/frontend/src/components/admin/official-agents/AgentViewerDialog.vue:16-21,176-185,215-217`
- `ground/apps/frontend/src/views/admin/AdminOfficialSkills.vue:291-297`
- `ground/apps/frontend/tests/admin-table.client.spec.ts:175-178`

## 交接

- 秋池：复验 F1 首屏数字（raw/gzip -6/无 preload）、F2 手工改 pageSize、F5 换头像、F6 断言强度。
- 浪哥：复核 F4 `isSaving` 暴露与 F5 缓存键策略；`vite.config.ts` 已回到无 `manualChunks` 状态。
- 主会话 DeepSeek：F3 未修（未列入本次指令），是否跟进请裁决。
