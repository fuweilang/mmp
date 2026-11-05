# platform-admin-console

猛犸公司总后台：给平台管理员管用户、角色、企业。写在现有 `apps/frontend` + `apps/backend`，不新开仓库。

## 背景

企业客户用 `/console` 和 `/agent`。猛犸自己的人没有总后台，只能挤在 console「租户」页或 Octop `/agent/admin/users`。后者是运行时影子用户，不是产品账号。

账号源只在中台 `mammoth_core`。

## 目标

- 平台管理员登录后进 `/admin`，能管全部用户和企业。
- 普通用户登录后进 `/agent/chat`，进不了 `/admin`。
- Admin 新建的用户能登 `/login`，再进 agent；普通用户还能进所属企业的 console。
- 平台管理员可从企业管理「进入」某家企业的 console。

## 范围

- 网关：`/admin` → Vue；`/admin/api` → Nest
- 前端：`apps/frontend` 增加 `/admin` 四页，样式抄 console
- 后端：`apps/backend` 增加 admin 模块，复用 `user` / `tenant` / `isPlatformAdmin`
- 登录跳转：`/login` 按角色分流

分 3 个任务做，见 `tasks.md`。

## 非目标

- 另起 admin 前后端项目
- 改 Octop `/agent/admin/users`（本 change 不双向同步）
- 新角色体系 / 权限矩阵（只有两个角色）
- PeecAI / 老系统同步
- 秋池、甜甜、浪哥、王总参与
- 提交/推送 git

## 用户流程

1. `/login`：默认 → `/agent/chat`（见 `login-prefer-agent`）；`next=/admin` 时平台管理员进总后台。
2. `/admin` 首页占位。
3. 用户管理：增删改查；角色只有「平台管理员 / 普通用户」。
4. 企业管理：列出全部企业，增删改查；「进入」切到这家 `/console/`。
5. 普通用户访问 `/admin*` → `/login` 或 `/agent/chat`。

## 风险

- 登录默认首页从 agent 改成按角色分流，OIDC `next` 参数仍要尊重。
- 删除用户若物理删会撞成员/授权外键；本 change 删除 = 停用。
- 平台管理员进入 console 后权限很大，只对 `isPlatformAdmin=true`。
