# 猛犸生产发版脚本（ground/infra/production）

面向 `https://www.mmai.vip` 的新栈：**api + web + pg**，只部署到 `/www/mmp-prod`。
发版入口见 [`baota-release` Skill](../../../.opencode/skills/baota-release/SKILL.md)。

## 脚本

| 文件 | 用途 |
|---|---|
| `release.sh` | **一键发版**：预检 → 前端 → api → 服务器 web → 部署 → nginx → smoke |
| `doctor.sh` | 发版前只读体检（工具/SSH/磁盘/镜像源/锁）；`--network` 做真实拉取 |
| `rollback.sh` | 按 state / 备份回滚 `.env`、镜像 tag、静态包、nginx |
| `build-local.sh` | 本机构建前端 dist + api 镜像；**不登录服务器** |
| `preflight-local.sh` | 检查发布目录完整性和产品清单 |
| `smoke.sh` | 部署后只读冒烟 |
| `compose.yml` | 新栈 compose（项目名 `mmp-prod-v1`） |
| `production.env.example` | 生产 env 模板，实际 env 不进仓库 |
| `nginx-mmai.conf` | `www.mmai.vip` 站点 include |
| `proxy-common.conf` / `proxy-common-long.conf` | 反代公共参数（长连接用于 agent） |
| `Dockerfile.api` | 中台 API 镜像 |
| `init-db.sh` | 首启建库脚本 |
| `backup-library.sh` | 在停止写入窗口备份 PostgreSQL 与全部资料原件，并校验清单 |
| `restore-library-local.sh` | 只恢复到专用本地新库与新目录，拒绝覆盖 |

## 端口与目录

| 项 | 值 |
|---|---|
| api | `127.0.0.1:33100 → 3100` |
| web | host 网络 `33080` |
| pg | 容器内 `5432` |
| 静态包 | `/www/mmp-prod/middle-web/` |
| 客户端包 | `/www/mmp-prod/downloads/` |
| 数据 | `/www/mmp-prod/data/{agent,uploads,library,api-state}` |
| 密钥 | `/www/mmp-prod/secrets/` |

## 构建约束

- **api 镜像**：可在本机构建，发布前必须验证 `require.resolve('express')`。
- **web 镜像**：必须在服务器原生 amd64 构建，禁止 Apple Silicon 模拟 x86。
- 服务器基础镜像走 `hub.rat.dev`；apt 用官方源或阿里云；pnpm 用 npmmirror。
- web 构建必须传 `MMP_CLIENT_COMMIT_HASH`。
- `.dockerignore` 不能排除 `**/lib`；rsync 不能排除 `*/lib`。

## 一键发版（推荐）

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh               # 可选：只读体检
./ground/infra/production/release.sh --dry-run    # 看计划
./ground/infra/production/release.sh --yes        # 正式发版
```

中断后续跑：

```bash
./ground/infra/production/release.sh --release-id <ID> --from web --yes
```

回滚：

```bash
./ground/infra/production/rollback.sh --list
./ground/infra/production/rollback.sh --release-id <ID> --yes
```

## 手动用法（排障/兜底）

```bash
# 1) 本机产物
RELEASE_ID="$(node -p "require('../../config/version.json').version")-$(date +%Y%m%d-%H%M)" \
  ./build-local.sh /absolute/release/dir

# 2) 预检
./preflight-local.sh /absolute/release/dir

# 3) 上线后冒烟
./smoke.sh https://www.mmai.vip
```

`build-local.sh` 的 web 镜像步骤仅作兼容保留；日常发版按 Skill 在服务器构建。

## 资料库配套备份与本地恢复

这些命令不属于发版自动步骤。实际生产备份需安排维护窗口；本次开发只在隔离数据库演练。
先确认当前 compose 项目中 pg、api、web 的真实容器名称，以及资料目录的实际宿主机挂载路径。停止所有可以写库/原件的服务，包含独立维护任务；不要遗漏额外副本。

```sh
./backup-library.sh --postgres-container mmp-prod-v1-pg-1 \
  --writers mmp-prod-v1-api-1,mmp-prod-v1-web-1 \
  --library-dir /www/mmp-prod/data/library \
  --output /www/mmp-backups/library-UNIQUE-ID
node ../../scripts/verify-library-backup.mjs /www/mmp-backups/library-UNIQUE-ID
```

父目录须事先存在，输出目录必须不存在且不能位于原件目录内。脚本只支持本机 Docker Unix socket（Windows 为本机 docker_engine 管道），并检查继承的 `DOCKER_HOST`、`DOCKER_CONTEXT` 或当前 context；远端及 TCP 端点在任何修改前拒绝。在服务器上执行备份命令，不通过远端 Docker context 混用本机原件路径。脚本停止明确列出的、原先正在运行的写入容器，在整个 dump/复制/校验期间保持停止；正常成功或失败后只重启这些容器，原先停止的容器保持停止。进程被强制结束或主机断电后，操作人员需检查并恢复服务运行状态。

输出包含 `database.dump`（完整 Ground PostgreSQL 自定义格式备份）、`originals/`（包含历史版本、回收站及额外原件的完整目录）和 `manifest.json`。同一备份 ID 记录 dump、每个原件的大小与 SHA-256，以及节点/版本/分块校验信息。失败或未通过验证的目录不得当作可用备份。备份含账号和企业数据，应保留其私有权限并放到受控备份存储；脚本不负责异地复制或加密密钥管理。

本地恢复使用一个独立 PostgreSQL 容器，将其 5432 **仅绑定** `127.0.0.1:55440`，初始化库用 `postgres`，不要预建目标库。确保没有其他恢复进程占用该端口：

```sh
export LIBRARY_RESTORE_DATABASE_URL=postgresql://postgres@127.0.0.1:55440/mmp_library_restore_acceptance
./restore-library-local.sh --postgres-container YOUR_LOCAL_RESTORE_CONTAINER \
  --backup /absolute/verified-backup --library-dir /absolute/new-originals-directory
```

恢复前先验证清单及每个文件，再创建固定名称的新库。数据库已存在、目录已存在、非专用地址或容器端口不匹配均拒绝；不会 drop 原库，也不会覆盖原目录。中途失败留下专用恢复库供检查，不自动删除。恢复后再次比对所有节点、版本、分块和原件；这不包含 Harness 客户端会话、用户工作区文件或全系统恢复。

自动演练入口为 `ground/scripts/library-acceptance.sh`；准备安装了 pgvector 的专用源库 `127.0.0.1:55439/mmp_library_acceptance` 后执行。源库容器默认名为 `mmp-library-p0-55439`，其他名称通过 `LIBRARY_TEST_POSTGRES_CONTAINER` 指定；`55440` 必须空闲。离线 `--offline` 仅供这个隔离源库在 HTTP writer 已关闭时使用，必须配置 `LIBRARY_BACKUP_DATABASE_URL`，不可用于生产。
