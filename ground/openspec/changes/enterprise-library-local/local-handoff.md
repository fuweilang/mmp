# 2026-11-10 会话交接（本节优先）

下次做资料库先读同目录 `2026-11-10-session-handoff.md`。Console 验收收尾，然后验收 Admin `/admin/library`。不要做对话自动全库检索。下文 t190 及更早索引保留为历史证据。

# t190–t193 最新索引（2026-11-08 18:22 Asia/Shanghai（UTC+8））

最新终端根导航、Console全层级表格/四页样式、三端统一上传及最终验证见同目录`t190-t193-handoff.md`。本索引覆盖下文旧呈现，历史证据保留；保存链接未移除。

# t188 更新索引（2026-11-08，Asia/Shanghai）

最新资料树、媒体保存、共享/最近口径与t189导航图标见同目录`t188-handoff.md`。下文保留历史交付证据，不代替本轮实际检查。

# 最新收尾交付（2026-11-07 21:42 PST；本节优先）

## 保持的边界
- 本机3.0 HEAD仍为`95a1a61e350e4e13875782963f523ba353626577`；2.0仍`88656a65352752429e3be91d149b06261e47fec5`。无unmerged，不新增commit/push，不改PeecAI，不部署、不改已应用迁移，不停用户dev进程。
- 指定云分支的合并已完成；后续工作是未提交本机增量，不能把界面反馈归因于“尚未merge”。本节列出的检查对应这个HEAD上的当前工作区，而非干净commit或生产部署。

## 九项清单：实现与验收分开
| 项目 | 本机代码/证据 | 仍待实际验收 |
|---|---|---|
|1 Console二级菜单|AppShell内最近使用/我的资料/企业共享/回收站；父项只展开；旧/library兼容；原4项路由断言通过|实际窗口菜单、刷新、窄栏|
|2 三端UI|Console不脱壳且无重复分类栏；Admin审批/代管沿用资源组件；Web/desktop共用重构面板、隐藏input、工具条/表格/状态/空态/更多/底栏|真实视觉与小窗操作，未声称已好看|
|3 真实Session草稿/发送|接正式session API；当前Session只加chips，无会话才真实创建。真实InputHub与版本Service的自动化验证不自动发、提交前open、无权保留草稿|运行中正式Session持久事件及真实回答；测试中的sendSession接收器是替身，不冒充模型/端到端|
|4 desktop注册与兼容|Web composition注册、desktop开发project链接当前包；两边lib SHA一致；框架来源请求hook替代组件直接useSyncExternalStore|已有桌面窗口是否加载新内存模块；见下方重要刷新边界|
|5 Ground云模型|正式Ground gateway/resolved池路径保持不变，未新增BYOK或读Key|尚无可用的正常授权开发测试身份连到运行中已配置池；真实问答未验。不是匿名401或fixture空库证明模型不可用|
|6 来源版本|HTTP验证单chunk真实paragraph:1、v1替换v2后旧版本仍可开；客户端草稿v1→替换v2→提交仍含v1原quote且不含v2；选择器保留真实版本元数据并去重|真实模型答案与引用点击定位|
|7 权限矩阵|新增正常登录HTTP矩阵：两租户、同租户成员、企业管理员、真实平台权限角色；私有/共享/撤销、所有读写、tenantId注入、移除成员；私人必须本人批准、禁止平台自授、单授权隔离、撤销/到期、无标题正文泄漏|真实账号交互核对；不宣称覆盖所有可能业务组合|
|8 文件异常|首次上传/回滚/容量事务沿用此前真实DB3项；新HTTP覆盖ZIP存下载无chunks/quote、坏DOCX失败重试无重复索引、空文件/不支持类型拒绝、回收恢复/彻删、链接撤销不返回缓存URL；临时聊天附件没有自动入库路径|大文件真实网络中断等未做GUI/压力验证|
|9 OpenSpec|本design/tasks/handoff统一真实进度，保留合并和历史证据|GUI/真实模型项明确未勾选|

## 新增正常认证HTTP验收与模型边界
- `test/library/library.http-fixture.cjs`严格限制127.0.0.1:55439/mmp_library_acceptance并再次查current_database，ignoreEnvFile，不读.env。
- 只在隔离验收库创建标记样本两租户/五身份/平台权限角色；随机fixture密码只在进程内，经过真实`POST /api/auth/login`由Auth正常签发会话。没有自行签token、读取用户cookie、变更开发账号或索取凭据。
- 后续通过真实Nest HTTP路由、JwtGuard、AuthModule、LibraryModule、Postgres执行授权矩阵，不是Actor替身；结束后样本tenant/user/role计数均0，临时文件与监听关闭。
- 此隔离库的身份不具备运行中开发库的云池授权；未复制provider配置/Key到隔离库、未改开发身份。真实Ground模型与正式运行Session仍待合法已登录窗口最终验收，不能用匿名401/fixture空库替代。

## 本轮命令与结果
- backend `./node_modules/.bin/tsc -p tsconfig.build.json` PASS（为HTTP测试构建实际Auth/Library产物）。
- backend `node --test test/library/library.http.test.cjs` PASS：8个HTTP子场景，含父test报告9/9。初次失败均为新harness路由/返回结构/Prisma命名断言已校正，未放宽权限或修改服务以迎合测试。
- mammoth-agent 两个目标包 `tsc -p packages/client/{ui-commands,ui-enterprise-library}/tsconfig.json` PASS；两个对应tsdown配置构建PASS。
- 目标Vitest panel/draft-send/popup-view（只library picker及相关筛选）17通过/26有意跳过；apply/popup-selection另5通过。真实InputHub/Service结合用例覆盖单chunk v1草稿跨v2替换；sendSession依然为测试接收器。
- 此前Console4、Vue类型、后端13/隔离DB3/原生30/既有弹窗54证据保留，未重复全组/全仓回归。`git diff --check`通过。
- HTTP正常登录矩阵、组件测试和编译均不能等同GUI或真实模型回答。

## 运行产物与服务
- 当前`ui-enterprise-library/lib/client.js`与桌面development project链接文件SHA256均`6bc539c958932a6168d065f2cabd01a9efda3ed6fcc154a445e4b3cacfcaa853`；CSS由组件显式import且已打包，非仅改源未出产物。
- Web启用client-hmr bundle轮询；**现有composition有意对desktop设watchBundles:false**。桌面链接磁盘产物是最新，但运行中Host可能缓存旧bundle，不能仅凭SHA宣称窗口已更新。若最终验收仍旧UI，需要正常重开开发桌面/其Host；本轮未擅自杀/重启用户Electron，也没有Shell驱动GUI。没有为本业务全局改变桌面HMR策略。
- 监听仍为3080 PID25493、5201 PID24740、5202 PID24661、3100 PID26564；桌面Electron主进程PID25955、Host25973，本轮最终核查均存活，Host实际HTTP端口54406（动态）；9230为调试监听，不作应用入口。
- 测试/构建均已退出，最终ps核对35858/36080/36200/36400/36515/36619/36914均已退出，未保留本轮新增后台命令。55439隔离数据库容器保留给后续验收，不是测试命令卡住。

## 最终统一GUI入口（无需现在操作）
- `http://127.0.0.1:5201/console/library/mine`：有本租户Console权限的成员；父资料库展开四子菜单，右侧始终AppShell。企业管理员不因此可读他人私有。
- `http://127.0.0.1:5201/admin/library`：平台权限身份默认统计；只有本人收到的有效单授权可看授权范围内容。Console页头可在本人/本企业合法范围批准并撤销。
- `http://127.0.0.1:3080/`及已有本机桌面：现有Ground正常登录、工作区/会话；左栏资料库、+资料多选、芯片点击与固定版本预览、用户主动发送。最终统一用非敏感scratch ui-acceptance-v1.md(7天)/v2.md(11天)验真实答案和版本。
- box环回与Mac不是同一网络，之前连接拒绝不代表Mac宕机；未开隧道。
- 当前代码与可执行自动化已收尾；外部未验边界是本机实际已登录GUI/正式会话/云模型，不要求用户此刻截图、登录或手工执行。

最终源码账本检查仅`.gitignore`为之前已知历史差异，未触碰；目标编辑文件没有并发指纹差异。

## 当前未提交路径（保留既有增量，共37个）
- `ground/apps/backend/src/library/library.controller.ts`
- `ground/apps/backend/src/library/library.dto.ts`
- `ground/apps/backend/src/library/library.prisma-store.ts`
- `ground/apps/backend/src/library/library.service.ts`
- `ground/apps/backend/src/library/library.store.ts`
- `ground/apps/backend/test/library/library.postgres.spec.ts`
- `ground/apps/frontend/src/components/LibraryCustodyApproval.vue`
- `ground/apps/frontend/src/components/LibraryManagedBrowser.vue`
- `ground/apps/frontend/src/layouts/AppShell.vue`
- `ground/apps/frontend/src/router/index.ts`
- `ground/apps/frontend/src/views/Library.vue`
- `ground/apps/frontend/src/views/admin/AdminLibrary.vue`
- `ground/openspec/changes/enterprise-library-local/design.md`
- `ground/openspec/changes/enterprise-library-local/local-handoff.md`
- `ground/openspec/changes/enterprise-library-local/tasks.md`
- `mammoth-agent/packages/client/ui-commands/src/client/PopupSelectView.module.css`
- `mammoth-agent/packages/client/ui-commands/src/client/PopupSelectView.tsx`
- `mammoth-agent/packages/client/ui-commands/src/client/contract.ts`
- `mammoth-agent/packages/client/ui-commands/src/client/popup.ts`
- `mammoth-agent/packages/client/ui-commands/tests/popup-view.client.spec.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/README.md`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.module.css`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/api.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/index.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/locales.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/selection.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/apply.client.spec.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/draft-send.client.spec.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/panel.client.spec.tsx`
- `mammoth-agent/packages/credentials/deepseek-account-platform/tests/ground-library.spec.ts`
- `ground/apps/backend/test/library/library.custody.spec.ts`
- `ground/apps/backend/test/library/library.http-fixture.cjs`
- `ground/apps/backend/test/library/library.http.test.cjs`
- `ground/apps/frontend/src/utils/libraryNavigation.ts`
- `ground/apps/frontend/tests/library-navigation.test.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/popup-selection.spec.ts`

---

# 以下为历史阶段交接（不覆盖上方最新状态）

# 当前本机3.0交接（本节优先，后附历史记录）

- 项目：`/Users/fuweilang/Documents/code/mmp`；机器`09cc32cc-e48f-4d74-acda-8c142c8ad6e9`。
- 当前分支3.0，merge commit `95a1a61e350e4e13875782963f523ba353626577`，双亲`88656a65…`和`a612da7e…`。指定云端资料库分支已真实合并，24个冲突采用已适配且更严格的本机实现解决。2.0未动，未push。
- 合并审查/恢复材料在同机 `/Users/fuweilang/Documents/code/mmp-library-local-scratch-20261108/merge-3.0/`。后续功能及局部UI增量尚未提交；保留既有20项改动，不可用云端旧文件覆盖。
- 现已具备连接鉴权的同源Host代理、Web/桌面共享资料库入口、原生管理/版本/回收、+多选确认、@选择、当前真实Session草稿、发送前版本授权摘录、芯片原生预览、所有者/管理员批准及单授权代管浏览。
- 代理用Host现有账号回调，不向浏览器吐JWT；模型仍走Ground正式池。`session/prompt`收到已经展开的摘录，不再在Session服务端独立重鉴权；随意粘贴的文字不是受控引用。
- 最新目标自动检查：13项后端、3项隔离Postgres、30项原生/代理/草稿、54项既有弹窗，相关类型和客户端产物通过；此次UI调整仅再做类型/路由小检查，不重复全组。
- 5433 `mammoth_core`迁移45项up-to-date；55439独立验收库；没有改已应用迁移、没有生产操作。

本轮UI调整补充验证：Ground Vue类型、原生资料库目标类型/产物、Console路由静态断言和diff检查通过；未重复既有测试组。

## 当前轮菜单/终端UI
- 已只读PeecAI AppLayout/router参考展开交互；没有修改PeecAI。Console分类已移入AppShell二级菜单，页内不重复侧栏，目录/检索URL可刷新。
- 已读取用户3080原型截图。Web/desktop共享LibraryPanel已实质重构局部导航、上传/新建、独立搜索筛选、真实元数据表格/状态、行更多菜单、勾选后草稿操作、空态和mmp Modal；+library选择器仅本业务调整底部按钮/字号。
- 本机当前监听：3080 PID25493、5201 PID24740、5202 PID24661、3100 PID26564；未停用户进程。匿名5201 `/api/library/items`与3080 `/ground-library/items`均401，证明身份边界，不能代替登录问答。
- 外部待验：用户本机已登录Web/桌面新截图与真实模型问答。box的127.0.0.1不是用户Mac，之前box连接拒绝不是用户服务宕机；不建公网隧道、不抓cookie、不读取Key。

## 本轮最终验证与核对素材（历史原记录）
- PASS：Vue `vue-tsc --noEmit`；ui-commands/ui-enterprise-library两个目标包tsc及tsdown。原生lib/client.js已生成，不仅停留在源码建议。
- PASS：Console菜单/旧路由/权限/无页内重复侧栏4项；原生面板10项（隐藏input、空态、真实元数据、显式入草稿、固定版本预览、失败原因、拒绝链接预览/旧标题清空、新建菜单Modal等）；资料专属选择底栏2项，其他27项有意跳过，不重复全组。
- `git diff --check`通过；3.0 HEAD仍95a1a61e，2.0仍88656a65；无unmerged，未commit/push。源码账本仅已知`.gitignore`历史差异，未动它；本轮目标文件没有并发指纹变化。
- 本轮所有测试/构建任务已退出，无残留测试PID；用户dev监听进程未停。
- 非敏感GUI素材在同机scratch的`ui-acceptance-v1.md`/`ui-acceptance-v2.md`：海鸥项目保留期分别7天/11天。上传v1至READY，加入当前真实会话草稿（确认不发）；通过更多→上传新版本替换v2，再发送原草稿提问，应按绑定v1答7天并可定位真实版本，不能偷偷改读v2，也不应编造页码。此步待本机已登录用户实际执行，不能标为已通过。
- Console验收：点击资料库父项URL不变、二级切换仍同AppShell，窄栏可先展开；进入目录并搜索后刷新/切回检查folder/q恢复，无第二套分类栏。
- 原生验收：刷新3080和已有桌面窗口，检查180–196px局部导航、独立操作区/表格/空态、文件输入不外露、小窗不溢出、勾选才出现草稿操作栏；+资料弹窗确认/关闭置底且未就绪有原因。未看到新GUI截图前不声称视觉通过。
- 唯一外部验收阻塞是用户Mac的已登录真实窗口/会话尚不可由当前工具安全访问；HTTP匿名接口均401。没有读取Key、抓cookie或伪造身份，未得出本机模型无配置/不可用结论。

## GUI核对入口与账号类型
1. `http://127.0.0.1:5201/console/library/mine`：有企业控制台权限的本租户成员；应保留AppShell品牌侧栏/导航顶栏/租户切换，资料库父菜单可展开，二级最近使用/我的资料/企业共享/回收站在同一AppShell右侧切换；旧`/library`和`/console/library`保留query/hash后进入mine（显式view可选受限分类）。
2. `http://127.0.0.1:5201/admin/library`：平台管理员；默认统计不含私有标题/正文，只有以本人收到的有效授权浏览才有内容。
3. Console页头“代管授权与撤销”：普通成员仅本人私人，企业管理员另可批准企业共享；另一位有效平台管理员作为代管人。分别核对批准、浏览、撤销/到期无标题泄漏。
4. `http://127.0.0.1:3080/`及现有桌面窗口：先用现有Ground账号正常登录、选择工作区/真实会话；左栏资料库与聊天+资料库应存在。多选只进草稿且保留文字，不自动发；发问时验证真正会话载荷及真实Ground模型回答；芯片点击查看固定版本摘录。
5. 原生菜单没更新先刷新窗口；如仍是旧Host，需由维护现有dev进程的人判断是否必要重启。此轮没有停止用户dev服务，不以HTTP匿名401冒充已登录GUI验证。
6. 当前服务：Ground网关5201、前端5202、后端3100、Web终端3080；桌面Host端口动态，不冒称固定同源。

尚未完成：实际GUI视觉验收、已登录真实模型回答/桌面交互；没有截图就不能断言已经好看。以下保留原始阶段记录，陈旧“原生未实现”描述仅属历史。

---

# 企业资料库本机第一阶段交接

## 状态
仅完成第一阶段Ground实施，不是任务1–7全部完成。分支2.0，HEAD 7416ac6e3868c93765c36f801bbca1b08697797a。初始683项工作区状态，最终所编辑源码指纹无并发冲突，其余已留基线源码未检测到变化。未停止用户服务，未fetch/pull/checkout/reset/stash/merge/commit/push，未创建PR或调用云端开发，未联系其他队友。既有PR仅只读参考；不以参考分支替换已有文件。

## 已实现
- 独立本机OpenSpec enterprise-library-local。
- Ground资料模块、持久存储、上传/文件夹/仅保存链接/搜索/改名移动/版本/回收恢复/下载/解析状态及重试。企业/owner/显式共享鉴权、版本绑定来源。
- 首次node→version→chunk同事务及失败清文件；中文文件名修复；单chunk无locator正确打开。
- 使用本机已有PDFParse、JSZip、XMLParser；DOCX有展开大小限制且拒绝实体；PDF真实页码；ZIP不解析；HTML仅提取纯文字。
- 平台自授权被拒绝；共享范围需本企业管理员、私人范围需本人批准；本人可撤销；代管读有审计。授权UI与平台授权浏览尚未接通。
- Console管理视图 /library（/console/library重定向），Admin统计 /admin/library。移除参考实现中独立伪会话提问框，未冒充原生对话。

## 数据库
Docker上下文colima为本机Unix socket；mammoth-postgres映射5433，容器内只读查询确认mammoth_core已有44项迁移，与Prisma当前目标一致。仅新增资料库表迁移已应用到该本地开发库；prisma migrate status为最新。无生产数据库、无破坏性迁移。
另建验收容器mmp-library-acceptance-20261108，127.0.0.1:55439，数据库mmp_library_acceptance，45项迁移。该库不含用户业务数据，DB测试对URL做严格硬限制。容器暂保留以供后续验收。

## 本机检查
- prisma validate/generate：通过。
- tsc --noEmit -p tsconfig.build.json：通过。
- test:library：11/11通过。
- test:library:db：2/2通过（隔离真实PostgreSQL，首次上传/权限/共享撤销/版本/回收/事务失败清文件）。
- @mammoth/shared build：通过。
- @mammoth/frontend typecheck：最终修改后通过。
- HTTP Ground health200，/library HTML200，匿名资料items与admin/stats均401。
- 全后端含所有测试的tsc首次运行曾报未触碰official-agent测试错误；不是全仓类型检查全绿，未做无关修复。
- 未运行GUI、桌面构建、真实模型回答或完整越权HTTP矩阵；单元模型回包为测试替身。

## 七任务实际进度
1 已完成本机新OpenSpec/范围。
2 Ground技术核查完成，原生端仍需适配。
3 Console/Admin基础UI已落地；原生交互未实现/未看GUI。
4 Ground服务和两种管理页及本地迁移已落地；企业授权审批UI/平台授权代管浏览未完成，生产存储挂载/备份未部署。
5 未改mammoth-agent源码，Web/桌面原生入口和草稿/发送未接。
6 Ground安全解析/版本摘录/云网关调用API完成；正式session/prompt接入与真实模型回答未验证。
7 本机定向类型/11单元/2真实DB通过；最终Web/桌面/真实模型流程未验收。

## 需要父代理的GUI验证
当前服务：Ground网关5201，前端5202，后端3100；终端Web3080；桌面已有运行实例但未改其代码。
1 在本机已登录Ground浏览器打开http://127.0.0.1:5201/library。
2 上传含唯一事实的中文MD；观察文件名、READY状态、预览、下载，勿用敏感真实资料。
3 在自己新建样本上操作改名、移动、替换v2、回收恢复；共享确认后用另一个同租户用户验证可见性，撤销后拒绝读取。
4 用已有超管登录http://127.0.0.1:5201/admin/library，应只见汇总与已授权清单，不应有平台自授权表单或私人正文。
不要让用户此时验收终端左栏资料库：原生端仍未接入。

## 后续本机实施要点
- 不直接复制参考原生插件：其浏览器process.env.MMP_GROUND_ORIGIN与直接/api/library路径不适配当前本机架构。当前3080及桌面Host不自动代理Ground业务API。
- 参考本机credentials/deepseek-account-platform/src/ground-billing.ts或ground-history.ts的同源Host代理：校验connection.requestRejection，只允许资料库指定路径，Host使用现有账户凭据服务，JWT不能传浏览器/输出日志。账号切换需阻止返回上一账户正文。
- 新UI插件三处注册：web-app/cordis.patch.yml、web-app/package.json、tsconfig.client.json；Web与桌面共用Web bundle。
- 当前会话通过真实uiSession/SessionBinding。无会话才按uiWorkspace.workspaceForNewSession选择工作区创建，openSession保留后再拿binding；不要虚构panel会话。
- 可定向适配参考appendReference的contract/input.ts、input/facade.ts、draft-hub测试增量，不覆盖本机现有改动。
- 发送前/open摘录鉴权不等于session服务端独立再鉴权；任意粘贴文字不是受控引用。
- 仍需检查并发quota预留、重试解析的不可变定位语义、全路径HTTP IDOR、跨租户角色范围；不能宣称上线通过。
- 回收保留配置目前没有自动清理调度；读取列表/统计绝不触发永久删除。

## 备份与清单
独立scratch：/Users/fuweilang/Documents/code/mmp-library-local-scratch-20261108。backups仅包含本轮即将编辑的非敏感源码，changes.json记录before/after SHA256；safe_edit.py会拒绝并发变化。未复制.env/密钥。

本轮文件（相对mmp）：
- `ground/apps/backend/src/library/library.ask.ts`
- `ground/apps/backend/src/library/library.controller.ts`
- `ground/apps/backend/src/library/library.dto.ts`
- `ground/apps/backend/src/library/library.errors.ts`
- `ground/apps/backend/src/library/library.files.ts`
- `ground/apps/backend/src/library/library.limits.ts`
- `ground/apps/backend/src/library/library.llm.ts`
- `ground/apps/backend/src/library/library.module.ts`
- `ground/apps/backend/src/library/library.parse.ts`
- `ground/apps/backend/src/library/library.policy.ts`
- `ground/apps/backend/src/library/library.prisma-store.ts`
- `ground/apps/backend/src/library/library.service.ts`
- `ground/apps/backend/src/library/library.store.ts`
- `ground/apps/backend/src/library/library.types.ts`
- `ground/apps/backend/test/library/library.flow.spec.ts`
- `ground/apps/backend/test/library/library.postgres.spec.ts`
- `ground/apps/frontend/src/api/library.ts`
- `ground/apps/frontend/src/views/Library.vue`
- `ground/apps/frontend/src/views/admin/AdminLibrary.vue`
- `ground/apps/backend/package.json`
- `ground/apps/frontend/src/router/index.ts`
- `ground/apps/frontend/src/layouts/AppShell.vue`
- `ground/apps/backend/src/llm/llm-chat.gateway.service.ts`
- `ground/apps/backend/prisma/schema.prisma`
- `ground/apps/backend/prisma/migrations/20261108040000_enterprise_library/migration.sql`
- `ground/openspec/changes/enterprise-library-local/proposal.md`
- `ground/openspec/changes/enterprise-library-local/design.md`
- `ground/openspec/changes/enterprise-library-local/specs/library/spec.md`
- `ground/openspec/changes/enterprise-library-local/tasks.md`
- `ground/packages/shared/src/index.ts`
- `ground/apps/backend/src/app.module.ts`
- `.gitignore`
- `ground/apps/backend/src/library/README.md`

## 最新 t196/t197
见`t196-t197-handoff.md`：导航/既有Menu、Element Plus真实CSS居中根因、28React+10Vue+9契约/类型/构建、产物hash与未视觉验收。旧t192仅class检查不足的声明已明确纠正。


## t200 Admin资料库开发交付
产品Page批准后已实施企业定位＋单企业全层级CRUD工作流，按原代管授权，不自授、不模拟成员；无schema迁移。文件彻底删除按方案保护仍阻断，回收恢复可用。精确文件、测试/产物hash、局限及刷新说明见同目录t200-handoff.md与t200-artifacts.json；真实浏览器视觉仍待用户审核。
