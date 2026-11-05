# baota-prod-hardening（生产发版契约冻结）

来源：复盘 `docs/reports/2026-11-02-release-retrospective.md`（2026-11-02 Asia/Shanghai）。

把发版救火中暴露的**部署/权限/遥测/模型回落**契约先写进 OpenSpec，实现可分期；契约先冻结，避免下次再靠口口相传。

## 背景

2.0 发版体感 ~2 小时：除 CI/大包外，大量时间耗在发版后救火——`OCTOP_HOME` 未挂载、支付 secrets 未挂、bridge/client-error 403、池外 sticky、内置角色可写等。运维步骤落在 `baota-release` Skill + `ground/infra/baota/*.sh`；本 change 冻结**产品/API 契约**侧。

## 目标

1. `deploy-octop-home`：pricing-config / 模型目录依赖 api 容器 `OCTOP_HOME` + `data/octop` 只读挂载。
2. `pay-secrets-mount`：`PAY_PROVIDER=real` 必须挂载 `/app/secrets` 且 PEM 齐全；local 默认 mock。
3. `bridge-platform-identity`：仅 platform identity 可访问 bridge API；org_* 403 预期；非 `canAccessBridge` 不得请求 `/api/bridge/*`。
4. `client-error-telemetry`：`POST /api/client-error` JWT-exempt + 限流；不得仅因非 loopback/经 nginx 而 403。
5. `sticky-model-fallback`：池外/失效 sticky 回落平台首选或 AUTO（交叉 `cloud-llm-proxy`）。
6. `builtin-role-write-guard`：`editable:false` 内置角色 PATCH 权限包必须拒绝（对齐秋池 D1 / unify-rbac）。
7. `release-sha-discipline`：拟上线 SHA/改动必须已在将发分支；禁止「只改生产容器、干净树没有」。

发版前挂载/secrets/Dockerfile/冒烟等运维门禁：**由** `.opencode/skills/baota-release/SKILL.md` **执行** `preflight-baota.sh` / `smoke-baota.sh`（本 change 只冻结合约，不替代 Skill）。

## 非目标

- 本 change **不**默认实现全部代码；先冻结验收。
- 不改 PeecAI。
- **不默认 push / 不开 GitHub PR**（本地 mmPlatform only）。
- 不替代 `baota-release` 运维 checklist（Skill 负责执行；本处负责契约）。

## 风险

- 与 `unify-ground-octop-rbac` 的 `editable` 字段重叠 → tasks 要求对齐，勿两套实现。
- 与 `cloud-llm-proxy` sticky 回落重叠 → 本处只补「登录后空模型/池外禁发」验收场景并交叉链接。
