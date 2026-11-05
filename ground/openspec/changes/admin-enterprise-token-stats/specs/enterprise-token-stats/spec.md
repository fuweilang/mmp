# enterprise-token-stats

## Requirement: 物理用量数据源

Admin「企业 Token 统计」SHALL 仅聚合 Octop `usage_log`（input/output/total tokens、turns、model），不得以 Ground `TenantAiLedger` 作为本页主数据源。

### Scenario: 打开页

- **WHEN** 平台管理员打开 `/admin/enterprise-token-stats`
- **THEN** 页头展示全平台合计（total/input/output tokens、turns；仅含已映射到企业成员的用量）
- **AND** 响应 `source` 为 `octop_usage_log`

## Requirement: 企业下钻

平台管理员 SHALL 能查看各非 PLATFORM 企业的物理 Token 合计，并点进按成员拆分。

### Scenario: 企业列表

- **WHEN** 管理员查看企业一览
- **THEN** 每行含企业名、Token 合计、input/output、笔数
- **AND** 成员归属通过 Octop `users.sso_subject` = Ground `user.id` 与 `OrgMember` 映射；无企业成员映射的用量 SHALL NOT 展示为「未归属企业」桶，且 SHALL NOT 计入全平台 totals / byModel / 企业列表

### Scenario: 成员明细

- **WHEN** 管理员打开某企业明细
- **THEN** 展示该企业成员的物理 Token / input / output / 笔数

## Requirement: 时间与模型

### Scenario: 时间过滤

- **WHEN** 管理员选择日期范围（Asia/Shanghai 自然日）并查询
- **THEN** 合计与列表仅统计该窗内 `usage_log.ts`

### Scenario: 模型过滤

- **WHEN** 管理员选择某一模型（或清空为全部）
- **THEN** 仅统计 `usage_log.model` 匹配的行
- **AND** 页内提供可选模型列表（来自 usage_log distinct）

## Requirement: 统一企业用量页（2026-10-31 方案 A）

Admin SHALL 仅保留 `/admin/enterprise-token-stats` 作为企业用量入口；页面同时展示 Token 与 AI币（AI币 = floor(tokens)，与 `BillingService.chargeCoins` 一致）。旧 `/admin/enterprise-usage` 菜单 SHALL 移除，路由 SHALL 重定向至本页。Console 企业侧仍只展示 AI币、不展示 Token。

## Requirement: 企业名/品牌本地过滤

页内企业列表 SHALL 支持按企业名称或品牌（slug）本地过滤；输入 debounce 500ms；回车立即应用过滤并取消未触发的 debounce；清空立即恢复全量。过滤不触发重新拉取 Octop 数据。

### Scenario: 输入 debounce

- **WHEN** 管理员在「按企业名称 / 品牌过滤」输入框连续输入
- **THEN** 停止输入 500ms 后应用过滤并重置到第 1 页

### Scenario: 回车立即搜索

- **WHEN** 管理员在过滤框按下回车
- **THEN** 立即应用当前输入为过滤条件（取消 pending debounce）并重置到第 1 页
