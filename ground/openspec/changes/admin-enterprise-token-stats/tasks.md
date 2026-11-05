# 任务 — admin-enterprise-token-stats

- [x] OpenSpec（proposal / specs / 与旧 enterprise-usage 区分说明）
- [x] Backend：只读 Octop `usage_log`，按 SSO `sso_subject`→Ground 用户→OrgMember 归企业
- [x] API：`GET /admin/billing/enterprise-token-stats`（全平台+企业；时间/模型）
- [x] API：`GET /admin/billing/enterprise-token-stats/detail`（成员；时间/模型）
- [x] Frontend：`/admin/enterprise-token-stats` + 侧栏/概况入口
- [x] 旧 `/admin/enterprise-usage` 文案标明 ledger/AI币，并提示 Token 物理页
- [x] 手测清单 `docs/ENTERPRISE-TOKEN-STATS-HANDTEST.md`（本地 only，不 push）
- [x] Frontend UI 重做：顶栏筛选 + 三数字卡 + 企业主表 + 成员抽屉（Element 方角/#415fff/#f5f7fb/表13px；数据源不变；本地 only）
- [x] Frontend：企业名/品牌过滤 input debounce 500ms；回车立即搜索；清空立即搜（本地 only）

- [x] Frontend：回退「顶栏+三数字卡+主表+抽屉」布局（相对汇总条版）；保留已删未归属、500ms debounce、无 info 长说明（本地 only，2026-10-31 17:54 Asia/Shanghai）

- [x] Frontend：成员明细 `el-drawer` teleport 到 body 导致 scoped/:deep 不生效；抽屉样式改为非 scoped（`.ets-drawer`），保留加宽 `min(960px, 96vw)`、少横滚、操作列 `font-size:0` 无小点（本地 only，2026-10-31 Asia/Shanghai）

- [x] 方案1：`overview.models` = Octop `listEnabledChatModels()` 目录 ∪ 时段用量 distinct；保留历史-only；`offlineModels` 标已下线（本地 only，2026-11-01 Asia/Shanghai）
