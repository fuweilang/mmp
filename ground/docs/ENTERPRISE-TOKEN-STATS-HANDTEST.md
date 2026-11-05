# 手测清单 — Admin 企业 Token 统计（任务1）

本地 only，不 push。OpenSpec：`openspec/changes/admin-enterprise-token-stats/`。

## 数据约定

| 页 | 路由 | 数据源 |
|---|---|---|
| 企业 Token 统计 | `/admin/enterprise-token-stats` | Octop `~/.octop/octop.db` → `usage_log` |
| ~~企业用量(AI币)~~ | ~~`/admin/enterprise-usage`~~ → 重定向至 Token 统计 | 已并入方案 A |

成员归属：`usage_log.user_id` → Octop `users.sso_subject` = Ground `user.id` → `org_member`（多企取最早非 PLATFORM 成员）。

## 前置

1. `pnpm dev` + `pnpm octop`（或已有本地 Octop DB）
2. 超管登录 `http://127.0.0.1:5201/admin`
3. 确认 `OCTOP_HOME`（默认 `~/.octop`）下有 `octop.db` 且 `usage_log` 有数据

## 手测步骤

1. **侧栏**：仅见「企业 Token 统计」（无独立「企业用量(AI币)」）；概况卡片可进 Token 页。
2. **全平台**：打开 Token 页，页头合计 Token/Input/Output/笔数 > 0（有历史调用时）；`source` 语义为物理用量。
3. **按模型**：页内「按模型」表有 deepseek/kimi 等；下拉选某一模型再「查询」，合计与企业行应变小且只含该模型。
4. **时间**：选近几日日期范围查询；清空/重置恢复。
5. **企业下钻**：点某企业「成员明细」，抽屉内成员 Token 之和 ≈ 该企业行合计。
6. **未归属**：无 Ground 企业成员映射的 Octop 用量不展示，也不计入全平台汇总 / 按模型 / 企业列表。
7. **旧页重定向**：打开 `/admin/enterprise-usage` 应落到 Token 统计页（query 保留）；本页表格含 Token + AI币。
8. **权限**：非平台管理员访问 API 应 403。
9. **缺库**：临时改错 `OCTOP_HOME` 应返回可读错误（找不到数据库），勿 500 裸栈。

## API（可选 curl）

网关前缀以本机为准（常见 `/admin/api`）：

- `GET /admin/api/billing/enterprise-token-stats`
- `GET /admin/api/billing/enterprise-token-stats?from=2026-10-01&to=2026-10-31&model=deepseek-flash`
- `GET /admin/api/billing/enterprise-token-stats/detail?tenantId=<id>`

## 验收勾选

- [ ] 数据源为 usage_log（非 ledger）
- [ ] 全平台 → 企业 → 成员
- [ ] 时间 / 模型过滤有效
- [ ] 侧栏无独立「企业用量(AI币)」；旧 URL 重定向正确
- [ ] 本地未 push

## UI 重做验收（2026-10-31 本地）

- [ ] 顶栏白底：日期范围 + 模型 + 企业名过滤 + 查询/重置
- [ ] 三数字卡：全平台 Token（副文案含 Input/Output）· 笔数 · 企业数
- [ ] 企业主表 13px、表头 #f8fafc、方角、主色按钮 #415fff；行点击/成员明细开抽屉
- [ ] 成员抽屉三卡 + 成员表；关闭清 `tenantId` query
- [ ] 页底 #f5f7fb；未改 API / 数据源

## 抽屉样式（teleport / 非 scoped）

1. 打开 `/admin/enterprise-token-stats`，点某企业「成员明细」
2. 抽屉应明显加宽（约 960px / 近满屏），成员表无明显多余横滚
3. 主表操作列「成员明细」按钮旁无空白小点
4. 抽屉内表头底色 `#f8fafc`、正文字号 13px（若仍像未加样式，说明 teleport 样式未生效）

## 方案 A（2026-10-31）

- 侧栏无「企业用量(AI币)」；访问 `/admin/enterprise-usage` 应落到 Token 统计页。
- 总览/按模型/企业表及成员抽屉均有 **AI币** 列（与 Token 1:1 floor）。
- 成员抽屉约 720px，表格无横向滚动。
- Console `/console/billing` 仍不展示 Token。
