# admin-operation-audit

Admin「操作审计」：跨全部企业 + 平台（`tenant_id` 为空）查看 `audit_log`；独立 `GET /api/admin/audit`，与企业控制台 `GET /api/audit` 分离。

## 范围（V1）

- 页：`/admin/audit`，侧栏「操作审计」
- 筛选：企业（含「仅平台」）、操作类型、操作者、时间范围
- 列表 + 分页；列含企业名；meta 默认折叠；敏感字段脱敏
- 权限：`portal.admin.audit`（仅平台角色包可授）

## 非目标

- 不改企业控制台 `/console/usage`
- 不导出、不详情深链、不实时推送
- 本地 only，不 push
