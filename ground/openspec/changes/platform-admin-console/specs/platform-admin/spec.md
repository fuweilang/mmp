# platform-admin

## Requirement: 入口与权限

系统 SHALL 在 `http://127.0.0.1:5201/admin` 提供猛犸总后台。

仅 `user.isPlatformAdmin = true` 的已登录用户 SHALL 打开 `/admin` 及其子页和 `/admin/api/*`。

普通用户打开 `/admin*` 时 SHALL 不渲染后台，并跳到 `/agent/chat` 或 `/login`。

## Requirement: 登录分流

`/login` 成功且没有合法 `next` 时：

- 平台管理员 SHALL 进入 `/admin`
- 普通用户 SHALL 进入 `/agent/chat`

`next` 指向 `/admin` 但当前用户不是平台管理员时，SHALL 忽略该 next，按普通用户分流。

OIDC 回调、`/console` 的 next 规则 SHALL 保持现有行为。

## Requirement: 信息架构

Admin 侧栏 SHALL 含：首页、用户管理、角色管理、企业管理。

对应路由：

- `/admin` 首页
- `/admin/users` 用户管理
- `/admin/roles` 角色管理
- `/admin/enterprises` 企业管理

品牌文案 SHALL 为「猛犸总后台」，不得写成「猛犸智能体」。

## Requirement: 首页

任务一的首页 SHALL 显示占位内容（Hello World 或一句「猛犸总后台」即可），不要求指标卡。

## Requirement: 两个角色

Admin 角色 SHALL 只有：

| UI | 字段 |
|---|---|
| 平台管理员 | `isPlatformAdmin = true` |
| 普通用户 | `isPlatformAdmin = false` |

角色管理页 SHALL 只读展示这两条及各自能进的系统：

- 平台管理员：`/admin`、`/agent`
- 普通用户：`/console`（须是企业 OWNER/ADMIN）、`/agent`

SHALL NOT 新增角色、SHALL NOT 新建权限表。

## Requirement: 用户增删改查

平台管理员 SHALL 能列出全部中台用户（跨企业）。

创建用户 SHALL 要求：姓名、手机号、密码、角色。手机号已存在 SHALL 拒绝。

创建普通用户时 SHALL 指定一家企业并写入 `org_member`（默认 MEMBER）。创建平台管理员时企业可空。

编辑 SHALL 能改姓名、角色、状态；改密码为可选。响应和列表 SHALL NOT 返回密码哈希。

停用用户 SHALL 把 `status` 设为 `inactive`，之后登录 SHALL 失败。

删除用户 SHALL 物理删除普通用户及其企业成员关系；平台管理员 SHALL NOT 被删除。服务端即使收到请求也 SHALL 拒绝删除平台管理员或当前操作者。删除后同一手机号可再用于新建用户。SHALL NOT 同步删除 Octop 影子用户。

新建用户首次走 `/login` 再进 `/agent` 时，SHALL 仍由现有 OIDC 创建 Octop 影子用户。Admin SHALL NOT 直写 Octop 用户表。

## Requirement: 平台管理员没有自己的企业上下文

`/admin` SHALL 是平台管理员的唯一后台，平台管理员 SHALL NOT 拥有属于自己的企业控制台上下文中台。

平台管理员登录成功后，当前企业 SHALL 为空；只有在企业管理点击「进入业务工作台」后，SHALL 才把当前企业切到目标企业。

平台管理员未选定企业时访问 `/console*`，SHALL 不渲染企业页面，并提示从总后台「进入业务工作台」后回到 `/admin`。

企业控制台 SHALL NOT 提供「租户」侧栏项或「切换企业」入口；企业增删改查只在 `/admin/enterprises`。

平台管理员 SHALL 仍可直接访问 `/agent`。

## Requirement: 企业管理

平台管理员 SHALL 能列出全部 `tenant`，并创建、编辑名称/品牌/状态。新建企业 SHALL 固定为 `ENTERPRISE`，SHALL NOT 选择类型。

删除企业时：猛犸总部（`PLATFORM`）SHALL 拒绝；其他企业前端 SHALL 允许点击删除。仅有成员或系统默认「企业助手」时 SHALL 允许删除，并 cascade 删除默认助手。只属于该企业的普通用户 SHALL 一并删除；还属于其他企业的用户 SHALL 只拆关系。平台管理员 SHALL NOT 被删除。若仍有下级组织、用户自建智能体、知识库或用量数据，服务端 SHALL 拒绝并返回「有数据，不能删除」。

「进入业务工作台」SHALL 把当前会话切到该企业，并在新标签打开 `/console/`。效果等同 PeecAI 进入业务工作台：保留真实操作者，不切换登录身份，停用企业 SHALL 拒绝进入。

UI 称「企业」，内部仍用 `tenant`。

## Scenario: 超管登录进总后台

- Given `13800000001` 是平台管理员
- When 打开 `/login` 登录且无 next
- Then 进入 `/admin`
- And 侧栏可见首页、用户管理、角色管理、企业管理

## Scenario: 普通用户进不了 Admin

- Given 某用户 `isPlatformAdmin = false`
- When 打开 `/admin/users`
- Then 不展示总后台
- And 被送到 `/agent/chat` 或 `/login`

## Scenario: Admin 开的普通用户能登录

- Given 平台管理员在 `/admin/users` 创建手机号新用户，角色普通用户，已绑企业
- When 该用户 `/login`
- Then 进入 `/agent/chat`
- And 若其为该企业 OWNER 或 ADMIN，可再打开 `/console/`

## Scenario: 平台管理员未选企业不能进控制台

- Given 平台管理员刚登录，`/admin` 的当前企业为空
- When 打开 `/console/`
- Then 不渲染企业页面
- And 提示从总后台「进入业务工作台」，并回到 `/admin`

## Scenario: 进入某家企业业务工作台

- Given 平台管理员在 `/admin/enterprises`
- When 点击某家企业「进入业务工作台」并在弹窗确认
- Then 当前企业切到这家
- And 在新标签打开 `/console/`
- Then 停用企业点击时 SHALL 提示不能进入

## Requirement: 企业控制台显示代运营横幅

平台管理员以代运营身份进入某企业后，企业控制台 SHALL 在顶栏下方显示横幅 `代运营：{企业名}`，并提供「退出工作台」。

横幅 SHALL 只在 `isPlatformAdmin` 且当前企业非空时出现；企业自身成员 SHALL NOT 看到。

「退出工作台」SHALL 清空当前企业（会话回到平台身份的「无企业」状态），记录一条 `exit_workbench` 审计，并把当前标签送到 `/admin/enterprises`。退出后平台管理员再直接打开 `/console/` SHALL 被拦回 `/admin`。

## Scenario: 代运营横幅与退出

- Given 平台管理员从 `/admin/enterprises` 进入了演示企业
- When 打开 `/console/`
- Then 顶栏下方显示「代运营：演示企业」
- And 点「退出工作台」
- Then 当前企业清空，该标签回到 `/admin/enterprises`
- And 该企业用量与审计里出现一条「退出业务工作台」
