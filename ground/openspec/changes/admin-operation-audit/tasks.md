# 任务 — admin-operation-audit

- [x] OpenSpec
- [x] 权限：`portal.admin.audit` 入 catalog + platform_admin 包；迁移补授平台角色
- [x] Backend：`GET /api/admin/audit`（筛选/分页/企业名/脱敏 meta）
- [x] Frontend：`/admin/audit` + 菜单 + API；UI 对齐 console usage / peecai-ui
- [x] shared：`AuditActionLabel` 补 admin_* 文案
- [x] 本地 API 冒烟（列表/仅平台/企业账号 403）；页未浏览器手点（不 push）
