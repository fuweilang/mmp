# org-role-presets

## Requirement: 三档句柄不变

企业成员角色句柄一期 SHALL 仍为 `OrgMember.role ∈ {OWNER, ADMIN, MEMBER}`。

Console 成员管理 API/UI SHALL 继续增删改该 enum；SHALL NOT 在一期要求自定义 roleId。

## Requirement: 预设包

系统 SHALL 为三档维护内置 Role 权限包（建议 key：`org_owner` / `org_admin` / `org_member`）：

| OrgMember.role | 权限意图（验收口径） |
|---|---|
| OWNER | agent 模块权限相对全开（种子含主要 nav/settings/control 业务 keys）+ 全部 `portal.console.*` |
| ADMIN | 业务模块 keys（种子子集）+ `portal.console.access` + `portal.console.members` |
| MEMBER | 对话不门禁 + 少量默认 settings keys；**不含** `portal.console.access` |

具体 key 列表以种子为准，变更种子 MUST 同步更新本表注释或附录。

## Requirement: console 准入

现网规则保持：

- OWNER / ADMIN（或平台管理员代运营）可进入 `/console`
- MEMBER SHALL NOT 进入 `/console`（`canAccessConsole` 为 false）

实现可额外要求 `portal.console.access` ∈ effectivePermissions；MEMBER 种子不得包含该 key，二者 SHALL 一致。

## Requirement: 切换企业重算

当用户切换 `currentTenant` 后，下一次 `GET /auth/me` SHALL 按新企业成员角色重算 `effectivePermissions`。

## Requirement: 一期禁止自定义

Console IA SHALL NOT 提供「创建企业自定义角色 / 编辑成员权限包」入口。

自定义企业角色整包能力归二期。

## Scenario: OWNER 能管 console 与 agent 模块

- Given 用户在企业 E 为 OWNER，无平台角色
- When `GET /auth/me`（当前企业 E）
- Then `effectivePermissions` 含 `portal.console.access`
- And 含至少一类 agent 业务 key（如 `experts` 或种子规定的全开集合中的代表 key）

## Scenario: MEMBER 不能进 console

- Given 用户在企业 E 仅为 MEMBER
- When 访问 `/console/`
- Then 无法使用企业控制台（重定向或无权限提示）
- And `effectivePermissions` 不含 `portal.console.access`

## Scenario: 跨企业角色不同

- Given 用户在企业 A 为 MEMBER，在企业 B 为 OWNER
- When 切换当前企业从 A 到 B 后拉取 `/auth/me`
- Then permissions 从「无 console」变为「有 portal.console.access」
