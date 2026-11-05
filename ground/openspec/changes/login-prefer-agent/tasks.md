# 任务

- [x] `Login.vue` `goAfterLogin`：去掉无 next 时进 `/admin`、`/console/` 的默认分流，统一 `startOctopSession`
- [x] 纠正本地账号 `17773333444`：去掉误授 `platform_admin` / `is_platform_admin`，恢复小米企业 `org_admin` + `OrgMember.ADMIN`
- [ ] 手工验证：该号登录后进 Agent；`13800000001` 无 next 也进 Agent，带 `?next=/admin` 仍进总后台
