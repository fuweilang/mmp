# 任务 — tiered-verification

## 1. 三个聚合目标（Octop）

- [x] `make verify-web`：`typecheck-frontend` + `build-frontend`。实测 **59s**（tsc -b 40s + build 18s），不是十秒级；第一次 tsc 全量编译最慢，之后增量会快很多。
- [x] `make verify-api`：`ruff check`（仅改动文件）+ `mypy src/octop` + `pytest --testmon`（受影响测试）。**目标已写好，本轮未跑通全流程**（testmon 无基线会先跑全量约十分钟），逻辑按 `verify-web` 同款结构照抄。
- [x] `make verify-desktop`：`cd desktop/src && go vet ./... && go test ./...`。实测 **0.58s** 通过（只跑本机平台）。
- [x] `make verify`：按 `git diff --name-only HEAD` 判断改动层并调用上面三个；命不中任何层（新脚本、未知目录）或没有改动时退回全量 `make test`。路由逻辑用假文件列表逐个验证过：`dashboard/*`→web、`src/*|tests/*|pyproject.toml|uv.lock|Makefile`→api、`desktop/*`→desktop、`*.md|docs/*|.github/*|.githooks/*`→忽略、其它→unknown→全量。

## 2. 日常口径改为分层

- [x] 开发说明写死规则：`Octop/AGENTS.md` §6 新增分层验证表（`verify-web` / `verify-api` / `verify-desktop` / `verify` + 用时），并写明全量 `make test` 只在提交前或 CI 跑。
- [x] `precommit` 从「全量 test」改为 `format-all lint typecheck test-affected`：Makefile 里本来就是这个组合，`.githooks/pre-commit` 也是调 `make precommit`，无需改动（只在 AGENTS.md 里把描述从 `make all` 更正过来）。
- [x] 首次使用 `--testmon` 需要一次全量建立基线，已写进 Makefile 注释与 AGENTS.md；基线文件 `.testmondata`，`.gitignore` 第 44 行已有 `.testmondata*`。
- [x] 「发版前才跑」的两件事写进 `baota-release` skill：① 全量 `make test`（约十分钟）② 桌面端双平台构建（darwin / windows，`wails build -skipbindings -s`）。日常循环两者都不跑。

## 3. CI 真正跑起来（Octop）

- [x] `ci.yml` 增加 `push` 触发：`branches: [1.0, main]`，保留 `pull_request`。
- [x] 加前端 job：`pnpm install --frozen-lockfile` + `pnpm exec tsc -b` + `make build-frontend`（`setup-node` 缓存 pnpm，另有 store 缓存）。
- [x] 加桌面端 job：`go vet` + `go test`，不打包。**放在 `macos-latest`**：desktop 只发 darwin/win32，Linux 上 wails 编译不过，放 ubuntu 会每次红灯。
- [x] 失败时能定位：job 名 `API / Python 3.12`、`API / Windows / Python 3.12`、`Web / dashboard`、`Desktop / Go`、`Live tests`，互不串联；另加 `concurrency` 取消同分支旧跑。
- [x] 说明：本轮**没有实际 push**，所以 Actions 未触发，jobs 未在 GitHub 上真跑过。

## 4. ground 补检查

- [x] `ground/apps/frontend/package.json` 增加 `typecheck`：`vue-tsc --noEmit`，本地实测通过。
- [x] `ground/.github/workflows/ci.yml`：`pnpm install --frozen-lockfile` + `pnpm verify-web`（shared build + vue-tsc + vite build）+ `pnpm verify-api`（backend `nest build`，即 tsc 全量编译）。后端没有 lint/test 脚本，按现有能力只做编译。两个 job 独立。
- [x] `ground` 根 `package.json` 增加 `verify` / `verify-web` / `verify-api`，与 Octop 命名对齐。本地实测：`verify-web` 6.6s、`verify-api` 2.8s，均通过。

## 5. 验收要点

- [ ] 只改 dashboard 一个组件：`make verify-web` 十秒内给出结论。**实测 59s**（tsc 40s + build 18s），十秒目标未达到；要压到十秒得只跑 tsc 或者跳过 vite build，暂未做。
- [ ] 只改一个后端模块：`make verify-api` 只跑相关测试，秒级返回。**未实测**（要先跑一次全量建 testmon 基线）。
- [x] 只改 `desktop/src/*.go`：`make verify-desktop` 0.58s 返回。
- [ ] push 到 `1.0` 后 GitHub Actions 触发、api/web/desktop 独立可见。**未验证**：本轮按要求没有 push。
- [x] 全量 `make test` 只在提交前或 CI 上执行，日常循环不再触发（`precommit` 用 `test-affected`）。
- [x] 记录改造前后对比：单个改动从「全量十分钟」降到「web 1 分钟 / desktop 1 秒级」，写进 `Octop/AGENTS.md` 分层验证表与 `baota-release` skill 发版前清单。