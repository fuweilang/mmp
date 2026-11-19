# 专家分类与能力标签前台渲染

用户要求：前端的专家分类渲染必须跟着后台「分类」字段走；「能力标签」在卡片和详情都要显示。

## 决策

- 前台分类 = 后台 6 个分类原样（常用/工作提效/内容营销/销售增长/专业知识/数据分析），废弃 9 组能力映射。
- 内置专家的 key 表不再覆盖分类，只保留 `industries` 供（已隐藏的）行业筛选。
- `category = null` 归入「未分类」（`uncategorized`），不并入「常用」。
- 能力标签：手填在前、工具推导在后，API 最多返回 8 个；卡片展示前 3 个，详情全部展示。
- 不改数据库枚举，不做数据迁移；旧客户端遇到新 id 自动不显示分类 chip。

## 改动

- `ground/apps/backend/src/official-agent/catalog-discovery.ts`
  - 删除 `CATEGORY_TO_CAPABILITY`，新增 `UNCATEGORIZED_EXPERT_CAPABILITY`。
  - `discoveryOf('expert')` 由 `category` 决定 capability；`industries` 仍取 key 表。
  - `catalogDiscoveryWhere('expert')` 改为 `category` 等值筛选（未分类 → `category: null`），技能分支不变。
- `ground/apps/backend/src/official-agent/gallery-presentation.ts`
  - `buildPublicCapabilities` stored-first；上限 3 → 8。
- `ground/apps/frontend/src/components/admin/official-agents/agent-display.ts`
  - 管理端「查看专家」能力标签顺序对齐 stored-first。
- `ground/apps/backend/scripts/gallery-v2-preservation.mjs`
  - facet 统计传 `{key, category}`，避免全部落入未分类。
- `mammoth-agent/packages/client/ui-official-agent-gallery/src/client/`
  - `skill-facets.ts`：`EXPERT_CAPABILITIES`（9 组）→ `EXPERT_CATEGORIES`（6 分类 + 未分类）。
  - `GalleryPage.tsx`：专家 chip 用新分类；卡片显示分类 chip + 最多 3 个能力标签；详情新增「能力标签」区块；移除卡片行业 tag。
  - `locales.ts`：新增 `categoryUnset`、`capabilityTagsLabel`（zh/en，其余语言继承 en）。
  - `GalleryPage.module.css`：`.detailTags` 标签行。
- 测试：`ground/apps/backend/test/gallery-presentation.unit.test.ts`、`official-agent-publish-validation.unit.test.ts`；
  `mammoth-agent/.../tests/gallery-page.client.spec.tsx`。
- 文档：`docs/design/expert-plaza-skills-ui-spec.md` §3.3/§3.4 同步。

## 验证

- 后端单测：11 passed（gallery presentation + category discovery）。
- 客户端 gallery 测试：`gallery-page.client.spec.tsx` 28 passed。
- 同包其余测试：3 个失败为改动前既有问题（starter-draft / expert-preview-assembly，已用 stash 对比确认与本次改动无关）。
- 类型检查：`tsc --noEmit -p packages/client/ui-official-agent-gallery/tsconfig.json` exit 0；ground frontend `pnpm typecheck` exit 0。
- 未执行：真实数据下的浏览器验收（开发栈需要数据库隧道）；未提交、未推送、未部署。
