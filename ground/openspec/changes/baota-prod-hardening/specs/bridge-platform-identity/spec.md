# bridge-platform-identity

## Requirement: bridge API 仅平台身份

### Scenario: 平台身份可访问

- **Given** 调用方具备 platform identity（如 `platform_admin` / `is_platform_admin` 或产品约定的平台角色）
- **When** 请求 `/api/bridge/*`（例如 `GET /api/bridge/connections`）
- **Then** 按业务授权放行（非因「仅企业身份」被拒）

### Scenario: 企业身份 403 为预期

- **Given** 调用方仅为组织身份（如 `org_admin` / org_*）
- **When** 请求 `/api/bridge/*`
- **Then** 返回 403
- **And** 这是硬门控预期，不是「企管权限配错」的偶发 bug

### Scenario: 客户端不得无条件拉 bridge

- **Given** 前端会话 `canAccessBridge !== true`
- **When** Agent 上下文初始化
- **Then** SHALL NOT 自动请求 `/api/bridge/*`
- **And** 因此 org_admin Network 面板不应刷出 bridge 403 噪声

参考：`Octop/docs/reports/2026-11-02-bridge-client-error-403.md`
