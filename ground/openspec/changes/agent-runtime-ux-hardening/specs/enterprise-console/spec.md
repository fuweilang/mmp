# enterprise-console

终端企业用 `/console/`，不是 Octop「管理 / 控制」。P0 与 P1 已实现；P2 未做。

## Requirement: 两套后台

- `/agent` 的「管理」「控制」SHALL 只给平台超管（`isPlatformAdmin=true`）。普通用户（如浪子）SHALL NOT 看到这两项。
- 终端企业管理员 SHALL 只在 `/console/` 管本企业。SHALL NOT 把 Octop 管理页开放给企业管理员。

## Requirement: 角色

| 角色 | 进 `/console/` | 进 `/agent` 管理/控制 | 聊天 |
|---|---|---|---|
| 平台超管 | 是（含租户） | 是 | 是 |
| 企业管理员 | 是（本企业） | 否 | 是 |
| 知识管理员 | 是（仅知识库） | 否 | 是 |
| 普通员工 | 否 | 否 | 是 |

普通员工默认首页 SHALL 为 `/agent/chat`。

## Requirement: 终端企业侧栏

企业管理员在 `/console/` SHALL 看到：

- 工作台
- 智能体
- 知识库
- 成员
- 用量与审计（P1）
- 企业设置（P1）

「租户」SHALL 只对平台超管出现。企业管理员侧栏 SHALL NOT 出现「租户」。

内部字段仍用 `tenantId`；UI 对企业管理员显示「本企业」，不显示「租户」。

## Requirement: P0 范围

下一刀实现 SHALL 覆盖：

- **智能体**：本企业 Agent 列表、人设、开关、谁能用。数据 `agent_ref`，带 `tenant_id`。
- **知识库**：上传材料、目录、生效状态、谁能看。数据 `kb*` 只放中台，带 `tenant_id`。SHALL NOT 打开 Octop 自带 KB。
- **成员**：本企业通讯录 + 角色，不是租户列表。
- **工作台**：用量摘要、待处理知识、邀请入口。SHALL NOT 只展示当前用户信息。

跨租户数据 SHALL NOT 可见。知识库文件 SHALL 只在 `/console/knowledge` 管理。对话检索 SHALL 只查中台 `kb*`（带 `tenant_id` + 授权），SHALL NOT 打开 Octop 自带 KB。

## Requirement: P1 / P2

P1 已实现：用量/配额（`usage_event` / `quota`）、审计页、企业设置（名称、Logo、默认 Agent、欢迎语）。会话质检本窗口不做。

P2 不实现：技能开关、快捷指令、渠道、数据导出。

## Requirement: 法律行业

法律 SHALL 叠在通用能力上：法律 Agent 人设 + 分库知识（法规/合同范本/客户名单）+ 按组授权。引用必须能溯源。SHALL NOT 编造法条、案件、胜诉结论。

SHALL NOT 做法案管理、计时计费、卷宗、开庭日历。

## Scenario: 浪子登录

- Given 浪子是普通员工
- When 登录成功
- Then 进入 `/agent/chat`，侧栏无「管理」「控制」
- And 无 `/console/` 菜单或进入后无管理项

## Scenario: 企业管理员登录

- Given 用户是某律所企业管理员
- When 打开 `/console/`
- Then 侧栏为工作台 / 智能体 / 知识库 / 成员 / 用量与审计 / 企业设置
- And 无「租户」
- And 只能看到本企业数据

## Scenario: 平台超管登录

- Given `13800000001` 是平台超管
- When 打开 `/agent`
- Then 可见「管理」「控制」
- And `/console/` 可见「租户」
