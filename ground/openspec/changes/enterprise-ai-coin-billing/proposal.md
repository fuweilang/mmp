# enterprise-ai-coin-billing（任务1）

猛犸商业化：企业 AI 币钱包 + 按 token 扣费 + Admin 可配售价倍率与「1 AI币 = N token」。本 change 是任务1；扫码充值（任务2）、差价/统计面板（任务3）另开。

## 背景

公司采购模型 API，对客户按 token 用量收费赚差价。云端代调（`cloud-llm-proxy`）已通，其后置项「计费钱包 / 用量扣减」落到本 change。账户主体为企业租户（`tenant`），不是个人。

## 目标

1. Admin 可配置：售价倍率、`1 AI币 = N token`（有平台默认值）。
2. 企业钱包：按租户维护 AI 币余额与流水。
3. 对话（云端 chat completions）按实际 token 用量扣企业 AI 币；余额不足拦截。
4. 超管可手动调账入账（为任务2扫码充值留同一入账接口形态）。
5. OpenSpec；本地 only，不 push。

## 范围

- ground Prisma：平台计费配置、企业 AI 币钱包、流水。
- ground API：Admin 配置/调账/查钱包；租户侧余额、预检、扣费（幂等）。
- Octop 云端 LLM 网关：请求前预检、响应后按 usage 扣费（用 console handoff 调中台）。
- Admin 前端：计费配置页 + 企业钱包调账入口。
- 新建企业时自动建空钱包。

## 非目标

- 微信/支付宝/扫码支付（任务2）
- 个人钱包、套餐订阅、发票
- 照搬 PeecAI 现金钱包或场景固定价；只借鉴「企业 AI 币 + 流水 + 幂等」思路
- 推远程 / CloudAgent / 生产宝塔
- 叫 PeecAI 团队角色

## 成功标准（任务1）

- 库表可 migrate；Admin 能改倍率与 N；超管能给企业调账。
- 扣费 API 可测；云端对话路径挂钩预检/扣费；余额 0 时对话被拦。
- 汇报：改动文件清单 + 如何本地验收。然后停，等任务2。
