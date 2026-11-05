# admin-access

## Requirement: 管理菜单

Octop 管理员侧栏 SHALL 展示「管理」分组且默认展开，项为：用户、模型、存储、插件、安全防护、应用设置。对应路由：

- `/admin/users`
- `/admin/models`
- `/admin/backend`
- `/admin/plugins`
- `/admin/security`
- `/admin/advanced`

网关前缀为 `/agent`。无对应权限的项 SHALL 不出现。

## Requirement: 平台超管映射

中台 `isPlatformAdmin=true` 的用户经 OIDC 进入 Octop 后，Octop `users.role` SHALL 为 `admin`。已存在的影子普通用户在下次 SSO 登录时 SHALL 升级。升级前侧栏可以没有管理项。

## Scenario: 超管第一次看到管理

- Given `13800000001` 是中台平台超管
- When 重启 API/Octop 后退出并重新登录
- Then 头像角色为管理员，侧栏底部可见管理 6 项
- And 打开 `/agent/admin/models` 可配置提供商与模型
