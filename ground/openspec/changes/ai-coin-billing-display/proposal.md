# ai-coin-billing-display（任务3）

Admin / Console / Agent 展示企业 AI 币余额、流水与约合用量。建立在任务1钱包与任务2扫码充值之上。

## 目标

1. Admin 企业管理列表显示余额；企业资金页看充值/消耗/按员工。
2. Console 概况展示 AI 币；资金页流水可按时间/员工筛选；衔接充值入口。
3. Agent 侧栏展示企业名+剩余 AI 币；Token 统计加「约合 AI币」；余额不足文案指向企业充值。

## 非目标

- 差价成本核算面板（可后续）
- 导出 Excel / 发票
- 不 push

## 补充（Console 流水展示）

Console「AI币流水」对 `chat_consume`：同笔 Token 用量按 **×2** 计算展示 AI 币消耗（`ceil(tokens × 2 / tokensPerAiCoin)`）；页面 **不写** 扣费/倍率公式。充值、调账行仍展示账本原值。本地 only，不 push。

