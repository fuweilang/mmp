# t200 Admin跨企业资料库 · 本机实现交接

产品基准：https://cursor.com/canvas/store-b6298dda-8b60-43d8-9e10-51a9a4efc00f/c2f06fd2-a039-4cce-b3ef-951623c48ec8
用户总批准按方案执行；未改原方案Page历史内容。工作区：Mac既有唯一WIP `/Users/fuweilang/Documents/code/mmp/ground`。

## 本轮实际功能
- `/admin/library`：可搜索/分页企业列表定位，进入一个明确企业后为全层级资料表，无树；全部/回收站、全层级名称搜索、owner/目录/类型/可见性/处理状态筛选及服务端分页。
- 表格保持核心列，详情承接真实MIME/大小/版本及最近30条管理结果；超过100版有明确截断提示，旧引用仍按原versionId。
- 新建目录和统一多选/拖拽上传：owner必须明确选该企业有效非平台成员；默认PRIVATE，共享显式确认；按授权选择目录/填写原因。平台实际操作者与owner分别记录，不模拟成员。
- READ只读、CRUD才可管理；原审批UI增加显式READ/CRUD选择并保留二次确认，默认READ。企业管理员仅批准共享，本人仅批准本人私人，平台不能给自己授权。过期/撤销/不同企业/非授权owner均服务端拒绝。
- 重命名、同企业同owner移动、双范围CRUD校验的共享变更、替换新版本、重试解析、回收与恢复。缺失父级需确认恢复到原企业原owner根目录，父级仍在回收站则先恢复父级。
- 单请求绑定tenant/node/expectedUpdatedAt/version/grant/reason/requestId；事务锁与幂等结果，陈旧修改409；AuditLog记录真实人/目标/原owner/前后元数据/授权依据/原因/请求及成功失败，不记录正文/token。
- 上传使用既有串行最多50文件队列、真实XHR字节进度；失败只重试失败项及原requestId。开始后目标冻结，切企业销毁队列不继续未发项，也不假称取消在途请求。旧列表/详情/预览/影响查询迟到响应不串企业/弹窗。
- 白底实际15px（Admin该路由workspace局部padding0），资料Dialog复用body teleport、align-center与margin:auto、viewport安全余量/正文滚动；没有扩展全局Dialog样式。

## 明确未开放/限制
- FILE永久删除：当前没有可靠的全局任务/读取互斥保护，接口明确409 REFERENCE_UNVERIFIED，UI禁用并显示“未核实”，不是假称零引用。文件回收/恢复可用；已回收空文件夹/链接确认后清理，非空拒绝，无递归扫目录。
- 已有owner不转移，不跨企业搬迁，不做Office编辑器/网页抓取/新多模态能力；保存链接及Console/终端交互、Harness原生mode/standard/工具/审批/模型、t170/171暂停项保持。
- 元数据全层级查询目前先按tenant读取元数据再在服务端过滤/切页，不是客户端只筛已加载一页，但大企业规模的SQL效率仍可后续优化；版本仅详情最近100、管理审计最近30明确展示。
- DB事务回滚保证不会提交半成品节点/版本；底层blob在事务完成前写入，极少数后置回滚可遗留不可访问的孤立blob，本轮没有新增扫盘清理器，不宣称磁盘事务或空间零残留。
- 无schema/迁移；未动真实用户资料/分享/历史。仅55439专用隔离库+临时目录的synthetic fixtures做CRUD并自动核验清理0。未读取凭据/用户正文，也未使用真实云模型。

## 精确源码/测试文件
backend:
- 新增 `apps/backend/src/library/library.admin.dto.ts`、`library.admin.service.ts`、`library.admin.controller.ts`。
- 定点 `apps/backend/src/library/library.module.ts` 注册服务/controller。
- 定点 `library.service.ts` 将原成员创建转交显式owner方法并新增范围校验，普通入口仍要求成员；`library.prisma-store.ts` 支持调用方Prisma事务，保留现有配额锁/普通根事务及显式Nest注入。
- 新增 `apps/backend/test/library/library.admin.http.test.cjs`；既有 `library.http-fixture.cjs` 手机号改独立随机后缀避免并行fixture同毫秒碰撞（不影响业务）。
frontend:
- 新增 `apps/frontend/src/api/libraryAdmin.ts`、`src/components/AdminLibraryTargetForm.vue`。
- 改 `src/views/admin/AdminLibrary.vue`；定点 `src/components/LibraryCustodyApproval.vue`、`src/layouts/AppShell.vue`、`src/router/index.ts`（仅本入口标签/额外padding）。
- 新增 `apps/frontend/tests/library-admin.client.spec.ts`，增补既有 `library-upload.vitest.config.mjs`实际组件别名/测试纳入；未增加依赖。
同change：design/spec/tasks/local-handoff追加本轮，新增本交接和产物hash清单。

## 验证（最终状态见后附结果）
- HTTP不是mock：正常认证/JwtGuard/Nest/当前dist/真实Prisma/Postgres专用55439，严格host/port/db检查，随机synthetic身份，不自行读取用户token。
- Vue DOM是真实Admin SFC/Router/安装Element Plus/Dialog/Menu/Select/MessageBox/上传组件，mock仅API传输，禁止真实fetch；包含授权禁用、修改失败/取消、字段冻结、多文件部分失败重试/切企业、实际CSS的body portal及auto margin，不是浏览器像素视觉。
- 旧领域单元/内存store回归与真实HTTP区分，不把内存测试当数据库测试。
- 历史/tmp产物清单一次Read因允许路径限制被拒绝，未绕过该文件；本轮产物直接从项目内真实dist/lib测量。

## 使用/刷新与待人工检查
正式入口 `http://127.0.0.1:5201/admin/library`。前端完整刷新；新增Nest controller需要正常backend watcher重载生效，若现进程非watch/仍旧内存，由用户正常重开开发服务。本轮未kill/restart已有进程、未启动重复常驻dev。
请在已登录实际Admin窗口检查企业定位/详情、上传目标表单/多选部分失败、回收恢复、窄屏/键盘与弹窗实际双轴位置；新管理正文/写操作需要已有范围READ/CRUD授权，没授权不应误判按钮失效。真实浏览器视觉、实际媒体codec播放未验；不用DOM替代。

## 最终结果（2026-11-08，Asia/Shanghai / UTC+8）
- `pnpm --filter @mammoth/backend build && node --test apps/backend/test/library/library.admin.http.test.cjs apps/backend/test/library/library.http.test.cjs`：exit0，HTTP21/21（含2个父项），两套隔离fixture均打印tenant/user/libraryNodes=0；日志 `/Users/fuweilang/terminals/400824.txt`。
- `pnpm --filter @mammoth/backend test:library`：23/23，exit0；日志400821（同日志前半HTTP21/21）。
- `pnpm --filter @mammoth/frontend typecheck && pnpm --filter @mammoth/frontend build`：exit0；日志400823，真实AdminLibrary-CALxjrP9.js及共享LibraryUploadDialog-CxBHQ50T.css。既有Vite >500k chunk及Prisma配置弃用仅warning，未作为错误隐藏。
- frontend cwd运行既有Vitest config：最终18/18（新增Admin8+先前组件10），3文件exit0；包含真实ElPlus审批二次确认/取消及默认READ/显式CRUD。传输明确mock，不是浏览器视觉/E2E。
- 初次并行HTTP碰到fixture的Date.now手机号碰撞，已改仅测试随机后缀并完整重跑通过。一次最后DOM命令卡在工具自有zsh/cat包装层，没有启动Node；仅结束该次自有测试包装进程，原样命令重试3.12秒18/18。未触碰/终止任何用户dev服务。
- 源码及真实dist SHA256、时间/schema/native保全在t200-artifacts.json；编译JS实际包含缺授权拒绝/FILE purge阻断，编译CSS实际margin:auto、Admin15px+workspace0。schema和t197原生UI bundle hash未变。
- 目标git diff --check通过；未做commit/push/PR/生产发布/迁移/依赖安装，未重启用户服务，未触碰真实用户资料。
