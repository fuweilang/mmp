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

只有用户明确要求才做。当前已知阻塞：

- `@mammoth-ai/mmp-llm-ground` 标记 `private: true`，且 `files` 指向不存在的 `lib/index.js` → host bundle 失败。
- 未签名 arm64 可以出包，但需先修上面的打包声明。
- 发之前必须检查 dmg 的 bundle id，**`com.tencent.octop` 是废弃包，禁止上线**。

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
| `ERR_MODULE_NOT_FOUND scripts/release/process.ts` | 源码同步不完整 | 重新 rsync，先 `test -s` 校验 |
| `Cannot find module 'express'` | API 镜像依赖不全 | 重建 API 镜像；`require.resolve('express')` 验证 |
| 首页白屏 / `failed to map segment` | 容器 `/tmp` `noexec`，原生模块无法执行 | tmpfs 加 `exec`，重建 web 镜像 |
| `/admin` 报“返回的不是 JSON” | nginx 缺 `/admin/api/` | 补 location 后 reload |
| 首次登录强制选工作区 | 容器无 `xdg-user-dir` | 加 shim，默认 `~/Documents/...` |
| `/downloads/mammoth-latest.json` 404 | 本轮无客户端包 | 正常；页面提示即可 |
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

- 禁止并行发版、禁止不拿锁就构建/上传。
- 禁止在 Apple Silicon 上构建 web 镜像。
- 禁止把源码树、`.git`、`node_modules` 留在服务器。
- 禁止把 `com.tencent.octop` 包当成新客户端发布。
- 禁止在 smoke 未通过时宣布完成。
- 禁止把明文密码写进文档、日志、聊天回复。