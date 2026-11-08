# t180 一条命令启动 Ground（本机 WIP）

以后在 `/Users/fuweilang/Documents/code/mmp` 运行 **`pnpm run dev`** 即可；在 ground 目录同样有效。

## 已实现的小范围契约
- 沿现有根 package → ground package → scripts/dev-stack.mjs 链路，未新增启动框架/依赖。两 package 仅加 `dev:prepare` 检查别名，已有 dev 命令仍是唯一日常入口。
- 先检测已配置数据库连接端口；已就绪时直接复用，不强制启动另一 Docker runtime。
- 数据库未就绪时先 docker info；已有 Docker 可用则不执行 colima start/open。不可用时按已有 context 启动已安装 Colima（包括既有命名 profile）或 macOS Docker Desktop；不安装软件、不手动切 Docker context，未知远端 context/显式 DOCKER_HOST 不擅自换本机 runtime。
- Colima/Desktop 启动和 Docker 就绪等待有界；CLI 缺失=127、超时=124，其他 CLI 错误保留退出码并停止后续启动。
- 复用 db:up 使用的 infra/docker-compose.yml/postgres。仅 `up -d --no-recreate --wait --wait-timeout 90 postgres`，沿现有 healthcheck 等待 PostgreSQL，再确认主机 :5433；绝不 down/rm/清卷/强制重建容器。
- 准备成功才进入原 api→web→gateway 启动，不递归调用 dev。`pnpm run dev:prepare` 或直接 node --prepare-only 只检查/准备 Docker/数据库，不进入原端口回收或启动常驻服务。
- 原 dev 的端口回收实现未改，本轮未执行该阶段；也未更改 DB schema/业务/模型/权限及此前暂停工作。

## 实际验证与界限
- `node --check scripts/dev-stack.mjs` 和 test 文件：exit0。
- `node --test scripts/dev-stack.test.mjs`：最终15通过/0失败，Node内建测试 + 独立Node进程 + 真实spawn的CLI替身，无第三方测试依赖。覆盖已有Docker/已有DB、Colima/命名profile/Desktop选择、缺安装、启动失败/超时、compose失败/DB端口超时、argv与exit传递、根/ground无递归链路。正常分支的fixture启动预算改为2秒以避免Mac冷启动抖动；专门timeout项仍400ms，生产120秒预算未放宽。
- 真实只读见当前context=colima、Docker可用、原mammoth-postgres healthy；实际 `node scripts/dev-stack.mjs --prepare-only` exit0，确认127.0.0.1:5433 ready，走“已有数据库”分支，因此没有真启动/停止Docker或数据库。容器ID前后仍9078620a…38e14c。
- 原compose支持 --wait/--wait-timeout/--no-recreate 参数已只读核实。冷启动/失败路径是CLI替身验证，未冒称实际关闭Docker再启动；没有运行完整dev，避免重复常驻服务或触发旧端口回收。

## 改动路径
1. /Users/fuweilang/Documents/code/mmp/package.json
2. /Users/fuweilang/Documents/code/mmp/ground/package.json
3. /Users/fuweilang/Documents/code/mmp/ground/scripts/dev-stack.mjs
4. /Users/fuweilang/Documents/code/mmp/ground/scripts/dev-stack.test.mjs
证据在本目录 evidence/：WIP原文件快照、CHANGE.diff、15项测试日志、真实prepare日志与RESULT.json。没有pnpm install/commit/push、没有迁移或清理用户数据。
