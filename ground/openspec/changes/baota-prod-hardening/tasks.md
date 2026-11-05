# 任务 — baota-prod-hardening

- [x] OpenSpec：proposal + 六份短 spec（契约冻结）
- [x] OpenSpec：补 `release-sha-discipline`（热修入库 / 将发分支纪律；复盘 C8）
- [ ] 实现分期：`deploy-octop-home` 部署验收接入 preflight（脚本已查 compose；缺则 fail）— **发版前由 baota-release skill 执行** `preflight-baota.sh`
- [ ] 实现分期：`pay-secrets-mount` 启动时 real 模式缺 PEM 显式报错（勿静默）— **发版前由 baota-release skill 执行** preflight（secrets 挂载/PEM 存在性）
- [ ] 实现分期：`bridge-platform-identity` — 服务端门控已有；客户端 `canAccessBridge` 须在将发布分支（对齐 `release-sha-discipline`）
- [ ] 实现分期：`client-error-telemetry` — 确认生产路径 JWT-exempt + 限流；smoke 已 POST — **发版后由 baota-release skill 执行** `smoke-baota.sh`
- [ ] 实现分期：`sticky-model-fallback` — **与 `cloud-llm-proxy` 对齐，勿重复实现两套**；本 change 只补验收场景
- [ ] 实现分期：`builtin-role-write-guard` — **与 `unify-ground-octop-rbac` 的 `editable` 对齐，勿重复实现两套**；至少 `org_admin` / `super_admin`（及设计中的内置锁）PATCH 权限包 403/拒绝
- [ ] 实现分期：`release-sha-discipline` — 发版 checklist / Skill P0 已写；可选把「上线 SHA ∈ 将发分支」做成 preflight 提示
- [ ] QA：发版窗口对生产域名跑 smoke + 本 change 验收条目缩略版 — **由 baota-release skill + smoke 执行**

## 交叉链接

- Skill（**唯一发版入口**）：`.opencode/skills/baota-release/SKILL.md`
- 换 AI 粘贴：`docs/release/HANDOFF-ANY-AI.md`
- 复盘：`docs/reports/2026-11-02-release-retrospective.md`
- RBAC：`ground/openspec/changes/unify-ground-octop-rbac/`（`editable` / builtIn）
- 云端模型：`ground/openspec/changes/cloud-llm-proxy/specs/cloud-llm/spec.md`
- 案例：`Octop/docs/reports/2026-11-02-bridge-client-error-403.md`

本地 only，不 push。platforms / 并行编排 **不**进本 change（Skill + `fast-release.sh`）。
