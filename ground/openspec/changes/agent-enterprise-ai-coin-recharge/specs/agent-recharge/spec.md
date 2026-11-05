# Spec: Agent 企业 AI 币充值

## Requirements

### Requirement: Agent 侧栏充值入口

Agent Sidebar 在企业 AI 币余额旁 SHALL 提供「充值」入口；仅当钱包接口 `canRecharge=true` 时展示可点充值。

#### Scenario: 企业管理员可见

- GIVEN 用户为企业管理员且已绑定企业
- WHEN 打开 Agent 侧栏
- THEN 可见 AI币余额与「充值」

#### Scenario: 普通成员不可下单

- GIVEN 用户仅为企业成员
- WHEN 查看侧栏
- THEN 仍可见余额（若有），无充值按钮；直接调 create API 返回需要企业管理员

### Requirement: 入账为企业钱包

充值成功后 SHALL 增加当前企业 `TenantAiWallet.balanceCoins`，并写 `TenantAiLedger` `type=qr_topup`；Console billing 与 Admin enterprise-wallets 可见同一余额与流水。

#### Scenario: mock 入账

- GIVEN `PAY_PROVIDER=mock` 且非 production
- WHEN Agent 对订单 `payQr(channel=mock)`
- THEN 订单 confirmed，钱包余额增加 `aiCoins`

### Requirement: 企业资金文案

充值 UI SHALL 明确告知：资金进入**企业 AI 币钱包**，非个人账户。
