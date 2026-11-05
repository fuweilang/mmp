# 任务5验收：余额拦截 + Token/扣费对账说明（本地 only）

## 范围

1. **余额不足拦截对话**（端到端核对，未改核心逻辑）
2. **Token vs 扣费对账口径**：Admin 文案明确新流水 Token ≈ AI币（1:1）
3. 承接任务4遗留中与本批相关的钱包抽屉流水分页（见企业钱包改动）

## A. 余额不足拦对话（已有链路核对）

| 层 | 路径 | 行为 |
|----|------|------|
| Dashboard 发送前 | `Octop/dashboard/.../mammothConsole.ts` → `prepareMammothChatTurn` → `POST /console/api/billing/precheck` | 402/`INSUFFICIENT` → `blocked` 文案，不发 turn |
| Chat hook | `useChat.ts` 读 `prepared.blocked` | 展示拦截消息 |
| Octop Web harness | `MammothBillingPrecheckMiddleware.abefore_agent` → `billing_precheck` | 402 → `OctopError` 402 |
| Octop cloud_llm | `cloud_llm.py` 转发前 `billing_precheck`；流结束 `tee_stream_and_charge` | 预检硬拦；流后 charge 失败仅日志（下次 precheck 拦） |
| Ground | `BillingService.precheck` / `charge` | 余额 `< required` → HTTP 402 + `INSUFFICIENT_AI_COINS` |
| 扣费公式 | `BillingService.chargeCoins` | `floor(tokens)`，**1 AI币 = 1 token**；售价倍率 / `tokensPerAiCoin` 不参与 |

手测建议：

1. 超管把某企业钱包调到 **0**
2. 该企业成员登录 Agent 发一句 → 应被拦截（Dashboard 或 harness 其一即可）
3. 调账入账后再发 → 可正常对话；钱包流水出现「对话消耗」，`deltaCoins` ≈ `-tokens`

## B. Token vs charge 对账

- **不做**独立大对账页（任务4已链到 Token 统计）
- Admin 文案：
  - `/admin/enterprise-token-stats`：新扣费 Token ≈ AI币 1:1
  - `/admin/enterprise-wallets`：侧栏提示 + 详情抽屉「旧流水可能偏小、不回填」
- API：`enterprise-funds` 返回 `notes.chargeRule` / `notes.legacyLedger`

## C. 企业钱包本批（用户批准 A）

- 列表：余额 AI币 + 累计入账/消耗；**无 Token余额列**
- 详情抽屉 `720px`；流水表收窄列宽 + `overflow-x: hidden`（无横滚）
- 流水分页：后端 `page`/`pageSize`（20–50）+ `ledgerPage.total`；前端 `el-pagination`；**不一次拉全量**
- 旧小 `deltaCoins`：**不回填**；抽屉 info 提示

## 改动文件

- `apps/backend/src/billing/billing.service.ts`
- `apps/backend/src/billing/admin-billing.controller.ts`
- `apps/frontend/src/api/admin.ts`
- `apps/frontend/src/views/admin/AdminEnterpriseWallets.vue`
- `apps/frontend/src/views/admin/AdminEnterpriseTokenStats.vue`
- `docs/BILLING-TASK5-VERIFY.md`
- `openspec/changes/ai-coin-billing-display/tasks.md`（轻量勾选）

## 仍留给后续（leftovers）

- 真机微信/支付宝回调对账与失败单人工补入
- 上游成本估算独立报表（采购单价 × Token）
- Console 发票/导出
- 去掉 API 兼容字段 `tokensPerAiCoin`（前后端一起收）
- 清理本地 `.bak-20261031*` 备份（`AdminEnterpriseTokenStats.vue.bak-*`）
- `AdminEnterpriseUsage.vue` 仍在仓库（路由已重定向到 Token 统计，可择机删除）
