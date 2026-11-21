# 企业会员

## 有效版本

- 标准版没有到期日。
- 专业版、旗舰版的到期日晚于当前时间才有效。否则按标准版。
- 没选企业，或租户类型是 PLATFORM，不校验版本。

## 广场

- 已发布专家全部返回。
- 每条有 `minPlan`（standard | pro | flagship）和 `locked`。
- `catalog-page` 额外返回 `membership.plan`、`membership.expiresAt`、`membership.enforced`。

## 使用

- 企业有效版本低于专家 `minPlan` 时，resolve、runtime、检索、搜索、网页、表格、委派目标和已打开会话的历史授权返回 `MEMBERSHIP_REQUIRED`。
- 总后台预览（previewId）不校验。

## 支付入账

- `applyPaymentSuccess` 只接受 pro、flagship，以及 wechat、alipay。
- 成功插入 `membership_order`，并写企业版本和到期日。
- 同一 `providerTradeNo` 再调用，不第二次改到期日。
- 当前有效版本高于所购版本时拒绝，不写订单。
- `GET /api/billing/membership` 给当前企业成员返回版本、年费和 `canPay`。
- `POST /api/billing/membership/payQr` 只给企业管理员。生成微信或支付宝付款码，并写入 `membership_checkout`。不写 `membership_order`。
- `POST /api/billing/membership/status` 向渠道查询。未支付不写订单。已支付走 `applyPaymentSuccess`。
- `/api/pay/wechatNotify` 和 `/api/pay/alipayNotify` 先按商户单号认会员付款。认到了就升级，不给 AI 币入账。认不到仍走原来的充值。

## 套餐与定价

- `GET/PUT /api/admin/membership-catalog`
- 只保存专业版、旗舰版年费（元，正整数）和三段说明。标准版没有价格。
- 说明最长 200 字。

## 手工修改

- `PATCH /api/admin/enterprises/:id/membership`
- `PATCH /api/admin/official-agents/:id/min-plan`
- 仅总后台可写。标准版清空到期日。专业版和旗舰版必须带到期日。
