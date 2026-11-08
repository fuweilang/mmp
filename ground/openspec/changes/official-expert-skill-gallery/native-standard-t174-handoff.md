# t174 原生standard恢复 — 已实施/窄验证，未云端或视觉验收

先停止t170/171：停止前7个source/test文件已有落盘，2个目标tsc emit曾执行，旧测试exit1；没有继续修它们、没有将其新bundle上线。PAUSED-T170-T171.json逐文件hash确认本轮未再改。无用户任务/DB操作。

已拆除：gallery对tools.definition可见性的allowlist、全体tools.guard/pre-execute受管限制、managed document-only prompt、自造create_document/read_uploaded_text/read_skill_reference的运行注册、阻止原生AGENTS/runtime context与其它skill provider的deny钩子、替换persona前后缀/抑制runtime context的旧专家安装、llm/stream受管拦截及llm-ground最终wire工具白名单/重复budget拦截。相应core/tools、agent-instructions、skill、Ground adapter上的自加seam定点移除；不是增加几种工具到白名单。

新专家/技能任务直接mount原生standard，role/method仅追加context，原生prompt/files/bash/工具集合与权限仍由Harness本身提供。普通新任务null选择直接走native，不创建gallery wrapper/attempt事件，也不额外查目录账号。原生preset/mode定义、审批/沙箱/权限选择/云超管resolved路由未更改；隐藏的是terminal的preset创建/选择菜单与设置section，旧任务mode不强制转换。专家/技能标签、选择、版本和广场/Admin均保留。

旧composition/attempt/artifact/receipt event schema和reader保留required兼容，不改旧日志。旧profile只用于历史解析/skill pin，不再决定工具白名单；历史artifact下载保留owner/hash核验。自造文档写工具已撤销，不为旧日志重建文件。模式定义在packages/bundle/web-app/presets/，本轮未改任何patch。

证据：SOURCE-NATIVE.json与BUILT-NATIVE.json各4pass/0fail。普通/专家/技能三条路径真实native AgentLoop+tool-fs+tool-bash+LocalSubprocessRuntime+原生FsSandbox，在独立temp目录实际write/read、pwd/ls、printf；原生read-only后write真实拒绝。NativeAGENTS及其它skill provider恢复读取。实际GroundLlmAdapter序列化最终wire保留完整已挂原生工具集合，而非库里有但wire又过滤。模型与Ground HTTP均明确mock；AUTO由原云端路由处理，不冒称live云验收。第四项实际compressed持久化dispose/resume保留旧composition且继续native tools。

六个变更包12条实际emit/bundle命令exit0（BUILD.json），runtime hash及限制消失检查RUNTIME.json；native persistence catalog --check发现文档/schema stale后用原生生成器同步并再次通过，未忽略未知event。没有改DB/启草稿/115正文/用户日志。全量原生standard其它插件未逐个业务实跑，无全仓build/浏览器/E2E。

本阶段已完成后才开始t175 ＋菜单修复，不重启或kill用户服务。用户需重开DevHost/客户端并完整刷新Web以加载native runtime；后续t175同流结束一并交付。历史managed-only acceptance tests不再代表当前原生产品契约，不把其旧白名单期望作为通过标准。


## t175 后续＋菜单 — 已修复与窄验（t174完成后顺序实施）
实际原因为新catalog contribution伪造CommandRegistry/SessionFace类型：原生CommandUi传入仅sessionId的ClientSessionContext，available却调用session.getSnapshot()。真实Cordis＋输入栏＋InputTrigger/CommandUi/Slots组合中复现三次TypeError并导致整个候选请求失败，故连企业资料也不展示。不是根据DI猜修。

只定点修改task-catalog.tsx：改用原生CommandUiContract，按sessionId取真实sessions.binding(...).session快照，缺binding不展示。补已有workspace ui-commands的type依赖/reference/lock importer，不安装或升级任何依赖，不改menu/权限/native tools，不改文字草稿机制。＋仍使用项目现有combobox菜单；专家/技能选择、可取消tag以及引用企业资料metadata保持。

最终源码窄验14pass/0fail（菜单3项+既有资料/草稿11项）；实际lib/client.js通过原生ClientModuleSystem注册/物化后，同一交互3pass/0fail。覆盖点击＋显示三个候选、专家+技能选择、tag取消、真实Session.prompt边界收到原文本+精确refs、移除后下次两null、资料选择和取消不污染文字。Session prompt、目录/知识HTTP为fixture，不是云端业务/真实登录/browser点检。没有删除/归档用户任务。

目标tsc exit0。起初root-filter构建exit0但client仍旧，built交互真实发现，随后用package-local client-face tsdown重新构建exit0，actual lib已包含binding lookup且旧getSnapshot错误消失，built3项通过；没有用refresh掩盖旧资源。T175-RUNTIME.json逐项hash源码/真实lib与命令，T175-SOURCE.json/T175-BUILT.json保留结果。首次补强原生类型时缺project reference的失败tsc自生成84个散落JS/d.ts/map已逐一按时窗+匹配TS源+untracked条件挪到tsc-stray-emit-backup保全（无删除用户文件）；reference已修复，没有遗留到src。

现在只读DB复核：DB/RESULT.json对比另存的t166 BASELINE，6表全部hash相同、mismatches=[]；当前46专家=22published+24draft、47versions、115enabled skills/115packages、44links、14grants；无DB写或新migration。t170/t171七个暂停source/test hash仍相同，不续修/不宣称已交付。详细before/after hashes见本证据目录DB文件。

最终需用户重开DevHost/客户端并Web完整刷新加载已更新host/client runtime；本执行未kill/restart其进程。真实云端账号任务、Web/desktop视觉与全部原生插件组合仍待用户环境验收。t174恢复原生能力和t175菜单修复已经完成针对性源/构建验证，不代表此前五项或暂停删除归档问题全部完成。


## 本轮source/原生生成文档文件（相对mammoth-agent）
- `packages/preset/official-agent-gallery/src/index.ts`
- `packages/preset/official-agent-gallery/src/managed-runtime.ts`
- `packages/core/tools/src/index.ts`
- `packages/context/agent-instructions/src/index.ts`
- `packages/skill/skill/src/index.ts`
- `packages/llm/llm-ground/src/index.ts`
- `packages/llm/llm-ground/src/adapter.ts`
- `packages/client/ui-agent-preset/src/client/index.ts`
- `packages/preset/official-agent-gallery/tests/native-standard.spec.ts`
- `docs/persistence-catalog.md`
- `docs/persistence-catalog.zh.md`
- `docs/persistence-catalog.i18n.yaml`
- `docs/persistence-schema.json`
- `packages/client/ui-official-agent-gallery/src/client/task-catalog.tsx`
- `packages/client/ui-official-agent-gallery/tsconfig.json`
- `packages/client/ui-official-agent-gallery/package.json`
- `pnpm-lock.yaml`
- `packages/client/ui-official-agent-gallery/tests/task-menu.client.spec.tsx`

真实运行lib/资源逐文件hash另见RUNTIME.json、T175-RUNTIME.json；不是将整个WIP diff说成此次新增。ground只写上述交接和证据目录，无业务源码/DB变更。
