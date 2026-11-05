# admin-enterprise-usage

Admin「企业用量」：各企业 Token / AI 币总消耗，点进按成员拆分；企业管理行内入口。数据复用 Ground `TenantAiLedger`（与 Octop 扣费同源）。可弱化 `/admin/billing` 上游采购单价展示。

## 非目标

- 不改 Octop 个人 Token 统计页
- 不导出 Excel
- 本地 only，不 push

> **区分（2026-10-31）**：物理 Token 对账见 `admin-enterprise-token-stats`（`/admin/enterprise-token-stats` ← Octop `usage_log`）。本 change 页面保留为 **AI币/ledger** 企业用量，不改为 usage_log。

> **Deprecated 2026-10-31 方案 A**：前端菜单与路由已并入 `/admin/enterprise-token-stats`（重定向）；API `GET /admin/billing/enterprise-usage` 可保留供对账，但不再作为独立 Admin 页入口。
