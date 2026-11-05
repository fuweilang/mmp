# builtin-role-write-guard

交叉：`ground/openspec/changes/unify-ground-octop-rbac/`（Role.`editable` / builtIn）。**与 unify-rbac 对齐，勿重复实现两套。**

## Requirement: 不可编辑内置角色拒绝写权限包

### Scenario: editable false 拒绝 PATCH

- **Given** 角色标记 `editable: false` 的内置角色（至少包括 `org_admin`、`super_admin`，以及 unify-rbac 锁定的其它内置键）
- **When** 调用方尝试 PATCH 其权限包 / 权限 chip
- **Then** 请求被拒绝（403 或产品约定的等价错误）
- **And** 数据库中该角色权限包保持不变

### Scenario: 可编辑角色仍可改

- **Given** `editable: true`（或非内置锁）的角色
- **When** 具备门户权限的管理员 PATCH 权限包
- **Then** 按 unify-rbac / admin-roles 规格允许更新
