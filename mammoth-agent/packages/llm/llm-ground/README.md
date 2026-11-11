# @mammoth-ai/mmp-llm-ground

猛犸 Ground 云端模型适配器（方案 1）。

- Provider：`mammoth-ground`
- Catalog：`GET {GROUND}/api/v1/models`（SSO Bearer）
- Chat：`POST {GROUND}/api/v1/chat/completions`（stream）
- SSE：DeepSeek `reasoning_content` → harness reasoning 块，随后 `content` 为可见回复
- 凭证：`deepseekAccount.resolveToken(groundOrigin)`（与 OIDC grant 同源）
- 默认 model：`auto` → 平台首选 / 列表首个

使用 `mmp-base` 的正式 Web、Desktop、Headless、SDK 与 ACP 配置只挂载此云端路由；厂商 Key 由 Ground 超管配置，环境变量不能恢复本机 BYOK 旁路。

官方专家固定模型在 Host 预算计算前确定，并由 Ground 再次校验。显式模型不可用时提示重新选择，不静默切换。已发布专家携带版本归属头，预览携带预览归属头，两者沿用正常网关和计费路径。

会话所有者可通过生命周期管理的 `groundRequestAttribution.guard()` 注册最终 wire 校验；adapter 在 body fitting 之后、HTTP 之前调用它。知识证据发生未记录的缺失或裁剪时失败关闭，不修改通用拟合器或通用 AgentLoop。
