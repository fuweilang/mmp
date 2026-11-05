# unify-ground-octop-rbac

猛犸权限打通：中台 ground 成为 Role/分配权威，登录下发 `effectivePermissions`；Octop 门禁只认 permission keys；admin `/admin/roles` 做成真角色 + permChip。

## 背景

现状分裂：

| 面 | 现状 | 问题 |
|---|---|---|
| 总后台 `/admin/roles` | `AdminRoles.vue` 静态两行（平台管理员 / 普通用户），绑死 `User.isPlatformAdmin` | 不能配置权限包，也不能区分超管与平台运营 |
| 企业 console | `OrgMember.role = OWNER \| ADMIN \| MEMBER`，只控能否进 console / 管成员 | 与 agent 模块权限无关 |
| Octop `/agent/admin/users?tab=roles` | 真 RBAC：`user_roles` + `permissions.py` catalog + `RolesPanel` permChip | 权威在运行时影子库，与中台账号不同源 |

账号源只在中台 `mammoth_core`。平台管理员经 OIDC 只带 `is_platform_admin`，Octop 靠 MAMMOTH-PATCH 映射成本地 `admin` 角色，**没有统一的 permission keys 下发**。

`platform-admin-console` 已明确「新角色体系 / 权限矩阵」为非目标；本 change 补上那块。

## 目标

1. **一期定全局模型**：Role / 分配 / Catalog / 有效权限计算一次定清，后续分期只扩能力不改权威方向。
2. **admin 一期可交付**：`/admin/roles` 真角色 CRUD（平台内置角色 + 权限 chip），用户可绑平台角色。
3. **console 一期不自定义角色**：继续用 OWNER/ADMIN/MEMBER，但各自映射到**预设权限包**；自定义企业角色放二期。
4. **权限权威 A**：ground 存 Role 与分配；登录/session/OIDC 下发 `effectivePermissions`；Octop 门禁只认 keys；Octop 本地 `user_roles` 仅作降级兼容。

## 范围（一期）

- ground Prisma：Role / RolePermission / 平台角色分配；兼容保留 `isPlatformAdmin` 派生或回填
- ground Catalog：以 Octop 模块 keys 为主，补 `portal.admin.*` / `portal.console.*`
- `/admin/roles`：真数据 + permChip（交互参考 Octop RolesPanel / PermissionCheckboxPicker，**不**搬 PeecAI 细粒度权限树）
- `/admin/users`：平台角色从「布尔平台管理员」升级为可选 `super_admin` / `platform_admin`（及后续自定义平台角色若一期支持编辑模板）
- session `/auth/me` + OIDC claims：增加 `effectivePermissions`（及必要的平台角色标识）
- Octop：消费 OIDC/handoff 下发的 keys 做门禁；本地 `user_roles` 降级路径保留
- 企业三档预设包：OWNER / ADMIN / MEMBER → 固定 permission key 集合（一期不可在 console 改包）

## 非目标

- 二期才做：console 自定义角色、企业内自建权限包编辑器
- 不搬 PeecAI 权限树 / Brand 隔离模型
- 不改 PeecAI 仓库
- 不把 Octop `/agent/admin/users` 变成产品账号源（仍是运行时影子用户）
- 不在一期删除 Octop 本地 `user_roles` 表
- 不提交/推送 git（由工程窗口自行处理）

## 用户流程

### 平台超管配置角色

1. `super_admin` 登录 → `/admin/roles`
2. 看到内置平台角色（至少 `super_admin`、`platform_admin`）与其权限 chip
3. 可编辑 `platform_admin`（及非系统锁定角色）的 chip；`super_admin` 默认全开且含「改平台角色模板」类 portal key
4. 在 `/admin/users` 给用户分配平台角色（替代单纯勾选「平台管理员」）

### 平台管理员日常

1. `platform_admin` 登录 → `/admin`
2. 可管用户、企业；默认**不能**改平台角色模板（缺对应 portal key 时角色编辑入口禁用或接口 403）
3. 进入某企业工作台后，有效权限仍按「平台角色 ∪ 当前企业成员预设包」计算（详见 design）

### 企业成员使用 agent / console

1. 用户登录后 session 带 `effectivePermissions`
2. OWNER：agent 模块权限全开 + console 管理类 portal keys
3. ADMIN：业务模块 + 成员管理
4. MEMBER：对话（ungated）+ 少量默认 settings；**不能**进 console（保持现网 `canAccessConsole`）
5. 进 `/agent/*` 时 Octop 用下发 keys 门禁；若中台 keys 缺失则降级读本地 `user_roles`/user.permissions

### 失败 / 降级

- Catalog 拉取失败：角色编辑页展示错误态，禁止保存未知 key
- OIDC 未带 permissions：Octop 沿用本地权限，并打可观测日志（不静默提权）
- 用户无平台角色且无企业成员：仅能登录后进 agent 基础能力（按 MEMBER 预设或更窄的 baseline），不能进 `/admin` / `/console`

## 验收标准（摘要）

1. `/admin/roles` 数据来自 API，不再是写死两行；能展示 chip，loading/空/错误齐全。
2. `super_admin` 能改角色模板；`platform_admin` 默认不能。
3. `/auth/me` 与 OIDC token/userinfo 含 `effectivePermissions: string[]`。
4. OWNER/ADMIN/MEMBER 映射与 design 预设表一致，MEMBER 仍进不了 console。
5. Octop 对某 key 无授权时对应 nav/API 拒绝；有下发 key 时不依赖本地把用户提成 `admin` 才能进模块页。
6. 现网 `isPlatformAdmin=true` 用户迁移后仍能进 `/admin`（映射到平台角色，默认 `super_admin` 或显式回填策略见 design）。
7. 秋池按 `specs/` 场景可手工/脚本验收；本 change 文档齐全。

## 与既有 OpenSpec 关系

- `platform-admin-console`：总后台壳与 `isPlatformAdmin` 二元角色已落地；其中「SHALL NOT 新建权限表」被**本 change 显式废止/升级**。
- `agent-runtime-ux-hardening` / `admin-access`：超管 → Octop `admin` 映射保留为过渡；一期结束后优先 keys，不再把「进管理页」等价于本地 system admin（除非仍持有全量 admin 类 keys / 平台超管）。
