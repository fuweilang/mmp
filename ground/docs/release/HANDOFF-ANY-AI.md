# HANDOFF — 任意 AI 发猛犸宝塔

> **人怎么说**：日常只说 **「发布猛犸宝塔」** 六个字即可。  
> **AI 怎么做**：已读仓库根 `AGENTS.md` 或本仓规则时，立刻打开并遵守 `.opencode/skills/baota-release/SKILL.md`，不要再要长 brief。  
> **本文件用途**：仅当新会话**没有**加载 `AGENTS.md` / Skill 时，把下面整段粘贴给 AI（兜底）。

## 粘贴段（兜底）

1. 先读并遵守：`mmPlatform/.opencode/skills/baota-release/SKILL.md`（唯一发版入口）
2. 再跑 `ground/infra/baota/*.sh`；禁止跳过 Skill、禁止只凭记忆发版
3. 只动 mmPlatform；默认不 push、不开 GitHub PR、不无故 docker `--no-cache`
4. 分支：ground 常 `2.0`，Octop 常 `3.0`（以当前 `git branch` 为准；`--ref` 对齐）
5. 并行：T0 中台 `preflight → 本地 docker build+save/load → smoke`（**禁**宝塔留源码 / 禁宝塔 build）∥ 可选客户端 `desktop-hotfix.yml`；T1 `publish-desktop-baota.sh`
6. 热修 platforms 默认：`darwin-arm64,darwin-amd64,windows-amd64`；禁止无脑 `all`
7. 云端模型：全端只走超管池；契约 `ground/openspec/changes/cloud-llm-proxy/`

命令：

```bash
cd ~/Documents/code/mmPlatform/ground/infra/baota
./fast-release.sh --mid octop              # 默认 dry-run + no-client
./fast-release.sh --mid octop --dispatch   # 才开客户端
./preflight-baota.sh --track fast
./release-baota-mid.sh --octop             # 末尾必 smoke
./smoke-baota.sh
```

## 版本号

读 `ground/config/version.json`（见 VERSION-SINGLE-SOURCE.md）。**默认不问**发哪个版本；分支名≠版本号。

- **本地=当前 SSOT；发版成功后再 bump。** 分支名≠版本号。详见 VERSION-SINGLE-SOURCE.md。
