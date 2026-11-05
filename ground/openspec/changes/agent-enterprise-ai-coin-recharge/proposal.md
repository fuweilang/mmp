# agent-enterprise-ai-coin-recharge（Agent 企业钱包充值）

在 **Agent 页侧栏**（AI币附近）为企业管理员提供扫码/模拟充值入口。充值入账主体为 **企业 AI 币钱包**（非个人），与 `/console/billing`、`/admin/enterprise-wallets` 同一账本。

## 目标

1. 契约/文档：说明 Agent 入口、企业文案、mock/real 切换。
2. API：复用既有 `billing/recharge/*` + 支付回调 `creditQrTopup`；钱包快照增加 `canRecharge`。
3. Agent Sidebar：AI币旁「充值」+ 弹窗（金额档位、渠道、轮询；文案明示入企业 AI币）。
4. 本地 `PAY_PROVIDER=mock` 可立刻验入账；`real` 走猛犸微信/支付宝商户。

## 非目标

- 不改 PeecAI；不改桌面 shell（除非 Agent dashboard 必需）。
- 不做个人钱包、退款、发票。
- 不 push / 不默认上宝塔。

## 成功标准

- org_admin（或企业 OWNER/ADMIN / 平台管理员）可在 Agent 侧栏充值。
- mock 入账后 console/billing 与 admin 企业钱包余额/流水可见 `qr_topup`。
- 非管理员见提示，不可下单。
