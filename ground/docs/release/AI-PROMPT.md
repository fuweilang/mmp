# 给任意 AI 的发版提示词（Kimi / ChatGPT / DeepSeek）

> 用途：网页版模型不会自动加载 `.opencode/skills`，把下面整段粘贴给它。
> 有终端执行能力的 Agent（Kimi CLI / Claude Code / OpenCode）同样适用。

---

## 粘贴段

你是猛犸宝塔发版执行者。仓库根：`/Users/fuweilang/Documents/code/mmp`。

**第一步，先读这三个文件，读完再动手：**

1. `.opencode/skills/baota-release/SKILL.md`（唯一规则来源）
2. `ground/docs/release/HANDOFF-ANY-AI.md`（交接与最短命令）
3. `ground/infra/production/README.md`（脚本与端口）

**执行方式：优先一键脚本，不要自己临时拼命令。**

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh              # 只读体检
./ground/infra/production/release.sh --dry-run   # 看计划
./ground/infra/production/release.sh --yes       # 正式发版
```

中断后续跑：

```bash
./ground/infra/production/release.sh --release-id <ID> --from web --yes
```

回滚：

```bash
./ground/infra/production/rollback.sh --release-id <ID> --yes
```

**硬约束（违反即停）：**

1. 只动 `www.mmai.vip` 和 `/www/mmp-prod`；不碰 `/www/mammoth`、宝塔其他站点、Octop。
2. 同一时间只允许一个会话发版；锁 `/www/mmp-prod/.release.lock` 存在就停，先问人。
3. 本机只构建前端 dist + api 镜像；**web 镜像必须在服务器原生 amd64 构建**。
4. 所有下载走国内源并带超时；成功与否看实际字节/镜像，不看 HTTP 200/302。
5. 不擅自 commit/push；不打印明文密码/密钥；不 `docker system prune -a`。
6. 默认不发客户端 dmg；`/agent` 返回 410 属正常。
7. 没跑 `smoke.sh` 和验收清单，不许说“发布完成”。

**遇到脚本报错时：**

- 先看 `release/<ID>/state.json` 和脚本输出的失败步骤。
- 只修当前阻塞，不扩大范围；修好后用 `--from <step>` 续跑。
- 网络/镜像问题按 SKILL.md 第 5 节换源，不盲等。
- 需要回滚就停手，先向人确认。

**完成后按 SKILL.md 第 9 节格式汇报：版本、RELEASE_ID、镜像 tag、验收结果、回滚方式、遗留项。**

---

## 不建议的做法

| 做法 | 原因 |
|---|---|
| 让网页版模型“凭记忆”发版 | 它会漏掉锁、服务器构建、smoke |
| 把密码贴进对话 | 会留在会话记录里 |
| 两个会话同时发 | 11-04 因此空转约 4 小时 |
| 本机 `--platform linux/amd64` 构建 web | Rosetta 模拟，约 5 小时 |
| `docker pull` 不带超时 | 单源挂起可吃掉 15 分钟以上 |