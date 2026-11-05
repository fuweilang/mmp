# admin-enterprise-token-stats

Admin「企业 Token 统计」：物理用量来自 **Octop `usage_log`**（真实 DeepSeek/Kimi 调用），按 **猛犸全平台 → 企业 → 成员** 下钻；支持时间窗与模型筛选。

## 与旧「企业用量」的区分

| 页 | 路由 | 数据源 | 用途 |
|---|---|---|---|
| **企业 Token 统计**（本 change） | `/admin/enterprise-token-stats` | Octop `usage_log` | 物理 token 对账（厂商控制台） |
| 企业用量（旧） | `/admin/enterprise-usage` | Ground `TenantAiLedger` chat_consume | AI 币扣费侧；含余额/流水 |

冲突时 **不替换** 旧页数据源；新建 Token 统计页。旧页文案标明「AI币/ledger」，并链到本页。

## 非目标

- 不改 Octop 个人 Token 统计页（企业用户仍隐藏真实 Token，见既有产品约定）
- 不导出 Excel
- 不把 AI 币余额混进本页主指标
- 本地 only，不 push

> **2026-10-31 任务2**：Admin 主数据源已切到 Ground `token_usage_turn`（见 `ground-token-usage-report`）。本 change 描述的 SQLite 直读为任务1实现；reader 文件保留。

> **2026-10-31 方案 A**：合并旧「企业用量(AI币)」菜单；本页表格加 AI币列（1:1 floor）；成员抽屉加宽约 720px 且含 Token+AI币、无横向滚动。
