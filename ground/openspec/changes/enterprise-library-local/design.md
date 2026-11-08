# 设计

- Ground 保存原件、不可变版本、解析段落、节点与权限、近期访问及审计；终端不维护第二份企业库。
- 每次列表/搜索/预览/下载/引用/问答均核验登录态tenant、成员、owner与共享范围；不信请求tenantId。管理员不默认读取个人资料。
- 代管必须由企业授权：共享范围由本企业管理员批准，私人范围仅所有者批准；到期/撤销停止新访问。平台不可自授正文权限。
- 原文件默认私人。同名新增不覆盖；替换只追加版本。回收停止正文与检索，恢复保留ID/版本/scope；彻删引用不跳新版。移动不自动扩权。
- 新上传node→version→chunk同事务；失败清落盘。ZIP只保存下载；HTML脚本/宏不执行；允许类型/大小/容量有限。
- 终端左栏资料库，最近/我的/企业共享/回收；主区搜索、文件夹路径、上传与状态。对话＋选择资料，多选只加当前草稿chips，不自动发送；无会话才创建真实会话。
- 发送时按版本重新读取授权摘录，记录进入正式session/prompt。此路径不等于session后端独立再鉴权；已读/历史明文无法远程撤回。引用绑定node/version/段落或真实页码。截断必须明示。
- 模型仅用Ground超管resolved云模型池，缺配置真实报告，不绕路本机Key。
- 初始发现5433为SSH监听；经本机Colima Unix上下文、Docker端口映射及容器内只读查询确认是本地mammoth-postgres/mammoth_core（44项既有迁移）。独立55439验收库45项迁移与真实事务测试通过后，仅对本地开发库应用新增资料表迁移；不接生产。

## Console菜单与原生资料工作区（2026-11-08，北京时间 UTC+8）
- Console资料库只做现有AppShell中的展开父菜单，点击父项不跳路由；二级为最近使用/我的资料/企业共享/回收站，对应`/console/library/{recent,mine,shared,trash}`，均复用同一Library视图与既有权限守卫。旧`/library`、`/console/library`兼容重定向，保留query/hash；默认我的资料，不自动扩至全员私人。
- Console页面内部不再放第二套分类侧栏。当前目录`folder`和标题检索`q`保存在URL；父壳在同一次打开期间保留各分类的query，切回恢复，直达/刷新从URL恢复。所有URL只是筛选，Ground仍核验身份与所有权。
- 终端继续保留mmp主侧栏；资料库共用Web/desktop工作区改成196px局部分类+弹性内容，窄窗自适应；不是把Console菜单方案硬套到终端。
- 原生上传以mmp主按钮触发隐藏file input；新建菜单收文件夹/URL。搜索/解析筛选独立工具条，文件列表列出真实名称/状态/大小/更新时间，单项操作收更多菜单，勾选后才出现可移除的选择chips与加入草稿按钮。
- 解析徽标与上传通知分开，不常驻0%传输，不把ZIP下载等同可读；空态有说明和上传入口，不画未实现拖放。预览/编辑/版本沿用mmp Modal/Menu/Button/Input/FileTypeIcon/Tag，不增重依赖或全站样式。
- +资料多选仍用既有composer选择器，仅library卡片加大字号/行高并把取消/确认置底；其它命令样式不变。发送前版本授权、真实Session草稿、来源边界与平台不得自授权等契约不变。
- 已实际阅读用户3080截图，确认原生file input外露、操作挤排、微小文字和弱空态；上述是针对明确问题的实质布局重构。代码/DOM测试不等于已登录真窗口视觉验收，需新截图或用户本机验证。


## 本机3.0最终收尾约束
- 来源请求以slots HostObservable注入hook消费，业务组件不直接useSyncExternalStore。命令选择保留实际授权LibraryChoice版本元数据并去重，绝不补假versionNo。
- PopupSelectView使用显式可选presentation:file-picker及cancelLabel，不在共用组件判断library业务命令；保持其他命令既有呈现。
- 正常认证HTTP验收只运行严格55439独立库，以随机样例身份调用真实登录API，结束清理。不得用开发JWT签名secret自行造token、读取用户cookie或把provider密钥复制到fixture。
- desktop开发project链接最新共享包，但composition关闭desktop bundle轮询，磁盘产物更新不等于正在运行窗口更新；最终GUI必要时正常重开，不为本功能更改全局HMR。
- 真实模型与GUI未验必须显式保留待验，不用HTTP匿名401、隔离空池或sendSession测试接收器冒充完成。当前完整状态见local-handoff最新九项表。

## t188 资料库增量设计（2026-11-08，Asia/Shanghai）
- 保留最近使用/我的资料/企业共享/回收站。我的资料是本人拥有的全部资料，包含本人已共享；共享仅取当前用户有权访问且scope=ENTERPRISE的同一记录，不复制、不默认公开上传。
- Web/desktop共享React面板及Console既有Vue壳下增加可折叠资料树：根文件与目录并列，展开才查询子页，20条分页，目录点击更新主列表/面包屑，文件点击鉴权预览。只在已展开分支取数据；重复ID/32层上限阻断循环，损坏循环元数据提供一个确定根而不改记录。Console缓存按user+tenant隔离。
- 后端items可选page/pageSize/status；未传分页保持旧flat选择器兼容，避免深层文件/后页丢失。分页之前做权限/范围/名称/处理状态过滤；所有列表、预览、下载、使用记录仍使用现有登录态与成员权限。
- 媒体允许PNG/JPEG/GIF/WebP/AVIF、MP4/WebM/MOV，沿既有单文件上限（默认20MiB）、容量与鉴权。前端上传前读取config，后端独立校验大小、扩展名与媒体签名，保存canonical MIME；不接受SVG，不渲染上传HTML。
- 媒体一律DOWNLOAD_ONLY（UI“仅保存”），不生成chunks，不做OCR/转码/图片或视频理解，不宣称上传成功即AI可读。图片/视频在既有预览中展示，编码不支持有原件下载回退。inline=1只允许已校验的栅格/视频，鉴权不变，nosniff/private no-store/CSP；不是匿名共享链接。React使用有生命周期的私有blob URL，Console使用同源鉴权资源。
- 最近使用只在成功返回文本/链接预览、授权原件/媒体读取、实际draft插入后的used receipt及资料问答API成功时touch当前user+tenant。list/search/展开/选中checkbox不计。发送前open purpose=prepare只准备摘录，不更新最近、更不伪称模型已读；native AgentLoop真实LLM消费未新增全局hook。@ onPick只构造待插入项不冒记成功，后续成功预览/下载可记录。used是经后端重新鉴权的客户端插入收据，不是AI遵从证明。
- 范围（仅自己/企业共享）与处理状态（处理中/可供AI引用/仅保存/解析失败）分离。新建沿用原Menu/Dropdown含文件夹/保存链接，上传为主按钮，目标行44/按钮32/icon16，沿mmp主题tokens与轻圆角，不引新UI框架或PeecAI品牌。
- 不改Harness/mode/standard/审批/工具/模型、不迁移DB、不改已有分享范围或用户资料；真实HTTP仅严格55439隔离库，GUI/codec播放/真实云端回答仍需实际环境核验。
- t189补充：仅更正终端导航语义，专家广场复用IconUsersOutlineRegular，更多复用IconEllipsisOutlineRegular；资料库轮廓图标。来源为ui-primitives产品SVG/sprite封装，供应商站点Logo另用simple-icons；Console另有lucide-vue-next，不全库统一替换或修改专家自定义头像。


## t190–t193 用户定稿（本节覆盖 t188 的导航呈现，不改授权/存储）
- 终端共享React：我的资料无独立根箭头，根内容直接出现，点击根标题只选择根而不toggle。子目录初始收起、独立箭头按需展开，标题只选目录；分类往返保留本次子分支状态。
- Console管理台有意不同：四个二级分类保留，但不渲染我的资料侧栏树。mine显式flat=1、parentId=null，用既有服务端权限过滤/全层级搜索/20条分页展示本人全部层级（含本人共享），不改变终端目录查询。新增版本MIME展示字段与仅flat mine返回的可见祖先路径；不凭显示名后缀猜类型，不泄露无权上级名称，未知MIME显示其他。文件夹是管理行，不假装文件预览。
- Console四路由的workspace局部padding=0、白底；页面padding=15px，避免原workspace20px叠加。仅资料库显式class的Element Plus Dialog/MessageBox采用水平垂直居中、24px安全间距（窄屏16px）、viewport最大高度、正文滚动及固定header/footer，含预览/新建文件夹/保存链接/移动/重命名/共享/彻删确认和代管授权确认；不全局改后台Dialog。
- 原生资料库及Console资料库、Console知识材料、Admin官方知识资料采用同一上传交互设计；React/Vue各复用本端现有Modal/Dialog，不引新库。弹窗拖拽文件/多选、最多50个串行队列、逐项保存成功/失败、仅手动重试失败项，成功项不重放。替换版本按原单目标契约保持单选并明示。AdminLibrary统计页本来无上传，不造新入口；头像/ZIP导入等未改。
- 资料库上传仍默认私人；Console知识材料保留原成员范围表单，Admin官方知识保留expert绑定/索引规则，均不自动改用户资料分享。现有格式、大小、权限及单文件API不扩展；多文件逐个请求，不只取第一个。XHR有真实字节进度；fetch仅上传中，不造百分比。保存成功不等于AI可读；索引失败已保存的官方资料提示用原列表重试索引，避免重复上传。网络结果未知需先刷新核对再手动重试。
- 活跃上传不提供虚假的取消。组件卸载后不再开始下一未发送项，但已发送请求仍可能保存；不触发卸载后的刷新/成功回调。当前运行请求不伪称被撤销。
- t194/t195仅问答：保存链接仍保留，原样仅存标题/URL、不抓正文/不切分索引，不新增网页导入或爬取器。本轮无移除批准。

## t196/t197 增量：层级与弹窗几何
终端细化根/树的导航层级与现有Menu状态筛选，保留t190行为；只资料弹窗恢复Element Plus align-center所需margin:auto并body teleport，Admin同范围移除硬编码top margin；终端只限制资料内容滚动，不改共享Modal。实际证据/旧声明纠正见t196-t197-handoff.md。


## t200：已批准的Admin跨企业管理增量
以产品Page c2f06fd2-a039-4cce-b3ef-951623c48ec8 为依据：平台可以定位跨企业元数据（含私人名称/路径），但正文和写操作继续使用现有READ/CRUD代管。审批仅增加明确权限选择，默认READ；平台不自行授权，不模拟成员。
企业分页定位→单企业全层级表格/筛选→详情/版本/操作记录；不做资料树或成员最近使用。创建必须选有效非平台成员owner、匹配授权、目录和原因，默认PRIVATE，共享需确认。统一上传队列锁定目标及requestId；切企业停止未发项，已发请求不假取消。
领域服务保持原登录成员创建入口，新增显式授权owner创建方法；PrismaStore复用已有事务与配额锁。管理写入用原Prisma事务、授权/节点锁、乐观时间戳和已有AuditLog.meta记录幂等结果及真实操作者、前后元数据，拒绝越权/陈旧版本。无schema或迁移。
删除先回收；恢复保留owner/scope/version，缺失父级需明确根目录确认，父级仍在回收站则先恢复父级。无法可靠核实活动任务/读取，因此所有FILE彻底删除服务端明确拒绝，不虚构0引用；仅已回收、无子项的文件夹/链接经确认允许清理。不新增全局引用系统，也不放宽旧入口。
Admin页使用白底实际15px、现有ElPlus及body teleport/margin:auto资料弹窗。Console/终端、保存链接、Harness/权限/模型、专家/技能及暂停项不作无关改动。详情见t200-handoff.md。
