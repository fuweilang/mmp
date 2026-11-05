# 任务 — unify-ground-octop-rbac

谁干：李庚 = ground 前端/Nest；王总 = Octop Python 门禁与 catalog 胶水；秋池 = 验收。浪哥/甜甜本期不挡主路径（UI 跟现有 admin 即可）。

勾选规则：实现窗口做完打 `[x]`；验收不过回开。

## 0. 产品冻结（林杰 / 已完成于本 OpenSpec）

- [x] 权威方案 A、分期、平台两角色、企业三档、Catalog 方向、UI 用 permChip
- [x] 写出 proposal / design / tasks / specs

## 1. 数据模型与种子（李庚）

- [x] Prisma：`Role` / `RolePermission` / `UserPlatformRole`（表名可微调，语义见 design）
- [x] 迁移 + 种子：`super_admin`、`platform_admin`、`org_owner`、`org_admin`、`org_member` 及预设 RolePermission
- [x] 回填：现有 `isPlatformAdmin=true` → `UserPlatformRole(super_admin)`；之后 `isPlatformAdmin` 派生或双写缓存
- [x] 新建平台管理员默认 `platform_admin`（除非显式选超管）
- [ ] **验收要点**：库内五角色存在；种子超管有 `portal.admin.roles.write`；普通成员无 `portal.console.access`

## 2. Catalog API（李庚，对齐王总 key 列表）

- [x] ground 代码常量/模块：Octop 模块 keys + `portal.admin.*` / `portal.console.*`
- [x] `GET /api/admin/permissions/catalog`（分组结构可供 chip 渲染）
- [x] 写入权限时校验未知 key → 400
- [ ] **验收要点**：catalog 含 `experts`、`users`、`portal.admin.roles.write`；未知 key 拒绝

## 3. 有效权限与登录下发（李庚）

- [x] 计算函数：平台角色 ∪ 当前企业预设（并集）；无企业则仅平台
- [x] `/auth/me`、登录成功响应增加 `effectivePermissions`、`platformRoleKey`
- [x] OIDC userinfo（及必要的 id_token 策略）增加 `permissions` / `platform_role`；保留 `is_platform_admin`
- [x] Admin/Console 路由守卫逐步改认 keys（至少 `portal.admin.access` / `portal.console.access`）；旧布尔可作兜底一版
- [ ] **验收要点**：OWNER 登录 me 含 console + 业务 keys；MEMBER 无 `portal.console.access`；超管含 `roles.write`

## 4. Admin 角色 API + `/admin/roles` UI（李庚）

- [x] 角色列表/详情/更新权限包（一期以编辑内置平台角色为主；`super_admin` 权限只读全开）
- [x] 用户创建/编辑支持选择平台角色
- [x] `/admin/users` 独立改密：行内按钮 + 弹窗；编辑去掉密码；`PATCH .../password`；非超管不可改超管密码
- [x] `AdminRoles.vue` 改为真数据：表格/卡片 + permChip（参考 Octop PermissionCheckboxPicker，Element Plus 重做）
- [x] 交互：loading / 空 / 错误重试 / 无 write 只读 / 保存中防抖
- [ ] **验收要点**：静态两行消失；改 `platform_admin` chip 保存后再进页仍在；无 write 的账号看不到保存

## 5. Octop 认 keys + 降级（王总）

- [x] SSO/OIDC 回调：读取 `permissions`（userinfo），写入影子用户 permissions 或会话覆盖
- [x] 门禁继续 `user_has_permission`；禁止因企业 OWNER 映射为本地 `admin`
- [x] `is_platform_admin` 旧补丁：可保留「升本地 admin」仅当平台超管且需兼容旁路；文档注释优先级 **keys > 本地**
- [x] permissions 缺失：fallback 本地 `user_roles`/user.permissions + 日志
- [x] Catalog 若增 portal 无关 key 不必进 Octop PERMISSIONS；Octop 只校验自己模块 key；忽略未知 portal.* 不报错
- [ ] **验收要点**：中台下发无 `providers` 的用户打不开 `/agent/admin/models`；断 permissions claim 时本地权限仍可用且有日志

## 6. 企业三档行为对齐（李庚为主，秋池验）

- [x] MEMBER 仍不可 `canAccessConsole`
- [x] OWNER/ADMIN 进 console；成员管理需 `portal.console.members`（ADMIN/OWNER 种子具备）
- [x] 切换企业后 `/auth/me` permissions 随 `currentTenant` 重算
- [ ] **验收要点**：同一用户在企业 A=MEMBER、企业 B=OWNER 时切换后 permissions 变化

## 7. 验收与回归（秋池）

- [ ] 按 `specs/rbac-authority.md`、`admin-roles-ui.md`、`org-role-presets.md` 出测试报告
- [ ] 回归：`platform-admin-console` 主路径（登录分流、进工作台、退出工作台）不坏
- [ ] 回归：Octop 管理侧栏权限隐藏仍正确
- [ ] **验收要点**：报告含通过/失败步骤与账号；失败附截图或 API 响应

## 明确不做（一期）

- [ ] console 自定义角色 UI/API
- [ ] 删除 Octop `user_roles` 表
- [ ] PeecAI 权限树
- [ ] 改 PeecAI 仓库
