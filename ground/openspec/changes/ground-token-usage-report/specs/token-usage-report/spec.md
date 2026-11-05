# token-usage-report

## Requirement: 按轮落库

Ground SHALL 提供 `token_usage_turn` 表，按对话轮次存储物理 token（模型、用户、企业、input/output/total）。

### Scenario: 上报成功

- **WHEN** 已登录企业成员通过 console handoff 调用 `POST /console/api/billing/reportTokenUsage`，且 body 含合法幂等键与 token 计数
- **THEN** 写入一行，`userId` 为 JWT 用户，`tenantId` 为当前会话企业（无则 null）
- **AND** 同幂等键再次调用 SHALL 不重复插入，返回首次结果

### Scenario: 上报不打断对话

- **WHEN** 中台不可达或返回 4xx/5xx
- **THEN** Octop 仅记日志，SHALL NOT 使本轮对话失败

## Requirement: Web/桌面挂钩

Octop Web 与桌面 harness 在每轮 `_record_turn_usage` 之后 SHALL best-effort 上报本轮用量（含 `clientKind`）。

### Scenario: 一轮对话结束

- **WHEN** 用户在 Web 或桌面完成一轮有 token 的对话
- **THEN** Ground 表新增对应行（有 handoff 时）

## Requirement: Admin 查询 Ground

Admin「企业 Token 统计」SHALL 以 `token_usage_turn` 为主数据源；响应 `source` 为 `ground_token_usage_turn`。

### Scenario: 打开页

- **WHEN** 平台管理员打开 `/admin/enterprise-token-stats`
- **THEN** 全平台/企业/成员合计来自 Ground 表已归属企业的轮次
- **AND** `tenantId` 为空或 PLATFORM 企业的行不计入
