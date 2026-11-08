# t166 任务工作流 — 本轮实现交付（未做用户验收）

授权：pt166u，一次完成1→5；Mac唯一WIP本地例外，不提交不发布，不删除用户真实任务做验证。

## 本轮契约
1. 终端用户文案用“任务”，技术session ID/路由与历史mode不改；新建任务standard，移除新建模式picker。
2. canonical Host归档/删除共享原生归档门禁；删除必须先停止到终态，再释放真实creator handle、取得持久化单写租约，仅unlink已知日志generation，绝不递归清workspace/共享附件/企业资料。删除失败保留归档，明确残留共享对象不扫目录。
3. 设置→数据管理→归档任务，搜索/查看/恢复/删除分页；侧栏不再常驻归档入口；缺失原workspace不得静默迁移到其他Host/path。
4. ＋专家选择器：recent/favourite/search/all；一份next-send草稿与不可变attempt组合分离；×只影响下一次发送，旧history保留，主动角色不得累加。
5. 同样支持一显式技能，可与一专家并用；首次业务LLM前冻结revision/hash/context/budget屏障，恢复/重试重检授权，不偷换latest。

## 组合与并发（采纳王总本轮建议，不代表测试通过）
新协议完整expertRef|null、skillRef|null、selection/protocol版本及幂等key；null显式移除，缺字段不能当null。相同key不同组合拒绝。接收后只用原子冻结snapshot，不再读可变草稿。standard幂等mount，按attempt重建角色/方法；legacy不能分离的persona必须明确限制而非假移除。压缩/恢复/模型切换重新验证真实context generation；撤权阻断依赖不改变snapshot。retry使用原组合，next send用新草稿，晚事件必须匹配task/attempt/generation/hash。starter只有仍空且draft/selection/request版本一致才填，不能覆盖输入/附件。

## 保护基线
fresh六表计数/逐行哈希：task-workstream-t166-evidence/DB/BASELINE.json；不是沿用旧值。46专家(22发布/24草稿)、47版本、115技能/包、44关联、14授权。现阶段未改这些资料/启用状态。

## 状态
本轮源码/生成工件/实际运行bundle已同步；最终结果见后文。不宣称无限制5/5或已验收，恢复迁移和真实云/视觉边界明确保留。

## t169自然节点状态（亚洲/上海：本轮尚在最终工件同步，不声称已验收）
1. 终端任务用语/新建standard：源码已实施、主要目标编译通过，新增locale包正在纳入最终bundle。
2. 归档/删除：canonical stop→确定终态→lease→只删本task canonical日志；真实临时JSONL、symlink、workspace拥有关系/并发fixture通过，未删除真实用户任务。共享artifact physical对象无法证明独占，明确保留。
3. 设置→数据管理→归档任务：已实施搜索/20条metadata分页/只读查看/恢复/删除、原sidebar归档入口移除、toast deep-open；保持Native已存在active-archive清主面板。安全限制：恢复需同Host且与原immutable cwd兼容；跨目录/跨Host迁移不在本实现，目录真丢失不能静默变更scope。
4. 专家选择：＋候选/最近/常用/搜索全库、可移除tag、同步空草稿starter、每attempt冻结组合均已落源码；actual native queue/真实Host dispose-resume/旧协议缺省隔离的fixture通过，视觉与真实账号待用户点检。
5. 技能组合：1expert+1explicit skill、精确revision/hash首次业务context屏障、最终wire/budget校验、cancel迟到/撤权/晚返加载边界已实施；实际native输入文件→报告对象→hash下载回读已通过（Ground/模型明确mock）。当前正在最终emit、codecs/catalog校验和真实lib资源同步，仍非云端到端验收。
t168已优先修好：严格13个新端点逐项owner-only；双face tsc exit0；最小classification+真实reader policy回归4pass/0fail（50过滤未跑）；Host LiveShare bundle exit0，client face最终显式同步纳入资源批次。未删satisfies/AssertNever、未放宽Record、未给reader全局授权；额外堵owner-only被plugin offer重开及经session/prompt传catalogSelection借Owner账号的路径。

## 最终结果（前述t169为当时自然节点，本段更新最终状态）
1. **任务文案/standard已实现。** 主入口、列表、归档/错误/toast的中英用户文案统一任务；新建standard且隐藏mode picker。技术session ID/API/Session Log保留，旧命名任务restore不强行更改原preset。locale目标已逐包emit/bundle。
2. **归档/删除已实现＋临时fixture验证。** task⋯、红色二次确认，Host scope和并发状态重检→archive/stop→确定终态→释放确属creator的handle→Native单写租约→只unlink已验证canonical log generations。失败保持归档；不能证明独占的共享physical attachment/output保留，不递归扫目录，不删workspace源文件/企业资料。未删除任何真实用户任务做验证。
3. **设置归档主体已实现，有迁移限制。** Sidebar归档入口/筛选移除，Settings数据管理归档搜索、20条metadata分页、只读历史分页、恢复/删除，archive toast deep-open；active archive用原生清主任务路径。原workspace优先；注册缺失可选同Host且与原immutable cwd一致的可用workspace。**原物理目录丢失后的任意新目录/跨Host迁移未实现**，拒绝静默改scope，不冒充全部恢复场景已完成。
4. **任务内专家已实现＋native/mock fixture通过。** ＋recent/favourite/all/search、server20分页、tenant/user隔离偏好、avatar/name/×、next-send独立metadata。当前运行attempt冻结，运行时改选择只影响下一轮。新任务空白draft同步starter，无远程晚返/自动发送；转移draft后清源选择。创建来源与当前主动角色分开，旧history保留，移除不累加旧persona。真实账号/UI/云待验。
5. **1专家＋1显式技能已实现＋native/mock fixture通过。** 协议1完整refs|null/selectionVersion/idempotency key，旧缺省与新null分离；Host冻结精确revision/raw hash/auth scope，role+method同一required context屏障，首次业务LLM前最终wire/budget核验，按attempt重建不重复mount。provider invalidate＋epoch/abort阻止旧晚返注入，撤权/禁用阻断不偷换revision/降为standard；selected消息只queue不steer。receipt按task/attempt/generation/组合hash，终态不被迟到成功复活。expert关联skill仍按需。真实native压缩日志dispose/resume/受控文件产物回读已测；生产完整preset、真正压缩/fork/切模型旅程未端到端验证。

## t168已真实修复
- 13新RemoteEndpoint逐项owner-only（账号catalog/偏好、mutation、artifact等不能reader global-read）；保留严格Record<RemoteEndpoint,...>、AssertNever、未知failclosed，未as any/放宽Record。
- Host policy禁止plugin offer重开owner-only；非Owner reader经普通prompt夹带catalogSelection同样拒绝，普通共享历史读取仍保留。
- host/client真实tsc exit0；选定classification/policy回归4pass/0fail（50过滤未跑），两face真实lib已同步。T168-CHECK.txt、FINAL-BUILD.json。

## 编译/资源/聚焦证据（不以模型自述替代）
- 原生WorkspaceTypertGenerator仅生成3个变更namespace及writeWorkspaceArtifacts，exit0；native persistence catalog --check exit0。两required事件在`@mammoth-ai/mmp-session/types`正确augmentation并进入真实core/session lib，不标ignorable/不绕unknown。
- **FINAL-BUILD.json：74条精确tsconfig实际emit→目标host/client tsdown命令全部exit0**，包括locale与LiveShare双face。不是root files:[]假检查，也不是noEmit后用旧JS打包。backend另`tsc -p tsconfig.build.json`实际emit exit0。
- FOCUSED.json：13pass/0fail、100未选；临时JSONL租约/ownership/symlink、原生workspace并发及组合边界。
- BUSINESS-REGRESSION.json两相关文件28pass/0fail；**BUILT-BUSINESS-REGRESSION.json同28pass/0fail**：加载实际新gallery lib，真实native AgentLoop/最终request/压缩持久化/附件对象与文件读写；Ground账户/目录和cloud模型为明确脚本mock，非live账号或云端验收。
- T166-ACTUAL-REPORT.csv、T166-ACTUAL-DOCUMENT.json、T166-NATIVE-QUEUE.json记录真实fixture输入→输出→hash回读/队列证据；t160引用企业资料9项既有回归在两相关文件内仍通过。
- RUNTIME-MANIFEST.json：647个实际JS/CSS/JSON hash、13项关键静态检查全true，包括native事件、deny hook、remote selection/delete codecs、LiveShare owner-only、UI设置/选择链、t150 opaque CSS源hash保持。

## DB与文件保全
- 唯一非破坏migration：`ground/apps/backend/prisma/migrations/20261107135000_catalog_user_preferences/migration.sql`；schema同目录上级。独立OfficialCatalogPreference表，tenant/user/kind/resource引用不复制包；prisma migrate deploy/generate已exit0。最近由实际Native准备使用后服务器记时间，late callback expectedScope/user重检。偏好最多返回256个私有引用，公开卡片仍20服务端分页。
- fresh BEFORE/AFTER六表所有字段逐行hash一致，DB/RESULT.json preserved=true/mismatches=[]：46专家＝22published＋24draft，47versions，115enabled skills/115packages，44links、14grants。未启用/发布草稿，未改正文/license/revisions/旧snapshot；不是沿用旧计数。
- SOURCE-FILES.json列具体source/test文件及hash（受限目标内、本次baseline后改动）；SOURCE-BEFORE/SOURCE-AFTER保存选定旧WIP对照。生成运行资源另见RUNTIME-MANIFEST；未reset/revert/覆盖旧WIP。

## 核心文件定位
- Ground `apps/backend/prisma/schema.prisma`及上述migration，`apps/backend/src/official-agent/{catalog-preference.controller,official-agent.module}.ts`，只读保全脚本`apps/backend/scripts/gallery-business-preservation.mjs`允许独立evidence目录。
- M native `core/session/src/known-event-types.ts`/native生成catalog，`core/tools/src/index.ts`仅deny定义钩子；`session/session-persistence{,-jsonl}/src/index.ts`、`workspace/workspace/src/index.ts`。
- M remote `api/session-controller/src/{index,types,commands,agent}.ts`/client sessions contract/manager，`api/workspace-controller/src/{types,commands}.ts`及原生codecs/schema工件。
- M Host `preset/official-agent-gallery/src/{index,task-composition,skill-provider,managed-runtime}.ts`。
- M UI `ui-workspace/src/client/task-data.tsx/.module.css`、navigation/sidebar/locales；ui-settings契约与ui-settings-general；ui-conversation的input/draft/contract/service/apply；ui-official-agent-gallery的task-catalog.tsx/.module.css、GalleryPage.tsx、GallerySourceLabel.tsx/locales；其它locale-only目标LOCALE-PACKAGES.json。
- LiveShare `experimental/liveshare/src/endpoint-classification.ts`、`host/viewer-access-policy.ts`与对应最小分类/policy回归。

## 未验/限制与用户加载要求
- 未跑浏览器/视觉/E2E/全仓build/广泛测试/他人QA或review；未真实登录执行收藏/删除/恢复RPC、未实跑cloud；用户仍需点检窄窗键盘/租户切换/真实任务流程。临时fixture使用最小真实native standard，不代表所有生产standard插件均已验。
- 普通standard保留原生策略，不自动扩大为受管权限；managed专家/skill只开现有受控文档对象能力。无通用OS sandbox/新可信Host握手/任意shell network开放；deny-only工具定义钩子不是授权扩容。
- 未提供任意目录/Host恢复迁移和共享对象GC；预算不足/撤权/缺解释器阻断，取消不宣称撤销已发生外部副作用。此等限制不是“全部真实执行关闭”，真实文档产物路径已fixture跑通。
- lib/codecs/CSS已同步；本轮未kill/restart用户进程。**backend若watch未重载请用户重启backend；DevHost/客户端重开或重启以加载runtime/codecs，Web完整刷新**。迁移已应用无需手工重复。
- 不commit/push/publish、不联系同事、不开始新scope；等待用户点检，不称稳定/已验收。
