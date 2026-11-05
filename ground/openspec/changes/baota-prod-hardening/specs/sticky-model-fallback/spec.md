# sticky-model-fallback

交叉：`ground/openspec/changes/cloud-llm-proxy/specs/cloud-llm/spec.md`「模型引用回落」「不可协商原则」。本文件只冻结**发版验收场景**，实现以 cloud-llm-proxy 为准，勿两套逻辑。

## Requirement: 登录后可用模型与池外 sticky

### Scenario: 登录后不出现长时间「还没有可用模型」

- **Given** 超管已在云端池配置可用模型，且用户已登录生产/类生产
- **When** 客户端完成 ensure_cloud / 目录拉取（含短退避重试）
- **Then** 模型列表应在合理时间内变为可用（loading 可接受；SHALL NOT 长时间卡死在空目录终态，除非池确实为空）

### Scenario: 池外 sticky 不得直接发会话

- **Given** 用户 sticky / preferred 指向已不在 Available Model Pool 的 model_ref（如已下架 `kimi-k2.6`）
- **When** 发送会话
- **Then** 回落平台首选（星标）或 `AUTO`
- **And** SHALL NOT 对池外模型直接发起上游调用
