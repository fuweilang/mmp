# ground-token-usage-report（任务2）

Web/桌面每轮对话结束后，把本轮物理 token（模型 / 用户 / 企业）报到 Ground；Ground 新建按轮用量表，供 Admin「企业 Token 统计」查询。不再只靠读 Octop SQLite（任务1仍保留 reader，本 change 切换 Admin 主数据源）。

## 背景

任务1 Admin 直接读本机 `~/.octop/octop.db` 的 `usage_log`，只适合单机开发。生产多端应对齐到中台落库。

## 目标

1. Ground 新建 `token_usage_turn` 按轮落库（模型、用户、企业、input/output/total、幂等键）。
2. Octop Web/桌面 harness 每轮对话结束后 best-effort 上报（失败不打断聊天）。
3. Admin `/admin/enterprise-token-stats` 主数据源改为 Ground 表。
4. OpenSpec；本地 only，不 push。

## 非目标

- 不改 AI 币扣费 / ledger
- ~~不迁历史 SQLite 数据~~ → 已补本地幂等脚本 `migrate-octop-usage-to-token-turns.mjs`
- 不改 Octop 个人 Token 统计页
- 不 push / 不生产

## 成功标准

- migrate 后表存在；上报 API 幂等
- 企业成员对话一轮后 Admin Token 页可见对应模型/用户/企业用量
- 手测清单可验收；然后停
