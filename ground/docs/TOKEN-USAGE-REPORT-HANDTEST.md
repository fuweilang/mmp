# 手测清单 — 任务2：对话轮次 Token 上报 Ground

本地 only，不 push。OpenSpec：`openspec/changes/ground-token-usage-report/`。

## 做了什么

1. Ground 表 `token_usage_turn`（模型 / 用户 / 企业 / input/output/total / 幂等键）
2. `POST /console/api/billing/reportTokenUsage`（JWT + tenant；幂等）
3. Octop Web/桌面每轮 `_record_turn_usage` 后 best-effort 上报
4. Admin `/admin/enterprise-token-stats` 主数据源改为 Ground 表（`source=ground_token_usage_turn`）
5. UI：`.ets-page` 背景 `#fff`、`padding: 5px`

## 前置

1. `cd ground && pnpm --filter @mammoth/backend exec prisma migrate deploy`
2. 重启 `pnpm dev` + `pnpm octop`
3. 企业成员已登录（有 console handoff）；超管另开窗口

## 手测步骤

1. **API 幂等**（企业成员 Bearer，网关 `http://127.0.0.1:5201`）：
   ```bash
   curl -sS -X POST http://127.0.0.1:5201/console/api/billing/reportTokenUsage \
     -H "Authorization: Bearer <企业成员JWT>" \
     -H "Content-Type: application/json" \
     -d '{"idempotencyKey":"QA_turn_manual_001","model":"deepseek-flash","inputTokens":100,"outputTokens":50,"totalTokens":150,"modelCalls":1,"clientKind":"web"}'
   ```
   - 首次：`reused=false`，库有行
   - 同键再发：`reused=true`，不双计

2. **真对话**：企业成员在 Web（或桌面）打一轮有回复的对话。
3. **DB**：`SELECT model,user_id,tenant_id,total_tokens,client_kind FROM token_usage_turn ORDER BY created_at DESC LIMIT 5;` 应见新行。
4. **Admin**：超管打开 `/admin/enterprise-token-stats`
   - 响应/页内语义 `source` 为 Ground 表
   - 全平台合计 / 企业行 / 成员抽屉能看到刚上报的用量
   - 按模型、日期过滤有效
5. **UI**：Token 统计页底背景为白，页面内边距约 5px（`.ets-page`）。
6. **权限**：非超管访问 enterprise-token-stats API → 403。
7. **无 handoff**：无中台登录的纯本地 Octop 对话可不报（只记日志），不炸聊天。

## 验收勾选

- [ ] migrate 成功，表 `token_usage_turn` 存在
- [ ] 上报 API 幂等
- [ ] Web/桌面一轮对话后 Ground 有行（有 handoff 时）
- [ ] Admin Token 页读 Ground，不再依赖本机 SQLite 作为主源
- [ ] `.ets-page` 白底 + padding 5px
- [ ] 本地未 push

## 说明

- 历史 SQLite：本地可跑 `cd apps/backend && node scripts/migrate-octop-usage-to-token-turns.mjs`（幂等；`idempotencyKey=octop-usage-log:{id}`）。无 SSO / Ground 无用户的行跳过；仅 PLATFORM 成员的行 `tenantId=null`，Admin 企业统计不计。
- AI 币扣费 / ledger 页未改。
