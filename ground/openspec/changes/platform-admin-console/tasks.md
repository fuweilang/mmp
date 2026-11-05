# 任务

按顺序做。做完任务一再开任务二。只叫李庚写代码。

## 任务一：壳和权限

- [x] 网关：`/admin/api` → `:3100` `/api/admin`；`/admin` 页面走 Vue
- [x] `AdminLayout` + 路由 `/admin` `/admin/users` `/admin/roles` `/admin/enterprises`
- [x] 非平台管理员访问 `/admin*` 不得进入
- [x] `/login` 无 next 时：默认 → `/agent/chat`（后改为 login-prefer-agent；`next=/admin` 仍给平台管理员）
- [x] 首页占位文案 Hello World（或「猛犸总后台」一句即可）
- [x] 用户/角色/企业页可先空壳，侧栏能点进去

## 任务二：用户和角色

- [x] `GET/POST /api/admin/users`，`PATCH /api/admin/users/:id`（含停用）
- [x] 用户管理页：搜索、角色筛选、增改、停用；密码不回显
- [x] 新建普通用户必须绑一家企业；平台管理员可不绑
- [x] 角色页只展示两条：平台管理员、普通用户（只读）
- [x] 种子账号 `13800000001` 能进用户页；新建普通用户能 `/login` 再进 agent

## 任务三：企业

- [x] `GET/POST /api/admin/enterprises`，`PATCH /api/admin/enterprises/:id`
- [x] 删除企业：无成员才允许
- [x] 企业管理页：列表 + 增改删
- [x] 「进入业务工作台」：切换当前企业并在新标签打开 `/console/`
- [x] 本 OpenSpec 任务勾完

## 对齐：admin / console / agent

- [x] 平台管理员登录后当前企业为空（没有自己的 console）
- [x] `/console*` 未选企业时提示「进入业务工作台」并回 `/admin`
- [x] console 去掉「租户」侧栏项、「切换企业」顶栏项
- [x] admin 侧栏底部改为「猛犸智能体」→ `/agent/chat`
- [x] 企业管理按钮改「进入业务工作台」（弹窗确认 + 新标签开 `/console/`）
- [x] 平台管理员保有 `/agent` 访问
- [x] agent 侧未登录直接在 Octop 发起 OIDC（不绕 `/login`）：不会被弹回 `/admin`，并少一次整页加载；`/login?next=/agent*` 仍保留兜底
- [x] 企业管理「进入业务工作台」弹窗的 loading/disabled 用 boolean（原来 string 触发 Vue 布尔强转，永远 loading）
- [x] 企业控制台代运营横幅：`代运营：{企业名}` + 「退出工作台」（清当前企业、记 `exit_workbench` 审计、回 `/admin/enterprises`）

## 明确不做

- [ ] 改 Octop `/agent/admin/users`
- [ ] PeecAI 同步
- [ ] 物理删除用户
- [ ] 新权限表