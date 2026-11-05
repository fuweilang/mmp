# console-roles

## Requirement: 列表含平台预置

`GET /api/tenant-roles`（需 `portal.console.roles`）SHALL 返回：

1. 平台预置企业角色：`scope=ORG_PRESET` 且 `key ∈ {org_admin, org_member}`（全局行，`tenantId` 为空）
2. 当前企业自建角色：`scope=ORG_CUSTOM` 且 `tenantId` 为当前企业

排序 SHALL：预置在前（`org_admin` 先于 `org_member`），其后自建按 `createdAt` 升序。

每行 SHALL 含既有字段，并 SHALL 暴露 `key`、`scope`、`builtIn`、`editable`。
对 `ORG_PRESET` 行，控制台响应中 `editable` SHALL 为 `false`（全局共享，仅总后台可改包）。

预置行的 `userCount` SHALL 统计「绑定该角色且为本企业 `OrgMember`」的用户数；自建行仍为本角色 `UserRole` 数。

## Requirement: 预置只读；自建可改

企业控制台对 `ORG_PRESET`（`org_admin` / `org_member`）SHALL 提供查看；SHALL NOT 提供可保存的编辑入口；SHALL NOT 提供删除入口。
UI SHALL 明确提示「全局共享，请到平台管理修改」。

`PATCH /api/tenant-roles/:id` SHALL 仅接受本企业 `ORG_CUSTOM`；对预置 id SHALL 拒绝（Forbidden），文案含「全局共享，请到平台管理修改」。
`DELETE /api/tenant-roles/:id` SHALL 仍只接受本企业 `ORG_CUSTOM`；对预置 id SHALL 返回不存在（404）。

总后台 `/admin/roles`（平台角色）对上述预置 SHALL 保持可编辑（保存即所得）；仅 `super_admin` 硬锁。

自建角色的创建、编辑、删除（含占用禁删）SHALL 保持不变。

## Scenario: 列表可见两档预置且只读

- Given 企业管理员进入 `/console/roles`
- When 加载列表
- Then 可见「企业管理员」「企业成员」
- And 两行操作列有「查看」、编辑为禁用并提示「全局共享，请到平台管理修改」，无「删除」

## Scenario: 控制台不可改预置包

- Given 企业管理员对 `org_member` 调用 PATCH `/api/tenant-roles/:id`
- Then 返回 Forbidden
- And 角色权限包未被修改

## Scenario: 预置不可删

- Given 预置角色 id
- When 调用 DELETE `/api/tenant-roles/:id`
- Then 返回 404
- And 角色与权限包未被删除

## Scenario: 自定义不变

- Given 本企业 `ORG_CUSTOM` 角色且无成员占用
- When 编辑名称/权限或删除
- Then 行为与改前一致（成功或既有校验错误）
