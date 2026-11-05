# org_member 租户覆盖 — 本地验收

时间：2026-11-01 Asia/Shanghai  
范围：`ground` 本地 only（无 push）

## 决策

1. 平台默认 = 全局 `ORG_PRESET`（`/admin/roles` 可写 `org_admin` / `org_member`）。
2. 控制台：`org_admin` 只读；`org_member` 只写本企业覆盖表，**永不**改共享 Role 行。
3. 解析：`tenant override ?? global`；`computeEffectivePermissions(userId, tenantId)` 必须带租户。
4. 成员详情 = 该用户在该企业；总后台用户详情可选企业上下文。
5. 自定义角色逻辑不变。

## 改动要点

| 路径 | 要点 |
|---|---|
| `prisma` + migration `20261101194000_org_member_preset_override` | `OrgPresetOverride` / Permission |
| `permissions/effective.ts` | 用 `tenantId`；ORG_CUSTOM 按租户过滤；org_member 覆盖优先 |
| `permissions/org-preset-override.ts` | 覆盖读写辅助 |
| `tenant-role.service.ts` | org_member PATCH→覆盖；org_admin Forbidden；list 展示有效包 |
| `admin.service` / `admin-user.controller` | `?tenantId=` 权限详情 |
| `Roles.vue` / `AdminUsers` / `UserPermViewDialog` | 成员可编辑覆盖；总后台选企业 |

## 验证

### A. 控制台 org_member 覆盖

1. 企业管理员 → `/console/roles`
2. 「企业管理员」：编辑禁用；「企业成员」：可编辑
3. 改成员权限包并保存 → 提示「已保存本企业成员权限覆盖」
4. DB：`org_preset_override` 有本企业 `org_member` 行；全局 `role_permission` 的 org_member **未变**
5. 另一企业控制台仍见平台默认（除非自己也覆盖）

### B. 有效权限带 tenantId

1. 给成员绑 org_member；企业 A 覆盖多/少若干 key
2. 该成员登录切到企业 A：`/auth/me` effectivePermissions 含覆盖结果
3. `/console/members` 查看权限 = 该企业上下文
4. `/admin/users` 查看：多企业可切换；权限随所选企业变化

### C. 回归

- `/admin/roles` 改全局 org_member 后，无覆盖的企业立刻跟随；有覆盖的企业不变
- org_admin console PATCH 仍 403「全局共享…」
- 自定义角色增删改不变；预置 DELETE 仍 404

## 未做

- 未 commit / 未 push
- 未做「恢复平台默认」按钮（删覆盖行）；需要时可补
