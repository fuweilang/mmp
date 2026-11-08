# t177/t178 desktop/agent 共享 client compiler 阻断修复

仅本机WIP，本次只改 mammoth-agent/packages/test-support/client-runtime/src/workspaces.ts:16：`[Key in keyof IWorkspaces]`映射增加`-?`，剥离可选修饰符。

根因：之前留下的 IWorkspaces.retryList? 使原同态映射保留 optional never 项；按 keyof 索引后 WorkspaceAction 多出 undefined，继而 Key 不能索引 IWorkspaces，Parameters/ReturnType 同时报4错。不是依赖缺失。现有 required callable keys、参数与返回类型约束保留；没有新增 any、删除门禁、skipLibCheck 或移除可选接口。没有续写暂停的retry/归档/删除业务。

先通过 build 脚本自身 libraryBuildSteps 生成同一个 `tsc -b <tsconfig.client.json references>`，修前真实复现4错 exit2，修后 exit0。

完整门禁（顺序执行，避免输出目录并发竞争）：
- DESKTOP-ARTIFACTS：run-gates: 8 passed, 0 failed, 0 skipped in 17.76s. exit0。
- AGENT-WEB-ARTIFACTS：run-gates: 7 passed, 0 failed, 0 skipped in 15.33s. exit0。

入口核实：mmp/package.json 的 dev:desktop → mammoth-agent dev:desktop → apps/desktop/scripts/dev.ts，先运行默认 build:artifacts（含Desktop bundle，8 gates）；dev:agent → mammoth-agent dev:web → scripts/dev-web.ts，实际以 MMP_BUILD_TARGET=web 跑 build:artifacts（无Desktop bundle，7 gates）。本轮分别复跑这两个完整前置图，未启动两者之后的常驻程序或桌面额外启动阶段。

命令：
- `node --import tsx/esm --input-type=module -e <从libraryBuildSteps调用client-src命令>`（完整invocation见CLIENT日志）
- `node node_modules/pnpm/bin/pnpm.mjs run build:artifacts`
- `MMP_BUILD_TARGET=web node node_modules/pnpm/bin/pnpm.mjs run build:artifacts`

pnpm首轮按其正常run行为自动核对lockfile，输出Already up to date并执行既有postinstall；未手动安装/删除node_modules或升级依赖，第二轮直接进入构建。不能把末尾node_modules warning作为根因。

完整artifacts构建按用户要求同步了当前WIP运行资源，非只tsc。t174原生standard/云路由与t175真实CommandUiContract相关9源码hash相同；暂停t170/t171的7源码/test hash仍相同。完整构建自然也会重建这些既有未改WIP的产物，不代表本轮续修或验收它们。没有DB操作/迁移/模型供应商更改、没有kill/restart或commit/push。

用户现在可重跑 `pnpm run dev:desktop` 和 `pnpm run dev:agent`，此共同编译阻断已消除。真实启动、登录、云端对话及视觉未验，不宣称全应用验收。具体exit codes/门禁清单/日志/类型修改前后hash见build-artifacts-t177-evidence/RESULT.json与TYPE-FIX.json。
