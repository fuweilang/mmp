# 任务4验收：Admin `/admin/billing` 计费与 AI币

本地 only，未 push。

## 产品口径

| 配置 | 含义 | 是否影响企业扣费 |
|------|------|------------------|
| 售价倍率 | 猛犸相对上游成本的加价；仅内部成本/售价估算 | 否 |
| 1 元 = N AI币 | 充值汇率：付 1 元 → 入账 N AI币 | 仅充值入账 |
| 1 AI币 = 1 token | 固定，不可改 | 是（对话扣币） |

## 入账公式（核心）

下单时锁定：

```
aiCoins = floor(实付金额元 × aiCoinsPerYuan)
```

支付确认入账使用订单上的 `aiCoins`（不再按当时配置重算）。售价倍率不参与。

代码：`BillingService.yuanToAiCoins` ← `RechargeService.createOrder`；确认走 `creditQrTopup(coins: locked.aiCoins)`。

## 页面结构

1. **计价配置**：售价倍率 / 固定 1:1 扣费说明 / 1元=N；上游采购单价折叠
2. **企业钱包**：表列余额 AI币 + 企业身份；详情抽屉三块——余额 / 流水 / 操作(调账)
3. **上游对账**：本页仅提示 + 链到 `/admin/enterprise-token-stats`（不新菜单、不深做对账 UI）

## 手测

1. 超管打开 `/admin/billing`，确认文案：售价倍率=猛犸加价、1元=N=充值汇率
2. 改 `1 元 = N` 保存 → Console 充值预估与下单 `aiCoins` 一致（`floor(yuan×N)`）
3. mock 支付成功 → 钱包余额增加订单 AI币；流水类型「充值」、有实付金额
4. 详情抽屉：余额 / 统一流水 / 手动调账
5. 点「企业 Token 统计」链接可达；本页无大块 DeepSeek/Kimi 对账表
6. `/console/billing` 仍无 Token 列

## 改动文件

- `apps/backend/src/billing/billing.service.ts`
- `apps/backend/src/pay/recharge.service.ts`
- `apps/frontend/src/views/admin/AdminBilling.vue`
- `apps/frontend/src/api/admin.ts`
- `docs/BILLING-TASK4-VERIFY.md`
- openspec 轻量备注（若有）

## 留给任务5

- ~~余额不足拦对话核对 + Token≈AI币对账文案 + 钱包流水分页~~ → 见 `docs/BILLING-TASK5-VERIFY.md`（已本地做）
- 真机微信/支付宝回调对账与失败单人工补入
- 上游成本估算独立报表（若需要基于采购单价 × Token 统计）
- Console/发票/导出
- 去掉 API 兼容字段 `tokensPerAiCoin`（需前后端一起收）

## 上游采购单价参考（2026-10-31）

- DeepSeek：`deepseek-flash` 高峰·缓存未命中 → 提问 2 / 回复 8（元/100万token）
- Kimi：`kimi-k3.1-pro` 标准 → 提问 13 / 回复 68
- 智谱：`GLM-5.3` 公开牌价 → 提问 8 / 回复 28（docs.bigmodel.cn，核对 2026-10-31）
- 页面：hint 展示参考 + 行内「填入参考」/「全部填入参考」写入输入框；「刷新参考」重读内置表（MVP 不爬官网，失败保留上次）；不接厂商 Admin API；价会变，仅粗算

## 参考价核对（2026-10-31）与 N 估算

- Kimi `kimi-k3.1-pro`：官网 CNY **¥13 / ¥68**（1M token）— 正确，保留
- DeepSeek `deepseek-flash` 高峰缓存未命中：官网 **USD $0.3 / $1.2**；页面用约×7 得 **¥2 / ¥8** 粗算；空闲约一半；可改
- `1元=N` 建议：四价均值 / 1e6 得单 token 成本，再 `floor(1 / 成本 / 售价倍率)`；按钮「按成本估算」；可手改
