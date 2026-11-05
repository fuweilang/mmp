# login-prefer-agent

登录成功默认进智能体（`/agent` / `startOctopSession`），不再默认进 `/admin` 或 `/console/`。

## 背景

此前 `goAfterLogin` 无 `next` 时：平台管理员 → `/admin`，企业控制台权限用户 → `/console/`。产品要求登录首选 Agent；总后台/企业控制台用显式 `next` 或侧栏入口。

## 目标

- `/login` 无 next（及非 admin/console/agent 显式目标）→ `startOctopSession` → `/agent/chat`
- `next=/admin`：仅 `isPlatformAdmin` 可进，否则仍进 Agent
- `next=/console|/middle`：有 console 权限才进（OIDC handoff 不变）
- 不改 Octop / 客户端注册

## 非目标

- 改 `issueBrowserSsoTicket` 的 console handoff next（从 Agent 进控制台仍走 `/console/`）
- 推 Git / 动 Octop
