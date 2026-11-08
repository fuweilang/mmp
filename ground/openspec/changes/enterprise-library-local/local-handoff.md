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
