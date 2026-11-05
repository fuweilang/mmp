# Agent 企业 AI 币充值 — 本地验收

## 前置

- `ground` 栈：`pnpm dev`（gateway `:5201` + api `:3100`）+ Octop Agent dashboard
- `apps/backend/.env`：`PAY_PROVIDER=mock`（本地立刻入账）；切真实支付改为 `PAY_PROVIDER=real`（保留微信/支付宝商户 env）
- 企业管理员账号（例：小米管理员）

## 任务覆盖

1. **契约**：`openspec/changes/agent-enterprise-ai-coin-recharge/`
2. **API**：`POST /api/billing/recharge/create` + `payQr`；成功走 `creditQrTopup` → 企业钱包；`GET /billing/wallet` 含 `canRecharge`
3. **Agent UI**：侧栏 AI币旁「充值」→ 弹窗文案明示入**企业** AI币
4. **mock**：见下方脚本结论

## 自动化（已跑通 2026-11-01 Asia/Shanghai）

企业管理员 cookie 登录 → channels.mockEnabled=true → create ¥1 → payQr(channel=mock) → status=confirmed →  
`TenantAiWallet` 增加 `aiCoins`；ledger `qr_topup`；`GET /admin/billing/wallets` 同余额；  
普通成员 create → 403「需要企业管理员」，`canRecharge=false`；  
gateway `http://127.0.0.1:5201/console/api/billing/wallet` 一致。

## 手测 Agent

1. 浏览器打开 `http://127.0.0.1:5201/agent`，企业管理员登录
2. 侧栏企业名下见 `AI币 · N` 与「充值」
3. 打开弹窗：见「进入当前企业 AI 币钱包…不是个人余额」
4. mock：点「模拟支付入账」→ 成功提示 → 侧栏余额刷新
5. Console `/console/billing` 与 Admin 企业钱包可见同一入账

## 切真实支付

```
PAY_PROVIDER=real
# 需重启 backend；微信/支付宝证书路径已在 .env
```
