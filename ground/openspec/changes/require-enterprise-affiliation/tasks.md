# 任务 — require-enterprise-affiliation

- [x] `/console/members` 菜单、路由 title、Home 入口改为「成员管理」
- [x] 注册 `createEnterpriseAccount`：企业名 trim 后为空则拒绝
- [x] admin `createUser` / `updateUser`：非平台账号必须有企业归属；禁止解绑全部企业
- [x] 登录：非平台且零企业成员关系 → Forbidden
- [x] AdminUsers 前端所属企业校验文案对齐
