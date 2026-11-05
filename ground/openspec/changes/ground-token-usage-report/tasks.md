# 任务 — ground-token-usage-report

- [x] OpenSpec（proposal / design / specs / tasks）
- [x] Prisma：`TokenUsageTurn` + migration `20261031180000_token_usage_turn`
- [x] Backend：`POST /billing/reportTokenUsage`（幂等落库）
- [x] Backend：Admin Token 统计改读 Ground 表
- [x] Octop：轮次结束后上报（web+desktop）
- [x] 手测清单 `docs/TOKEN-USAGE-REPORT-HANDTEST.md`
- [x] AdminEnterpriseTokenStats：`.ets-page` 背景白、padding 5px
- [x] 本地 only，停等验收
- [x] 历史：本机 `usage_log` → `token_usage_turn` 幂等脚本 `apps/backend/scripts/migrate-octop-usage-to-token-turns.mjs`（本地 only）
