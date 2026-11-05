# design — ai-coin-qr-topup

## 换算

`aiCoins = floor(amountYuan * aiCoinsPerYuan)`，默认 `aiCoinsPerYuan=1000`（1 元 = 1000 AI币）。  
配置挂在 `PlatformBillingConfig`。

## 数据

`AiRechargeOrder`：一单一码字段内嵌（orderNo、amountYuan、aiCoins、status、channel、outTradeNo、codeUrl、expireAt、transactionId、confirm 幂等键）。  
入账：`TenantAiLedger.type=qr_topup`，幂等键 `recharge:{orderNo}:confirm`。

## 支付

- 客户端逻辑参考 PeecAI `wechat-pay.client` / `alipay.client` / `pay-config`（env 键同名）。
- 本地：`PAY_PROVIDER=mock` → 模拟支付并入账，不调渠道。
- 入账只认 notify 验签或 query 成功；浏览器回跳不作入账依据。
- 网关：`/api/pay/*` 打到 ground（避免被 Octop `/api` 吃掉）。

## API

- `POST /api/billing/recharge/create` `{ amountYuan }`（企业管理员）
- `POST /api/billing/recharge/payQr` `{ orderId, channel: wechat|alipay|mock }`
- `POST /api/billing/recharge/status` `{ orderId }`（轮询，触发查单）
- `GET /api/billing/recharge/orders` 本企业
- `GET /api/admin/billing/recharge-orders` 全平台
- `POST /api/pay/wechatNotify`、`POST /api/pay/alipayNotify`（无登录，验签）
