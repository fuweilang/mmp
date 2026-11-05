# chat-ux

## Requirement: 思考过程默认折叠

对话执行中，思考与普通工具过程 SHALL 默认折叠，只显示「深度思考中 / 正在调用工具」类摘要。用户可点开详情。结束后保持一行摘要。单聊与团队偏好分 key 存储；未设置时默认折叠。

## Requirement: 流式中用户消息可见

用户在助手仍在回答时发送的文本 SHALL 立即作为右侧用户气泡出现。`steer.drained` 或 `turn.ended` SHALL NOT 删除该气泡，除非 steer 被 discarded。刷新后历史中的同一句话仍 SHALL 可见。

## Requirement: 过期专家路由

`/agent/chat/{agentId}/...` 在专家列表加载完成后，若 `agentId` 不在当前用户专家列表中，页面 SHALL 跳转到第一个可用专家或 `/agent/chat`，且 SHALL NOT 再请求该死 ID 的 threads/history/read。

## Requirement: 品牌图

欢迎吉祥物与空状态图 SHALL 从 `{BASE_URL}octop-mascot-*` 加载。当前 empty/peek 资源为猛犸 logo 占位，可再替换文件而不改路径约定。

## Scenario: 死专家链接

- Given 用户打开已删除专家的旧 URL
- Then 不出现「历史记录加载失败」连环 404
- And 进入仍存在的专家或空专家态
