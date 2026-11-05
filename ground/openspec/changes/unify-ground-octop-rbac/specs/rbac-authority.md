# rbac-authority

## Requirement: 权威在 ground

系统 SHALL 在中台 `mammoth_core` 持久化 Role、RolePermission 与用户平台角色分配。

Octop SHALL NOT 作为产品账号权限的权威写入源。Octop 本地 `user_roles` / `users.permissions` SHALL 仅用于本地账号与降级兼容。

## Requirement: effectivePermissions 下发

已登录用户调用 `GET /auth/me`（及等价登录成功会话）时，响应 SHALL 包含：

- `effectivePermissions`: `string[]`（去重；建议排序）
- `platformRoleKey`: `string | null`
- `isPlatformAdmin`: `boolean`（与是否拥有平台角色一致，兼容旧客户端）

OIDC `userinfo` SHALL 包含完整 `permissions` 数组（与 effectivePermissions 同义）及 `platform_role`；SHALL 继续提供 `is_platform_admin`。

## Requirement: 计算规则

`effectivePermissions` SHALL 为：

1. 用户平台角色的权限包，若存在；并
2. 若请求带当前企业且用户为该企业 `OrgMember`，并上该成员角色对应预设包（OWNER→`org_owner`，ADMIN→`org_admin`，MEMBER→`org_member`）

平台管理员代运营进入企业时 SHALL 使用并集（平台包 ∪ 企业预设包），SHALL NOT 用企业包削弱平台包。

无当前企业时 SHALL 只返回平台包（可为空）。

## Requirement: Octop 只认 keys

Octop 对模块页与写操作的门禁 SHALL 调用基于 permission key 的检查（如 `user_has_permission`）。

当 SSO 会话提供了中台 `permissions` 时，Octop SHALL 使用该列表作为影子用户有效权限来源，SHALL NOT 仅因中台企业 OWNER/ADMIN 而将影子用户 `role` 设为 `admin`。

当 `permissions` 缺失或无法解析时，Octop SHALL 降级使用本地 permissions，并记录可观测日志；SHALL NOT 静默授予全站 admin。

## Requirement: Catalog 校验

写入 Role 权限列表时，服务端 SHALL 拒绝不在 Catalog 中的 key（HTTP 400）。

Catalog SHALL 包含 Octop 模块 keys，并包含至少：

- `portal.admin.access`
- `portal.admin.users`
- `portal.admin.enterprises`
- `portal.admin.roles.read`
- `portal.admin.roles.write`
- `portal.console.access`
- `portal.console.members`
- `portal.console.settings`

## Scenario: 超管拿到改角色权限

- Given 用户绑定平台角色 `super_admin`
- When 调用 `GET /auth/me`
- Then `effectivePermissions` 包含 `portal.admin.roles.write`
- And `isPlatformAdmin` 为 true

## Scenario: 平台管理员默认不能改角色模板

- Given 用户绑定 `platform_admin`（默认种子）
- When 调用 `GET /auth/me`
- Then `effectivePermissions` 包含 `portal.admin.access`
- And `effectivePermissions` 不包含 `portal.admin.roles.write`

## Scenario: OIDC 下发后 Octop 拒无权限模块

- Given 中台为用户下发的 permissions 不含 `providers`
- When 用户经 SSO 进入 Octop 并打开模型管理页或调用对应 API
- Then 访问被拒绝或入口不可见
- And 用户未被仅因企业 OWNER 提升为本地 admin

## Scenario: 降级本地权限

- Given SSO 未带 permissions claim/userinfo 字段
- And 影子用户本地 permissions 含 `experts`
- When 用户访问专家页
- Then 仍按本地 permissions 放行
- And 系统产生降级日志
