# design — cloud-llm-proxy（强制云端）

## 不可协商范围

- **环境**：生产与开发同一原则；不得用 `NODE_ENV` / 本地 flag 打开 BYOK 或本机厂商旁路。
- **端**：Web harness 与桌面客户端 harness 的对话 LLM 均以超管云端 `providers` 为真相源。
- **交付**：行为以已发布服务端 + 已发布客户端为准；个人本机 Octop checkout 仅供开发，不代替发版。

站立原则原文与 SHALL 见 `specs/cloud-llm/spec.md`「不可协商原则」。

## 调用链（桌面）

```
本机 Octop harness
  → ChatOpenAI(base_url={cloud}/api/cloud/v1/p/{provider}, api_key={cloud_octop_jwt})
  → POST {cloud}/api/cloud/v1/p/{provider}/chat/completions
  → ground gateway /api → 服务器 Octop
  → billing_precheck → 用服务器 providers Key 转发厂商 → tee 流式扣费
  → 流式回传

本机工具（filesystem / workspace）仍打本机 Octop，不经云端。
本机 providers 表即使有用户历史 Key：**不参与** harness / 模型列表。
```

## 调用链（Web）

```
浏览器 → 服务器 Octop harness（providers = 超管配置的真相源）
  → MammothBillingPrecheckMiddleware（企业 AI 币预检）
  → 直连上游厂商（Key 仅在服务器）
  → turn 结束后 _schedule_mammoth_harness_charge（按 token 扣费）

说明：Web 与桌面共用猛犸钱包/流水；**扣费 SoT 已统一为 harness turn 结算**（`_schedule_mammoth_usage_and_charge`）。cloud_llm 仅预检、不再 tee 扣费，避免流式无 usage 漏扣与双扣。
```

## 换票（桌面）

```
桌面登录成功 → mammoth.console_handoff.{user_id}
  → POST {cloud}/api/auth/mammoth/exchange-console-token
  → 云端 Octop access_token → settings: mammoth.cloud_llm.access_token
```

## 注入时机（强制）

- boot / 登录后 / on_provider_changed：桌面 **始终** `ensure_cloud_virtual_providers`（忽略 local usable）
- 本机已有 providers：**不再**「本机优先」；一律云端
- Web：`build_harness_configs()` 仅反映超管服务器配置
- Dev 环境：同样强制云端注入；不以「方便本地调试」恢复本机 Key 旁路

## model_ref 回落

- 选型入口（sticky / preferred / expert 默认 / 会话恢复）在解析 `model_ref` 时校验是否属于当前 Available Model Pool（超管 `/agent/admin/models`）。
- 不在池内 → 平台首选（星标）→ `AUTO`；禁止继续请求已移除条目（例：池去掉 `kimi-k2.6` 后不得再打该 ref）。
- Web 与桌面共用同一回落语义，避免一端已回落、另一端仍打旧模型。

## 安全

- 厂商 `api_key` 永不写入桌面 `providers`、永不下发 JSON
- `/api/cloud/providers/resolved` 不含 `api_key`
- 网关/预检需有效登录态
- `/agent/admin/models` 写权限不变（超管）

## 为何 Web 不强制 HTTP 绕一圈网关

多租户共享 `ChatModelFactory`，无法把「每用户 JWT」塞进共享 provider.api_key。
Web 已在持 Key 的服务器进程内，与桌面网关共用同一套 `mammoth_billing` 预检/扣费即可满足「猛犸统一统计」。
