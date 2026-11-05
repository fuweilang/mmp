# HANDOFF — 任意 AI 发猛犸宝塔

> **人怎么说**：日常只说 **「发布猛犸宝塔」** 六个字即可。
>
> **AI 怎么做**：先读并遵守 `.opencode/skills/baota-release/SKILL.md`，不要凭记忆或聊天摘要发版。
>
> **本文件用途**：新会话没有自动加载 Skill 时，把下面整段粘贴给 AI（兜底）。

## 粘贴段（兜底）

1. 仓库根：`/Users/fuweilang/Documents/code/mmp`（`ground/` + `mammoth-agent/`）
2. **唯一发版入口**：`.opencode/skills/baota-release/SKILL.md`；先读全文再执行
3. 只动 `www.mmai.vip` 和 `/www/mmp-prod`；不碰 `/www/mammoth` 和宝塔其他项目
4. 单主操：先拿 `/www/mmp-prod/.release.lock`；已有锁就停
5. 版本读 `ground/config/version.json`；`RELEASE_ID = 版本-YYYYMMDD-HHMM`
6. 本机只构建前端 dist + api 镜像；**web 镜像必须在服务器原生 amd64 构建**
6.5 优先跑 `ground/infra/production/release.sh` 一键发版；中断按提示 `--release-id ... --from ...` 续跑
7. 所有外网依赖走镜像：Electron/npm 用 npmmirror，apt 用官方或阿里云，Docker 用 `hub.rat.dev`
8. 发版后必须跑 `ground/infra/production/smoke.sh` + 验收清单，才算完成
9. 默认不发客户端；`/agent` 返回 410；`downloads/` 可为空
10. 不擅自 commit/push；不打印明文密码；不 `docker system prune -a`

## 最短命令

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh              # 只读体检
./ground/infra/production/release.sh --dry-run   # 看计划
./ground/infra/production/release.sh --yes       # 发版
```

中断后续跑：

```bash
./ground/infra/production/release.sh --release-id <ID> --from web --yes
```

回滚：

```bash
./ground/infra/production/rollback.sh --release-id <ID> --yes
```

手工兜底（脚本报错时才用）：

```bash
pnpm --dir ground run version:check
./ground/infra/production/preflight-local.sh "$RELEASE_DIR"
./ground/infra/production/smoke.sh https://www.mmai.vip
```

完整步骤、故障速查、回滚见 Skill 第 4/7/10 节。

## 版本号

读 `ground/config/version.json`（见 `VERSION-SINGLE-SOURCE.md`）。**默认不问发哪个版本**；分支名 ≠ 版本号。

- 本地 = 当前 SSOT；发版成功后再 bump。
- 禁止在服务器 `.env`、Dockerfile、前端里硬编码版本。

## 相关

- 检查清单：[`BAOTA-RELEASE-CHECKLIST.md`](./BAOTA-RELEASE-CHECKLIST.md)
- 给 Kimi/ChatGPT 的提示词：[`AI-PROMPT.md`](./AI-PROMPT.md)
- 脚本说明：[`../../infra/production/README.md`](../../infra/production/README.md)
- 2026-11-04 复盘：[`../reports/2026-11-04-baota-release-retrospective.md`](../reports/2026-11-04-baota-release-retrospective.md)