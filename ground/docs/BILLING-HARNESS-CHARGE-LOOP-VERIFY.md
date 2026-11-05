# 对话扣费闭环（harness SoT）本地验证

## 根因

桌面对话写了 `token_usage_turn`，但 `GlobalProcessor` 对 `is_desktop_shell()` **跳过** `billing_charge`，依赖 `cloud_llm` `tee_stream_and_charge`。流式常无 `usage` → 企业钱包不扣。

## 修复（Octop）

- Web+桌面：turn 结算统一 `_schedule_mammoth_usage_and_charge`（先 `reportTokenUsage` 再 `ChargeService.charge`/`chat_consume`）
- `cloud_llm`：仅 `precheck`；tee 透传、不再扣费（避免双扣）
- 单测：`Octop/tests/unit/gateway/test_mammoth_usage_charge.py`

## 本地最小验证

1. `cd Octop && .venv/bin/python -m pytest tests/unit/gateway/test_mammoth_usage_charge.py -q`
2. Ground 已起时，用企业成员 JWT 调 `POST /api/billing/charge`：余额下降、`totalDebited` 上升；同 `idempotencyKey` → `reused:true`
3. 真机：桌面发一轮对话后应同时有 `token_usage_turn` + `chat_consume` 流水

## 历史漏扣

`apps/backend/scripts/dry-run-missing-chat-consume.mjs` **仅 dry-run 列表**，默认不回补生产。
