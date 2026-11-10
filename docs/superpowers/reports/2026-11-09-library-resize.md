# 资料库分隔线与 WorkBuddy 实现核对

用户选定范围为“调整宽度并记住”。实现资料库内部分隔线的悬浮反馈、Pointer 拖拽、本机宽度记忆与键盘调整；达到最小宽度保持展开。

## WorkBuddy 的对应实现

来源为本工作区先前取得的公开资料库远程脚本 `53601.ef8b063b.js`，不是将桌面聊天布局通用 Sash 当成资料库实现。

| 项目 | 原脚本可核对的逻辑 |
| --- | --- |
| 初始与范围 | 默认 280px；最小 200px；最大 480px |
| 计算宽度 | Pointer 横坐标减布局容器左边坐标，再限定范围 |
| 拖动 | 左键启动；捕获 Pointer；处理 move/up/cancel；释放捕获及监听 |
| 保存 | localStorage `mindx.sidebar.width`；松手或键盘调整后保存整数 |
| 缓存异常 | 非数字回到默认；越界数值限制到范围；存储异常不影响当次操作 |
| 键盘 | 左右键每次 16px；Home/End 到边界；separator 的可访问性属性 |
| 自动收起 | 原始宽度小于 160px 时触发收起；用户明确选择不采用此行为 |

REA 父证据为 `ev_86c3998523eb196b6b5c889bfe5f0a3f6ff7dc60eddb3389750f8982d55d1a22`。分析成功，语义图达到节点上限而不完整；上表经原始脚本逐段核对。静态代码不证明当前运行的 WorkBuddy 加载同一远程版本。没有取得该页面匹配 CSS，未声称核实其悬浮色、命中宽度或动画时长。

[REA 记录](../../../../workbuddy-library-investigation-20261109/resize-evidence.json)和[带原始位置的脚本摘录](../../../../workbuddy-library-investigation-20261109/resize-source-excerpts.json)保存在当前工作区。

## 猛犸实现

Web 与桌面共享 `ui-enterprise-library` 的 LibraryPanel。宽度使用本机独立键 `mmp.library.navigation.width`，沿用 280px、200–480px 与 16px 键盘步长；8px 命中区和现有主题色用于悬浮、聚焦与拖动态。Pointer 取消、失去捕获、窗口失焦和卸载恢复先前的文本选择与鼠标样式。

CSS 为右侧内容保留 320px，手机纵向布局隐藏分隔线。临时缩窄窗口不覆盖保存的偏好。键盘从实际可见宽度调整；注册端持有 ResizeObserver，通过框架注入测量值供可访问性读数使用，组件不自行订阅外部数据。独立复查发现并修正了窄窗口下第一次左方向键不移动的问题。

## 验证记录

新增 8 项交互测试覆盖拖拽边界、松手保存、重挂载恢复、非法缓存、存储不可用、取消及卸载清理、窄窗口实际宽度和可访问性读数。最新资料库包共 78 项测试通过，build:artifacts 的 8 项构建和 build:check 的 2 项检查通过，新增实现文件及浏览器测试的定向 lint 通过。

较早一次应用级浏览器验收通过，覆盖鼠标拖动、刷新恢复、键盘、响应式与手机布局。随后合入并行预览改动后的最新应用级浏览器验收在启动阶段失败：documentpreview 的 lib/client.js 引用相对分块 `./client.LoadingIndicator.js`，但客户端模块表没有加载该分块。独立复查确认该依赖来自预览分包路径，分隔线实现没有该依赖；尚未证明底层加载问题是否早于并行改动存在。当前不能宣称最新应用级浏览器验收通过，亦不能将旧截图当作最新预览版本验收。

全量 `test:gui` 的一次运行有 50 个测试文件失败，693 个文件通过；484 项失败，12112 项通过，5 个未捕获错误。失败列表位于项目 `.superpowers/library-resize/gui-failures.json`，其中包括其他组件的 renderer factory、settings scrollIntoView 和 snapshot 失败；不能据此宣称全量通过。`test:docs` 同样存在仓库文档格式和历史资料校验失败，包括资料库 README 既有的 Summary/Model Experience 格式问题。

当前工作区有并行资料库预览变更；本项保留其代码并单独验证分隔线，不提交、不发布，也未替换已安装的 Mac 应用。
