# OpenSpec（本地交接）

给新开的 AI 窗口用，不是完整 PRD。

## 新窗口先读

1. `docs/ARCHITECTURE.md`
2. `AGENTS.md`
3. `openspec/changes/desktop-first-launch/`（当前要做：客户端第一次打开能登录）
4. `openspec/changes/platform-admin-console/`（猛犸总后台 `/admin`）
5. `openspec/changes/agent-runtime-ux-hardening/`（已落地交接；控制台 IA 见其中 `specs/enterprise-console/`）
6. `openspec/changes/unify-ground-octop-rbac/`（进行中：猛犸权限打通 / ground 权威 + admin 真角色）
7. `openspec/changes/role-deletion-policy/`（进行中：角色删除策略——内置四角色不可删；自定义仅超管/平台管可删；占用禁删）
8. `openspec/changes/login-prefer-agent/`（登录默认进 Agent，不默认 admin/console）
9. `openspec/changes/cloud-llm-proxy/`（进行中 / **站立原则**：prod+dev、web+client 全部 LLM → 云端超管池；见 `specs/cloud-llm/spec.md` 不可协商原则；Key 不下发）
10. `openspec/changes/enterprise-ai-coin-billing/`（任务1：企业 AI 币钱包 + 按 token 扣费 + Admin 配置）
11. `openspec/changes/ai-coin-qr-topup/`（任务2：扫码充值 AI 币）
12. `openspec/changes/ai-coin-billing-display/`（任务3：Admin/Console/Agent 展示与报表）
13. `openspec/changes/admin-enterprise-token-stats/`（Admin 企业 Token 统计：Octop usage_log 物理用量）

## 约定

- **LLM 站立原则**：不论生产/开发、Web/客户端，所有大模型调用统一走云端超管配置模型。权威条文：`changes/cloud-llm-proxy/specs/cloud-llm/spec.md`；发版技能 MUST：`.opencode/skills/baota-release/SKILL.md`。
- 改完功能：在对应 change 的 `tasks.md` 打勾，必要时补 `specs/`。
- 新开一条大功能：新建 `openspec/changes/<name>/`（proposal + tasks + specs）。
- 不要回放旧聊天；以本目录 + 代码为准。
