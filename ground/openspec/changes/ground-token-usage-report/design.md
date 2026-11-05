# design — ground-token-usage-report

## 表 `token_usage_turn`

| 字段 | 说明 |
|------|------|
| userId | Ground 用户（JWT sub） |
| tenantId | 会话企业；无则 null（不入企业统计） |
| model / inputTokens / outputTokens / totalTokens / modelCalls | 本轮物理用量 |
| threadId / agentId / source / clientKind | 上下文；clientKind=`web`\|`desktop`\|`unknown` |
| idempotencyKey | 唯一；重复上报返回首次 |
| occurredAt | 轮次时间（默认 now） |

## 上报链

```
Web/桌面对话结束
  → Octop processor._record_turn_usage（仍写本地 usage_log）
  → best-effort POST /console/api/billing/reportTokenUsage
      Bearer=console handoff
      body: model, tokens..., threadId, agentId, clientKind, idempotencyKey
  → Ground 用 JWT userId + tenantId 落库
```

桌面与 Web 均在 harness 轮次结束上报（与扣费分流不同：扣费桌面走 cloud_llm，上报两边都走 processor）。

## Admin 查询

`enterpriseTokenStatsOverview/Detail` 改为聚合 `token_usage_turn`：
- 仅 `tenantId` 非空且企业 `type != PLATFORM`
- 时间窗 Asia/Shanghai 自然日过滤 `occurredAt`
- 可选 model 过滤
- `source` 响应字段 = `ground_token_usage_turn`

任务1 `octop-usage.reader.ts` 保留，不再作为该页主路径。

## 历史迁移（本地）

`apps/backend/scripts/migrate-octop-usage-to-token-turns.mjs`：
- 读 `OCTOP_HOME/octop.db`（或 `OCTOP_SQLITE_PATH`）`usage_log`
- `sso_subject` → Ground `user.id`；`tenantId` = 最早非 PLATFORM `org_member`（否则 null）
- `idempotencyKey` = `octop-usage-log:{id}`；`createMany(skipDuplicates)` 可重复跑
- 跳过：无 SSO / Ground 无对应用户 / 零 token
- `DRY_RUN=1` 只统计

```bash
cd ground/apps/backend && node scripts/migrate-octop-usage-to-token-turns.mjs
```
