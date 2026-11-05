# ORG_PRESET 方案1 本地验收

时间：2026-11-01 Asia/Shanghai  
范围：`ground` 本地 only（无 push / 无 cloud）

## 决策摘要

1. 保持单一共享 `ORG_PRESET`（`org_admin` / `org_member`）。
2. **仅总后台** `/admin/roles` 可改预置权限包。
3. **企业控制台** `/console/roles` 对预置只读，提示「全局共享，请到平台管理修改」。
4. 成员/用户查看弹窗：展示绑定角色权限并集（effectivePermissions），chip 标注来源角色；不用 console∪admin 模板冒充权限。

## 改动文件

| 路径 | 要点 |
|---|---|
| `apps/backend/src/tenant-role/tenant-role.service.ts` | console PATCH 拒 ORG_PRESET；列表 `editable=false` |
| `apps/backend/src/permissions/effective.ts` | `listBoundRoleSources` |
| `apps/backend/src/tenant/tenant.service.ts` | `memberPermissions` 增 `roles` |
| `apps/backend/src/admin/admin.service.ts` | `userPermissions` 增 `roles` |
| `apps/frontend/src/views/Roles.vue` | 预置编辑禁用 + 提示 |
| `apps/frontend/src/views/Members.vue` | 权限详情来源标签 |
| `apps/frontend/src/views/admin/AdminUsers.vue` | 同上 |
| `apps/frontend/src/components/admin/users/UserPermViewDialog.vue` | chip 来源 |
| `apps/frontend/src/api/tenants.ts` / `admin.ts` | `RolePermSource` 类型 |
| `openspec/changes/console-roles-include-presets/*` | 契约对齐方案1 |

## 如何验证

### A. 控制台只读预置

1. 登录企业管理员 → `/console/roles`。
2. 「企业管理员 / 企业成员」行：有「查看」；「编辑」禁用，悬停文案为「全局共享，请到平台管理修改」；无删除。
3. 打开「查看」：顶部 alert 同文案；权限包只读。
4. （可选 API）对预置 roleId：`PATCH /api/tenant-roles/:id` → 403，body/message 含「全局共享，请到平台管理修改」。
5. 自建角色仍可新建 / 编辑 / 删除（无占用时）。

### B. 总后台仍可写预置

1. 平台管理员 → `/admin/roles`（平台角色 tab）。
2. 编辑 `org_admin` / `org_member` 权限包并保存成功。
3. 回到控制台打开同角色「查看」，应看到新权限包（只读）。

### C. 用户/成员权限详情

1. `/console/members` → 查看某多角色成员：权限详情 chip 右侧/悬停显示来源角色名；集合 = 绑定角色并集。
2. `/admin/users` → 查看用户：同上。
3. 不应出现「把 console 目录 ∪ admin 目录整表当用户权限」的假并集。

### D. 回归

- 预置 DELETE `/api/tenant-roles/:id` 仍 404。
- 登录 `/auth/me` 的 `effectivePermissions` 仍随角色绑定/总后台改包变化。

## 未做

- 未 commit / 未 push / 未开 cloud agent。
- 未拆租户级预置副本（方案1 明确不拆）。
