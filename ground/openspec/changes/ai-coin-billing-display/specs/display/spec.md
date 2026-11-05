## MODIFIED Requirements

### Requirement: Console AI coin ledger display (no Token column)

Console「AI币流水」SHALL 只展示 AI币等非 Token 字段；SHALL NOT 展示 Token 列。对话消耗 AI币列 SHALL 展示账本原值 `coins`（与扣费 1:1 一致）；SHALL NOT 对 `chat_consume` 做 ×2 / markup / N 换算展示。

#### Scenario: ledger columns

- **WHEN** 企业用户打开 `/console/billing` 的 AI币流水
- **THEN** 表格不含 Token 列
- **AND** AI币列展示账本 `coins`

#### Scenario: non-consume rows unchanged

- **WHEN** 流水类型为 `qr_topup` 或 `manual_adjust`
- **THEN** AI币列展示账本原值 `coins`（充值入账原样）
