---
name: baota-release
description: >-
  用户说「发布猛犸宝塔」「发宝塔」「发版猛犸」「上线 mmai.vip」「回滚宝塔」时必须先读本 Skill 全文再执行；
  也用于排查宝塔发版慢、构建失败、镜像/网络、nginx 切流、发版后验收与回滚。适用于任意 AI 模型（DeepSeek / Kimi / ChatGPT / OpenCode）。
---

# 猛犸宝塔发版（MMP：ground + mammoth-agent）

## 0. 一句话授权

用户说 **「发布猛犸宝塔」** = 授权按本 Skill 执行。

**一键入口**：`ground/infra/production/release.sh --yes`（详见第 4 节方式 A）。

默认范围：**中台 api + web + pg**，只替换 `https://www.mmai.vip`。
默认不做：Octop、客户端 dmg、GitHub PR、commit/push。

只有用户明确说“发客户端 / 发 dmg / 发安装包”才处理客户端。

## 1. 红线（违反即停）

| # | 红线 |
|---|---|
| 1 | **单主操**：同一时间只允许一个会话发版。发版前必须拿 `/www/mmp-prod/.release.lock`；锁存在且未过期 → 停止并问人 |
| 2 | **只动 `www.mmai.vip` 和 `/www/mmp-prod`**。`/www/mammoth`、宝塔其他站点、其他容器一律不碰 |
| 3 | **禁止在 Apple Silicon 上构建 web 镜像**（不要用 `--platform linux/amd64` 跑 mammoth-agent web）；web 镜像必须在服务器原生构建 |
| 4 | 宝塔只留镜像 + `middle-web/` + `downloads/` + `secrets/` + `data/`，**不留源码树** |
| 5 | 不打印明文密码/密钥；凭据只放 `release-private/`，权限 600 |
| 6 | 不擅自 commit/push；不改 mammoth-agent 业务代码（修发版阻塞除外，需单独说明） |
| 7 | 不用 `--no-cache`；不执行 `docker system prune -a`；不重启整台服务器 |
| 8 | nginx 只 `reload`，不 `restart`，避免影响同机其他站点 |
| 9 | 发版未跑 smoke + 验收清单，不得说“发布完成” |
| 10 | 发版结束必须释放锁、写 state、汇报镜像 tag 与回滚方式 |
| 11 | **所有网络下载必须带超时，并校验实际字节/镜像**；HTTP 200/302 不算成功 |
| 12 | **能跑 `release.sh` 就不要手工拼命令**；手工步骤只在脚本报错排障时用 |

## 2. 环境事实

| 项 | 值 |
|---|---|
| 本机仓库 | `/Users/fuweilang/Documents/code/mmp`（`ground/` + `mammoth-agent/`） |
| 服务器 | `root@124.223.179.250`（SSH key，`BatchMode=yes` 可用） |
| 宝塔面板 | `https://124.223.179.250:18888/39af4bfb`（密码不进文档） |
| 新栈目录 | `/www/mmp-prod` |
| compose 项目 | `mmp-prod-v1` |
| api | `127.0.0.1:33100 → 3100` |
| web | host 网络 `33080` |
| pg | 容器内 `5432`，库 `mammoth_core`，卷 `prod_pg` |
| 站点配置 | `/www/server/panel/vhost/nginx/www.mmai.vip.conf` + `extension/www.mmai.vip/mammoth.conf` |
| 静态包 | `/www/mmp-prod/middle-web/` |
| 客户端包 | `/www/mmp-prod/downloads/`（本轮可空） |
| 旧栈（勿动） | `/www/mammoth`，`mammoth-api:3100`、`mammoth-octop:8088` |
| 超管 | `13800000001`，密码见 `release-private/admin-credentials.txt` |

## 3. 版本与命名

唯一版本源：`ground/config/version.json`。分支名 ≠ 版本号。

```bash
cd /Users/fuweilang/Documents/code/mmp
export VERSION="$(node -p "require('./ground/config/version.json').version")"
export RELEASE_ID="$VERSION-$(date +%Y%m%d-%H%M)"
export RELEASE_DIR="$PWD/release/$RELEASE_ID"
export HOST=root@124.223.179.250
mkdir -p "$RELEASE_DIR"
```

镜像 tag、release 目录、state 文件全部用同一个 `RELEASE_ID`。禁止再出现 `20261104` 目录配 `20261105` 镜像的情况。

## 4. 发版流程（按顺序，不许跳）

### 方式 A：一键脚本（推荐，任意模型优先用）

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh              # 只读体检（可选，建议先跑）
./ground/infra/production/release.sh --dry-run   # 先看计划
./ground/infra/production/release.sh --yes       # 正式发版
```

脚本内部就是下面 Step 0–9：抢锁、写 state、本机构建前端/api、服务器构建 web、
上传部署、切 nginx、smoke，并在退出时释放锁。中断后按提示续跑：

```bash
./ground/infra/production/release.sh --release-id <ID> --from web --yes
```

只有在脚本报错需要排障、或需要改脚本时，才按方式 B 手工执行。

### 方式 B：手工步骤（排障/兜底）

### Step 0 预检 + 抢锁 + 建 state

```bash
pnpm --dir ground run version:check
git status --short
git -C mammoth-agent rev-parse HEAD
ssh "$HOST" 'df -h / | tail -1; docker --version; docker compose version'
```

磁盘剩余必须 ≥ 30G。

抢锁（文件存在就停）：

```bash
ssh "$HOST" 'mkdir -p /www/mmp-prod; test ! -f /www/mmp-prod/.release.lock || { echo "LOCKED:"; cat /www/mmp-prod/.release.lock; exit 3; }'
printf 'release=%s\nsession=%s\nstarted=%s\n' "$RELEASE_ID" "${OPENCODE_SESSION_ID:-local}" "$(date -Is)" \
  | ssh "$HOST" 'cat > /www/mmp-prod/.release.lock'
```

锁一旦拿到，后续无论成功失败都要释放（见 Step 9）。

建 `$RELEASE_DIR/state.json`，字段见第 8 节。每完成一步就更新，换模型/断线可续。

### Step 1 构建前端（本机，快）

```bash
cd ground
VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/shared build
VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/frontend build
tar -C apps/frontend/dist -czf "$RELEASE_DIR/middle-web.tar.gz" .
```

### Step 2 构建 API 镜像（本机，可接受）

```bash
cd /Users/fuweilang/Documents/code/mmp/ground
docker build --platform linux/amd64 -f infra/production/Dockerfile.api -t "mmp-api:$RELEASE_ID" .
```

**必须立刻验依赖**，不通过就不许发：

```bash
docker run --rm --platform linux/amd64 "mmp-api:$RELEASE_ID" \
  node -e "require.resolve('express'); console.log('deps ok')"
docker save "mmp-api:$RELEASE_ID" | gzip -1 > "$RELEASE_DIR/mmp-api-image.tar.gz"
```

### Step 3 构建 web 镜像（必须在服务器，原生 amd64）

同步源码。**不要排除 `*/lib`、`scripts/release`**：

```bash
cd /Users/fuweilang/Documents/code/mmp
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .desktop-build \
  --exclude release --exclude releases \
  mammoth-agent/ "$HOST:/tmp/mmp-web-build/"
```

生成服务器专用 Dockerfile（只换基础镜像源），并确认关键文件存在：

```bash
COMMIT="$(git -C mammoth-agent rev-parse HEAD)"
ssh "$HOST" 'cd /tmp/mmp-web-build \
  && sed "s|^FROM node:24-bookworm|FROM hub.rat.dev/library/node:24-bookworm|; s|^FROM docker:28-cli|FROM hub.rat.dev/library/docker:28-cli|" \
       infra/production/Dockerfile > Dockerfile.server \
  && sed -i "s|^\*\*/lib$|# **/lib|" .dockerignore \
  && test -s scripts/release/process.ts \
  && test -s packages/llm/llm-ground/lib/types/index.js \
  && echo source-ok'
```

启动构建（后台 + 日志）：

```bash
ssh "$HOST" "cd /tmp/mmp-web-build && setsid nohup docker build --platform linux/amd64 \
  --build-arg MMP_CLIENT_COMMIT_HASH=$COMMIT \
  -f Dockerfile.server -t mmp-web:$RELEASE_ID . \
  > /tmp/mmp-web-build.log 2>&1 < /dev/null & echo started"
```

轮询，禁止盲等超过 5 分钟：

```bash
ssh "$HOST" 'tail -6 /tmp/mmp-web-build.log; pgrep -f "docker build" >/dev/null && echo RUNNING || echo DONE'
```

- 正常：约 10–20 分钟。
- 超过 25 分钟仍在同一阶段：看最后 40 行，按第 7 节排查，不要继续睡等。

### Step 4 准备并上传发布包

`production.env` 不在仓库里。首次从 `production.env.example` 生成；已存在则**只备份、不覆盖**：

```bash
cd "$RELEASE_DIR"
cp /Users/fuweilang/Documents/code/mmp/ground/infra/production/{compose.yml,nginx-mmai.conf,proxy-common.conf,init-db.sh} .
# production.env 不在仓库：首次从 example 生成后填密钥；已有则从服务器拉回，禁止覆盖
test -f production.env || cp /Users/fuweilang/Documents/code/mmp/ground/infra/production/production.env.example production.env
ssh "$HOST" 'mkdir -p /tmp/mmp-release'
scp compose.yml production.env nginx-mmai.conf proxy-common.conf init-db.sh middle-web.tar.gz "$HOST:/tmp/mmp-release/"
```

服务器落位（先备份）：

```bash
ssh "$HOST" 'set -e; TS=$(date +%Y%m%d-%H%M%S); cd /www/mmp-prod \
  && cp -a .env .env.bak-$TS \
  && cp -a middle-web middle-web.bak-$TS \
  && rm -rf middle-web/* \
  && tar -xzf /tmp/mmp-release/middle-web.tar.gz -C middle-web \
  && cp /tmp/mmp-release/{compose.yml,nginx-mmai.conf,proxy-common.conf,init-db.sh} . \
  && echo "backup=$TS"'
```

### Step 5 载入镜像并启动

```bash
gunzip -c "$RELEASE_DIR/mmp-api-image.tar.gz" | ssh "$HOST" 'docker load'
```

原子更新 `.env` 后启动：

```bash
ssh "$HOST" "cd /www/mmp-prod \
  && sed -e 's|^MMP_API_IMAGE=.*|MMP_API_IMAGE=mmp-api:$RELEASE_ID|' \
         -e 's|^MMP_WEB_IMAGE=.*|MMP_WEB_IMAGE=mmp-web:$RELEASE_ID|' \
         .env > .env.new && mv .env.new .env \
  && docker compose up -d \
  && sleep 15 && docker compose ps"
```

检查 api 日志：必须看到 migrate 完成 + `Nest application successfully started`；**不能有** `Cannot find module` / `MODULE_NOT_FOUND`。

### Step 6 超管（仅首次或密码重置）

```bash
curl -s -X POST https://www.mmai.vip/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"phone":"13800000001","password":"<见 release-private/admin-credentials.txt>"}'
```

要求 200 且返回用户信息。若权限不全，检查 `user_role` 是否有 `super_admin`。

### Step 7 切 nginx（只 reload）

```bash
ssh "$HOST" 'set -e; TS=$(date +%Y%m%d-%H%M%S); \
  cp -a /www/server/panel/vhost/nginx/www.mmai.vip.conf /www/server/panel/vhost/nginx/www.mmai.vip.conf.bak-$TS; \
  cp -a /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf.bak-$TS; \
  cp /www/mmp-prod/nginx-mmai.conf /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf; \
  nginx -t && nginx -s reload && echo nginx-ok'
```

`nginx -t` 失败立即还原备份，不得强行 reload。

必须确认配置里有这两条，否则后台页面会报“接口未就绪：返回的不是 JSON”：

```nginx
location ^~ /console/api/ { proxy_pass http://127.0.0.1:33100/api/; ... }
location ^~ /admin/api/   { proxy_pass http://127.0.0.1:33100/api/admin/; ... }
```

### Step 8 smoke + 验收

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/smoke.sh https://www.mmai.vip
```

再逐项：

| 检查 | 期望 |
|---|---|
| `GET /` | 303 → `/login`，页面含“猛犸” |
| `GET /agent` | 410 |
| `GET /login` `/console/` `/admin/` | 200 |
| `GET /api/health` | 200 `{"ok":true}` |
| `GET /api/version` | 200，版本 = `version.json` |
| `GET /admin/api/users`（带登录 cookie） | 200，`application/json` |
| `GET /console/api/version` | 200 JSON |
| 真实登录 | 200，能进 `/console/` |
| `docker compose ps` | api/web/pg 均 Up，`RestartCount=0` |
| web 日志 | 无 `No usable native binding`、无 `failed to map segment` |
| 下载页 | 无包时明确提示，不报 500 |

### Step 9 收尾

```bash
ssh "$HOST" 'rm -rf /tmp/mmp-web-build /tmp/mmp-web-build.log /tmp/mmp-release; rm -f /www/mmp-prod/.release.lock; df -h / | tail -1'
```

镜像保留策略：当前版本 + 上一个版本，其余删除；删除前先 `docker images` 列出来给用户确认。

更新 `state.json` 为 `done`，按第 9 节格式汇报。

## 4A. 提速与并行（2026-11-05 起建议照做）

### 两条独立流水线，并行跑

| 流水线 | 内容 | 是否占发布锁 | 依赖 |
|---|---|---|---|
| A：中台 + web | `release.sh`（Step 0–9） | 占 | 无 |
| B：客户端安装包 | 本机打 dmg/exe | 不占 | 无，只有最后传 `downloads/` 才碰服务器 |

客户端打包起步就是 30–60 分钟，**先把它在后台开跑，再发中台**；总时长 ≈ max(A, B) + 传 latest.json，而不是 A + B。

### 流水线 A 内部的并行点（方式 B 手工时）

1. **Step 1（本机前端构建）与 Step 3（服务器 web 镜像）互不依赖**：rsync 完源码立刻在服务器后台启动 `docker build`，回本机接着做前端和 api 镜像，别串行傻等。
2. **Step 2（api 镜像 docker build）与 Step 1（pnpm build）可并行**，两个进程互不等。
3. **api 镜像 `docker save | gzip` 上传与服务器 web build 并行**：一个吃本机上行带宽，一个吃服务器 CPU。

### 流水线 B（客户端三包）的打法

- 三个 target 的产物目录互相隔离（`.desktop-build/targets/<name>/`），但**不要三开**；本机建议只开一个 desktop target 与 `release.sh` 并行。
- 打包是 CPU 密集型；本机核心数不多时：**客户端串行打包、中台并行**——出一个包校验一个，传的同时打下一个。
- **Windows 包不能在 macOS 上打**：`package-target.ts` 明确要求 `win-x64` 使用 Windows x64 构建机；走 `.github/workflows/windows-package.yml`（发布必须 signed），本轮不打就在下载页显示“暂未提供”。
- flock 平台包已内建进打包流程（`package-target.ts` 优先本地 cross-compiled 平台包，缺失才回退 registry），缺失会直接在 `prepare:packages` 报错，不会出坏包。
- **别清 `.desktop-build/`**（Electron/pnpm store 缓存）和服务器 docker 层缓存，重复打包提速主要靠这两处。

### 顺序总原则

1. **先开客户端最慢的 target（mac-arm64）**，再跑中台 + web；客户端上传放最后，避开 api 镜像上传。
2. 客户端包最后走 `downloads/`；`mammoth-latest.json` **永远最后传**（先传产物、备份旧 json、再改指针）。
3. 任何一条流水线炸了，另一条不受影响，各自独立回滚。

### 时间预期

| 范围 | 顺利 | 踩坑 |
|---|---|---|
| 仅中台 + web | 20–40 分钟 | 1 小时 |
| 全量（含三包 + 上传） | 1–1.5 小时（并行后） | 2–3 小时 |

大头永远是客户端打包和安装包上传（取决于本机上行带宽），中台本身很快。

## 4B. 2026-11-05 复盘：今天踩过并已解决的坑

| # | 现象 | 根因 | 处理 | 以后规避 |
|---|---|---|---|---|
| 1 | web 镜像构建报 `ERR_MODULE_NOT_FOUND .../scripts/release/process.ts` | rsync 的 `--exclude release` 把嵌套的 `scripts/release/` 也排掉了 | 改成锚定根目录：`--exclude '/release' --exclude '/releases'`，重新同步 | 所有 rsync 排除根目录必须带 `/`；构建前 `test -s .../scripts/release/process.ts` |
| 2 | 容器起来后本机 `curl` 健康检查 404/421 | 没带公网 Host，web 按 Host 路由 | 健康检查加 `-H 'Host: www.mmai.vip'` | 容器内检查也必须带 Host；最终以公网 smoke 为准 |
| 3 | 跨架构 desktop 构建 TS 报找不到 `pack-registry-package` 类型 | 只有 `.mjs`，缺 `.d.mts` 声明 | 补 `apps/desktop/scripts/pack-registry-package.d.mts`，import 使用声明 | 新增 `.mjs` 同步补 `.d.mts`；跨架构打包前先跑 `pnpm --dir apps/desktop run build` |
| 4 | 已装客户端第一轮会话报 `Cannot find module '@mammoth-ai/node-addon-system-<platform>-<arch>'` | 只打了入口包，目标平台原生包缺失；跨架构还可能优先拿到 registry 旧包 | `package-target.ts` 补打目标平台包；优先本地 cross-compiled addon，registry 兜底；`prepare-package-set.ts` 缺包直接报错 | 出包后检查 `app.asar.unpacked/.../node-addon-system-<platform>-<arch>`；首轮会话必须实测 |
| 5 | 上传 x64 时容易拿到 `release/desktop/` 里的旧包（旧 `2f1e…` vs 当次 `dc2f…`） | 两套产物目录并存，按目录名取文件会拿错 | 只从 `.desktop-build/targets/mac-x64/unsigned-artifacts/` 取当次文件，重传并更新 manifest | 禁止从 `release/desktop/` 旧目录上传；state 记录 source path + sha256 + size |
| 6 | 单平台重打后，manifest 里另一个平台仍可能指旧包 | 只重建了 arm64，没有逐个核对 x64 指针 | 重打所有对外平台，或只保留当次重打的平台并同步页面 | “一个平台重打，所有平台都核对 sha”；manifest 最后传 |
| 7 | 本轮没出 Windows 包，页面/manifest 若保留 Windows 入口就会 404 | manifest 只有 darwin-arm64/darwin-amd64，没有 `windows-amd64` | 页面对 Windows 显示“暂未提供”，不生成可点链接 | 页面平台列表必须由 manifest 生成；smoke 逐个 GET manifest 里的文件 |
| 8 | `mammoth-latest.json` 更新后客户端下载 404/旧包 | 先改指针后传产物，或旧 json 覆盖新 json | 先传产物并校验，备份旧 json，最后原子替换 json | 指针永远最后；保留 `.prev`，写清回滚命令 |
| 9 | `release/*/state.json` 停在 `deploying` | 手工静态部署（middle-web-only）没有收尾 | 补 `status=done/failed`、`finished_at`、note | 任何部署都建 state 并收尾；新会话先读 `release/*/state.json` |
| 10 | deploy 显示 done 但 `note=exit=1` | 上一次失败 note 残留，`state_update done` 未清空 | 以 status + smoke 为准，补写成功 note | `state_update done` 未传 note 时删除旧 note（脚本待补）；每次状态变更都写 note |
| 11 | web-only 热修后默认工作区/首屏仍不对 | 容器 HOME、默认工作目录、冷启动路径未一起设置 | 设置 `HOME` + `default-workspace`，加 warmup splash；验证 657ms/3419ms | web-only 也要验收 `defaultWorkspaceId`、冷启动、`RestartCount=0` |
| 12 | desktop 上传 state 已 done，之后又重传 arm64 但 state 没变 | 重传没有新建记录 | 新建 reupload step 或新 release id，更新 `finished_at` | 任何重传都必须留痕；manifest 的 `updated_at` 与 state 对得上 |
| 13 | 客户端打包/上传时本机 CPU、上行被中台构建抢满 | 两条流水线同时抢本机资源 | 桌面只开一个 target，等中台到服务器 web build 再开下一个；上传错开 api 镜像 | 同一时间只跑一个 desktop target；大文件上传串行 |

> 未闭环：今天 API 发版后，控制台权限 migration 是否已完全应用尚未单独复核；下次接手中台先查。

## 4C. 并行发版执行卡（客户端 + 中台）

**结论：可以并行。** 客户端打包不占 `/www/mmp-prod/.release.lock`，也不依赖中台镜像；只有最后写 `downloads/` 时才碰服务器。

### 推荐时间线

| 阶段 | 本机 | 服务器 | 目的 |
|---|---|---|---|
| T0 | 后台开 `mac-arm64`（最慢） | — | 先让最慢的跑起来 |
| T0+1m | `release.sh --yes` | 抢锁、构建 | 两条独立流水线 |
| 中台进入 `web-image` | 开 `mac-x64` | 服务器 build web | 本机让出 CPU，避免和 api 构建互抢 |
| 中台 `deploy/smoke` | 继续 x64 / 准备上传 | 切流、验收 | 不要这时传大文件 |
| 中台完成 | 传 DMG → 校验 → 最后传 json | 只读校验 | 避开 api 镜像上传带宽 |

### 开跑命令

```bash
# 终端 1：客户端先开一个 target，别三开
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
nohup caffeinate -dimsu pnpm --dir apps/desktop run package:mac:arm64:unsigned \
  > /tmp/mmp-desktop-arm64.log 2>&1 &
echo $! > /tmp/mmp-desktop-arm64.pid
tail -f /tmp/mmp-desktop-arm64.log
```

```bash
# 终端 2：中台同时发
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/release.sh --yes
```

```bash
# 中台进入 web-image 后，再开 x64；win-x64 不在 macOS 上打
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
pnpm --dir apps/desktop run package:mac:x64:unsigned
```

### 并行边界

| 可以并行 | 不要并行 |
|---|---|
| 客户端打包 vs `release.sh` | 两个 `release.sh` / 两个 nginx reload / 两个 `compose up` |
| 本机前端构建 vs 服务器 web 镜像 | 三个 desktop target 同时开 |
| api 镜像 docker build vs 本机前端构建 | DMG 上传 vs api 镜像上传 |
| 下一个 target 打包 vs 上一个 target 校验 | `mammoth-latest.json` 先于产物上传 |

### 资源竞争

| 资源 | 风险 | 建议 |
|---|---|---|
| CPU | Electron/asar 与本地 Docker build 互抢 | 同一时间只开一个 desktop target；中台到服务器构建后再开下一个 |
| 内存 | Colima + Electron + 打包缓存 | 至少留 8G；不够就先发中台，客户端排队 |
| 上行 | DMG 200–300MB，api tar 约 300MB | 大文件串行；中台 smoke 通过后再传 DMG |
| 磁盘 | 三包 + Electron 缓存约 2–3G | 打包前 `df -h`，别清 `.desktop-build` |
| 休眠 | 合盖杀进程 | `caffeinate -dimsu`，长任务放独立终端 |

## 4D. 其他可优化点（按优先级）

| 优先级 | 建议 | 收益 | 落点 |
|---|---|---|---|
| P0 | 上传先写 `.tmp`，服务器 `mv` 原子替换；json 同样 | 客户端不会下到半个文件 | 第 6 节命令 |
| P0 | `downloads/` 上传单独串行，或加 `.downloads.lock` | 防止两个会话互相覆盖 | `release.sh` / 客户端上传脚本 |
| P0 | `state_update done` 未传 note 时清空旧 note，并补 `finished_at` | 不再出现 done + `exit=1` 的误导 | `release.sh`（待改） |
| P0 | smoke 按 manifest 遍历所有平台，校验文件存在 + sha/大小 | Windows/arm64 漏传能立刻发现 | `smoke.sh` |
| P1 | `release.sh --with-desktop`（建议新增）：自动后台开 mac-arm64，主流程结束后等待并上传 | 一条命令完成并行，不靠人记 | 新 wrapper 或 `release.sh` 开关 |
| P1 | 废弃 `release/desktop/` 作为上传源，只认 `.desktop-build/targets/` | 消灭“旧包/新包”混用 | 文档 + 上传脚本 |
| P1 | 下载页平台列表从 manifest 生成；无包平台显示“暂未提供” | 不再出现死链接 | 前端下载组件 |
| P1 | 出包自动检查 `file`/`lipo` 架构 + `app.asar.unpacked` 原生包 | 跨架构坏包在打包阶段暴露 | `package-target.ts` / 校验脚本 |
| P2 | manifest 增加可选 `bytes`、`built_at`；客户端忽略未知字段 | 大小一致性可机器校验 | schema v3 兼容 |
| P2 | 桌面包保留上一版 + 一键回滚（DMG + json） | 客户端回滚不用手拼 | `downloads/` 备份 + 脚本 |

## 5. 网络与下载（最容易吃掉几小时）

> 2026-11-04 这次发版，10h47m 里至少 3h 花在“拉文件”：GitHub 0 字节、Docker Hub 超时、
> 镜像站挂起、apt TLS 失败。以下规则和源表是按实测结果写的，换模型也照此执行。

### 5.1 四条铁律

| # | 规则 |
|---|---|
| 1 | **先选源，再下载**：不要先直连等 10 分钟再换源 |
| 2 | **每个下载都必须有超时**：`timeout 180`、`curl --max-time 600`；禁止无超时裸跑 |
| 3 | **成功与否看实际产物**：文件看字节数，镜像看 `docker pull`/`docker images`；HTTP 200/302 不算成功 |
| 4 | **单源失败立刻换下一个**：最多试 3 个源，不要对同一个源反复重试 |

### 5.2 已实测源表（2026-11-05）

| 资源 | 首选 | 可用备选 | 实测不可用 | 验证方式 |
|---|---|---|---|---|
| Electron | `https://npmmirror.com/mirrors/electron/` | 本机缓存 | GitHub `release-assets.githubusercontent.com`：`content-length: 0` | `curl -sSIL` 看 content-length（应为 130394296） |
| npm / pnpm | `https://registry.npmmirror.com` | `https://mirrors.cloud.tencent.com/npm/` | 官方源慢 | 实际安装或 `npm view pnpm version` |
| Debian apt | `https://mirrors.aliyun.com/debian` | 官方 `deb.debian.org` | 腾讯云 apt 源：TLS 证书校验失败 | `apt-get update` 真正跑通 |
| Docker 基础镜像（本机） | `hub.rat.dev` | `dockerhub.icu` | `docker.1ms.run` 挂起 >15m；`dockerproxy.net` 429；`docker.xuanyuan.me`/`docker.1panel.live`/`docker.nju.edu.cn` 403 | 实际 `docker pull` 一个小镜像 |
| Docker 基础镜像（腾讯云服务器） | `mirror.ccs.tencentyun.com`（内网） | `hub.rat.dev` | 本机访问腾讯云内网镜像返回 `000` | 在服务器上 `docker pull` |
| GitHub Release 大文件 | 对应项目的国内镜像 / 预下载 | 代理 | 直连常见 302 后 0 字节 | 下载后 `ls -lh` 校验字节 |

**实测镜像站状态码（仅作参考，不能代替 pull）：**

| 镜像站 | `/v2/` 或 manifest | 实际 pull |
|---|---|---|
| `hub.rat.dev` | 302 | ✅ 可用 |
| `dockerhub.icu` | 200 | ✅ 可用 |
| `dockerproxy.net` | 200 | ⚠️ node 可用，docker:28-cli 报 429 |
| `docker.1ms.run` | 401 | ❌ 挂起超 900s |
| `docker.xuanyuan.me` / `docker.1panel.live` / `docker.nju.edu.cn` | 403 | ❌ |
| `docker.m.daocloud.io` | 401 | ❌ |
| `mirror.ccs.tencentyun.com` | 000（本机） | ❌ 本机不可达 |

### 5.3 腾讯云专项

- **腾讯云 npm 镜像可用**：`https://mirrors.cloud.tencent.com/npm/` 根路径返回 404，但作为 registry 正常；不要把根路径 404 当成不可用。
- **腾讯云 apt 镜像曾 TLS 失败**：`Certificate verification failed ... issuer is unknown`，换官方源或阿里云。
- **腾讯云 Docker 内网镜像只在内网可用**：`mirror.ccs.tencentyun.com` 在本机返回 `000`；在腾讯云服务器上才快。
- 服务器本身就是腾讯云（`VM-0-16-ubuntu`）：**能在服务器构建的，优先在服务器构建**，既快又避免本机断网/休眠。

### 5.4 下载验证模板

```bash
# 1) 文件：必须看最终 content-length 和实际字节
curl -sSIL -m 20 "URL" | grep -iE '^HTTP|content-length|location'
curl -L --fail --max-time 600 -o /tmp/artifact "URL" && ls -lh /tmp/artifact

# 2) Docker：必须实际 pull，不能只看 /v2/ 状态码
timeout 180 docker pull hub.rat.dev/library/node:24-bookworm-slim \
  || timeout 180 docker pull dockerhub.icu/library/node:24-bookworm-slim \
  || echo "ALL MIRRORS FAILED"

# 3) 容器内网络：node 镜像没有 curl，用 fetch
docker run --rm node:22-bookworm-slim node -e \
  "fetch('https://registry.npmmirror.com/pnpm').then(r=>console.log(r.status))"
```

常见误判：

- GitHub 返回 `302` 就以为成功，实际资源域 `content-length: 0`。
- 镜像站 `/v2/` 返回 200/302/401，实际 blob 拉取 429/403。
- 腾讯云 npm 根路径 404，就以为整个源不可用。
- `curl -I` 成功，但 `GET` 被代理拦截；必须下真实文件。

### 5.5 长任务与断线

```bash
# 服务器/本机统一：后台 + 日志 + 独立临时目录
BUILD_DIR="/tmp/mmp-build-$RELEASE_ID"
setsid nohup bash -c '...' > "$BUILD_DIR.log" 2>&1 < /dev/null &
```

- 轮询间隔 **60–120 秒**，不要 `sleep 600` 以上；长时间等待会掩盖卡死。
- 本机跑长构建时用 `caffeinate -dimsu`，或直接放服务器；**笔记本休眠/断电会杀掉构建**。
- 每次发版用独立 `/tmp/mmp-build-$RELEASE_ID`，不要复用，避免两个会话互相覆盖。
- 工具超时（如 900s）会杀掉前台命令；长命令必须后台化。

### 5.6 传输与完整性

```bash
# 镜像：边压边传，不落中间 tar
docker save "mmp-api:$RELEASE_ID" | gzip -1 | ssh "$HOST" 'gunzip | docker load'

# 大文件：可续传、有进度
rsync -avP --partial middle-web.tar.gz "$HOST:/tmp/mmp-release/"
```

- macOS `tar` 会带 xattr，Linux 解包出现 `LIBARCHIVE.xattr.com.apple.provenance` 警告；用 `COPYFILE_DISABLE=1 tar ...` 或忽略。
- 传完必须校验：`docker images | grep <tag>`、`ls -lh`、`shasum -a 256`。
- `scp` 大文件无进度、断线要重来；优先 `rsync`。

### 5.7 构建环境

- 服务器磁盘 ≥ 30G（web 镜像约 3.5–6G，构建缓存另算）；这次发版后服务器已用 84%。
- `release.sh` 预检会自动预拉 `node:24-bookworm`、`node:24-bookworm-slim`、`docker:28-cli`、`pgvector:pg16`，并补打 `hub.rat.dev` 标签；冷缓存不再等到构建时才暴露。
- 本机 Colima 若用于 API 构建，至少 `--cpu 8 --memory 12`；不要用它构建 web。
- Docker daemon 的 mirror 配在 **Colima VM 内**（`colima ssh` 改 `/etc/docker/daemon.json`），不是 macOS 的 `~/.docker/daemon.json`；改完重启 Docker 会停掉本地容器，记得 `docker start`。
- 容器内没有 `.git`，web 构建必须显式传 `MMP_CLIENT_COMMIT_HASH`。
- 不要用 `${img%%:*}${img#*:}` 拼镜像名（少冒号会得到 `node22-bookworm-slim`）；直接写 `name:tag`。

## 6. 客户端（可选，默认不发）

只有用户明确要求才做。打包命令（本机 macOS arm64）：

```bash
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
pnpm --dir apps/desktop run package:mac:arm64:unsigned   # 本机架构，本地编译原生模块
pnpm --dir apps/desktop run package:mac:x64:unsigned     # 跨架构，优先本地 cross-compiled darwin-x64，缺了才回退 registry
# win-x64 不能在 macOS 上打：package-target.ts 要求 Windows x64 构建机
# 走 .github/workflows/windows-package.yml（发布必须 signed；unsigned 仅内部调试）
```

### 6.1 三 target 对照表

| target | 在哪打 | 本地产物（`.desktop-build/targets/<target>/unsigned-artifacts/`） | 服务器文件名 | manifest key |
|---|---|---|---|---|
| `mac-arm64` | 本机 Apple Silicon | `mammoth-ai-<version>-mac-arm64-unsigned.dmg` | `mammoth-agent-mac-arm64.dmg` | `darwin-arm64` |
| `mac-x64` | 本机 Apple Silicon 跨架构 | `mammoth-ai-<version>-mac-x64-unsigned.dmg` | `mammoth-agent-mac-x64.dmg` | `darwin-amd64` |
| `win-x64` | Windows x64 构建机/CI | `mammoth-ai-<version>-win-x64-unsigned.exe`（发布用 signed） | `mammoth-agent-win.exe` | `windows-amd64` |

**只认 `.desktop-build/targets/<target>/unsigned-artifacts/` 下的当次产物。** `release/desktop/` 里的旧 DMG 只能用于对比/回滚，禁止上传。

### 6.2 出包后先验本地

```bash
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
VERSION="$(node -p "require('./apps/desktop/package.json').version")"
TARGET=mac-arm64
ARCH=arm64   # mac-x64 用 x64
SRC="apps/desktop/.desktop-build/targets/$TARGET/unsigned-artifacts/mammoth-ai-$VERSION-$TARGET-unsigned.dmg"
APP="apps/desktop/.desktop-build/targets/$TARGET/unsigned-artifacts/mac/猛犸智能体.app"

shasum -a 256 "$SRC"
stat -f%z "$SRC"
file "$APP/Contents/MacOS/猛犸智能体"
file "$APP/Contents/Resources/app.asar.unpacked/mmp/node_modules/@mammoth-ai/node-addon-system-darwin-$ARCH/bin/system.node"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist"
```

- 架构必须匹配：x64 包主程序和 `system.node` 都应是 `x86_64`，arm64 包都应是 `arm64`。
- bundle id **不能是 `com.tencent.octop`**（废弃包）。
- `system.node` 缺失或架构不对，直接重打，不要上传。

### 6.3 上传与三重校验

```bash
# 1) 先传临时名，再原子改名，避免客户端下到半个文件
DEST=mammoth-agent-mac-arm64.dmg
rsync -avP --partial "$SRC" "$HOST:/www/mmp-prod/downloads/.$DEST.tmp"
ssh "$HOST" "mv '/www/mmp-prod/downloads/.$DEST.tmp' '/www/mmp-prod/downloads/$DEST'"

# 2) 服务器校验
ssh "$HOST" "sha256sum '/www/mmp-prod/downloads/$DEST'; stat -c%s '/www/mmp-prod/downloads/$DEST'"

# 3) 公网校验（必须真下，不能只看 HEAD）
curl -L --fail --max-time 600 -o "/tmp/$DEST" "https://www.mmai.vip/downloads/$DEST"
shasum -a 256 "/tmp/$DEST"
stat -f%z "/tmp/$DEST"
```

本地、服务器、公网三处 sha256 和字节数必须完全一致；不一致就重传，不要改 manifest 去“适配”。如果服务器对、公网不对，先怀疑 CDN/EdgeOne 缓存，purge 后重试。

### 6.4 `mammoth-latest.json` 最后传

1. 三个（或本轮实际构建的）安装包全部上传并三重校验。
2. 备份旧 json：`mammoth-latest.prev-<ts>.json`。
3. 按实际文件生成新 json，只写已上传的平台；Windows 没包就不要写 `windows-amd64`，页面显示“暂未提供”。
4. 同样先传 `.tmp` 再 `mv`，最后再 `curl` 拉一次，解析 `file` + `sha256` 是否与服务器文件一致。

```bash
# 示例：只保留本轮实际有的平台
cat > /tmp/mammoth-latest.json <<'JSON'
{
  "product": "mammoth-agent",
  "schema_version": 2,
  "updated_at": "2026-11-05T11:38:22Z",
  "platforms": {
    "darwin-arm64": {
      "shell": { "version": "0.2.2-alpha.2" },
      "file": "mammoth-agent-mac-arm64.dmg",
      "sha256": "<本地/服务器/公网一致的 sha256>",
      "signed": false,
      "automatic_updates": false
    }
  }
}
JSON
```

回滚只改指针：

```bash
ssh "$HOST" 'cd /www/mmp-prod/downloads && cp mammoth-latest.prev-<ts>.json mammoth-latest.json'
```

发之前必须检查 dmg 的 bundle id，**`com.tencent.octop` 是废弃包，禁止上线**。

无客户端时：`/agent` 返回 410，`downloads/` 可为空，preflight/smoke 跳过下载项，不阻塞中台发版。

## 7. 故障速查

| 现象 | 根因 | 处理 |
|---|---|---|
| Electron 下载卡住 / 0 字节 | GitHub 直连失败 | `ELECTRON_MIRROR=npmmirror` |
| `failed to resolve source metadata ... docker.io` | Docker Hub 不通 | 配镜像源；服务器用 `hub.rat.dev` |
| `Certificate verification failed`（apt） | 腾讯云源证书链问题 | 换官方 Debian 源或阿里云 |
| `ERR_PNPM_OUTDATED_LOCKFILE` | lockfile 与 package.json 不一致 | `pnpm install` 更新后重试 |
| `status: 128` 取 commit 失败 | 镜像内无 `.git` | 传 `MMP_CLIENT_COMMIT_HASH` |
| `UNRESOLVED_ENTRY lib/types/index.js` | `*/lib` 被 rsync / `.dockerignore` 排除 | 去掉排除，重新同步 |
| `ERR_MODULE_NOT_FOUND .../scripts/release/process.ts` | rsync `--exclude release` 误排嵌套的 `scripts/release/` | 改 `--exclude '/release' --exclude '/releases'`，重同步并 `test -s` |
| web 容器健康检查 404/421 | `curl 127.0.0.1:33080` 没带公网 Host | 加 `-H 'Host: www.mmai.vip'`；最终以公网 smoke 为准 |
| `Cannot find module 'express'` | API 镜像依赖不全 | 重建 API 镜像；`require.resolve('express')` 验证 |
| 首页白屏 / `failed to map segment` | 容器 `/tmp` `noexec`，原生模块无法执行 | tmpfs 加 `exec`，重建 web 镜像 |
| `/admin` 报“返回的不是 JSON” | nginx 缺 `/admin/api/` | 补 location 后 reload |
| 首次登录强制选工作区 / 默认目录不对 | 容器无 `xdg-user-dir`、HOME/默认工作目录未设 | 加 shim，默认 `~/Documents/...`；web-only 也验 `defaultWorkspaceId` |
| 跨架构 desktop TS 报缺少 `pack-registry-package` 类型 | 只有 `.mjs`，缺 `.d.mts` 声明 | 补 `pack-registry-package.d.mts`，重跑 `apps/desktop` build |
| 本机打 win-x64 报 `requires a Windows x64 build host` | Windows 包不能从 macOS 交叉构建 | 用 `.github/workflows/windows-package.yml` / Windows x64 机器；本轮不打就页面隐藏 |
| 客户端报 `Cannot find module '@mammoth-ai/node-addon-system-<platform>-<arch>'` | 未打目标平台原生包，或跨架构拿了 registry 旧包 | 优先本地 cross-compiled addon；缺包守卫直接报错；重打并查 `app.asar.unpacked` |
| `/downloads/mammoth-latest.json` 404 | 本轮无客户端包 | 正常；页面提示即可 |
| 下载页 Windows 入口 404 | 没构建/上传 win-x64，但页面或 manifest 写了 `windows-amd64` | 页面按 manifest 显示；无包写“暂未提供” |
| 上传后 manifest sha 不对 / 仍下旧包 | 从 `release/desktop/` 旧目录取了文件，或先传 json | 只从 `.desktop-build/targets/` 取；本地/服务器/公网三处 sha 对齐；json 最后传 |
| 客户端安装包下到半个文件 | 直接覆盖正式文件名 | 先传 `.tmp`，服务器 `mv` 原子替换 |
| `release/*/state.json` 停在 `deploying` | 手工 middle-web 静态部署没写收尾 | 补 `status/finished_at/note`；任何部署都建 state |
| state 显示 done 但 `note=exit=1` | 上次失败 note 残留 | `state_update done` 清空旧 note；以 smoke 结果为准 |
| 重传安装包后 state 没变 | 重传没有新建记录 | 加 reupload step 或新 release id，更新 `finished_at` |
| `docker compose up` 后 api 反复重启 | 镜像/依赖/env 错误 | `docker logs` 看第一个异常，不要反复 `up` |
| GitHub 返回 302 但下载 0 字节 | 资源域被墙/代理空响应 | 换国内镜像；校验 `content-length` |
| `docker pull` 卡十几分钟 | 镜像站挂起且命令无超时 | `timeout 180`，按源表换源 |
| `unexpected status ... 429` | 镜像站限流 | 换 `hub.rat.dev` / `dockerhub.icu` |
| 容器内 `curl: not found` | node 基础镜像不含 curl | 用 `node -e "fetch(...)"` 测网络 |
| `scp` 大文件中途断开 | 无续传 | `rsync -avP --partial` |
| `tar: LIBARCHIVE.xattr...` | macOS 扩展属性 | `COPYFILE_DISABLE=1 tar ...` |
| 本机构建突然停住 | 笔记本休眠/断电 | 服务器构建，或 `caffeinate -dimsu` |
| 两个会话互相覆盖 | 共用 `/tmp`、`.env`、镜像 tag | 独立构建目录 + 锁 + 唯一 tag |
| `docker compose up` 没换镜像 | tag 没变或容器未重建 | 换 tag 或 `up -d --force-recreate` |
| 宝塔面板保存后配置被覆盖 | 面板重写 vhost | 改 `extension/` 文件，保存后 `nginx -t` + 复查 |
| release 目录日期与镜像日期不一致 | `date -u` 与本地时区不同 | 统一本地时区或显式 `TZ=Asia/Shanghai` |
| `release.sh` 报“发版锁已存在” | 另一会话在发版，或上次异常退出 | 先看锁内容；确认无人发版再加 `--force-lock` |
| `release.sh` 中途失败 | 某一步报错，state 已记录 | 看日志，修好后 `--release-id <ID> --from <step>` |
| `doctor.sh` 有 FAIL | 工具/SSH/磁盘/镜像源不满足 | 先处理 FAIL；WARN 可继续 |
| `rollback.sh` 找不到 `.env` 备份 | 备份被清理或名字不对 | `--list` 查看，或按第 10 节手工回滚 |

## 8. 状态文件

发版目录下 `state.json`：

```json
{
  "release_id": "2.0.0-20261105-1200",
  "version": "2.0.0",
  "commits": { "ground": "<sha>", "mammoth-agent": "<sha>" },
  "started_at": "2026-11-05T12:00:00+08:00",
  "finished_at": null,
  "steps": [
    { "name": "preflight", "status": "done", "started_at": "...", "ended_at": "...", "note": "" },
    { "name": "frontend", "status": "done" },
    { "name": "api-image", "status": "done" },
    { "name": "web-image", "status": "running" },
    { "name": "deploy", "status": "pending" },
    { "name": "nginx", "status": "pending" },
    { "name": "smoke", "status": "pending" }
  ],
  "images": { "api": "mmp-api:<id>", "web": "mmp-web:<id>" },
  "rollback": { "nginx_backup": "<ts>", "previous_env": ".env.bak-<ts>" }
}
```

新会话接手：先读 `release/*/state.json` + 服务器锁，再决定继续还是重来。禁止在不知道别人进度的前提下重新构建。

> 2026-11-05 起：`state_update done` 必须清空旧 `note`；middle-web-only/静态部署也要建 state 并收尾；安装包重传必须新增记录，不能只改 `finished_at`。

## 9. 汇报格式

```markdown
上线完成：https://www.mmai.vip

| 项 | 结果 |
|---|---|
| 版本 / RELEASE_ID | 2.0.0 / 2.0.0-20261105-1200 |
| api / web / pg | Up，RestartCount=0 |
| /、/login、/console/、/admin/ | 200（/ 为 303 → /login） |
| /api/health、/api/version | 200 |
| 超管登录 | 200 |
| 客户端 | 本轮无包（/agent 410） |
| 旧栈 | 未动 |
| 回滚 | nginx 备份 <ts>；.env.bak-<ts>；上一版镜像 <tag> |
| 遗留 | 历史镜像 xxG；是否清理待确认 |
```

## 10. 回滚

优先用脚本（会读 state 里的备份名并跑 smoke）：

```bash
./ground/infra/production/rollback.sh --list
./ground/infra/production/rollback.sh --release-id <ID> --yes
# 静态包也回滚：加 --restore-web
# 旧备份的 nginx 时间戳可能和 .env 不同：加 --nginx-ts <ts>
```

手工兜底：

```bash
# 1) nginx
ssh "$HOST" 'cp -a /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf.bak-<ts> \
  /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf && nginx -t && nginx -s reload'

# 2) 镜像
ssh "$HOST" 'cd /www/mmp-prod && cp .env.bak-<ts> .env && docker compose up -d'

# 3) 静态包
ssh "$HOST" 'cd /www/mmp-prod && rm -rf middle-web && cp -a middle-web.bak-<ts> middle-web'
```

数据库迁移是向前的，不回滚 schema；只有确认不兼容时才恢复备份，且必须先让用户确认。

## 11. 禁止

- 禁止并行发版（两个 `release.sh`、两个 nginx reload、两个 `compose up`）；客户端打包不算发版，但同一时间只跑一个 desktop target，上传串行。
- 禁止不拿锁就构建/上传中台产物；客户端写 `downloads/` 也必须串行，禁止两个会话同时覆盖。
- 禁止从 `release/desktop/` 旧目录上传安装包；只认 `.desktop-build/targets/<target>/unsigned-artifacts/` 当次产物。
- 禁止先传 `mammoth-latest.json` 再传安装包；禁止把未构建的平台写进 manifest。
- 禁止在 Apple Silicon 上构建 web 镜像。
- 禁止把源码树、`.git`、`node_modules` 留在服务器。
- 禁止把 `com.tencent.octop` 包当成新客户端发布。
- 禁止在 smoke 未通过时宣布完成。
- 禁止把明文密码写进文档、日志、聊天回复。