# role-deletion

## Requirement: 内置角色不可删除

系统 SHALL 将以下角色视为平台初始化内置角色，且 SHALL NOT 允许任何账号删除它们：

- `super_admin`
- `platform_admin`
- `org_admin`
- `org_member`

判定 SHALL 同时认可：

- `Role.builtIn === true`，或
- `Role.key` 属于上述内置键集合（与 `BUILTIN_ROLE_KEYS` 一致）

对内置角色的 DELETE（平台角色或误走企业角色接口）SHALL 返回 4xx，且 SHALL NOT 修改 `UserRole` / `RolePermission`。

前端 `/admin/roles` 对内置行的删除按钮 SHALL 禁用，tooltip SHALL 说明「系统内置角色不可删除」。

## Requirement: 自定义角色删除身份

对非内置角色（平台自定义：`builtIn=false` 且 key 非内置键；企业自定义：`scope=ORG_CUSTOM`）：

- 仅当操作者持有平台角色 **`super_admin` 或 `platform_admin`** 时 SHALL 允许删除
- 身份判定 SHALL 基于用户已绑定的角色 key（或与之等价的平台身份），SHALL NOT 仅依赖 `portal.admin.roles.write`
- 不具备上述身份时 DELETE SHALL 403；前端删除按钮 SHALL 禁用并提示仅超管/平台管可删

说明：创建/编辑角色权限包仍可继续使用既有 `portal.admin.roles.write`；本需求只约束**删除**。

## Requirement: 占用中禁止删除

若目标角色仍存在至少一条 `UserRole` 关联（`userCount > 0`）：

- DELETE SHALL 失败（4xx）
- 错误信息 SHALL 表明仍有用户/成员在使用该角色
- 系统 SHALL NOT 为完成删除而自动解除 `UserRole` 或改绑用户

前端在 `userCount > 0` 时 SHALL 禁用删除并提示仍有人使用。

## Requirement: 企业自定义角色同源

总后台企业角色 Tab 调用的 `deleteTenantRole`（或等价接口）SHALL 遵守同一套身份闸与占用禁删规则。

## Scenario: 内置四角色不可删

- Given 操作者为 `super_admin`
- When 对 `org_admin`（或任一内置 key）调用删除接口
- Then 返回 4xx 且角色行仍在
- And `/admin/roles` 上该行删除按钮为禁用

## Scenario: 平台管理员可删空闲自定义角色

- Given 操作者为 `platform_admin`，且目标为无用户占用的平台自定义角色
- When 调用 `deleteRole`
- Then 删除成功（200）
- And 角色从列表消失

## Scenario: 有人使用则禁删

- Given 某自定义角色 `userCount >= 1`
- When 超管或平台管调用删除
- Then 返回 4xx，提示仍有人使用
- And 该角色的 `UserRole` 关联数量不变

## Scenario: 无平台身份不可删

- Given 操作者不是 `super_admin` / `platform_admin`
- When 调用 `deleteRole` 或 `deleteTenantRole`
- Then 返回 403
