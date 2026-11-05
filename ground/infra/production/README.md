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

## 端口与目录

| 项 | 值 |
|---|---|
| api | `127.0.0.1:33100 → 3100` |
| web | host 网络 `33080` |
| pg | 容器内 `5432` |
| 静态包 | `/www/mmp-prod/middle-web/` |
| 客户端包 | `/www/mmp-prod/downloads/` |
| 数据 | `/www/mmp-prod/data/{agent,uploads,api-state}` |
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