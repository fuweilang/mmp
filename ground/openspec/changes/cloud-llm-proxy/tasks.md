# 任务 — cloud-llm-proxy（强制云端修订）

- [x] OpenSpec：proposal / design / specs（强制云端 + 砍 BYOK）
- [x] OpenSpec：补强不可协商原则（prod+dev / web+client / 云端超管池 / model_ref 回落 / 已发布交付）+ baota-release MUST 指针
- [x] 服务器 Octop：云端 chat completions 网关 + resolved（无 Key）
- [x] 服务器 Octop：`exchange-console-token` 换云端 JWT
- [x] 桌面：`cloud_inject` **忽略本机 providers**，强制云端虚拟 provider
- [x] Chat `/providers/resolved`：桌面只回云端目录
- [x] Web harness：`MammothBillingPrecheckMiddleware` + turn 后扣费（不与桌面双扣）
- [x] OctopServer boot bind billing server
- [x] 单测更新（desktop ignore local / server admin providers / ensure force）
- [ ] 手测：本机即使有旧 providers Key，对话仍打云端网关并扣费；Web 余额 0 被拦
- [x] 计费钱包 → `enterprise-ai-coin-billing/`

## 本地怎么验

1. 超管在服务器 `/agent/admin/models` 配好 DeepSeek/Kimi。
2. 桌面：即便 `~/.octop` 里曾有本地 Key，登录后 harness base_url 仍为 `{origin}/api/cloud/v1/p/...`。
3. Web：企业余额 0 时对话预检 402；有余额时 turn 后流水增加。
4. 单测：`cd Octop && uv run pytest tests/unit/providers/test_cloud_llm_proxy.py -q`

本地 only，不 push。

- [x] Octop：桌面 force-cloud 下 `is_model_ref_usable` / AUTO 选型改用 cloud/factory 运行时目录，不再信本机 providers 粘性
- [x] Dashboard：composer sticky/expert/preferred 与 `availableModels` 求交；无效 sticky 清掉并回落平台首选或 AUTO
- [x] Dashboard：登录后空 catalog 不立刻终态，短退避重拉 `listResolvedModels`；`modelsReady` 在重试期保持 loading

