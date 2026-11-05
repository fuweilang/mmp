# 任务1验收：企业 AI 币钱包 + 按 token 扣费

本地 only，未 push。OpenSpec：`openspec/changes/enterprise-ai-coin-billing/`。

## 改动文件（要点）

### ground
- `openspec/changes/enterprise-ai-coin-billing/**`
- `apps/backend/prisma/schema.prisma` + `migrations/20261030233000_enterprise_ai_coin_billing/`
- `apps/backend/src/billing/**`（config / wallet / adjust / precheck / charge）
- `apps/backend/src/app.module.ts`、`admin/admin.service.ts`（建企建钱包）、`auth/auth.service.ts`
- `apps/frontend/src/views/admin/AdminBilling.vue`
- `apps/frontend/src/api/admin.ts`、`router/index.ts`、`layouts/AppShell.vue`

### Octop
- `src/octop/infra/agents/providers/mammoth_billing.py`
- `src/octop/api/routers/cloud_llm.py`（预检 + 按 usage 扣费）

## 公式

`chargeCoins = ceil(tokens * sellPriceMultiplier / tokensPerAiCoin)`  
默认：倍率 `1.5`，`1 AI币 = 1000 token`。  
平台管理员 / 无 tenantId：免检免扣。

## 怎么验

1. DB：`pnpm --filter @mammoth/backend exec prisma migrate deploy`（本机已 apply）
2. 起栈：`pnpm dev`（网关 `http://127.0.0.1:5201`）
3. 超管登录 → `/admin/billing`：改倍率/N、对企业「调账」入账
4. API（Bearer 中台 JWT，`tenantId` 为企业成员）：
   - `GET /admin/api/billing/config`
   - `POST /admin/api/billing/wallets/adjust` `{tenantId, deltaCoins, idempotencyKey, remark}`
   - `POST /console/api/billing/precheck` → 余额 0 返回 **402**
   - `POST /console/api/billing/charge` `{tokens, idempotencyKey}` → 幂等
5. 云端对话：企业成员余额 0 时打 `/api/cloud/v1/p/{provider}/chat/completions` 应被预检拦住；有余额则结束后按 usage 扣流水 `chat_consume`

## 本轮已手测

- migrate OK；默认配置 1.5 / 1000；现有 2 家非平台企业已建钱包
- 超管调账入账 + 幂等 reuse
- 企业成员 charge `tokens=2000` → 扣 **3** AI币；同 key reuse；余额清零后 precheck **402**

## 任务2可接

扫码充值（微信/支付宝 QR）：下单 → 展示码 → 回调/轮询成功后入账。  
复用 `BillingService.adjustWallet` / 入账路径，流水 type 预留 `qr_topup`；不要另起余额字段。
