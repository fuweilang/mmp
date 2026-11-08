# t160：引用企业资料收进＋菜单（非知识库业务重设计）

## 最新交付
按t160取代t159的常驻checkbox建议。Web/客户端共享输入区默认没有“企业知识库”按钮或checkbox；沿既有＋→command source→CommandUiRuntime加入“引用企业资料”可勾选行，选中后才显示24px高、12px字、8px圆角的小tag，×取消并恢复输入焦点。菜单用现有列表/键盘/关闭生命周期，checked与键盘highlight独立，不新建平行弹层。×会关闭正在打开的候选菜单，重开时按当前Session状态重读勾选，不留下旧checked。

t155只有只读命令、未有删除落盘；本轮开头确认原按钮/前缀parser/CSS仍在，BEFORE.json留证，所以无需恢复删除，更没有git restore/reset/revert覆盖WIP。本轮直接替换原入口。

## 数据流契约（已实现）
- `DraftSnapshot.enterpriseKnowledge?: boolean` 是每Session草稿选项，缺省off；存原有conversation draft storage，不新增DB表/迁移。不改问题、selection或editor revision，不写任何可见/不可见控制前缀。
- InputState发布当前选项；InputActions.setEnterpriseKnowledge修改。现有＋菜单通过可选checked回调读取同一shell；tag通过同一动作取消。冻结发送阶段拒绝新toggle，不让发送中的question/option混合。
- Enter时与text/references/attachments一起原子捕获boolean+knowledgeRevision到SubmitAttempt；异步reference序列化、检索和消息准入均沿该attempt。成功才清本次选项，generation防迟到回执清掉新草稿的新选择；失败保留。快速重复发送沿原生单attempt门禁。
- Hub只在显式boolean为true时调用原有enterpriseKnowledgePrompt，不再解析文本`【企业知识库】`。不选、取消、或手写旧标记不会触发检索。旧草稿无来源证明，原文保留，不自动清理/猜测迁移，也不改历史消息。
- 检索依旧是同一Host代理、同一tenant/member权限后端、最多8片段、同一引用要求；无命中/鉴权失败/服务失败处理保留。内部模型消息仍按原流程附加证据，未新造隐藏上下文协议或改写已有会话展示/日志。
- 按原来workspace选择流程搬移整个草稿时选项随该草稿搬移，并清原Session选项；普通切会话各自保留，不串状态。
- 没有动后台知识库管理、文档、索引、权限、模型、Host凭据代理、旧专家enterprise_knowledge工具或数据；未读取DB/私人文档/凭据。

## 源码清单
M = /Users/fuweilang/Documents/code/mmp/mammoth-agent
- `packages/client/ui-conversation/src/client/contract/{draft-editor.ts,input.ts}`：可选草稿/attempt元数据及动作。
- `.../draft.ts`：旧string与structured draft兼容、metadata持久化codec。
- `.../input/{facade.ts,machine.ts,hub.ts,enterprise-knowledge.ts}`：捕获/成功清理/失败保留；按flag检索；去掉前缀开关导出。
- `.../apply.ts`：沿现有File action注册方式加company-materials action；workspace draft移交选项清理。
- `.../skeleton/{InputBar.tsx,InputBar.module.css}`：去常驻按钮、只选中才显示轻量tag；取消/焦点/窄宽截断。
- `.../locales.ts`：八语“引用企业资料”和取消文案。
- `packages/client/ui-commands/src/client/{contract.ts,service.ts}`：可选checked与preserveDraftOnMenu；只该action不消耗当前编辑选区，其他命令行为默认不变。
- `packages/client/ui-input-trigger/src/{types.ts,client/MenuView.tsx}`：可选checked展示、aria-checked与勾选图形；现有列表不另造菜单。
- `ui-conversation/tests/{company-materials.client.spec.ts(新增),input-bar.client.spec.tsx}` 与 `ui-commands/tests/service.client.spec.ts`：本需求窄回归。

## 有界验证/资源同步
三个相关包分别 `./node_modules/.bin/tsc -p packages/client/<package>/tsconfig.json`，最终均exit0；每个包目录分别执行 `../../../node_modules/.bin/tsdown --env.MMP_BUILD_FACE client --no-clean --logLevel error`，均exit0。真实lib/client.js与map已同步，RUNTIME-MANIFEST记录六份文件SHA及八条static检查。无Remote参数/descriptor变化，不需要重建Host协议。

聚焦命令：`vitest run packages/client/ui-conversation/tests/company-materials.client.spec.ts packages/client/ui-conversation/tests/input-bar.client.spec.tsx packages/client/ui-commands/tests/service.client.spec.ts -t 'company materials' --maxWorkers 1 --reporter=json --outputFile=.../FOCUSED.json`。
**11 pass / 0 fail，其余207条被过滤未跑，不是全套验证。** 覆盖：默认off/手写旧标记不触发；选中后一次检索且最多8段；取消不改问题且不检索；检索失败保留/不发送；无命中提示；同Session草稿持久化及另Session隔离；成功准入之后迟到receipt不清新草稿/新勾选；Host拒绝保留；连续两条不串开关；默认无常驻控件与tag取消且caret/revision不变；真实菜单checked按Session重读且不消耗编辑选区。真实InputHub/Shell/CommandUiRuntime与jsdom组件，**HTTP/账号与最终Session prompt明确mock**，不是实际云模型/桌面端到端验收。

本轮不跑browser/E2E/全仓build/QA/review；未进行真实视觉验收，无已核实可供box浏览器访问的URL。父/用户可在原有Web或客户端已登录会话：输入普通问题→＋→引用企业资料→检查小tag与输入原文→×取消→再次选择发送。不能据静态检查称视觉已经验收。

## 保全与刷新
同目录`enterprise-reference-t160-evidence/`有BEFORE/FOCUSED/RESULT/RUNTIME-MANIFEST。本轮再次对照t153 manifest，8份session/gallery/descriptor工件SHA全部不变；没有碰t150 GalleryPage/弹窗源码或其UI包，也没改t149执行边界。

三包资源已最新；请完整刷新Web，并重开开发客户端/DevHost以排除旧模块/资源缓存。未代重启或杀用户进程，无后端/DB迁移要求。开发过程中仅结束本代理一个挂起的只读文件名查询shell（不是用户dev/Host）。未commit/push/publish/clone/cloud，不启用专家，不重设计KB业务。完成后等待用户点检。
