# 猛犸发版文档索引

当前生产：`https://www.mmai.vip` → 新栈 `mmp-prod-v1`（api + web + pg），目录 `/www/mmp-prod`。

## 当前入口（2026-11 起）

| 资源 | 路径 |
|---|---|
| **发布 Skill（唯一发版入口）** | [`.opencode/skills/baota-release/SKILL.md`](../../../.opencode/skills/baota-release/SKILL.md) |
| **换 AI 兜底交接** | [`HANDOFF-ANY-AI.md`](./HANDOFF-ANY-AI.md) |
| **发版检查清单** | [`BAOTA-RELEASE-CHECKLIST.md`](./BAOTA-RELEASE-CHECKLIST.md) |
| **给 Kimi/ChatGPT 的提示词** | [`AI-PROMPT.md`](./AI-PROMPT.md) |
| 状态文件模板 | [`RELEASE-STATE.template.json`](./RELEASE-STATE.template.json) |
| 构建/部署脚本 | `ground/infra/production/`（见其 [README](../../infra/production/README.md)） |
| 版本单一源 | [`VERSION-SINGLE-SOURCE.md`](./VERSION-SINGLE-SOURCE.md) |
| 2026-11-04 复盘 | [`../reports/2026-11-04-baota-release-retrospective.md`](../reports/2026-11-04-baota-release-retrospective.md) |

## 最短流程

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh              # 只读体检
./ground/infra/production/release.sh --dry-run   # 看计划
./ground/infra/production/release.sh --yes       # 发版
```

中断续跑：`./ground/infra/production/release.sh --release-id <ID> --from web --yes`
回滚：`./ground/infra/production/rollback.sh --release-id <ID> --yes`

## 原则

- 单主操、发版锁、`state.json`；禁止并行发版。
- 本机只构建前端 + api；web 镜像在服务器原生构建。
- 只动 `www.mmai.vip`；旧栈 `/www/mammoth` 与其他项目不碰。
- 默认不发客户端、不发 Octop。

## 历史（已废弃）

以下为 Octop / 旧宝塔流程，仅作追溯，**不要按它发版**：

- `ground/infra/baota/`（旧快发脚本，已 `exit 1` 停用）
- `docs/release/fast-parallel.md`
- Octop 桌面端相关 workflow / 文档

旧复盘：`docs/reports/2026-11-02-release-retrospective.md`