# enterprise-affiliation

## Requirement: 成员管理文案

`/console/members` 的侧栏菜单与页面标题 SHALL 显示「成员管理」。

### Scenario: 打开成员页

- **WHEN** 企业管理员进入 `/console/members`
- **THEN** 侧栏高亮项与页标题均为「成员管理」

## Requirement: 注册必须有企业

console 与 agent 经中台 `POST /auth/register` 的自助注册 SHALL 创建企业并为注册人建立成员关系；企业名 trim 后为空时 SHALL 拒绝。

### Scenario: 缺企业名

- **WHEN** 注册请求的 `enterpriseName` 为空或仅空白
- **THEN** 服务端拒绝，不创建用户

## Requirement: 加人必须有企业归属

Admin 创建/更新用户时，除超级管理员、平台管理员外，用户 SHALL 有所属企业；显式 `tenantId: null` 解绑全部企业 SHALL 仅允许纯平台账号。Console 加人 SHALL 在当前企业上下文下执行（无当前企业则不可加人）。

### Scenario: admin 创建无企业业务用户

- **WHEN** 管理员创建用户且角色非纯平台账号、且未传 `tenantId`
- **THEN** 返回错误「用户必须有企业归属」

### Scenario: admin 解绑非平台用户企业

- **WHEN** 管理员对非纯平台账号提交 `tenantId: null`
- **THEN** 拒绝解绑

## Requirement: 拦无企业业务用户登录

非平台管理员且不存在任何企业成员关系的账号登录时 SHALL 被拒绝。

### Scenario: 孤儿业务账号登录

- **WHEN** 业务账号密码正确但 `org_member` 为空
- **THEN** 返回 Forbidden「账号未归属任何企业，请联系管理员」
