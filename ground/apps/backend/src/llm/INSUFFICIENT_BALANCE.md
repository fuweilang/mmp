# Chat gateway insufficient balance (402)

When enterprise wallet precheck fails, Ground returns **HTTP 402 Payment Required**:

```json
{
  "statusCode": 402,
  "error": "Payment Required",
  "message": "企业 AI 币余额不足，请联系管理员充值",
  "code": "INSUFFICIENT_AI_COINS",
  "balanceCoins": 0,
  "requiredCoins": 1
}
```

- `code` is stable: `INSUFFICIENT_AI_COINS` — Harness should key UX off this.
- `balanceCoins` / `requiredCoins` are integer AI coins.
- Platform admin without tenant context skips billing (no 402).

## 冻结 / 结算 / 透支策略（2026-11 起）

1. **请求前冻结**：网关按估算上限（输入 ≈ 字符数/2，输出 = `max_tokens`，全按非缓存价）
   预冻结钱包，写 `chat_freeze` 流水。冻结即真正扣减余额，余额不足直接 402，
   `requiredCoins` 为本次冻结额。请求不会发给上游。
2. **完成后结算（多退少补，同一事务）**：解冻退回冻结额（`chat_unfreeze`），
   按实际 usage 扣费（`chat_consume`），两条流水幂等键派生自同一 baseKey。
3. **透支**：实际扣费允许把余额打成负数（请求开始时的价格快照是权威，
   超出冻结估算的部分补扣）。余额 ≤ 0 后，下一次请求在冻结阶段被 402 拦住。
4. **失败补偿**：传输错误 / 上游 4xx/5xx / 客户端在响应前断开 / 上游未返回 usage，
   全额解冻（`chat_unfreeze`，幂等）。进程中断导致的残留冻结，可用
   `chat_freeze` 无对应 `chat_unfreeze`/`chat_consume` 的流水做对账。
5. **Token 额度**：`quota.monthly_tokens`（企业）与 `user_token_quota.monthly_tokens`
   （用户），0 = 不限；当月 `token_usage_turn` 合计超限时返回 429
   `TOKEN_QUOTA_EXCEEDED`，先于钱包冻结校验。
