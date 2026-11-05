# admin-roles-ui

## Requirement: 真角色页

`/admin/roles` SHALL 从中台 API 加载角色列表，SHALL NOT 再使用写死的「平台管理员 / 普通用户」两行静态数据作为唯一数据源。

页面 SHALL 展示至少内置平台角色 `super_admin`、`platform_admin`（可用中文名「超级管理员」「平台管理员」）。

## Requirement: permChip 交互

角色编辑/详情 SHALL 使用 permission chip 多选交互，信息架构对齐 Octop `/agent/admin/users` 的 PermissionCheckboxPicker：保留 chip button；按 category 一级分组，再按 page 二级分组（如「知识库」下同时放 `knowledge_bases` + `knowledge_settings`，「用户」下 `users` + `sso`）；分组展示已选计数；选中/未选中态清晰。

SHALL NOT 引入 PeecAI 细粒度权限树（按资源实例、深层级勾选）。

Chip 标签优先中文 `labelZh`；保存时只提交 Catalog 内 key。

## Requirement: 权限门禁

| 能力 | 所需 key |
|---|---|
| 进入 `/admin/roles` 查看 | `portal.admin.roles.read`（或超管全量） |
| 修改角色权限包/名称 | `portal.admin.roles.write` |
| 进入总后台 | `portal.admin.access` |

无 `roles.write` 时 UI SHALL 只读：隐藏或禁用保存；直接调 PATCH SHALL 返回 403。

`super_admin` 角色的权限包 UI SHALL 展示为「全部权限」且不可编辑（防把自己锁死），操作列编辑按钮 SHALL 为禁用态；其余内置角色（含 `org_admin`/`org_member` 企业预设）SHALL 可编辑（仅持有 write 者），修改企业预设 SHALL 提示会影响所有使用该角色的企业成员。企业侧只有「企业管理员（`org_admin`）/ 企业成员（`org_member`）」两档，`org_owner` 已下线并合并进 `org_admin`。

角色列表操作列 SHALL 同时提供「查看」与「编辑」：查看为只读弹窗，展示角色 Key、范围、权限数、关联用户数、说明与已授予权限 chips；编辑打开右侧抽屉（宽 760px）承载名称/说明/权限包。

## Requirement: 用户绑定平台角色

`/admin/users` 创建/编辑用户时 SHALL 能选择角色（单一「角色」下拉，选项来自 listRoles，至少含全部内置 Role）：

- 无角色（普通用户，清空 `UserPlatformRole`，`isPlatformAdmin=false`）
- 全部内置角色：`super_admin`、`platform_admin`、`org_owner`、`org_admin`、`org_member`（含 `ORG_PRESET`，允许绑定）
- `isPlatformAdmin` SHALL 仅在绑定角色 `scope === PLATFORM` 时为 true；绑 ORG_PRESET 或清空时为 false
- 编辑对象已是 `super_admin` 时 SHALL 不展示角色下拉，角色固定；后端 SHALL 拒绝变更其 `platformRoleKey`

兼容：旧字段 `isPlatformAdmin=true` 的写入 SHALL 映射为赋予某一平台角色（新建默认 `platform_admin`；迁移存量见 design）。

列表 SHALL 展示实际角色中文名（含企业所有者等），而不只是「平台管理员」布尔。

## Requirement: 独立修改密码

`/admin/users` SHALL 提供行内「修改密码」（独立弹窗：新密码 / 确认密码）；编辑用户弹窗 SHALL NOT 再含密码字段；新建用户仍设初始密码。

改密挂在既有用户管理能力（`requirePlatformAdmin` / `portal.admin.users`），不新增独立 permission key。后端 SHALL 提供独立接口（如 `PATCH /admin/users/:id/password`，body `{ password }`）；`PATCH` 更新用户 SHALL NOT 再接受/写入 `password`。

权限闸：目标为 `super_admin` 时，仅操作者自身亦为 `super_admin` 可改；平台管理员改超管密码 SHALL 403。前端对非超管操作者隐藏超管行的改密按钮。前端改密弹窗不做长度/一致等校验；后端可对空串拒绝（`MinLength(1)`）。

## Requirement: 交互状态

| 状态 | SHALL |
|---|---|
| 加载中 | 表格/卡片可感知 loading |
| 空列表 | 空态文案「暂无角色」 |
| 加载失败 | 错误提示 + 可重试 |
| 保存中 | 提交按钮 loading，防重复点击 |
| 校验失败 | 展示服务端/前端错误，不静默成功 |
| 搜索 | 支持角色名 keyword；debounce 或显式搜索与现网 admin 一致 |

## Scenario: 静态页被替换

- Given 平台超管已登录
- When 打开 `/admin/roles`
- Then 列表来自 API 且可见 `super_admin` / `platform_admin`
- And 不再仅渲染写死的 `isPlatformAdmin = true/false` 说明两行作为唯一内容

## Scenario: 只读平台管理员

- Given 用户为 `platform_admin` 且无 `portal.admin.roles.write`
- When 打开 `/admin/roles`
- Then 可查看角色与 chip
- And 不能成功保存权限变更

## Scenario: 超管改平台管理员权限包

- Given 超管编辑 `platform_admin`
- When 取消某业务 chip 并保存成功
- And 重新进入编辑
- Then 该 chip 仍为未选中
