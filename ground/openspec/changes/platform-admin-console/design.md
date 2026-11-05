# design

## 放哪

不新建 `apps/admin`。页面进 `apps/frontend`，接口进 `apps/backend`，库仍是 `mammoth_core`。

| 入口 | 去哪 |
|---|---|
| `/admin` `/admin/`* | Vue `:5202` |
| `/admin/api/*` | Nest `:3100`，rewrite 成 `/api/admin/*` |
| `/agent/admin/*` | 仍是 Octop，本 change 不改 |

## 角色映射

UI「平台管理员」= `user.is_platform_admin = true`。  
UI「普通用户」= `false`。

不新增 role 表。角色页只展示这两条说明，不可自定义。

企业内 OWNER/ADMIN/MEMBER 仍只在 console 成员页，Admin 不改。

## 数据

复用 `user`、`tenant`、`org_member`。本 change **不新建 Prisma model，不做迁移**。

- 用户列表：全库 `user`，可按姓名/手机/角色/状态筛。
- 新建普通用户：必填姓名、手机、密码、绑定一家企业（`org_member`，默认 MEMBER）。
- 新建平台管理员：可不绑企业。
- 停用用户：`status = inactive`，之后登录失败。
- 删除用户：物理删除普通用户；平台管理员不可删。成员关系 cascade，不写 Octop。
- 企业：全库 `tenant` 增删改。总部不可删。只有成员或默认「企业助手」可删。只属于该企业的普通用户一并删；跨企业用户只拆关系；平台管理员不删。有下级组织/自建智能体/知识库/用量则拒绝。
- 「进入业务工作台」：现有 `switch-tenant` + 新标签打开 `/console/`；停用企业拒绝。

Octop 影子用户：靠现有 `/login` + OIDC 首次进入 agent 时创建。Admin 不写 Octop 库。

## 登录分流

无 `next` 或 `next` 不可用时：

1. `isPlatformAdmin` → `/admin`
2. 否则 → `/agent/chat`（走现有 OIDC）

平台管理员登录后 `currentTenant` 为 `null`：他没有「自己的」企业控制台，必须从企业管理「进入业务工作台」切企业。`/console*` 在未选企业时提示并回 `/admin`。

console 侧栏去掉「租户」项、顶栏去掉「切换企业」，企业增删改查只在 `/admin/enterprises`。

## agent 会话

agent 侧（Octop）未登录时**不绕 `/login`**：直接 `POST /api/auth/oauth/start` 拿 authorize URL 跳转。中台会话在 → `/authorize` 直接 302 回回调；不在 → `/authorize` 自己 302 到 `/login?next=<authorize>`，由中台登录页放行。省掉一次整页加载，也避免平台管理员被回落丢到 `/admin`。

`/login?next=/agent*` 兜底保留（书签/直链入口）。

`/agent/chat` → `/chat/<agent>/<thread>` 是前端 `navigate(replace)`，不是刷新。

## 代运营横幅与退出

平台管理员的「当前企业」就是代运营上下文（没有 PeecAI 的 Brand 概念，故文案去掉「（全部品牌）」）。企业控制台在顶栏下方渲染 `代运营：{企业名}` + 「退出工作台」，条件 `isPlatformAdmin && currentTenant`。

进入 = `POST /auth/switch-tenant`（审计 `switch_tenant`）；退出 = `POST /auth/exit-workbench`：平台管理员专属，清空 cookie 里的 tenantId，审计 `exit_workbench`（挂在被退出的企业上，便于企业侧审计可见），再回 `/admin/enterprises`。

`next=/admin...` 且非平台管理员 → 当无权限，改走 `/agent/chat`。  
`next=/console...` 保持现有 `canAccessConsole` 判断。

## 前端壳

独立 `AdminLayout`，侧栏：首页、用户管理、角色管理、企业管理。品牌文案「猛犸总后台」。底部可跳「猛犸智能体」（`/agent/chat`）。样式 token 复用 `layout.css`。
