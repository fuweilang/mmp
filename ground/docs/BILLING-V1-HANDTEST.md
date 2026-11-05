# 第一版手测：PeecAI 风格充值 UI + DeepSeek/Kimi 对账

本地 only，未 push。OpenSpec：`openspec/changes/ai-coin-qr-ui-and-reconcile/`。

## 前置

1. `apps/backend/.env`：`PAY_PROVIDER=mock`（或已配微信/支付宝）
2. 在 `ground/`：`pnpm exec prisma migrate deploy`（含 `20261031160000_vendor_unit_prices`）
3. `pnpm dev` + `pnpm octop`；浏览器只开 `http://127.0.0.1:5201`

## A. Console 充值 UI（照搬 PeecAI）

1. 企业管理员登录 → `/console/billing`
2. 点「扫码充值」：应出现档位金额卡片（100/500/2000/…）+ 自定义金额 + 预计 AI 币
3. `PAY_PROVIDER=mock`：点「模拟支付」→ 成功提示 → 余额增加、充值记录 `confirmed`、流水 `qr_topup`
4. 若配置了微信/支付宝：表单底栏出品牌按钮 → 进入支付步出码 → 轮询入账；关闭弹窗不取消已付订单
5. 「继续支付」可对 `pending` 单恢复弹窗

**不做**：席位/年费套餐入口。

## B. Admin 对账（页布局见 `BILLING-ADMIN-UI-HANDTEST.md`）

1. 超管 → `/admin/billing`：顺序为「计价配置」→「企业资金」→「上游对账」折叠
2. 配置区可改 DeepSeek/Kimi 输入/输出采购单价（¥/1M tokens，默认 2 / 8）
3. 企业资金主表可「详情 / 调账」；充值记录在同卡 Tab
4. 「上游用量对账」折叠：按时间查 → 按厂商 / 按模型 Tab；文案说明与 Octop / 厂商账单可能不一致需人工对

## C. 与 Octop TokenUsage 交叉

1. Agent 侧栏 → Token 统计 →「按模型」
2. 对照 Admin 对账页的 DeepSeek/Kimi 拆分（本系统 ledger vs Octop usage_log）
3. 再与 DeepSeek / Kimi 厂商控制台账单人工对；差异属预期（缓存、失败重试、未入库调用等）

## 假设（默认可改）

| 厂商 | 输入 ¥/1M | 输出 ¥/1M | 成本估算 |
|------|-----------|-----------|----------|
| DeepSeek | 2 | 8 | tokens×(in+out)/2/1e6（ledger 无 IO 拆分） |
| Kimi | 2 | 8 | 同上 |
| other | — | — | 成本记 0 |

精确 IO 请用 Octop `GET /api/admin/usage/summary?granularity=by_model`。
