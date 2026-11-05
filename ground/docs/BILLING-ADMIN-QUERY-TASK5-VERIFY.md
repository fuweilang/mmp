# 任务五验收：超管 Admin 查询对齐口径（本地 only）

## 范围

1. `/admin/enterprise-wallets`：余额列表、流水类型筛选、调账、meta 关键字段、充值订单筛选
2. `/admin/enterprise-token-stats`（别名 `/admin/token-stats`）：AI币以 `chat_consume` 实扣为准
3. 去掉写死 1000 / Token≈AI币 1:1 旧展示口径

## 自测步骤（小米企业）

企业 id：`cmvxwa7i60000gt7u7zmrrvbh`

1. 打开 `/admin/enterprise-wallets`，搜索「小米」→ 余额应等于该企业全部流水 `Σ(in) − Σ(out)`
2. 点进详情：类型筛选 充值/消耗/赠送/调账；消耗行「关键信息」含模型·tokens；充值行含订单号·渠道
3. 「扫码充值记录」Tab：可按状态筛选；列含企业/金额/币数/渠道/状态/时间
4. `/admin/enterprise-token-stats`：顶部「AI币实扣」= 同时间窗全部企业 `chat_consume.coins` 合计；点小米成员明细实扣合计 = 该企业 `chat_consume` 合计
5. 编译：`apps/backend` `tsc -p tsconfig.build.json --noEmit`；`apps/frontend` `vue-tsc --noEmit` + `vite build`

## 接口

- `GET /admin/billing/enterprise-funds?tenantId&page&pageSize&type`（type=recharge 含 qr_topup）
- `GET /admin/billing/enterprise-token-stats` / `detail`（返回 `consumedAiCoins`、`tokensPerAiCoin`、`aiCoinSource=ledger_chat_consume`）
- `GET /admin/billing/recharge-orders?tenantId&status&page&pageSize`（已有，UI 补状态筛选）

## 待拍板

- token-stats 时间窗：token_usage_turn 用 `occurredAt`，ledger 用 `createdAt`，极端时钟差可能有微小偏差
- 流水量极大时 overview 拉 chat_consume 上限 5 万行；若超限需改 groupBy/SQL 聚合
- `DEFAULT_AI_COINS_PER_YUAN` 默认已改为 50000（仅影响新建配置；库内已有值以 DB 为准）
