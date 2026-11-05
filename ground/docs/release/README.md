# 猛犸发版文档索引

目标：中台发版 **≤20 分钟**（客户端大包拆开）。只改 mmPlatform（ground + Octop）；生产走宝塔；默认不开 GitHub PR。

**对人**：发版时只说 **「发布猛犸宝塔」**。根目录 `AGENTS.md` + Skill `baota-release` 已绑定；不必贴长文。

## 规程与脚本

| 资源 | 路径 |
|------|------|
| 发布 Skill（**唯一发版入口**） | `.opencode/skills/baota-release/SKILL.md` |
| **换 AI 粘贴 HANDOFF** | [`HANDOFF-ANY-AI.md`](./HANDOFF-ANY-AI.md)（本地 MD 不会自动加载） |
| preflight / release / smoke / T1 | `ground/infra/baota/{preflight,release-baota-mid,smoke,publish-desktop-baota,assert-latest-json,fast-release}.sh` |
| infra 说明 | `ground/infra/baota/README.md` |
| **并行快发** | `docs/release/fast-parallel.md` + `ground/infra/baota/fast-release.sh` |
| compose 模板 | `ground/infra/baota/docker-compose.yml` |

## 复盘与契约

| 资源 | 路径 |
|------|------|
| 2026-11-02 发版复盘 | `docs/reports/2026-11-02-release-retrospective.md` |
| 生产契约 OpenSpec | `ground/openspec/changes/baota-prod-hardening/` |
| 云端模型原则 | `ground/openspec/changes/cloud-llm-proxy/` |
| RBAC / editable | `ground/openspec/changes/unify-ground-octop-rbac/` |

## 版本与环境

| 资源 | 路径 |
|------|------|
| version.json SSOT / latest.json 字段 | `docs/release/versioning.md` |
| **单一源 + AI 不问版本（方案）** | `docs/release/VERSION-SINGLE-SOURCE.md` |
| 本机 vs 生产 Octop | `docs/runbooks/local-vs-prod-octop.md` |

## Octop 侧案例报告

- `Octop/docs/reports/2026-11-02-bridge-client-error-403.md`
- `Octop/docs/reports/2026-11-01-bridge-platform-identity-gate.md`
- 指针：`Octop/docs/reports/RELATED-baota-release-retrospective.md`

## 20 分钟命令序列（快发）

中台 alone：

```bash
cd ~/Documents/code/mmPlatform/ground/infra/baota
./preflight-baota.sh --track fast
./release-baota-mid.sh --api --octop   # 按改动改 flag，或 --all
./smoke-baota.sh
```

带客户端时走**并行**（见 [`fast-parallel.md`](./fast-parallel.md)）：

```bash
./fast-release.sh --mid octop              # 默认只要中台
./fast-release.sh --mid octop --dispatch   # T0：desktop-hotfix + 打印中台命令
# 另窗照抄 preflight / release-baota-mid / smoke
# T1：./publish-desktop-baota.sh --run-id <id> --version <ver> [--apply]
```
