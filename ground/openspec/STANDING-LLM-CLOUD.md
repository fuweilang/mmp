# 站立原则：全环境 · 全端 · 云端大模型

> 以后，不管是生产环境还是开发环境，不管是Web端还是客户端，所有的大模型调用，都统一调用云端的大模型，由超级管理员配置。全部遵守这条原则。

| 项 | 要求 |
|----|------|
| 环境 | 生产 **与** 开发 |
| 端 | Web **与** 桌面/客户端 |
| 调用路径 | 云端中台模型（超管 Available Model Pool + 首选星标，`/agent/admin/models`） |
| 禁止 | 用户 BYOK / 本机厂商旁路 / 以个人 Octop checkout 代替已发布产物 |
| model_ref | 失效 sticky/preferred/expert → 平台首选或 `AUTO`，勿打已下架池模型 |
| 交付 | 已发布 client / server |

权威 OpenSpec：[`changes/cloud-llm-proxy/`](./changes/cloud-llm-proxy/)（`specs/cloud-llm/spec.md`）。  
发版 MUST 指针：仓库根 `.opencode/skills/baota-release/SKILL.md`。
