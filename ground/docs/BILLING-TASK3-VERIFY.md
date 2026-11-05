# 任务3验收：Admin / Console / Agent 展示

本地 only，未 push。OpenSpec：`openspec/changes/ai-coin-billing-display/`。

## 改动要点

### Admin
- 企业管理列表增加「AI币余额」列与「资金」入口（跳转 `/admin/billing?tenantId=`）
- `/admin/billing` 企业资金面板：余额汇总、充值单、按员工消耗、最近消耗流水
- API：`GET /admin/api/billing/enterprise-funds?tenantId=`

### Console
- 概况新增「AI币余额」卡片 + 余额不足告警 + 快捷入口
- `/console/billing` 增加流水筛选（类型/时间）
- API：`GET /console/api/billing/ledger`；workbench summary 含 `aiBalanceCoins`

### Agent（Octop dashboard）
- 侧栏展开态展示「企业名 · N AI币」
- Token 统计增加「约合 AI币」「企业 AI币余额」
- 对话前 billing precheck；402/不足文案指向中台充值

## 手测要点（任务1–3）

1. **任务1**：Admin 改倍率/N；调账；企业成员对话扣费；余额 0 → 402  
2. **任务2**：企业管理员 `/console/billing` mock 扫码；Admin 看充值记录  
3. **任务3**：  
   - Admin 企业列表余额；点「资金」看按员工  
   - Console 概况 AI币卡片；资金页流水筛选  
   - Agent 侧栏余额；Token 页约合 AI币；余额 0 时对话拦截文案清晰  

## 汇总（1–3）

| 任务 | 能力 |
|------|------|
| 1 | 钱包、配置、按 token 扣费、手动调账 |
| 2 | 扫码下单/QR/回调·轮询/mock 入账 |
| 3 | 三端展示与按员工报表 |

## 收尾修复（本轮）

- TokenUsage：`SummaryView` / `DimensionView` 补传 `approxAiCoins` / `aiBalance` props（避免子组件作用域未定义）。
- dashboard `tsc --noEmit` 通过。

## Console 流水 1:1（产品改版）

- 打开 `/console/billing` →「AI币流水」：无 Token 列
- `chat_consume` AI币 = 账本 `coins`（扣费侧 1 AI币=1 token，无 ×2 / 倍率 / N）
- 充值/调账行 AI币仍为账本原值
- Admin「售价倍率」仅对账估算；「1 AI币=N token」已隐藏，固定 1:1
- 本地 only，未 push

