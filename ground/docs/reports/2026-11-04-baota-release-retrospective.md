# 2026-11-04 宝塔发版复盘（www.mmai.vip 新栈）

> 记录一次从 11-04 00:10 到 11-05 10:57 的真实发版。结论已沉淀为
> [`baota-release` Skill](../../../.opencode/skills/baota-release/SKILL.md)，
> 本文保留完整时间线和证据，供后续换模型/改脚本时对照。

## 1. 结果

| 项 | 结果 |
|---|---|
| 站点 | `https://www.mmai.vip` → 新栈 `mmp-prod-v1` |
| 容器 | api `mmp-api:20261105b`、web `mmp-web:20261105-r2`、pg `pgvector:pg16` |
| 验收 | `/` 303→`/login`；`/agent` 410；`/login` `/console/` `/admin/` 200；`/api/health` 200 |
| 超管 | `13800000001`（凭据在 `release-private/admin-credentials.txt`） |
| 客户端 | 本轮无包（Octop 包已删除） |
| 旧栈 | `mammoth-api:3100`、`mammoth-octop:8088` 未动 |
| 总耗时 | 10h47m 墙上时钟；有效工作约 2.5h |

## 2. 时间线

| 时间 | 耗时 | 事件 |
|---|---|---|
| 00:10–00:19 | 9m | 接手 ChatGPT 半成品；读不到聊天记录，只能按文件和服务端现状反推 |
| 00:19–00:37 | 18m | 客户端 dmg 打包；Electron 下载失败；`docker.1ms.run` 拉镜像挂起 |
| 00:37–00:52 | 15m | 换镜像源、改 daemon、重启 Colima、拉基础镜像 |
| 00:52–01:12 | 20m | `build-local.sh` 连续失败：Docker Hub 超时 → apt TLS → lockfile → git hash |
| **01:12–05:52** | **4h40m** | 本机构建 web 镜像，停在 host bundle |
| 05:52–06:15 | 23m | 诊断 + Colima 调 8C/12G + 重启构建 |
| **06:12–06:57** | **45m** | **另一会话接手，完成首次上线并切 nginx** |
| **06:15–10:06** | **3h51m** | 原会话继续等待；电脑断电/休眠，站点其实已上线 |
| 10:06–10:29 | 23m | 改用服务器构建，同步源码、拉基础镜像、杀掉本地构建 |
| 10:29–10:44 | 15m | 服务器构建失败 2 次（`process.ts` 缺失、`*/lib` 被排除） |
| 10:44–10:54 | 10m | 第三次构建成功 |
| 10:54–10:57 | 3m | 部署、切流、smoke；API 缺 `express`，切 `mmp-api:20261105b` |
| 10:10–10:28 | 18m | 验收修复：Worker `/tmp noexec`、`/admin/api` 路由、工作区弹窗、下载页 |

## 3. 为什么这么慢

1. **本机模拟 x86 构建 web 镜像**：Apple Silicon 上 `--platform linux/amd64`，Rosetta 下编译数小时无结果。实际有效构建应放在服务器，10–20 分钟。
2. **双会话并行发版**：用户关 tab 后重开会话，旧会话仍在跑。B 会话 06:57 已上线，A 会话不知情，继续构建到 10:29 并再次切流。没有锁、没有 state 是根因。
3. **国内网络与镜像源**：Electron、Docker Hub、apt、pnpm 全部需要换源；部分镜像站会挂起，且原命令没有超时。
4. **构建脚本没有“服务器构建”路径**：`build-local.sh` 只能本机 Docker，方案切换太晚。
5. **缺少进度与交接**：本地构建无阶段输出；断线后只能靠翻会话库恢复。

## 4. 踩坑清单

### 4.1 交接与协作

| 坑 | 根因 | 处理 |
|---|---|---|
| ChatGPT 进度无法继承 | 读不到其会话，只留半套脚本 | 按文件和服务器现状反推 |
| 文档与实际不符 | AGENTS 指向 `mmPlatform`，旧 baota 脚本 `exit 1` | 以 `ground/infra/production/` 为准 |
| 两个会话同时发生产 | 关 tab 后重开，旧会话仍活着 | 单主操 + `/www/mmp-prod/.release.lock` + `state.json` |
| 完成无通知 | 会话之间不共享状态 | 用户追问才发现已上线 |
| 命名混乱 | 目录 `20261104`、`RELEASE_ID=20261105`、镜像 `-r1/-r2/b` | 统一 `VERSION-YYYYMMDD-HHMM` |
| “新宝塔”理解偏差 | 同机新面板（18888），旧项目仍在跑 | 先只读勘察，只动 `www.mmai.vip` |

### 4.2 网络与镜像

| 坑 | 根因 | 处理 |
|---|---|---|
| Electron 下载 0 字节 | GitHub 直连失败 | `ELECTRON_MIRROR=npmmirror` |
| Docker Hub 拉不到基础镜像 | 网络超时 | 本机 daemon 镜像；服务器 `hub.rat.dev` |
| 镜像站挂起 15 分钟 | `docker.1ms.run` 无响应 | 加超时，多源 fallback |
| apt TLS 证书失败 | 腾讯云 Debian 源证书链 | 官方源或阿里云 |
| pnpm 慢 | 官方源 | npmmirror |

### 4.3 本地构建

| 坑 | 根因 | 处理 |
|---|---|---|
| web 镜像构建 5h 无结果 | Apple Silicon 模拟 x86 | 改服务器原生构建 |
| Colima 资源不足 | 默认 CPU/内存小 | `--cpu 8 --memory 12` |
| 重启 Colima 停掉本地 pg | Docker 运行时重启 | `docker start mammoth-postgres` |
| 构建无进度 | 只有最终日志 | 轮询阶段，不盲等 |
| lockfile 过期 | 依赖被移除但 lock 未更新 | 更新 lockfile |
| 容器内取不到 git commit | 镜像无 `.git` | 传 `MMP_CLIENT_COMMIT_HASH` |

### 4.4 仓库与脚本

| 坑 | 根因 | 处理 |
|---|---|---|
| API 镜像缺 `express` | Dockerfile 的 pnpm 过滤/部署不完整 | 重建并 `require.resolve` 验证 |
| `UNRESOLVED_ENTRY lib/types/index.js` | rsync `*/lib`、`.dockerignore` `**/lib` | 去掉排除 |
| `scripts/release/process.ts` 缺失 | 源码同步不完整 | 重新同步并 `test -s` |
| `serve-ground-web.js` vs `.mjs` | 文件名不一致 | 修 compose 与 Dockerfile |
| 客户端 dmg 出不来 | `mmp-llm-ground` `private:true`，`files` 指向不存在的 `lib/index.js` | 本轮放弃，待修 |
| 差点发错 Octop 包 | 2.0.0 dmg 的 bundle id 是 `com.tencent.octop` | 检查 bundle id 后删除 |

### 4.5 部署与运行时

| 坑 | 根因 | 处理 |
|---|---|---|
| 首页白屏 / 500 | Worker 非 root + read-only + `/tmp noexec` | tmpfs 加 `exec` |
| `/admin` 报“接口未就绪” | nginx 缺 `/admin/api/` | 补 location 后 reload |
| 首次登录强制选工作区 | 容器无 `xdg-user-dir` | 加 shim |
| 超管权限不全 | 缺 `user_role` | 补 `super_admin` |
| preflight 因无 dmg 失败 | 客户端被当硬性前置 | 改为可选 |
| 下载页三平台无包 | 确实没有产物 | 验收时才发现，应提前说明 |
| 旧栈未停、镜像 20G 未清 | 无收尾 | 保留旧栈，清理策略待定 |
| 无回滚演练 | 只备份 nginx | 写进清单，下次演练 |

### 4.6 安全与流程

| 坑 | 根因 | 建议 |
|---|---|---|
| root/宝塔/DB 密码走聊天 | 无密钥管理 | SSH key + `release-private/` |
| 无阶段计时 | 脚本不输出耗时 | `state.json` 记录每步时间 |
| 无发版锁 | 多会话可同时操作 | 服务器锁文件 |
| 验收清单缺失 | 登录/下载/工作区上线后才发现 | 发版前先跑清单 |

## 5. 网络与下载专项（实测）

这次至少 3 小时耗在“拉文件”，不是代码问题。

| 资源 | 实测现象 | 耗时 | 结论 |
|---|---|---|---|
| Electron 44.7.0（GitHub Release） | 302 到 `release-assets.githubusercontent.com`，`content-length: 0` | ChatGPT 3 次打包全失败；本次重试 16 分钟 | GitHub 直连不可用 |
| Electron 44.7.0（npmmirror） | `content-length: 130394296` | 下载正常 | 首选 |
| Docker 基础镜像（Docker Hub） | `dial tcp ... i/o timeout` | 构建第一步即失败 | 必须配镜像 |
| `docker.1ms.run` | 先是镜像名拼接错误，随后修正仍挂起 | >900s 超时 | 不可用 |
| `dockerproxy.net` | node 镜像可拉；`docker:28-cli` blob 429 | 多轮重试 | 仅备用 |
| `dockerhub.icu` / `hub.rat.dev` | manifest 200/302，实际可拉 | 可用 | 备选/首选 |
| `docker.xuanyuan.me` / `docker.1panel.live` / `docker.nju.edu.cn` | 403 | 立即失败 | 不可用 |
| `mirror.ccs.tencentyun.com` | 本机返回 000 | - | 仅腾讯云内网 |
| 腾讯云 npm | 根路径 404，但作为 registry 可用 | - | 可用，勿用根路径做健康检查 |
| 腾讯云 Debian apt | `Certificate verification failed ... issuer unknown` | 构建中断 | 换官方/阿里云 |
| 阿里云 Debian apt | 200 | - | 可用 |
| 服务器首次拉 `node:24-bookworm` + `docker:28-cli` | 工具 900s 超时仍未完 | >15 分钟 | 首次慢，缓存后 7.3s |
| API 镜像传输（1.26GB，save+gzip+ssh+load） | 完成 | ~2 分钟 | 流式传输可接受 |
| web 镜像传输（3.66GB，save+gzip+scp+load） | 完成 | ~7 分钟 | 大包要预留时间 |

镜像站状态码不能代替实际 pull：

| 镜像站 | `/v2/` 或 manifest | 实际 pull |
|---|---|---|
| `hub.rat.dev` | 302 | ✅ |
| `dockerhub.icu` | 200 | ✅ |
| `dockerproxy.net` | 200 | ⚠️ 429 |
| `docker.1ms.run` | 401 | ❌ 挂起 |
| `docker.xuanyuan.me` / `docker.1panel.live` / `docker.nju.edu.cn` | 403 | ❌ |
| `docker.m.daocloud.io` | 401 | ❌ |
| `mirror.ccs.tencentyun.com` | 000（本机） | ❌ 本机 |

其他网络相关教训：

- `curl -I` 看到 302 就以为成功，实际资源域返回 0 字节。
- `docker pull` 没有默认超时，前台跑会被 900s 工具超时杀掉，留下半拉状态。
- Colima 的 mirror 要改 VM 内 `/etc/docker/daemon.json`，不是 macOS 的 `~/.docker/daemon.json`；重启 Docker 会停本地容器。
- node 镜像没有 `curl`，容器内测网络要用 `node -e fetch`。
- macOS `tar` 带 xattr，Linux 解包会刷 `LIBARCHIVE.xattr` 警告；用 `COPYFILE_DISABLE=1`。
- `scp` 大文件无进度、断线重来；用 `rsync -avP --partial`。
- `date -u` 生成的 RELEASE_ID 与本地日期差一天，造成目录/镜像命名不一致。

## 6. 对脚本/仓库的待办

已完成：

1. `release.sh`：一键入口（预检 → 前端 → api → 服务器 web → 部署 → nginx → smoke），带锁、state、超时、续跑。
2. `doctor.sh`：发版前只读体检（工具/SSH/磁盘/镜像源/基础镜像/锁）。
3. `rollback.sh`：按 state/备份回滚 `.env`、镜像 tag、静态包、nginx。
4. `smoke.sh` 已包含 `/admin/api/users`、`/console/api/version` 的 JSON 校验入口；更细的带 cookie 项仍留人工。

仍待办：

5. 客户端打包修 `mmp-llm-ground` 的 `private`/`files` 声明后再恢复发客户端。
6. 历史镜像清理脚本化，保留当前 + 上一版。
7. 首次发版前预拉服务器基础镜像（`node:24-bookworm`、`docker:28-cli`），把冷缓存 15 分钟降到接近 0。

## 7. 关联

- Skill：[`baota-release`](../../../.opencode/skills/baota-release/SKILL.md)
- 检查清单：[`BAOTA-RELEASE-CHECKLIST.md`](../release/BAOTA-RELEASE-CHECKLIST.md)
- 脚本说明：[`ground/infra/production/README.md`](../../infra/production/README.md)