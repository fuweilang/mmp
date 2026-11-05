# tasks

- [x] Backend `TenantRoleService.list` 合并 ORG_PRESET + 本企业 ORG_CUSTOM；toRow 暴露 key/scope/builtIn；预置 userCount 租户内统计
- [x] Backend `TenantRoleService.patch`：**拒绝** ORG_PRESET（Forbidden「全局共享，请到平台管理修改」）；delete 仍仅 ORG_CUSTOM；控制台 toRow 预置 `editable=false`
- [x] Frontend `Roles.vue`：预置只读 + 提示；自定义可增删改
- [x] 成员/用户查看：`effectivePermissions` + 角色来源标签（`listBoundRoleSources`）
- [x] Admin `/admin/roles` 预置仍可写（未改写路径）
- [x] OpenSpec：本 change proposal/tasks/spec 对齐方案1

- [x] 修订：org_member 租户覆盖表（不改共享 Role）；console PATCH 写覆盖；org_admin 仍 Forbidden
- [x] computeEffectivePermissions / listBoundRoleSources 使用 tenantId；ORG_CUSTOM 按租户过滤
- [x] 总后台用户权限详情支持 tenantId 选择
- [x] Roles.vue 解锁 org_member 编辑；AdminUsers 企业上下文切换
