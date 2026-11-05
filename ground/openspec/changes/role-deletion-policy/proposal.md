# role-deletion-policy

总后台 `/admin/roles` 角色删除策略定稿：内置四角色永不可删；自定义平台角色与企业自定义角色仅超管/平台管可删；有人使用则禁删（不解绑清关联）。

## 背景

`unify-ground-octop-rbac` 已落地角色 CRUD 与 `deleteRole` / `deleteTenantRole`。现状与产品定稿有两处偏差：

| 点 | 现状 | 定稿 |
|---|---|---|
| 谁可删自定义角色 | 依赖 `portal.admin.roles.write`（内置包仅 `super_admin` 有） | **超级管理员、平台管理员**均可删 |
| 内置角色 | `builtIn=true` 禁删 | 明确四键：`super_admin` / `platform_admin` / `org_admin` / `org_member`，**不可删除**（`builtIn` + key 双闸） |
| 有人使用 | 已 400 禁删 | 保持：禁止删除、**不得**清空 `UserRole` 强行删 |

前端 `canDeleteRow` 目前跟 `canWrite`（roles.write）绑定，导致 `platform_admin` 即使进了总后台也删不了自定义角色。

## 目标

1. 内置四角色服务端硬拦 + 前端删除按钮禁用，提示「系统内置角色不可删除」。
2. 非内置（平台自定义 `builtIn=false` / 企业 `ORG_CUSTOM`）可删，**仅**操作者为 `super_admin` 或 `platform_admin`（按角色身份，不单靠 `roles.write`）。
3. `userCount > 0` → 禁删，提示仍有人使用；不自动解绑。
4. OpenSpec 写清规则与验收；实现与 UI 对齐。

## 范围

- OpenSpec：本 change 的 proposal / tasks / specs
- Backend：`deleteRole`、`deleteTenantRole` 删除闸（身份 + 内置 key + 占用）
- Frontend：`AdminRoles.vue` 的 `canDeleteRow` / `deleteHint`（及若有企业 Tab 同源逻辑）
- 核对 `BUILTIN_ROLE_KEYS` 与种子四角色一致（不含已移除的 `agency_admin`）

## 非目标

- 不改创建/编辑角色所需的 `portal.admin.roles.write` 门禁（编辑仍按既有 write；本 change 只收紧/校正**删除**）
- 不给 `platform_admin` 默认加上 `roles.write`（避免扩大「改权限包」能力；删除按身份放行）
- 不在企业 console 另开一套删角色产品（总后台企业角色 Tab 同源接口即可）
- 不推 GitHub / 不开 PR

## 规则（产品定稿）

1. **不可删**：`super_admin`、`platform_admin`、`org_admin`、`org_member`（系统初始化/内置）。
2. **可删**：新建的平台角色、企业自定义角色；仅 **超级管理员、平台管理员**。
3. **占用禁删**：仍有 `UserRole` 关联 → 禁止删除，提示「还有 N 个用户/成员使用该角色」；SHALL NOT 自动清空关联后删除。
4. **双端**：服务端接口硬拦；前端按场景 disable + tooltip。

## 验收标准（摘要）

1. 对四内置角色调 DELETE → 400，文案含「内置」或等价；UI 删除禁用。
2. `platform_admin` 对无用户占用的自定义平台角色 / 企业自定义角色 DELETE → 200；无身份账号 → 403。
3. 有 `userCount>0` 的自定义角色 DELETE → 400，关联行仍在。
4. `tsc` / `nest build` 通过（本机）。

## 与既有 OpenSpec 关系

- 继承 `unify-ground-octop-rbac` 的角色模型与 `/admin/roles` UI；本 change **校正删除策略**，不重开 RBAC 权威。
- 内置键集合与已移除 `agency_admin` 的 catalog 一致。
