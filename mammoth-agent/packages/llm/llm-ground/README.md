# @mammoth-ai/mmp-llm-ground

猛犸 Ground 云端模型适配器（方案 1）。

- Provider：`mammoth-ground`
- Catalog：`GET {GROUND}/api/v1/models`（SSO Bearer）
- Chat：`POST {GROUND}/api/v1/chat/completions`（stream）
- SSE：DeepSeek `reasoning_content` → harness reasoning 块，随后 `content` 为可见回复
- 凭证：`deepseekAccount.resolveToken(groundOrigin)`（与 OIDC grant 同源）
- 默认 model：`auto` → 平台首选 / 列表首个

使用 `mmp-base` 的正式 Web、Desktop、Headless、SDK 与 ACP 配置只挂载此云端路由；厂商 Key 由 Ground 超管配置，环境变量不能恢复本机 BYOK 旁路。
