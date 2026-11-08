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
