# cloud-llm

## 不可协商原则（全环境 · 全端）

站立原则（产品硬约束，以后全部遵守）：

> 以后，不管是生产环境还是开发环境，不管是Web端还是客户端，所有的大模型调用，都统一调用云端的大模型，由超级管理员配置。

规范性要求：

- SHALL：上述原则适用于**生产与开发**、**Web 与桌面/客户端**；猛犸用户路径上每一次对话/Agent LLM 调用均走**云端中台模型**，由**超级管理员**在 Available Model Pool + 首选星标（`/agent/admin/models`）配置。
- SHALL NOT：以用户 BYOK、本机 `providers`、本机 Ollama/其它本地厂商，或开发者个人 checkout 里的旁路，作为猛犸用户对话 LLM 的调用路径。
- SHALL：环境变量、本地开发脚本、桌面注入逻辑均不得再引入「开发环境可走本机 Key / 生产才走云」的分叉；dev 与 prod 同一云端真相源（超管服务器 `providers`）。
- SHALL：粘性会话 / 用户 preferred / expert 默认等 `model_ref` 若已不在当前可用池（例如池变更后仍指向已下架的 `kimi-k2.6`），**必须**回落到平台首选（超管星标）或 `AUTO`；SHALL NOT 继续向已移除池模型发起调用。
- SHALL：行为修复通过**已发布的客户端 / 服务端**生效，不以某个开发者本机 Octop checkout 的临时改动作为用户侧解法。

交叉引用：发版技能 `.opencode/skills/baota-release/SKILL.md` 中的 MUST 子弹；本 change 的 `proposal.md` / `design.md`。

## 真相源

- SHALL：模型与厂商 Key 的真相源是**服务器 Octop** `providers`（超管在 `/agent/admin/models` 配置）。
- SHALL NOT：把厂商 `api_key` 同步进桌面本机 DB，或经 API 下发给客户端持久化。
- SHALL NOT：向终端用户提供「自配 API Key / 本地模型」作为对话 LLM 旁路。

## 网关

- SHALL：服务器 Octop 提供 `POST /api/cloud/v1/p/{provider}/chat/completions`，行为兼容 OpenAI chat completions（含 stream）。
- SHALL：网关用该 `{provider}` 在服务器 `providers` 中的 Key / base_url 转发上游。
- SHALL：`GET /api/cloud/providers/resolved` 返回可用模型元数据且**不含** `api_key`。
- SHALL：未认证请求不得调用网关（401/403）。
- SHALL：网关路径在转发前做猛犸企业 AI 币预检，并在 usage 可知后扣费。

## 桌面选用（强制云端）

- SHALL：桌面登录后（或 boot 时已有换票凭证）**始终**注入云端虚拟 provider，**即使本机 providers 表非空**。
- SHALL：虚拟 provider 的 `base_url` 指向云端网关；`api_key` 仅为云端 Octop 会话 JWT，不是厂商 Key。
- SHALL：桌面 Chat 模型列表只来自云端目录，不得回落本机 resolved。
- SHALL：本机 filesystem / workspace 工具仍由本机 Octop 执行。

## Web / 服务器 harness

- SHALL：Web harness 使用服务器 `providers`（超管配置）驱动模型。
- SHALL：Web harness 对话在 turn 前预检企业 AI 币，turn 后按 token 扣费（与桌面同一猛犸账单）。
- SHALL：Web/桌面扣费均以 harness turn 结算为唯一 SoT；cloud_llm 不得再扣费，避免双扣与流式无 usage 漏扣。

## 模型引用回落

- SHALL：桌面 force-cloud 模式下，会话 send 路径对 `model_ref` 的可用性判定（含 `is_model_ref_usable` / AUTO 候选）SHALL 以云端 resolved / harness factory 目录为准，SHALL NOT 以本机 `providers` 表残留行判定可用。
- SHALL：Chat composer 在发送前将 sticky / expert 默认 / 平台 preferred（★）与当前云端 `availableModels` 求交；不在池内时清除无效 sticky，并回落到平台首选或 `AUTO`。
- SHALL：登录后若首次拉取云端目录为空，SHALL NOT 立即永久视为无模型；须在 ensure_cloud / recovery 成功后或短退避轮询后重新拉取，并在就绪前保持 loading 态（适当场景）。

- SHALL：解析 sticky / preferred / expert 默认 `model_ref` 时，若目标不在当前 Available Model Pool，回落顺序为：平台首选（超管星标）→ `AUTO`（或产品约定的等价自动选型）。
- SHALL：回落须对 Web 与桌面一致；不得静默继续调用已下架 model_ref。
- SHALL：池变更（超管增删/改首选）后，既有会话与用户偏好在下次选型时遵循上述回落，无需用户手工清本地缓存才能停止打旧模型。

## 换票

- SHALL：`POST /api/auth/mammoth/exchange-console-token` 接受中台 `console_handoff_token`，校验通过后签发云端 Octop JWT。
- SHALL：换票失败时不得创建半残本地厂商 provider 行。

## 权限

- SHALL：非超管（无 providers 权限）仍不能打开模型配置写入口。
- SHALL：不在 ground admin 新增模型配置页。

## 发布路径

- SHALL：与本原则相关的服务端/客户端行为变更，须经已发布产物（宝塔服务端镜像/静态资源与已发布桌面客户端或 code/dashboard 通道）到达用户。
- SHALL NOT：把「开发者本机 Octop checkout 已改好」当作生产或其它用户开发环境的交付完成标准。

## 日志

- SHALL NOT：网关日志打印完整厂商 Key 或超长用户消息正文。
