# 资料库双树与格式预览：实现及验收

日期：2026-11-09。已按用户确认的设计完成本地实现。未提交、推送、发布，未替换已安装桌面 App。

## 当前行为

- 左侧“我的资料”和“企业共享”各自使用真实层级树，可独立展开、收起和分页；共享子目录继续查询 shared，不混入 mine。
- 右侧取消重复目录表格和预览弹窗，点击左侧文件后直接预览。目录选择保留新建/上传位置；搜索、最近使用、回收站及文件管理操作在左侧。
- Markdown 使用文档排版；文本/代码保留结构；HTML 使用现有静态清洗和禁止脚本/网络的沙箱；PDF 使用原始页面与文字层；Excel 使用只读工作簿和工作表切换；图片支持缩放，支持的音视频使用播放器。
- Word/PPT 在账号绑定 Host 中授权读取确切原始版本，再复用 Office-to-PDF 转换。转换不需要创建聊天、复制到 Session 或公开文件地址。
- Ground 的版本预览增加 originalName/mimeType。显示名称改动和跨格式版本替换不再改变原文件格式识别；AI 操作和下载跟随所选版本。
- 文件/分类/目录切换会取消过期请求；转换失败保留正确版本的下载操作。右侧和树菜单不再混用回收站操作。
- 保留并适配并行完成的目录宽度拖动、键盘调整和测量注入实现。修复了暗色树背景回退为浅色的问题。

## 验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 资料库、预览器、Host 资料代理及转换专项 | 71 个文件、737 项通过 | `/tmp/mmp-inline-final-tests.log` |
| Ground 资料流、共享和托管 | 36 项通过，含改名/替换/历史格式回归 | `.superpowers/sdd/2026-11-09-library-tree-inline-preview/task-2-result.md` |
| Host/API/现有 Office provider 额外专项 | 7 个文件、135 项通过；与上一集合有重叠，不累加 | 同上 |
| 完整构建 | 10 项通过、0 失败 | `/tmp/mmp-inline-build-final4.log` |
| 最新构建类型复查 | Host/Client 两项通过 | `/tmp/mmp-inline-check-final.log` |
| 真实 Chromium Web 验收 | 1 个端到端场景通过 | `.superpowers/library-tree-inline-preview/browser-run7-final.log` |
| 独立审查 | 四项 P2 及后续路径均已修复并关闭 | `.superpowers/sdd/2026-11-09-library-tree-inline-preview/review.md` |

737 项专项测试包含已有和新增行为。新问题均先复现再修复：双树分类、固定预览、过期请求、历史版本状态、转换失败后的版本操作、跨分类版本菜单、不可变文件格式、HTML 沙箱、StrictMode 生命周期及实际分包依赖。

浏览器验收通过真实 Web composition 和注册的预览 Factory，使用真实 Markdown、HTML、两页 PDF、带样式与两张工作表的 XLSX、图片，以及由本机原生 LibreOffice kit 从真实 DOCX/PPTX 转换得到的页面。Ground 列表、下载和 render HTTP 使用受控测试响应；真实账号权限、生产服务和实际用户资料未作为本次端到端证据。

实际检查了 PDF 两页及可选择文字、Office 页面文字和字体提示、Excel 蓝色单元格像素及工作表切换值、HTML 原始样式、双树递归、慢请求失败取消、没有目录表格/预览弹窗。桌面与 390px 明暗主题均通过；390px 页面 clientWidth 与 scrollWidth 均为 390。树中文字对比度约为浅色 18.90:1、深色 17.45:1。

## 可查看的效果

截图相对仓库根目录：

- `.superpowers/library-tree-inline-preview/visual/markdown-desktop-dark.png`
- `.superpowers/library-tree-inline-preview/visual/markdown-390-light.png`
- `.superpowers/library-tree-inline-preview/visual/html-desktop-light.png`
- `.superpowers/library-tree-inline-preview/visual/pdf-desktop-light.png`
- `.superpowers/library-tree-inline-preview/visual/xlsx-styled-desktop-light.png`
- `.superpowers/library-tree-inline-preview/visual/word-desktop-light.png`
- `.superpowers/library-tree-inline-preview/visual/slides-desktop-light.png`

完整截图清单、原始文件、原生转换记录与浏览器验收条件见 `.superpowers/library-tree-inline-preview/acceptance.md`。

## 范围和限制

WorkBuddy 对照采用 REA 静态证据及实际文件代码，来源与 Evidence ID 保存在设计文档。未复刻其私有云端 SDK；不声称所有复杂文档与其像素一致。Office 测试文件实际出现 Liberation Sans 和宋体缺失提示；复杂 Excel 图表、图片、形状等沿用现有预览器的具体不支持提示。视觉预览可用不代表内容已经可被 AI 引用。

真实账号的完整权限验收、已安装桌面 App、生产部署仍未执行。现有全局 lint、JSDoc、依赖检查失败未被伪装为通过，详情见任务专项记录；本轮完整构建和上述行为验收通过。测试仍产生一条既有 PDF 标准字体配置提示，浏览器实际 PDF 文字和页面检查通过。

保留了当前分支上的既有并行修改。只清除了本轮错误编译产生且经 source map 与起始状态核对的新文件，未清理用户文件。
