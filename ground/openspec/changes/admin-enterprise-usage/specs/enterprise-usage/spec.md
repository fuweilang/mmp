# enterprise-usage

## Requirement: Admin 企业用量总览

平台管理员 SHALL 能在 `/admin/enterprise-usage` 查看各企业（非 PLATFORM）的 Token 合计、消耗 AI 币合计与笔数，数据来自 Ground `TenantAiLedger` 的 `chat_consume` 记录。

### Scenario: 打开企业用量页

- **WHEN** 平台管理员打开 `/admin/enterprise-usage`
- **THEN** 列表展示各企业 Token、消耗 AI 币、笔数、余额
- **AND** 页头展示全平台合计

### Scenario: 按时间过滤

- **WHEN** 管理员选择日期范围并查询
- **THEN** 合计与列表仅统计该时间窗内的 `chat_consume` ledger

## Requirement: 点进按成员

管理员 SHALL 能从企业用量列表或企业管理行进入某企业的成员消耗明细。

### Scenario: 成员明细

- **WHEN** 管理员点击某企业的「成员明细」或企业管理行「用量」
- **THEN** 展示该企业按成员汇总的 Token / AI 币 / 笔数（复用 enterprise-funds）
- **AND** 可查看最近消耗流水

### Scenario: 企业管理行入口

- **WHEN** 管理员在 `/admin/enterprises` 对非平台租户点击「用量」
- **THEN** 跳转到 `/admin/enterprise-usage?tenantId=<id>` 并打开该企业明细

## Requirement: 弱化上游采购单价

`/admin/billing` 的上游采购单价配置 SHALL 默认折叠，不抢主流程注意力；对账区块默认收起。
