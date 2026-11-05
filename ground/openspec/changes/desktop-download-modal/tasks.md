# 任务 — desktop-download-modal

排队任务：**等另一个终端的 8/9/10 节全部完成后**再开工，避免同时改 `dashboard/`。

## 1. 去掉两段式交互

- [x] 删掉 `ClientDownloadLink.tsx` 里主链接右侧的 `ChevronDown` 和 `downloadSplit` 结构，改成一个按钮。
- [x] 点击按钮开弹窗（antd `Modal`，footer 只留关闭）。
- [x] 侧栏收起（`compact`）时保留纯图标按钮，点击同样开弹窗，不再直连下载。
- [x] 弹窗内 3 项：Apple 芯片 Mac / Intel Mac / Windows，点击整行即下载（沿用 `clientDownloadUrl`）。

## 2. 按钮降级为次级样式

- [x] Agent 端：下载入口无底色、无描边，次级色文字/图标（`--fn-text-tertiary` 一档），hover 才升主色。
- [x] 中台端：navbar 的下载按钮从主色降为次级（ghost），把主色留给页面业务主操作。
- [x] 两端折叠/窄屏态用 icon-only + tooltip，tooltip 文案「下载客户端」。（中台 navbar 窄屏只是收窄 padding，本来就没有文字溢出）

## 3. 与中台对齐

- [x] 文案与中台一致：`选择与你的电脑匹配的安装包。macOS 不确定芯片型号？点屏幕左上角  → 「关于本机」即可看到。`（拆成主提示 + Mac 辅助行，拼接后与这句完全一致）
- [x] 只有 Windows 标「当前系统」；Mac 不做芯片猜测。
- [x] 平台命名与顺序两端一致：Apple 芯片 Mac / Intel 芯片 Mac / Windows。

## 4. 弹窗信息与反馈

- [x] 提示区下加**一行**统一信息：`最新版本 vX.Y.Z · 日期 · 约 XXX MB`，三行选项不重复。（取 `/downloads/mammoth-latest.json` 的 `shell.version` + `updated_at`，大小用 HEAD `content-length`；取不到整行隐藏）
- [x] 去掉 Windows 行的重复灰底，只保留「当前系统」badge（一个标记只出现一次）。
- [x] 每行右侧下载动作做成 ghost 按钮，或去掉文字只留箭头，不要两者都留。（保留 icon + 「下载」文字，无 badge）
- [x] 点击后原地反馈：该行动作变为「已开始下载」，并保留重试入口；不要点了没反应。
- [x] Mac 芯片指引从顶部大段提示降为 12px 辅助行，贴近 Mac 两行。

## 5. 验收要点

- [x] 浏览器打开 `/agent/chat`：左下角只有一个「下载客户端」入口，**没有小箭头**；点击出弹窗。（按代码走查，未开浏览器实点）
- [x] 弹窗列出 3 个包，点击任一项开始下载对应文件（文件名/URL 正确）。
- [x] Windows 环境显示「当前系统」；Mac 不显示芯片判断结果。
- [x] 侧栏收起时图标按钮点击同样出弹窗。
- [x] 客户端（Wails 壳）内不出现该按钮。
- [x] 中台顶栏下载按钮不再使用主色，页面主操作的主色不被抢。
- [x] `pnpm run build` 通过；`pnpm exec tsc -b` 无新增错误。（ground `vite build`、Octop dashboard `pnpm run build` + `tsc -b` 均通过）