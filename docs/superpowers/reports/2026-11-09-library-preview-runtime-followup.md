# 预览 404 与真实文档结构样式复验

日期：2026-11-09（America/Los_Angeles）。针对用户截图中的 Word 预览 404，本轮完成本地运行服务修复和真实账号、真实文档验收。本轮没有修改渲染源码、上传文件、切换账号或发布生产。

## 根因与处理

用户页面位于 `http://127.0.0.1:3080/`。浏览器已取得本轮新前端，但该端口的账号路由器及身份 Host 仍是当天 08:06/08:08 启动的进程。进程内缓存的旧资料代理没有新加的 `/ground-library/nodes/:id/render` 操作，因而返回旧代理的明确 404 文案“ 不存在的资料操作”。源码和已编译文件中已有新操作，单独刷新前端不能刷新 Host 模块。

在实际 Chrome 标签中，以当前已登录企业管理员账号、其有权读取的真实 Word 文件先复现相同 404。随后对本地账号路由器做正常 SIGTERM 关闭，以相同工作目录、`MMP_HOME=/Users/luoxiaojun/.mmp` 和 Ground 地址 `http://127.0.0.1:5201` 启动当前受支持的 Web launcher。保留账号、资料、任务和工作区持久目录；未删除用户数据。3080 新监听 PID 为 31577，进程记录和日志位置见 `mammoth-agent/.superpowers/library-preview-runtime-20261109/service.json`。

之前的受控浏览器验收没有验证这个已运行数小时的服务进程。不能用此前测试通过代替这次运行现场的验收。

## 本轮真实验收

当前 Chrome 登录账号是企业管理员，用户截图显示企业员工。本轮没有替换或扩张账号权限：先在当前账号本人可访问的 Word 文件中复现；之后在当前账号可访问的“企业共享”里找到 `Slogan大师.docx`（v1，4.6KB），通过正常界面打开。

现场未拦截或伪造 Ground、render、download 请求；实际经过账号 Host 授权、原文件读取、原生 Office 转 PDF 和浏览器 PDF 渲染。

- `Slogan大师.docx` 生成 3 页；浏览器 DOM 中实际有 3 个 PDF 页面容器。
- 第一页显示蓝色封面标题、作者/部门及日期。向下滚动后第二页实际完成 canvas 和文字层绘制。
- 正文可见加粗分节标题、①②③编号、段落间距与项目列表，保留原文件版式；不是只拿提取文字显示。
- 右侧预览区 alert 数量为 0，文件标题正确。
- 当前环境缺少“微软雅黑”，真实预览仍明确显示字体替代说明；另一份 Word 文件也提示 Consolas 缺失。不能声称字体与原始制作环境完全一致。

证据：

- `mammoth-agent/.superpowers/library-preview-runtime-20261109/slogan-styled-preview.jpg`
- `mammoth-agent/.superpowers/library-preview-runtime-20261109/slogan-dom.txt`
- `mammoth-agent/.superpowers/library-preview-runtime-20261109/real-word-after.jpg`
- `/tmp/mmp-library-preview-runtime-20261109.log`

## REA 对照

再次检查 WorkBuddy 对应原始界面模块及已安装包中的 Markdown 资源。报告：`/Users/luoxiaojun/Documents/mmp/workbuddy-library-investigation-20261109/preview-error-followup-20261109/structured-styles/REPORT.md`。

远程模块 REA 父证据为 `ev_c700d96c1108ec2aecba3d7b47756281ade7367143dc0b8b91b99fbb2f34ef6c`；已安装 Markdown guest 父证据为 `ev_8ee8d9852d7c25c3ea0557258bf4b4469134a6791679d4adaf05b401e9a73fd7`。静态语义图局部受资源限制，原始文件和 SHA-256 保存在同一报告目录，未把静态分析描述成 WorkBuddy 真实账号运行结果。

WorkBuddy 的 Office 文件使用腾讯文档 SDK 或后端预览 URL，文档原有结构交由对应格式引擎处理；原生富文档、网盘文件、Markdown、网页、代码也有不同显示路径。已安装桌面 Markdown 样式包含独立标题层级、列表、表格、代码和图片间距规则。其 `cloud-hosted` 分支是下载/受限占位，不是富预览引擎。

Mammoth 当前的对应实现为原文件字节进入格式预览器：Word/PPT 原生转换后的页式预览、PDF 页面与文字层、只读工作簿、结构化 Markdown 和静态 HTML。它没有复制 WorkBuddy 私有 SDK，也不把抽取正文统一套字号当作保真排版。本轮现场验证确认了这条原版式链路在实际 `Slogan大师.docx` 上已经可用。

## 状态

本地实际服务已更新，实际文件预览已恢复。生产部署和已安装桌面 App 均未操作；字体缺失仍按实际情况提示。本轮以现场复现→运行服务修复→同类真实文件及指定名称文档复验为验收，没有为了进程重启新增无意义的源码测试。
