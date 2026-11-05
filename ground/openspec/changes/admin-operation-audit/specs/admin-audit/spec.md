# admin-audit

## Requirement: 独立 Admin 审计 API

平台 SHALL 提供 `GET /api/admin/audit`，聚合 Ground `audit_log` 全量（含 `tenant_id` 为空的平台操作），不得复用或放宽企业控制台 `GET /api/audit` 的租户边界。

### Scenario: 鉴权

- **WHEN** 调用方无有效会话或不具备 `portal.admin.audit`
- **THEN** 返回 401/403，且不得泄露其它企业审计行

### Scenario: 分页列表

- **WHEN** 具备 `portal.admin.audit` 的平台管理员请求列表
- **THEN** 返回 `{ total, page, pageSize, rows }`，默认按 `created_at` 降序
- **AND** 每行含 `enterpriseName`（平台行为「仅平台」或等价空企业文案）、`actorName`、脱敏后的 `meta`

## Requirement: 筛选

### Scenario: 企业

- **WHEN** 筛选某 `tenantId`
- **THEN** 仅返回该企业审计
- **WHEN** 筛选「仅平台」（约定值 `__platform__`）
- **THEN** 仅返回 `tenant_id IS NULL` 的行

### Scenario: 操作 / 操作者 / 时间

- **WHEN** 传入 `action`、操作者关键字、`from`/`to`
- **THEN** 分别按 action 精确、操作者姓名/手机/用户 id 模糊、创建时间窗过滤

## Requirement: meta 与脱敏

### Scenario: 折叠

- **WHEN** 前端展示列表
- **THEN** meta 默认折叠；用户可展开查看 JSON 文本

### Scenario: 敏感字段

- **WHEN** meta 含 password/token/secret/phone 等敏感键
- **THEN** API 返回值 SHALL 脱敏（如手机号中间打码、口令类替换为 `***`）

## Requirement: 菜单与权限

- **WHEN** 用户具备 `portal.admin.audit`
- **THEN** 总后台侧栏可见「操作审计」并进入 `/admin/audit`
- **AND** `portal.admin.audit` 仅出现在平台角色可分配目录（`portal_admin`），不进入企业角色硬顶
