# 任务

- [x] `Login.vue` `goAfterLogin`：去掉无 next 时进 `/admin`、`/console/` 的默认分流，统一 `startOctopSession`
- [x] 纠正本地账号 `17773333444`：去掉误授 `platform_admin` / `is_platform_admin`，恢复小米企业 `org_admin` + `OrgMember.ADMIN`
- [ ] 手工验证：该号登录后进 Agent；`13800000001` 无 next 也进 Agent，带 `?next=/admin` 仍进总后台

## Web 与桌面登录回流补记（2026-11-05）

- 普通浏览器直接登录或注册后进入配置的 Web 智能体首页。显式访问 Admin 或 Console 会保留目标及原有权限校验。Admin 和 Console 的网页版与客户端入口分开。
- 桌面发起时继续同源的 OIDC 授权请求，原请求负责校验 PKCE 并回到发起登录的 Host。桌面保存凭证后将客户端置前，浏览器只显示成功提示。
- 本地浏览器实测密码登录只进入 Web。用隔离的 MMP Dev 实测客户端密码登录，Host 回调返回 200，桌面工作区获得焦点。浏览器注册使用模拟成功响应，验证了 Web 首页和原 OIDC 回调两条去向，未创建企业。
