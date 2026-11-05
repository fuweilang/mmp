---
name: baota-release
description: >-
  用户说「发布猛犸宝塔」「发宝塔」「发猛犸生产」「宝塔发版」时必须先读本 Skill 全文再执行。
  猛犸中台/Octop → 宝塔生产 www.mmai.vip 双轨快发（≤20 分钟）、preflight/smoke、
  desktop-hotfix、排查构建慢/挂载/secrets 时也用本 Skill。
---

# 宝塔生产发布（mmPlatform + Octop）


## 用户一句话（最高优先级）

用户只说 **「发布猛犸宝塔」** 即视为完整授权启动本 Skill：

1. 读完本文件 → 跑 `ground/infra/baota/` 脚本（先 `fast-release.sh` dry-run 打印，再按确认/上下文真跑）
2. 分支：以仓库当前分支为准（Octop 常 `3.0`，ground 常 `2.0`）；勿问冗长确认
3. 默认只要中台；用户提到客户端/安装包再 `--dispatch` / `desktop-hotfix`
4. mmPlatform 根目录 `AGENTS.md`、各仓 `AGENTS.md` 已把这句话绑到本 Skill——**不要**再让用户粘贴长 brief（仅当 AGENTS 未进会话时才要 `docs/release/HANDOFF-ANY-AI.md`）

## 唯一发版入口（任何 AI / 人 先看这里）

1. **任何 agent**（Grok / Kimi / Deepseek / OpenCode 等）向猛犸宝塔发版前，**必须先读本 Skill 全文**，再跑 `ground/infra/baota/*.sh`。
2. **禁止**只凭记忆、聊天摘要或散落 MD 发版；本文件 + 脚本是运维 SSOT，OpenSpec 只冻结合约缺口。
3. **换模型时**：优先依赖仓库根 `AGENTS.md` / 本 Skill 描述触发「发布猛犸宝塔」。若新会话**未**加载 AGENTS，再粘贴 [`docs/release/HANDOFF-ANY-AI.md`](../../../docs/release/HANDOFF-ANY-AI.md) 作兜底。
4. 编排入口：`ground/infra/baota/fast-release.sh`（默认 dry-run；`--dispatch` 才触发客户端 CI）。
5. **发版规程与 Octop 业务大改无关**：从 **3.0** 发时 `--ref 3.0`（fast 轨用当前分支即可）；大重构只加额外冒烟，**不换**本 Skill。

## 墙上时钟最短路径（先看这里）

慢的主因不是缺 `platforms` 输入（workflow **已有**），而是：人手常填 `all`、中台与 Actions **串行**、大包全下全传、preflight 漏挂载后发后救火。

**并行模型（必须写死）**

```
T0  门禁绿（本地/CI）—— dispatch 前必须绿
T0  ├─ A 中台：preflight → release-baota-mid（只改动的服务）→ smoke（写死必跑）
T0  └─ B 客户端（可选）：默认不跟中台绑死；要发客户端才 --dispatch
         热修优先 desktop-hotfix.yml（矩阵写死三平台，默认不挂 Release）
         正式/自定义 platforms 才 octop-desktop.yml（禁止无脑 all）
T1  B 完成后：publish-desktop-baota.sh（gh run download → scp → mammoth-latest；默认 dry-run；覆盖前 *.bak-<ts>）
```

墙上时间 ≈ **max(中台, CI+上传)**，不是相加。

**落点纪律（十条加速）**

| # | 点 | 落点 |
|---|----|------|
| 1 | 中台与客户端拆单 | 本 Skill；`fast-release` **默认 --no-client**，仅 `--dispatch` 开客户端 |
| 2 | 分层更新优先 | 本 Skill + README → `mammoth-dashboard-release` / `mammoth-release --dashboard\|--code`；脚本 echo |
| 3 | Actions 产物直传宝塔 | `publish-desktop-baota.sh`（T1）；默认 dry-run |
| 4 | 门禁预跑 | 本 Skill「dispatch 前门禁绿」；`fast-release` 打印检查提醒 |
| 5 | 本地镜像构建 / 禁宝塔 build / 禁 --no-cache | `release-baota-mid` save/load；仅 `BAOTA_FORCE_NO_CACHE=1` 例外 |
| 6 | desktop-hotfix.yml | `Octop/.github/workflows/desktop-hotfix.yml`；热修优先 |
| 7 | smoke 必跑 | `release-baota-mid` 末尾调用；`--skip-smoke` 仅应急 |
| 8 | latest 版本断言 | `assert-latest-json.sh`（smoke / publish 调用） |
| 9 | 单主操 | 本 Skill「协作纪律」：同一时刻一个主操发版 |
| 10 | 覆盖前 bak | `publish-desktop-baota.sh`：`*.bak-<timestamp>` |

**协作纪律（单主操）**：同一发版窗口只指定**一名主操**（人或一个 agent）跑 `release-baota-mid` / `publish-desktop-baota`；其余只读协助，禁止并行 scp 镜像/web 互踩。

**推荐 platforms（热修）**

| 场景 | `platforms` |
|------|-------------|
| 默认热修 | `darwin-arm64,darwin-amd64,windows-amd64`（主用户；不打 linux / windows-arm 除非需要） |
| 只要本机 Mac | `darwin-arm64` |
| 正式大版本 / tag `v*` | 才用 `all`（tag push 无 inputs 时代码已是 `PLATFORMS||'all'`，保持） |

**精确 dispatch 示例**

```bash
cd ~/Documents/code/mmPlatform/Octop
# 热修优先（矩阵写死三平台，默认不挂 Release）
gh workflow run desktop-hotfix.yml --ref 3.0 -f attach_release=false
# 正式/自定义 platforms：
gh workflow run octop-desktop.yml --ref 3.0 \
  -f platforms=darwin-arm64,darwin-amd64,windows-amd64 \
  -f attach_release=true -f release_tag=v3.0.0
```

**一键打印编排（默认 dry-run + no-client）**：`ground/infra/baota/fast-release.sh`  
半页说明：`docs/release/fast-parallel.md`

```bash
cd ~/Documents/code/mmPlatform/ground/infra/baota
./fast-release.sh --mid octop          # 默认只要中台提示
./fast-release.sh --mid octop --dispatch   # 才开客户端并触发 desktop-hotfix
# T1（CI 完，先 dry-run）:
./publish-desktop-baota.sh --run-id <id> --version <ver>
./publish-desktop-baota.sh --run-id <id> --version <ver> --apply
```

## 目标与双轨

**目标**：中台发版从 ~2 小时压到 **≤20 分钟**；带客户端时墙上时钟走并行，≈ max(中台, CI+上传)。

正式采用**双轨**，**默认走快发**：

| 轨道 | 何时用 | 本地树 | 要点 |
|------|--------|--------|------|
| **中台快发（默认）** | 日常上生产修复/迭代 | `~/Documents/code/mmPlatform/{ground,Octop}` 当前分支（Octop 多为 `3.0`） | 必须先 `preflight`；**本地** `docker build --platform linux/amd64` → save/load；**禁止** rsync 源码到宝塔；**禁止**宝塔 `compose build` |
| **冻结发版（可选严格轨）** | 正式打版本号 / 对外宣称的冻结发布 | `~/Documents/code/mm-release-1.0/{ground,Octop}` 的 `1.0`，干净 + cherry-pick SHA | 同上镜像密保；禁止 `merge 2.0` |

**密保强制**：宝塔 `/www/mammoth` **不得**长期保留 `src/`（ground）或 `Octop/` 明文源码树；只留镜像 + `web/` dist + `downloads/` + compose/env/secrets/data。清理：`cleanup-baota-source-trees.sh --apply`。

旧文「发布只能从 1.0」的绝对禁止语气已废除：开发树直发**允许**，但必须以快发检查表与脚本为准，禁止无 preflight 的裸操作，**禁止**把整仓源码推上宝塔。

可执行脚本（`ground/infra/baota/`）：

- `fast-release.sh` — **并行快发编排**（默认 dry-run + **no-client**；`--dispatch` 才开客户端）
- `preflight-baota.sh` — 发版前检查（image-only compose；禁明文源码树）
- `release-baota-mid.sh` — 中台快发：本地 build+save/load → web dist → up → smoke
- `cleanup-baota-source-trees.sh` — bak 后移走盘上明文 `src/`、`Octop/`
- `smoke-baota.sh` — 发版后冒烟（调 `assert-latest-json.sh`）
- `publish-desktop-baota.sh` — **T1** Actions→宝塔（默认 dry-run；覆盖前 bak）
- `assert-latest-json.sh` — mammoth-latest shell/portable 分裂警告

复盘：`docs/reports/2026-11-02-release-retrospective.md`  
索引：`docs/release/README.md` · 并行快发：`docs/release/fast-parallel.md` · **换 AI 粘贴**：`docs/release/HANDOFF-ANY-AI.md`  
契约：`ground/openspec/changes/baota-prod-hardening/`

## 版本号（单一源，默认不问）

- **SSOT**：`ground/config/version.json`（详见 [`docs/release/VERSION-SINGLE-SOURCE.md`](../../../docs/release/VERSION-SINGLE-SOURCE.md) / [`versioning.md`](../../../docs/release/versioning.md)）。
- 发版前在发版 worktree 读取并打印：`node -p "require('./config/version.json').version"`（cwd=`ground`）。
- **AI 默认不问**「发哪个版本」；角标、smoke `--expect-version`、`publish-desktop-baota --version`、Actions 包版本一律跟 SSOT（后两者脚本可省略参数，自动读 SSOT）。
- **分支名 ≠ 版本号**（`3.0` 锁定分支可以继续发 `2.0.0`）。只要用户没书面改 SSOT，就按文件里的版本发。
- **仅当** SSOT 缺失/非法，或与用户明确指定的 tag/版本**明显冲突**时，才问一句确认。
- **本地开发 / 本次发版 = 当前 SSOT**（现在是 `2.0.0` 就发 `2.0.0`）；**发版成功（smoke + 需要的 T1 publish 完成后）再 bump** 下一版，勿在发版窗口中途改 SSOT。
- 升版本只走：`cd ground && pnpm version:bump --set x.y.z`（或 patch/minor/major）→ `pnpm version:sync`（脚本已含）→ `pnpm version:check` → commit；禁止手改一处漏 sync。`version:sync` 会同时改 `packages/shared` 的 **src + dist**，避免角标仍读旧 dist。

## MUST：大模型调用原则（发版前后都遵守）

- **MUST**：生产与开发、Web 与客户端——猛犸用户路径上**所有大模型调用**一律走**云端中台模型**，由**超级管理员**在 `/agent/admin/models`（Available Model Pool + 首选星标）配置；禁止 BYOK / 本机厂商旁路，禁止依赖某个开发者本机 Octop checkout。
- 失效 sticky/preferred/expert `model_ref` 须回落平台首选或 `AUTO`（勿继续打已下架池模型）。
- 契约：`ground/openspec/changes/cloud-llm-proxy/`（尤 `specs/cloud-llm/spec.md`「不可协商原则」）；验收场景另见 `baota-prod-hardening` 的 `sticky-model-fallback`。

## 生产拓扑

| 项 | 值 |
|---|---|
| 域名 | `https://www.mmai.vip` → `124.223.179.250`（`ssh root@…` 免密） |
| 部署根 | `/www/mammoth`：`web/`（dist）、`downloads/`、`.env`、`docker-compose.yml`（**image-only**）、`secrets/`、`data/`；**禁止**明文 `src/`、`Octop/` 源码树 |
| 容器 | `mammoth-api`(:3100)、`mammoth-octop`(:8088)、`mammoth-pg`(:5434)，均只监听 127.0.0.1 |
| 反代 | 宝塔 nginx：`/console/` → 3100，`/agent/` → 8088 |
| 健康检查 | `/console/api/health`、`/console/api/version`、`/agent/api/health`、`/agent/api/version`、**`/agent/chat`**（必须 200） |

## 时间预算表（中台快发 20min）

| 段 | 预算 | 动作 |
|----|------|------|
| preflight | ~2 min | `./preflight-baota.sh --track fast`（禁盘上明文源码；compose 无 build:） |
| local build | ~8 min | 本机 `docker build --platform linux/amd64`（只改动的服务）；禁常态 `--no-cache` |
| transfer | ~4 min | `docker save \| gzip` → scp → 宝塔 `docker load`（**不**传源码树） |
| web | ~3 min | 本地 `pnpm --filter @mammoth/frontend build` + rsync **仅** `web/` dist |
| up + smoke | ~3 min | `docker compose up -d`（无 `--build`）+ `./smoke-baota.sh` |

**一键**：`ground/infra/baota/release-baota-mid.sh --api|--octop|--web|--all`  
**镜像路径（一句话）**：本地 build(linux/amd64) → save|gzip → scp → 宝塔 load → compose up -d。

客户端安装包（~220MB）**不计入**这 20 分钟——见下文「客户端/Actions 拆开」。

## P0 发版前检查表（可勾选）

- [ ] 选定轨道：`fast`（默认）或 `freeze`；`preflight` 已通过
- [ ] **热修未入库禁止上线**：将上线的 SHA 必须已在将发布分支（本地 commit 可，禁止「只改了生产容器、干净树没有」）
- [ ] CI：若本次带客户端，相关门禁**必须绿**再 `workflow_dispatch`（`desktop-hotfix` / `octop-desktop`）
- [ ] **单主操**：本窗口只有一人/一 agent 写生产（rsync/scp/compose）
- [ ] compose 挂载：
  - [ ] `api`：`OCTOP_HOME` + `./data/octop:/data/.octop:ro`
  - [ ] `api`：`./secrets:/app/secrets:ro` 且支付宝/微信相关 PEM 存在（不打印内容）
  - [ ] `PAY_PROVIDER` 与 secrets/mock 一致（prod `real` 必须有证；local 可 `mock`）
  - [ ] Octop issuer / 客户端入口：无残留 `127.0.0.1:5201`；验生产客户端前杀本机 `pnpm run octop`
- [ ] 本地 `Dockerfile.octop` 含 **frontend-builder**（构建在本地/CI，不在宝塔）
- [ ] 构建：国内源；**本机** build；只做改动服务；**禁常态 `--no-cache`**（例外：`BAOTA_FORCE_NO_CACHE=1`）
- [ ] **禁止** rsync `/www/mammoth/src` 或 `/www/mammoth/Octop` 源码；盘上若仍有明文树先 `cleanup-baota-source-trees.sh --apply`
- [ ] 生效：load 后必须 `up -d`（无 `--build`）；**smoke 必跑绿**（禁常态 `--skip-smoke`）

## 本地 vs 生产差异

| 项 | 本地 | 生产（宝塔） |
|----|------|----------------|
| 支付 | 默认 `PAY_PROVIDER=mock` | `PAY_PROVIDER=real` + `/app/secrets` PEM |
| Octop 入口 | 常 `pnpm run octop` / `127.0.0.1:5201` / attach_existing | `https://www.mmai.vip`（nginx→8088）；compose 模板设 `OCTOP_MAMMOTH_OIDC_ISSUER` |
| OCTOP_HOME | 本机 `~/.octop` 等 | api 容器 `OCTOP_HOME=/data/.octop` + `./data/octop` 只读挂载（pricing-config / 模型目录依赖） |
| secrets | 可不挂 | **必须** `./secrets:/app/secrets:ro` |
| 残留进程 | Ctrl+C 后可能残留 `pnpm run octop` 占端口/抢登录 | 验生产客户端前必须杀掉本机残留（见 `docs/runbooks/local-vs-prod-octop.md`） |

## compose 挂载必查

模板：`ground/infra/baota/docker-compose.yml`（发版 preflight 会对照生产）。

必含：

1. `api.environment.OCTOP_HOME: /data/.octop`
2. `api.volumes`：`./data/octop:/data/.octop:ro`
3. `api.volumes`：`./secrets:/app/secrets:ro`
4. **无** `build:`（生产 image-only；Dockerfile 只在本地/CI 使用且 octop 含 `frontend-builder`）
5. `.env`：`PAY_PROVIDER` 与挂载一致
6. **无** `/www/mammoth/src`、`/www/mammoth/Octop` 明文源码树

**不要**把真实密钥写入仓库。

## 中台快发步骤（引用脚本）

```bash
cd ~/Documents/code/mmPlatform/ground/infra/baota

# 1) 检查（~2min）
./preflight-baota.sh --track fast

# 2) 主编排（按改动选 flag；不确定用 --all）
./release-baota-mid.sh --api --octop          # 或 --web / --all
# 干跑：./release-baota-mid.sh --all --dry-run

# 3) 仅冒烟（发版后 15 分钟窗口也可单独跑）
./smoke-baota.sh
# ./smoke-baota.sh --expect-version 2.0.0
```

脚本内部顺序：preflight → 本地 `docker build --platform linux/amd64` → `docker save|gzip` → scp → 宝塔 `docker load` → 同步 image-only compose → 可选 frontend dist→`web/` → `docker compose up -d`（无 `--build`）→ smoke。

### 冻结轨（可选）

```bash
# worktree 已按历史方式创建：mm-release-1.0/{ground,Octop} @ 1.0
./preflight-baota.sh --track freeze
./release-baota-mid.sh --track freeze --all

# cherry-pick 仍用 Octop：
#   cd ~/Documents/code/mm-release-1.0/Octop
#   scripts/release-sync.sh --dry-run <sha> ...
#   scripts/release-sync.sh <sha> ...
```

版本号 SSOT：`ground/config/version.json`（`pnpm version:bump` / `version:check`）。详见 `docs/release/versioning.md`。  
**禁止**在服务器 `.env` 写死 `MAMMOTH_APP_VERSION`（历史事故：角标显示旧版）。

## 客户端 / Actions 拆开步骤

中台与客户端**拆单**：`fast-release` **默认只要中台**；加 `--dispatch` 才开客户端。中台 20 分钟**不等** 220MB；要带客户端时与中台 **T0 并行**。

1. **CI 必须绿**再 dispatch（禁止红门禁常态上车）。
2. **热修优先** `desktop-hotfix.yml`（矩阵写死三平台，默认 `attach_release=false`）。正式/自定义 platforms 才 `octop-desktop.yml`；禁止无脑 `all`（tag `v*` 才 `all`）。
3. **分层更新优先于大包**：能 dashboard/code zip 就别打全量 portable——`Octop/scripts/mammoth-dashboard-release.sh`、`mammoth-release.sh --dashboard` / `--code`（README/脚本会 echo 提示）。
4. **T1 直传**：`ground/infra/baota/publish-desktop-baota.sh --run-id <id> --version <ver>`（默认 dry-run；`--apply` 真传；覆盖前 `*.bak-<timestamp>`）。不走强制 1.0 的 `mammoth-release.sh` 冻结检查。
5. 更新 `mammoth-latest.json`：校验 **shell / portable / dashboard / code**；只发壳须说明；`assert-latest-json.sh` / smoke 对分裂打 WARN。
6. 冻结轨一条龙仍可用：`Octop/scripts/mammoth-release.sh`（先 `--dry-run`，要求 1.0）。编排打印：`fast-release.sh`。

### Dashboard 同包同号门禁

```bash
# Octop 仓库
make build-frontend
scripts/check-dashboard-gate.sh
```

`ground/infra/baota/Dockerfile.octop` **必须**含 `frontend-builder`；缺了会再现 `/agent/chat` 404。

## 发版后 15 分钟冒烟

自动：`./smoke-baota.sh`（health/version/chat/client-error/latest.json）。

人工补强（P1）：

- [ ] 超管：pricing-config 能读到模型厂商（验证 OCTOP_HOME）
- [ ] 企管：支付 channels 显示微信/支付宝 `configured`（或小额扫码）
- [ ] 桌面/Web：**base URL 为生产**；无本机 `pnpm run octop` 残留
- [ ] org_admin：Network **不应**自动刷 `/api/bridge/*` 403；`POST /api/client-error` 200
- [ ] 登录后模型列表：不长时间卡「还没有可用模型」；池外 sticky 不得直接发会话

## 热修未入库禁止上线

上线 SHA **必须**在将发布分支（fast=开发树当前分支；freeze=`1.0`）。  
生产容器里「临时改过、git 没有」的热修，下次镜像 load 会被盖掉（复盘 C8：`631ca4a` 等未入库风险）。  
默认不开 GitHub PR；需要 Actions 打包时再动远程。

## 编译位置（密保后）

| 产物 | 在哪编译 | 怎么发 |
|---|---|---|
| API 镜像 | **本地/CI** `docker build --platform linux/amd64 -f infra/baota/Dockerfile.api` | save → scp → load → `up -d api`（启动跑 prisma migrate） |
| Octop 镜像 | **本地/CI** `docker build --platform linux/amd64 -f infra/baota/Dockerfile.octop`（context=Octop） | 同上 → `up -d octop` |
| 前端 web | **本地** | `pnpm build` → rsync **仅** `web/` dist |
| 客户端安装包 | **GitHub Actions** 热修 `desktop-hotfix.yml` / 全量 `octop-desktop.yml` | CI 绿后手动触发；T1 用 `publish-desktop-baota.sh` |

**禁止**在宝塔上 `docker compose build`；**禁止**把 ground/Octop 源码树放到 `/www/mammoth`。

## 快发版规则（常态必守）

1. 支付 secrets / compose 挂载只配一次；常态不要反复 scp 证书。
2. 只 rebuild 有改动的服务。
3. 用 Docker / pnpm 缓存；**禁止**常态 `--no-cache`（例外仅 `BAOTA_FORCE_NO_CACHE=1`）。
4. 固定步骤；清库/全表扫描仅当用户明确要求。
5. 客户端装包与宝塔中台**拆单**；`fast-release` 默认 `--no-client`。
6. **smoke 必跑**；分层优先于大包；T1 覆盖前 bak；**单主操**。

## 踩坑附录（K1–K7、C1–C8 压缩）

来源：`docs/reports/2026-11-02-release-retrospective.md`。

| ID | 坑 | 规避 |
|----|----|------|
| K1 | Actions 门禁红反复跑 | CI 绿再 dispatch |
| K2 | Release 资产命名异常 | 稳定名 `mammoth-agent-*`；上传前改名 |
| K3 | 构建慢（境外源/前台 SSH/desktop 进 context） | 国内源；nohup；排除 desktop；禁常态 no-cache |
| K4 | latest.json shell≠portable | smoke WARN；只发壳须文档说明 |
| K5 | 1.0 vs 2.0 规程打架 | **双轨**：默认 fast，freeze 可选 |
| K6 | 旧流程 rsync 源码 / 宝塔 build | **已废止**：改本地 build+save/load；盘上不留源码 |
| K7 | 无 frontend-builder → `/agent/chat` 404 | Dockerfile 保留 frontend-builder；smoke 查 chat |
| C1 | pricing 读不到目录 | api `OCTOP_HOME` + `data/octop` 挂载（OpenSpec `deploy-octop-home`） |
| C2 | real 支付无 PEM | `secrets:/app/secrets`（OpenSpec `pay-secrets-mount`） |
| C3 | bridge 对 org_* 403 | 预期；仅 platform identity；客户端 `canAccessBridge`（OpenSpec `bridge-platform-identity`） |
| C4 | client-error 经 nginx 403 | JWT-exempt + 限流，非 loopback 门（OpenSpec `client-error-telemetry`） |
| C5 | 客户端连本机 5201 | 验生产前检查 issuer / base URL（runbook） |
| C6 | 残留 `pnpm run octop` | 杀掉再验（runbook） |
| C7 | 内置角色可写 | `editable:false` 拒绝 PATCH（OpenSpec `builtin-role-write-guard`；对齐 unify-rbac） |
| C8 | 热修未入库 | 上线 SHA 必须在将发布分支 |

### 构建类细节（保留）

1. **镜像源一律国内**：apt/npm/pnpm/pypi → `mirrors.cloud.tencent.com`（及阿里云 pypi 备用）。境外源可卡数十分钟。GitHub Actions runner 除外。
2. **构建上下文瘦身**：`Octop/.dockerignore` 排除 `/desktop`、`/.git.upstream`。
3. **pnpm 唯一**：`pnpm install --frozen-lockfile`；dashboard `.npmrc` 可 `node-linker=hoisted`。
4. **构建在本地/CI**：宝塔只 `docker load`；大 tar 用 gzip；Mac 必须 `--platform linux/amd64`。
5. **load ≠ 生效**：必须 `docker compose up -d`（不要加 `--build`）。
6. **迁移随 api 启动**：`docker exec mammoth-api npx prisma migrate status`。

## 回滚

```bash
# 镜像（发版前脚本/手工应先 tag prev-）
ssh root@124.223.179.250 'cd /www/mammoth && \
  docker tag mammoth-api:prev-<时间> mammoth-api:local && docker compose up -d api'
# octop 同理

# 前端：web.bak-<时间> 换回 /www/mammoth/web
# 客户端 latest.json：用上传前备份 dist/mammoth-latest.json.bak 传回
```

## 常看日志

```bash
ssh root@124.223.179.250 'docker logs --tail 100 mammoth-api'
ssh root@124.223.179.250 'docker logs --tail 100 mammoth-octop'
# 镜像 load 后无 /tmp/build.log；看 compose / docker logs 即可
```

Octop `api/middleware/access_log.py` 打印真实 IP + 用户 + 路径，是客户端问题第一入口。
