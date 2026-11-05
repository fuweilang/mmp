# console-roles-include-presets

企业控制台 `/console/roles` 角色列表纳入平台预置的企业管理员（`org_admin`）、企业成员（`org_member`）。
**产品决策（2026-11-01 修订）**：全局 `ORG_PRESET` 仍由总后台维护。`org_admin` 控制台只读；`org_member` 允许企业写**租户覆盖**（不改共享行），解析为「租户覆盖否则全局」。自定义（`ORG_CUSTOM`）不变。

## 背景

原先预置未进控制台列表；后一度允许控制台改包。方案1收口为：列表可见、权限包只读，改包去平台管理，避免多企业互相覆盖。

## 目标

1. 列表返回：`ORG_PRESET` 的 `org_admin`/`org_member` + 本企业 `ORG_CUSTOM`。
2. 预置行：可「查看」；编辑禁用 + 全局共享提示；不可删除。`PATCH` 对预置拒绝；`DELETE` 仍只对 `ORG_CUSTOM`。
3. 预置 `userCount` 按**当前企业**成员统计。
4. 成员/用户查看弹窗：展示 `effectivePermissions`（绑定角色并集）并标注角色来源；不以 console∪admin 目录模板冒充有效权限。
5. 企业可勾选目录仍随 admin 侧预置包收口（`resolveAssignableKeys`）。

## 非目标

- 不拆 org_admin 租户副本（仅 org_member 覆盖表）
- 不开放删除预置；不让企业改 `super_admin`
- 不推 Git、不碰 Octop / PeecAI

## 验收

1. `/console/roles`：org_admin 只读；org_member 可 PATCH 覆盖；`/admin/roles` 仍改全局预置。
2. org_admin PATCH → Forbidden；org_member PATCH 只写覆盖表；DELETE 预置仍 404；自定义不变。
3. `/console/members` 与 `/admin/users` 查看弹窗权限 chip 带来源角色名。
