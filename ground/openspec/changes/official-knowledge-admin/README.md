# 猛犸知识库 Admin（首版）

独立 Admin 页 `/admin/official-knowledge`，只管理官方 `official_kb_*`，不混入企业知识库。

## 行为边界

- 检索：仅 `active=true` 且 `status=READY` 的官方文档；有官方资料时不会回退企业库。
- 上传/替换：先写 `active=false` staging → 索引；`READY` 后切换生效并降级旧文档；失败保留旧生效文档。
- 绑定约束：已有官方资料的智能体，或资产声明了 kb 且 toolScope 含 `enterprise_knowledge` 的智能体；禁止给纯 Prompt / 仅企业资料型智能体贸然绑官方库。
- 不做停用删除、多智能体共享、版本回退；版本号字段有则显示，无则显示 —。

## 本地迁移

`apps/backend/prisma/migrations/20261106180000_official_kb_active_staging`

增加 `active` 列，去掉 `(agent_id, asset_key)` 全量唯一，改为 `WHERE active=true` 的部分唯一索引。
