# design — unify-ground-octop-rbac

## 1. 权威模型（方案 A，已拍板）

```
ground (mammoth_core)
  Role / RolePermission / 分配
        │ 登录、/auth/me、OIDC claims
        ▼
  effectivePermissions: string[]
        │
        ├─► ground 前端：/admin、/console 路由与按钮
        └─► Octop：只认 keys 做门禁
              └─ 本地 user_roles / users.permissions：降级兼容（中台未下发或离线）
```

**SHALL**：Octop 不得再把「中台账号源」写成自己的 Role 权威。本地角色模板可继续服务纯本地账号与降级。

## 2. 数据模型（ground）

### 2.1 新增（建议表名，实现可微调但语义不变）

| 模型 | 字段要点 | 说明 |
|---|---|---|
| `Role` | `id`, `key` (unique), `name`, `description?`, `scope` (`PLATFORM` \| `ORG_PRESET`), `builtIn` bool, `editable` bool, `createdAt`, `updatedAt` | 平台角色 + 企业三档预设都是 Role；一期 ORG_PRESET 不可被 console 自定义 |
| `RolePermission` | `roleId`, `permKey` | 唯一 `(roleId, permKey)`；未知 key 禁止写入 |
| `UserPlatformRole` | `userId` (unique), `roleId` | 用户至多一个平台角色；无行 = 非平台管理员 |
| （可选）`PermissionCatalog` 表或代码常量 | `key`, `category`, `labelZh`, `labelEn`, `page?` | 一期可用代码常量 + API 暴露；与 Octop `PERMISSIONS` 对齐 |

`OrgMember.role` **保留** enum `OWNER|ADMIN|MEMBER`，作为企业三档的稳定句柄；其权限包来自对应 `Role.key`（如 `org_owner` / `org_admin` / `org_member`）的 `RolePermission`，而不是在 `OrgMember` 上存 key 列表。

### 2.2 兼容 `User.isPlatformAdmin`

| 规则 | 行为 |
|---|---|
| 读 | `isPlatformAdmin := UserPlatformRole 存在且 role.scope=PLATFORM`（或 role.key ∈ 平台角色集合） |
| 写（过渡） | 旧 Admin API 若仍收 `isPlatformAdmin=true`，默认绑定 `platform_admin`；种子超管 `13800000001` 与既有 `isPlatformAdmin=true` **回填为 `super_admin`**（避免丢「改角色」能力） |
| 迁移 | 一次性脚本/启动迁移：`isPlatformAdmin=true` 且无平台角色 → `super_admin` |

一期可暂时保留列 `is_platform_admin` 作派生缓存，但**授权判断以 Role 分配 + effectivePermissions 为准**；新代码禁止只读布尔做细粒度授权。

### 2.3 字段规则

- `Role.key`：`^[a-z][a-z0-9_]{1,63}$`，内置不可改 key
- `permKey`：必须存在于 Catalog；最大长度 64；禁止空串
- `Role.name`：1～40 字，trim；同 scope 下展示名建议唯一
- `description`：可选，≤200
- 删除 Role：`builtIn=true` 禁止删；有用户绑定的平台角色禁止删（先解绑）

## 3. Catalog

### 3.1 来源优先级

1. **Octop 模块 keys**（`Octop/src/octop/infra/users/permissions.py` 的 `PERMISSIONS`）为一期 chip 主体，分类沿用 `nav` / `settings` / `control` / `admin`
2. **门户补齐**：
   - `portal.admin.access` — 进入 `/admin`
   - `portal.admin.users` — 用户管理
   - `portal.admin.enterprises` — 企业管理
   - `portal.admin.roles.read` — 查看角色
   - `portal.admin.roles.write` — 改平台角色模板 / 权限包
   - `portal.console.access` — 进入 `/console`
   - `portal.console.members` — 成员管理
   - `portal.console.settings` — 企业设置类（现有 settings 页能力；细拆二期）

Chat **不是** permission（与 Octop 一致）：无 key 也可对话。

### 3.2 同步约定

- ground Catalog **声明式**维护；Octop 新增模块 key 时，本期要求双端补齐（任务里王总改 Octop catalog / 门禁，李庚改 ground catalog 常量或同步接口）
- ground 暴露 `GET /api/admin/permissions/catalog`（仅平台角色可读）；Octop 已有 `GET /users/permissions`
- 校验：写入 RolePermission 时 `validate` 未知 key → 400

## 4. 预设包映射（一期固定）

> 「全开 / 业务 / 少量」以 Catalog 分类表达；具体 key 列表落在种子数据，改种子须同步本表与验收。

| 句柄 | Role.key（建议） | 权限包意图 | portal |
|---|---|---|---|
| 平台 `super_admin` | `super_admin` | Catalog **全部** keys（含全部 Octop 模块 + 全部 portal.admin.*） | 含 `roles.write` |
| 平台 `platform_admin` | `platform_admin` | `portal.admin.access/users/enterprises/roles.read` + 进入 agent 时业务向 keys（默认**不含** Octop 高危 admin 页全开，也不含 `portal.admin.roles.write`） | 无 `roles.write` |
| 企业 OWNER | `org_owner` | Octop：`nav`+`settings`+`control`+业务相关 **模块全开**（不含把运行时变成安装级超管的必要限制见下）+ `portal.console.*` | console 管理全开 |
| 企业 ADMIN | `org_admin` | Octop：业务模块（experts/tasks/knowledge/channels/connectors/skills 等，种子定稿）+ `portal.console.access` + `portal.console.members` | 可管成员，默认无企业危险设置若有拆分 |
| 企业 MEMBER | `org_member` | Octop：对话 ungated + **少量默认 settings**（对齐 Octop `BASELINE_PERMISSIONS` 的子集或全集，种子定稿） | **无** `portal.console.access` |

Octop 运行时「system admin」旁路（`user.role == admin` 全放行）与平台 `super_admin` 对齐：SSO 下发全量 keys **或** 继续映射本地 admin **二选一须在实现里显式**，推荐：**优先 keys；仅当 claims 声明 platform super 且需兼容旧门禁时再升本地 admin**。禁止普通 OWNER 被写成 Octop `admin`。

### 4.1 effectivePermissions 计算

```
perms = ∅
if user 有平台角色:
  perms ∪ RolePermission(platformRole)
if currentTenant 且有 OrgMember:
  perms ∪ RolePermission(org_preset(OrgMember.role))
# 平台管理员代运营进入企业时：仍带平台角色权限 ∪ 该企业预设？ 
# 拍板默认：代运营 = 平台权限为主；企业预设不削弱平台权限（并集）。
return sorted(unique(perms))
```

无租户上下文（平台管理员未进工作台）：只返回平台角色权限（应含 `portal.admin.*`，通常不含 `portal.console.access` 除非角色带了）。

## 5. 权限权威流

### 5.1 登录 / session

`GET /auth/me`（及登录成功响应）增加：

```json
{
  "user": {
    "id": "...",
    "isPlatformAdmin": true,
    "platformRoleKey": "super_admin"
  },
  "currentRole": "OWNER",
  "effectivePermissions": ["experts", "portal.admin.access", "..."]
}
```

- `isPlatformAdmin` 保留给旧前端判断
- 新前端优先 `effectivePermissions` / `platformRoleKey`

### 5.2 OIDC

在现有 `is_platform_admin` 之外增加 claim（建议）：

- `permissions`: string[]（即 effectivePermissions；注意 ID Token 体积，过大则改 userinfo 必带 + access 侧缓存）
- `platform_role`: string | null

若 permissions 过长：ID Token 可只带 hash/version，**userinfo 必须返回完整 list**；Octop SSO 回调拉取 userinfo。

### 5.3 Octop 门禁

- API / nav：`user_has_permission(user, key)` 只看 keys（admin 旁路仅对本地 system admin 或显式全量 keys）
- SSO 登录：若 claims/userinfo 含 permissions → `set_permissions` 到影子用户（或 session 内存覆盖），**不**按企业 OWNER 提权 admin
- 降级：permissions 缺失 → 读本地 `users.permissions` / role 模板；日志 `rbac.fallback_local`

## 6. 接口预期（ground）

| 方法 | 路径 | 谁 | 行为 |
|---|---|---|---|
| GET | `/api/admin/permissions/catalog` | 有 `roles.read` 或 `roles.write` | 返回 chip 分组结构 |
| GET | `/api/admin/roles` | `roles.read` | 列表；支持 keyword |
| POST | `/api/admin/roles` | `roles.write` | 一期默认只允许编辑内置平台角色的权限，或禁止新建（若一期不开放自定义平台角色，则 POST 可 404/403；**最低交付是 PATCH 内置**） |
| PATCH | `/api/admin/roles/:id` | `roles.write` | 改 name/description/permissions；`super_admin` 的 permissions 可锁定为全量 |
| GET/PATCH | `/api/admin/users/:id` | `users` | 增加 `platformRoleKey`；创建/更新可赋平台角色；更新 **不再** 接受 password |
| PATCH | `/api/admin/users/:id/password` | `users` | 独立改密；非超管不可改 `super_admin` 密码 |
| GET | `/auth/me` | 登录用户 | 含 `effectivePermissions` |

错误：403 无 key；400 未知 permKey；409 删除仍被引用；404 角色不存在。

Console 成员 API 保持 `role: OWNER|ADMIN|MEMBER`；一期**不**接自定义 roleId。

## 7. UI（`/admin/roles`）

参考：`Octop/dashboard/.../RolesPanel.tsx` + `PermissionCheckboxPicker` 的 **permChip**（分类块、可多选 chip、选中态），用 Element Plus 在 Vue 重做，视觉跟总后台（console token）。

### 交互

| 状态 | 表现 |
|---|---|
| loading | 表格/卡片 skeleton 或 `v-loading` |
| 空 | `el-empty`「暂无角色」 |
| 错误 | 顶栏 `el-alert` + 重试 |
| 无 `roles.write` | 只读查看 chip；保存按钮隐藏/禁用 |
| 保存中 | 按钮 loading，防重复提交 |
| 内置 | Tag「系统」；`super_admin` 权限区只读「全部权限」 |

**不做**：PeecAI 式深层级权限树、按资源实例勾选。

## 8. 分期

| 期 | 交付 |
|---|---|
| **一期（本 change）** | 模型 + Catalog + admin 真角色/chip + 平台两角色 + 企业三档预设映射 + 下发 effectivePermissions + Octop 认 keys/降级 |
| **二期** | console 自定义角色；企业可基于预设克隆权限包；成员可绑自定义 role |

一期禁止在 console 露出「编辑权限包」入口。

## 9. 风险与兼容

| 风险 | 缓解 |
|---|---|
| ID Token 过大 | permissions 放 userinfo；Octop 回调必拉 |
| 旧前端只认 `isPlatformAdmin` | 保留派生字段至前端全切 |
| Octop 本地 admin 旁路与 keys 双轨 | 文档化优先级；超管可继续旁路；OWNER 禁止旁路 |
| Catalog 双端漂移 | 同一 key 列表进验收；CI 可后续加对账 |
| 回填变 `super_admin` 过宽 | 种子仅原 `isPlatformAdmin=true`；新建平台管理员默认 `platform_admin` |
| 代运营并集权限过大 | 接受一期并集；二期可做「模拟成员视角」 |

## 10. 现状锚点（核实）

- `ground/.../AdminRoles.vue`：静态 `admin`/`user` 两行
- `User.isPlatformAdmin`；`OrgMember.role` enum
- `auth.toMe` 无 permissions；OIDC 仅 `is_platform_admin`
- Octop `permissions.py` + `RolesPanel` + `permChip` 已是真 RBAC
- Octop `manager.py` MAMMOTH-PATCH：`is_platform_admin` → 本地 admin
