# 任务 — ai-coin-billing-display（任务3）

- [x] OpenSpec
- [x] Admin：企业列表余额 + 企业资金报表 API/UI
- [x] Console：概况 AI币卡片 + 流水筛选
- [x] Agent：侧栏余额、Token 约合、不足文案
- [x] 手测要点 + 1–3 汇总

- [x] Console「AI币流水」：去掉 Token 列；AI币展示账本原值（1:1，无 ×2）；OpenSpec 已同步（本地 only）

## 任务4（Admin 计费页收口）

- [x] 售价倍率 / 1元=N 文案；隐藏可编 1 AI币=N token
- [x] 企业详情抽屉：余额 / 流水 / 调账；充值入账用 floor(yuan×N)
- [x] 上游对账精简为链到 /admin/enterprise-token-stats
- [x] 本地验收 docs/BILLING-TASK4-VERIFY.md


## 任务5（余额拦截核对 + 对账文案 + 钱包流水分页）

- [x] 核对 Dashboard/Harness/cloud_llm precheck → 402 拦对话（本地 only）
- [x] Admin Token 统计 / 企业钱包：新扣费 Token ≈ AI币；旧流水不回填提示
- [x] 企业钱包抽屉流水分页 20–50（backend+frontend）；无横滚
- [x] docs/BILLING-TASK5-VERIFY.md
