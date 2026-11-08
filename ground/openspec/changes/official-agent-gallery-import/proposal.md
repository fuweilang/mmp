# official-agent-gallery-import

## Why

一期已有文案润色大师 + 企业资料答疑助手。latest 盘点出 20 个官方/内置智能体。产品决定**先做智能体广场货架，知识库产品后做**。需要把映射固化，并落地批次 A（无 KB）导入与上架。

## What Changes

- 固化 latest → MMP `official_agent`(+`version`) 映射表（20 个，批次 A/B/C/暂缓）。
- Ground 增加可版本控制的资产包 + 幂等导入草稿通路（不覆盖已发布管理员改动）。
- 批次 A 发布并给华为试点开通：`mammoth`、`c3274112ed041`；保留已有润色/答疑。
- 广场卡片最小对齐：name、summary、openingQuestions（已有则露出）；无图用占位/首字。

## Non-Goals

- 知识库页面与官方 KB 导入
- 带 KB 的 6 个（ip/gzh/niche/sell/method/interview）本迭代不发布
- 编排型 boss
- 缺工具的 data / spy
- git commit / push / PR / 宝塔发版

## Impact

- `ground/openspec/changes/official-agent-gallery-import/`
- `ground/apps/backend/src/official-agent/assets/`
- Admin 导入 API / seed / 脚本
- 广场 UI 极小对齐（可选首字头像）
