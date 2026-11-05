# desktop-download-modal

浏览器访问 `/agent/chat` 时，「下载客户端」改为点开弹窗、在弹窗里选包下载；按钮降为次级样式，不再抢业务主色的位置。

## 问题

- 现在是「文字链接 + 右侧小箭头」两段式：点文字按猜出来的平台直接下载，点箭头才出下拉菜单。同一行两种行为，用户容易下错包。
- Mac 分 Apple 芯片 / Intel 两种包，浏览器 UA 拿不到芯片架构；下错就是 200M+ 装不上。
- 中台（`ground/apps/frontend/src/components/ClientDownloadLink.vue`）已经是弹窗三选一，Agent 端（`Octop/dashboard/src/layouts/ClientDownloadLink.tsx`）还是下拉菜单，两端不一致。
- 中台顶栏的下载按钮用了主色（`#2563eb`），页面真正的主操作反而没有主色可用，层级倒置。

## 目标

- 左下角只剩一个入口，**去掉右侧小箭头**，点击直接开弹窗。
- 弹窗列出 3 个包：Apple 芯片 Mac / Intel Mac / Windows，样式对齐中台弹窗（图标 + 标题 + 副标题 + 下载动作）。
- 只在能确定时标记「当前系统」：Windows 一种包可标；Mac **不猜芯片**。
- 下载入口降为**次级样式**：无底色、次级色文字/图标，hover 才升主色；折叠态为 icon-only + tooltip。
- **不新建下载中心页**：三个包 + 一句「关于本机」提示，弹窗足够；将来要放 Linux / 历史版本 / 校验和时再开独立页。

## 范围

- `Octop/dashboard/src/layouts/ClientDownloadLink.tsx`、`Sidebar.module.less`、`locales/{zh,en}.json`。
- `ground/apps/frontend/src/components/ClientDownloadLink.vue`（仅弹窗信息与按钮层级）。
- 复用 `utils/clientDownload.ts` 的平台清单、下载地址与检测函数。

## 非目标

- 不改安装包构建与 `mammoth-latest.json`。
- 不改客户端内的「版本更新」入口（头像下拉，属于原地更新，不是下载）。
- 客户端内不显示下载入口（`!isDesktopShell()` 判断保持不变）。
- 不做 `/download` 独立页面。