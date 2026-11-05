# tiered-verification

把验证分层：改哪层跑哪层，全量测试交给 CI。目标是把「每轮改完 10 分钟验证」压到十秒级。

## 问题

- `Octop` 全量测试 **5107 个**（`pytest -m "not live"`），跑一轮十分钟起；每改一个文件就跑全量，是当前最大的时间黑洞。
- `Octop/Makefile` 其实已经有 `test-fast`、`test-affected`（pytest-testmon）、`typecheck`、`typecheck-frontend`、`lint-frontend`，但**日常没人用**，默认动作还是全量。
- 缺组合目标：没有 `verify-web` / `verify-api` / `verify-desktop`，改一层不知道跑哪几条命令，于是干脆全量。
- `.github/workflows/ci.yml` 只监听 `pull_request`。我们的实际流程是直接 push `1.0` / `main`，**CI 从来没被触发过**，等于白配。
- `ground` 仓库只有一个 `octop-desktop.yml`，前端改动没有任何自动检查；`ground/apps/frontend` 连 `typecheck` 脚本都没有。

## 目标

- 三个聚合目标，覆盖三层改动：

  | 目标 | 内容 | 预期耗时 |
  |---|---|---|
  | `make verify-web` | `typecheck-frontend` + 前端构建 | 十秒级 |
  | `make verify-api` | 受影响测试（testmon）+ 该模块 ruff/mypy | 秒级 |
  | `make verify-desktop` | `go vet` + `go test ./...`（仅本机平台） | 秒级 |

- **全量 `make test` 只在「提交前」或 CI 跑**，不进日常循环。
- CI 加 `push` 触发（`1.0`、`main`），失败要能在手机上看到。
- `ground` 前端补 `typecheck` + 构建检查，接入 CI。

## 范围

- `Octop/Makefile`、`.github/workflows/ci.yml`。
- `ground/package.json`、`ground/apps/frontend/package.json`、`ground/.github/workflows/`。
- 开发说明（`AGENTS.md` / skill）里的验证口径。

## 非目标

- 不改测试框架、不重写测试用例、不追求覆盖率。
- 不做分仓。
- 不引入新的商业 CI 服务；只用 GitHub Actions。
- 不动桌面端双平台打包流程（发包时才有必要）。