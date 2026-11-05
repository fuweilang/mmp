# design — enterprise-ai-coin-billing

## 账户与配置

| 实体 | 说明 |
|------|------|
| `PlatformBillingConfig` | 单行（id=`default`）：`sellPriceMultiplier`、`tokensPerAiCoin` |
| `TenantAiWallet` | 一企一账：`balanceCoins`、累计入/出 |
| `TenantAiLedger` | 流水：手动调账 / 对话消耗；幂等键唯一 |

默认值：`tokensPerAiCoin=1000`，`sellPriceMultiplier=1.5`。

## 扣费公式

整数 AI 币（禁止浮点余额）；**1 AI币 = 1 token**：

```
chargeCoins = floor(tokens)   # tokens<=0 → 0
```

`sellPriceMultiplier` 仅用于 Admin 成本/售价估算与对账，**不**乘入企业钱包扣费。`tokensPerAiCoin` 配置字段保留兼容，扣费侧固定 1:1。

平台管理员（`isPlatformAdmin`）或无 `tenantId` 会话 → 不预检、不扣费。

## 调用链（云端对话）

```
客户端 → Octop POST /api/cloud/v1/p/{provider}/chat/completions
  → 取 console handoff → ground POST /console/api/billing/precheck
  → 不足：402，不转发厂商
  → forward 厂商
  → 解析 usage.total_tokens（非流式 JSON / 流式末包）
  → ground POST /console/api/billing/charge（幂等键含 user+请求指纹）
```

## Admin / 租户 API

- `GET/PUT /api/admin/billing/config`
- `GET /api/admin/billing/wallets`、`GET .../wallets/:tenantId`
- `POST /api/admin/billing/wallets/adjust` `{ tenantId, deltaCoins, remark, idempotencyKey }`
- `GET /api/billing/wallet`、`POST /api/billing/precheck`、`POST /api/billing/charge`

网关：`/admin/api/*` → Nest `/api/admin/*`；`/console/api/*` → `/api/*`。

## 并发与幂等

- 扣减：事务内 `UPDATE ... WHERE balance_coins >= ?`；影响行 0 → 余额不足。
- 入账：`increment`。
- 流水 `idempotencyKey` unique；重复请求返回首次结果，不二次改余额。

## 与任务2/3衔接

- 任务2：扫码支付成功回调只调同一 `credit`/`adjust` 入账路径，流水 type=`qr_topup`。
- 任务3：可基于 ledger 做差价与企业用量统计，本 change 不写面板。
