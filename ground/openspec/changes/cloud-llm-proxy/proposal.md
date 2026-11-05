# cloud-llm-proxy

超管在服务器 Octop `/agent/admin/models` 统一配模型；**生产与开发、Web 与桌面/客户端、任何端 LLM 全部强制走猛犸云端代调并统一统计扣费**；厂商 Key 不下发；**砍掉用户自配 Key / 本地模型旁路**（用户不可配、无此说法）。本机工具（读文件、改代码）仍走本机 Octop。

## 站立原则（不可协商）

> 以后，不管是生产环境还是开发环境，不管是Web端还是客户端，所有的大模型调用，都统一调用云端的大模型，由超级管理员配置。全部遵守这条原则。

含义摘要：

- Prod **与** Dev；Web **与** 桌面/客户端：每一次 LLM 调用 → **云端中台模型**（超管 Available Model Pool + 首选星标）。
- 无 BYOK / 本地厂商作为猛犸用户调用路径。
- 失效的 sticky / preferred / expert `model_ref` → 平台首选或 `AUTO`，不得继续打已下架池模型。
- 修复经**已发布客户端/服务端**生效，不以个人本地 Octop checkout 为交付。

细则见 `specs/cloud-llm/spec.md`「不可协商原则」与「模型引用回落」。

## 背景

- 原 MVP：桌面「本机无 providers 时」才注入云端，本机已有 Key 则旁路云端 → 无法统一扣费。
- 产品硬要求（2026-10-31）：客户端 / Web / 任何端 **全部走云**，全部由猛犸统计；不是此逻辑的其它旁路全部砍掉；没有用户配置、没有用户本地模型。
- 补充硬要求（2026-11-02）：**开发环境同样遵守**；池变更后无效 `model_ref` 必须回落，避免继续调用已移除模型（如 `kimi-k2.6`）。

## 目标

1. OpenSpec 写清：强制云端（prod+dev、web+client）、无用户 BYOK、超管唯一配置入口、扣费挂钩、无效 model_ref 回落。
2. 桌面：忽略本机 `providers` 行，登录后一律注入云端虚拟 provider → 网关。
3. Web：服务器 `providers`（超管配）为真相源驱动 harness；**对话路径挂钩猛犸预检/扣费**（与桌面网关同一套企业 AI 币）。
4. Chat 模型列表：桌面只展示云端目录；永不回落本机自配。
5. 非超管仍看不到 `/agent/admin/models` 写入口；不在 ground admin 另做模型页。
6. 本地 only，不 push。

## 非目标

- 用户可配自己的 API Key / Ollama 本地模型作为对话旁路
- 「仅生产走云、开发可本机 Key」的环境分叉
- 在 ground admin 再做模型配置页
- 把厂商 `api_key` 同步进本机 DB
- 推 GitHub / CloudAgent / 登宝塔生产（本 change 文档任务本身）
- Anthropic 原生协议代调（MVP 仍 OpenAI-compatible）

## 方案摘要

| 项 | 决策 |
|----|------|
| 真相源 | 服务器 Octop `providers`（仅超管 `/agent/admin/models`） |
| 适用范围 | **prod + dev**；**Web + 桌面/客户端** |
| 桌面 LLM | **强制**云端虚拟 provider → `POST /api/cloud/v1/p/{provider}/chat/completions`；忽略本机 Key |
| Web LLM | 服务器 harness 用超管 providers；中间件预检 + turn 后扣费（猛犸企业 AI 币） |
| model_ref | 失效 → 平台首选（星标）→ `AUTO` |
| 鉴权 | 桌面：console_handoff → 云端 Octop JWT；网关/预检均需登录态 |
| 本机工具 | 仍由本机 Octop / harness 执行 |
| 用户配置 | **无**；无「本地模型」产品入口 |
| 交付 | 已发布 client / server；非个人 checkout |

## 风险

- 桌面与云端 Octop JWT 密钥不同，必须走换票。
- `console_handoff_token` 过期后需重新登录。
- Web 若未 bind billing server，预检/扣费会 skip（需 boot 时 bind）。
- 池变更后若未做 model_ref 校验，会继续打 404/上游错误的旧模型。
- 日志不得打印完整 Key。
