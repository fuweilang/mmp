# 设计要点

## 静态资源前缀

Vite `base` 是 `/agent/`。硬编码 `/octop-mascot-*`、`/experts/avatars/*` 会打到网关中台，404。

SHALL 走 `import.meta.env.BASE_URL` 或 `withDashboardBase()`。

## 过期专家 URL

`resolvedAgentId` 不能直接用路由里的死 ID。列表加载完若 URL 专家不在列表：跳到第一个可用专家，或 `/chat`。跳转前不请求 threads/history/read。

## Steer 用户气泡

流式中回车走 `sendSteerWhileBusy`。`steer.drained` / `turn.ended` 不得删掉乐观用户气泡；只有 discarded 才删。

## SSO 角色

中台 `User.isPlatformAdmin` → OIDC claim `is_platform_admin`。

Octop `resolve_or_create_sso_user`：claim 为真则 `role=admin`；已存在的普通用户下次登录升级。JWT 在登录时签发，必须重新登录。

## 管理侧栏

`sectionsFromLayout` 强制附上 catalog 里的 admin 分组；折叠状态忽略 `admin`。权限仍由 `navAllowed` 过滤——所以超管必须先是 Octop admin，菜单才会出现。

## 两套后台

Octop「管理 / 控制」是运行时（模型、插件、存储），只映射平台超管。终端企业后台是 `/console/`（Agent、知识库、成员），数据带 `tenant_id`，不回写 Octop KB。

「租户」是超管 UI；企业管理员 UI 叫「本企业」，字段仍是 `tenantId`。
