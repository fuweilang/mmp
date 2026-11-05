# 任务 — enterprise-ai-coin-billing（任务1）

- [x] OpenSpec：proposal / design / specs
- [x] Prisma：PlatformBillingConfig / TenantAiWallet / TenantAiLedger + migrate
- [x] BillingService：配置、钱包确保、调账、预检、按 token 扣费（幂等）
- [x] Admin API + 租户 billing API
- [x] 新建企业自动建钱包；seed 默认配置
- [x] Admin 前端：计费配置 + 调账
- [x] Octop cloud_llm：precheck + charge 挂钩
- [x] Web harness：MammothBillingPrecheckMiddleware + turn 后 charge（强制云端修订）
- [x] 本地验收说明（不 push）

## 任务2

- 已开 `openspec/changes/ai-coin-qr-topup/`
