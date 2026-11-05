# 任务2验收：AI 币扫码充值

本地 only，未 push。OpenSpec：`openspec/changes/ai-coin-qr-topup/`。

## 做了什么

1. 充值单 `AiRechargeOrder` + 配置项 `aiCoinsPerYuan`（默认 1 元 = 1000 AI币）
2. 微信 Native / 支付宝当面付客户端（只读参考 PeecAI，env 键同名；密钥在 `.env`，未提交）
3. 流程：创建订单 → `payQr` 出码 → notify/轮询查单 → `creditQrTopup` 入账（流水 `qr_topup`，幂等 `recharge:{orderNo}:confirm`）
4. 本地 `PAY_PROVIDER=mock` 可立刻入账
5. 企业控制台 `/console/billing`；总后台 `/admin/billing` 看充值记录
6. 网关 `/api/pay/*` → ground（回调不被 Octop 吃掉）

## 手测（本轮）

- mock：¥10 → 10000 AI币；余额 1000→11000；ledger `qr_topup`；Admin 列表可见
- channels：`mockEnabled=true`（且 PeecAI 镜像密钥后 wechat/alipay configured=true）

## 怎么验

1. `apps/backend/.env` 含 `PAY_PROVIDER=mock`（或真实微信/支付宝键）
2. `pnpm exec prisma migrate deploy`（迁移 `20261030240000_ai_coin_qr_topup`）
3. 重启 `pnpm dev`（加载新 env + PayModule；改网关后需重启 gateway）
4. 企业管理员登录 → `/console/billing` → 扫码充值 → 选「本地模拟」
5. 超管 `/admin/billing` 看「扫码充值记录」

## 任务3可接

- 差价核算面板（模型采购成本 vs 售价倍率 × token 用量）
- 企业 / 员工维度用量与充值统计、导出
- 充值档位套餐、发票、自动对账报表
- （可选）生产 notify 公网域名与渠道联调清单
