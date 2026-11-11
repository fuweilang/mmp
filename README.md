# 猛犸 MMP

统一管理 `ground`（中台）与 `mammoth-agent`（智能体）。两个项目保留各自的 package.json、pnpm workspace 和锁文件；根目录仅提供快捷命令，不合并依赖。

需要 Node.js >=24.9 和 pnpm。子项目分别声明 pnpm 10.32.1 与 11.28.5，安装时需要可访问对应包管理器和依赖下载源。

在 mmp 根目录执行：

| 命令 | 用途 |
| --- | --- |
| `npm install` | 通过 postinstall 依次安装两个项目的依赖 |
| `npm run install:all` | 再次安装两个项目依赖 |
| `npm run install:ground` / `npm run install:agent` | 只安装一个项目 |
| `npm run dev` / `npm run dev:ground` | 启动中台开发服务 |
| `npm run dev:agent` | 启动智能体网页开发服务 |
| `npm run dev:desktop` | 启动智能体桌面开发服务 |
| `npm run build` | 依次构建中台和智能体，失败即停止 |
| `npm run build:ground` / `npm run build:agent` | 只构建一个项目 |
| `npm run start:agent` / `npm run start:desktop` | 启动已构建的智能体网页或桌面服务 |

也可使用 `pnpm run <命令>`。根目录 `pnpm install` 同样通过 postinstall 安装两个子项目；不要设置 ignore-scripts，否则不会自动安装子项目。

首次运行中台需要配置环境变量、启动数据库，详见 ground/README.md；安装依赖不会自动建库或写入初始数据。同时开发时，在两个终端分别运行 `dev:ground` 和 `dev:agent`（或 `dev:desktop`）。根目录 `dev:agent` 和 `dev:desktop` 可在两个终端按任意顺序启动：首次准备完整的网页与桌面构建，重叠启动时会等待共享构建完成；网页监听运行时，桌面直接复用产物。重复执行 `dev:agent` 会提示已运行。停止网页开发服务请在原终端按 Ctrl+C；正常退出会释放启动记录，进程异常结束后的旧 PID 记录会自动恢复。

启动记录保存在忽略入库的 `.mmp-dev/`。3080 被其他服务占用时，网页命令会在构建前提示占用；先停止已确认的旧服务再重试。请通过根目录的两个命令启动以使用协调机制；直接运行子项目命令、`dev:desktop:watch` 或独立 `build` 不受该机制协调，不要在网页监听期间再运行完整构建。桌面 Host 或主进程源码更新后，先停止网页监听，再重新运行 `dev:desktop` 以更新完整产物。

发布应从固定 Git 提交的独立目录构建。release 与 release-private 是本机发布资料，不上传仓库。
