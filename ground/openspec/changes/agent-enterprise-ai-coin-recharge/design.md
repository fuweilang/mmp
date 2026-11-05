# design — agent-enterprise-ai-coin-recharge

## 账户

入账路径与任务2相同：`AiRechargeOrder` → 支付成功 → `BillingService.creditQrTopup` → `TenantAiWallet` + `TenantAiLedger.type=qr_topup`。

## 权限

下单/出码：`requireOrgAdminTenant`（平台管理员直通；`org_admin` 角色；或 `OrgMember` OWNER/ADMIN）。

钱包 `GET /billing/wallet` 增补 `canRecharge: boolean`，供 Agent 侧栏显隐，避免猜角色。

## Agent UI

- Sidebar 品牌卡：企业名 + `AI币 · N` + 「充值」链接（仅 `canRecharge`）。
- 弹窗文案：**充值金额将进入当前企业 AI 币钱包，供本企业成员对话共用，不是个人余额。**
- 交互对齐 Console：档位金额、自定义、微信/支付宝二维码或 `mock` 一键入账、状态轮询。
- 调用：`/console/api/billing/recharge/*`（handoff token，与现有 `mammothConsole` 一致）。

## 支付切换

| `PAY_PROVIDER` | 行为 |
|---|---|
| `mock`（非 production） | `payQr(channel=mock)` 立即入账 |
| `real`（默认本地可配） | 微信 Native / 支付宝 precreate；回调 `/api/pay/*` |

猛犸商户沿用 env：微信 `1451634202` / AppID `wxf93c1356875f7604` 等。
