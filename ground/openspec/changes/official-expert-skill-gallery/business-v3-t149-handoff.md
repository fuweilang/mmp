# t148/t149 可用业务闭环：受管文档执行，不是解除全部门禁

## 真实结果与边界
- 本轮把 `gallery-v2-closed-1` 的全拒绝改为 `gallery-v3-managed-documents-1`。**新**专家/显式技能均明确 mount 原生 standard，再追加冻结角色/方法；不是只放开咨询聊天：原生工具能够读取本会话已准入的 UTF-8 上传，真实写入、回读验真并下载受管文件。
- 开放四个工具：`skill`、`read_uploaded_text`、`create_document`、`read_skill_reference`。输出 Markdown/TXT/CSV/JSON；无任意路径、覆盖、Shell、MCP、子任务、安装、生产、发送/付款或任意网络能力。没有声称支持 PDF/Office 渲染或115技能的全部外部依赖。
- 上次 Seatbelt shape 的 outsideReadSucceeded=true 仍成立，**未**因本轮变成完整沙箱。新路径根本不把这些任意执行器提供给模型；保留旧工具注册与宿主权限机制，当前原生 tool guard/pre-execute 额外约束定义身份、Agent、父调用和现行资源可用性。无宽泛确认按钮可以越过它。没有实现/宣称完整可信Host握手、跨OS句柄隔离、单审批并发消费；对应危险入口不开。
- 普通未绑定标准会话不修改组合/工具。旧专家/技能内容不改、不给旧会话追加新文档工具；可在其旧工具上限与当前授权内继续，危险工具仍拒绝。新文档路径需另建新会话。未知/损坏组合仍可能拒绝恢复执行；未做旧历史UI集成验收。

## 八任务状态（不是8/8全功能验收）
|任务|状态|交付|
|---|---|---|
|一 字段/兼容/保全|本轮保留+fresh核对|沿t146字段/迁移，本轮无migration/DB资料写入；六表全字段hash相等。|
|二 安全范围|受管对象路径实现并聚焦验证；任意执行仍blocked|Session所属附件、不可覆盖新对象、内容地址/字节/hash校验、配额与并发序列化、guard身份；隔离私有AGENTS和本地技能provider。|
|三 Admin详情|保留t146实现|未改Admin源码/默认10/原ZIP/图标/关联资料；未浏览器点检。|
|四 public白名单/分页|保留t146实现|原后端published/enabled范围、public20、详情API不改；新增Host会话级产物download Remote，不是Admin详情暴露。|
|五 双端入口/来源|已接通并同步共享资源|旧卡片详情/独立CTA/starter保留；输入/头部读真实运行projection；输入区提供最近已保存产物的受权下载。未浏览器点检。|
|六 standard/加载|受管v3实现，native业务夹具通过|显式mount standard，角色追加；显式技能在native assemble期间宿主装载，首次业务LLM前校验冻结hash/正文/预算；Ground实际post-budget body再次核对。|
|七 receipt/cancel/产物|受管路径实现并聚焦验证|真实准备/获取/context/running及原生turn终态；迟到终态不复活；文档callId不可变幂等、对象读取校验及下载。外部副作用/审批状态机未开放亦未假造。|
|八 资源/证据|本轮允许范围完成|5相关包有界tsc、Host/native及共享client bundle、单包Typert；9项窄运行检查通过；未全build/E2E/browser/QA/review/live云验收。|

## 调用链与当前能力
`GalleryPage` 独立按钮 → 官方 gallery create/createSkill Remote → 现行Ground card/resolve/begin session → 本机当前Host `agents.create`（先写composition v3，显式standard mount）→ 冻结绑定/会话级provider → native system-prompt assemble屏障 → native AgentLoop final-request → mammoth-ground adapter实际budget后的序列化body屏障 → 原生tool executor → Session所属AttachmentStore对象 → scoped download Remote → UI Blob下载（SHA256重验）。

- 新composition版本3/profile managed-documents；不使用旧设计稿中的未实现v2标记。普通standard不写该标记。mount/绑定失败不启动任务，沿原生create错误释放和attach失败dispose路径；未实现单独孤立对象TTL回收器。
- explicit skill 绑定时冻结id/key/revision/raw SHA256；正文由Host第一次业务assemble主动 `skills.get`，而不是等模型愿意调用。native assemble在pre-step前，因此屏障必须修改**当前assembly**；只改下一步section会漏首请求，本轮真实测试发现并已修复。
- 专家关联技能首次按需加载；prepare receipt保存key/revision/hash。恢复后已用方法须按旧revision重载并对照历史hash；之后每个业务request重新检查最新system正文与保守预算，不用旧历史system假通过。辅助LLM只允许云端无工具推理，不伪装为业务method loaded；完整native compaction/resume/fork端到端仍未跑。
- 云池无效sticky/default id回有效preferred或AUTO，不请求下架旧id；空目录拒绝；云不可达不回本地/BYOK。原适配器post-budget最终wire额外事件 `llm-ground/before-send` 在loggedFetch之前校验，原生request指纹与wire指纹以boundary区分。
- 安全策略层级不由包改动；原标准persona/安全工具指导保留，专家角色/skill文字不得改Host、授权或模型。包reference仅allowlist文本，路径/大小/数量限制，私有目录0700、文件0400，不执行scripts/hooks。
- 由于standard原生会自动读取AGENTS及本地skill目录，增加两个默认不干预普通会话的授权hook：`agent-instructions/authorize` / `skills/provider-authorize`。注意Cordis bail忽略false，deny使用字符串；聚焦测试证明managed会话私有provider读取0、私有AGENTS sentinel不进入最终请求。
- 工具注册和授权分离：mask只限制继承工具（scoped本地工具不在restrict名单）；guard再核对捕获的真实ToolDefinition身份，拒绝同名skill shadow与父执行。
- 输入文件来自原生API的Session-owned upload receipt，不能提交任意client path（session-controller commands.ts:298–351,556–575；client/file-upload/src/index.ts:57,189起）。本轮业务夹具直接合成已准入user/message，不声称跑过真实浏览器上传HTTP链。
- 上传文本上限128KiB，读取/下载对象上限1MiB；输出单个512KiB、会话总4MiB；仅md/txt/csv/json。输出与callId绑定name+hash，单会话队列防并发重复/配额竞态；JSON做JSON.parse。文件实际native sha256:附件ID、bytes和回读hash均校验。
- 产物hostInstance是当前进程生成的关联ID，**不是**新增可信Host签名握手。沿既有认证Remote/Session授权，不宣称实现新的tenant/user/workspace expiry grant体系。下载检查当前Ground可用性和本Session对象归属。现有文件保留策略沿用，没有新增TTL；UI当前仅提供最近产物快捷下载。
- UI状态是bound/preparing/fetching/prepared/context_loaded/running/原生turn终态，不显示“技能执行成功”；context_loaded不代表模型遵从。事件保留session原生seq、attempt/turn/step/generation/eventId/hash；不是方案全文的完整统一tenant/task/approval envelope。取消后已提交文件仍如实保留，不能假称撤销。
- 模型处理在云；执行/存储在当前连接Host。Web Host可能服务端，不能读浏览器任意磁盘。没有跨Host迁移、全OS网络隔离或危险权限开放。

## 聚焦运行证据（真实与mock分清）
`FOCUSED-TESTS.json`：**9 passed / 0 failed**。运行真实Cordis、原生AgentPresetRegistry.mount、AgentLoop、工具执行器、AttachmentLocal（独立临时根目录）、回读/下载。Ground HTTP身份/资源回复、模型决策均为明确mock，不是线上云模型/真实用户权限集成。
1. 技能：真实已存入的CSV → native read_uploaded_text → mock模型发create_document → 真实report.csv → 原生下载回读/SHA；首个业务request含完整冻结方法与standard base。
2. 专家：standard base+角色追加 → native skill按需读取 → create_document真实expert.md → 下载回读；普通standard仍能发送完成。
3. 冻结正文损坏：业务adapter调用数0，真实失败终态。
4. 任意工具/../文件名/物理存在但未准入的附件拒绝；本地provider/丢正文/超限拒绝。
5. 并发同callId同参数只一个对象；同callId改参数拒绝。
6. 原生cancel后迟到completed不能复活；后续新turn新attempt完成。
7. 旧历史system有方法而最后system缺失、post-budget方法截断、wire多出bash均拒绝。
8. **实际GroundLlmAdapter+body-budget+SSE parser** 使用mock HTTP：wire指纹对应实际发送body，已删除model sticky替换active cloud fixture；缺方法时POST计数不增加。
9. 继承skill的同名scoped shadow被拒，替身execute调用0。

可审计文件：`FIXTURE-SKILL-REPORT.csv`、`FIXTURE-EXPERT-REPORT.md` 是上述真实工具/存储生成后下载出来的文件，不是另写脚本冒充工具结果；模型仍为mock。相应SKILL/EXPERT-BUSINESS-EVIDENCE.json与WIRE-EVIDENCE.json标明mock边界与输出hash。不拿这组结果宣称真实云账户已跑通或全体115技能稳定。

## 编译/资源/数据
最终命令均exit0：
- `./node_modules/.bin/tsc -p packages/{skill/skill,context/agent-instructions,llm/llm-ground,preset/official-agent-gallery,client/ui-official-agent-gallery}/tsconfig.json`（分别执行五个有界项目）。
- 单包WorkspaceTypertGenerator generate官方gallery host；最终generated `agent:officialAgentGallery/downloadArtifact`存在。
- 根tsdown精确filter上述5包、`--no-clean`（读取workspace配置但仅5包实际build）；UI目录 `tsdown --env.MMP_BUILD_FACE client --no-clean`；最后Host精确单filter同步。没有mono build。
- `MMP_GALLERY_EVIDENCE_DIR=.../business-v3 ./node_modules/.bin/vitest run packages/preset/official-agent-gallery/tests/managed-business.spec.ts --maxWorkers=1 --reporter=json --outputFile=.../FOCUSED-TESTS.json`。
- `node apps/backend/scripts/gallery-business-preservation.mjs --capture`（改前）；无--capture（改后）均0。
注意：第一次`pnpm exec tsc`在添加3个既有workspace服务依赖后意外触发pnpm自动workspace relink/postinstall（日志0新增下载、400 workspace）。随后一律直接node_modules二进制，没有主动升级第三方依赖/改tsconfig lib。manifest新增attachment/agent-preset-registry/agent-instructions peer+dev及项目refs；保留自动lockfile增量，不reset。

fresh before=after：46专家(22published/24draft)、47版本、115启用技能/115包、44links、14grants；**全字段**hash纳入discoveryDetail，不沿t146排除新列；RESULT preserved=true、mismatches=[]。本轮migration=无，DB写入=无。BASELINE/RESULT/SOURCE-BEFORE/RUNTIME-MANIFEST见business-v3目录；不是引用历史值。

## 实际改动文件
M/packages/preset/official-agent-gallery/src/{admission.ts,index.ts,managed-runtime.ts(新增),skill-provider.ts,types.ts}
M/packages/preset/official-agent-gallery/{package.json,tsconfig.json,tests/managed-business.spec.ts(新增)}
M/packages/skill/skill/src/index.ts
M/packages/context/agent-instructions/src/index.ts
M/packages/llm/llm-ground/src/{adapter.ts,index.ts}
M/packages/client/ui-official-agent-gallery/src/client/{index.ts,GallerySourceLabel.tsx,GallerySourceLabel.module.css,locales.ts}
M上述5包对应lib/types、lib/index.js；gallery lib/typert.{host,remote-client}资源；共享UI lib/client.js/map；pnpm自动workspace lock增量（未回退其他WIP）。
G/apps/backend/scripts/gallery-business-preservation.mjs(新增)
G/apps/backend/src/official-agent/assets/managed/business-v3/*
G本change的design.md/tasks.md/specs/managed-skill-sessions/spec.md及本handoff；t146 handoff只追加superseded链接，不覆写历史证据。

## 未验与用户点检
- 没有真实登录账户的云LLM/HTTP鉴权、完整生产standard全部插件装配、三Host拓扑、实际网页上传/下载点击、真实compaction/resume/fork、OS shell/network、危险审批竞争验收。没有读凭据、造token或假冒用户；若需真实云任务，请父协调用户在原登录DevHost使用上述最小CSV任务，或提供原生正常会话验证入口，不绕鉴权。
- 五包资源最新但运行中的Host仍缓存旧ESM；**用户按原方式重启DevHost，再刷新Web/客户端**。没有杀/重启用户进程。后端本轮代码未改，无新迁移，已运行的t146 backend无需因本轮重建；若仍旧后端必须按原步骤加载已有t146资源。
- 点检建议：分别新建专家/技能会话，填草稿后手动发送；上传小CSV并让其生成csv/md，看到真实context状态、tool步骤与下载；普通standard再发一次；缺权限/停用/损坏应明确失败不降级。此为待用户实际验收步骤，不是已完成验收。
- 没commit/push/publish/启用草稿/改115正文license/revision/旧snapshot；未调用同事/QA/review/browser/E2E，不自动开展其他任务。

## unblock research（不是安全证明）
已按unblock-research查记忆、公开官方security资料与公开社区用法；可复用结论是缩小到受管对象/明确权限，不把所有业务堵死。参考https://cursor.com/docs/grok-bot/security；未找到能替代本项目跨OS强制隔离的现成保证。实际边界以本轮native工具/对象证据为准。

### 最终补充验证
相同9项用例另以 `MMP_GALLERY_TEST_BUILT=1` 改用**实际已构建Host lib/index.js**再次全部通过，结果FOCUSED-BUILT-TESTS.json（最终9/0），不是仅源码验证。最后收口可移植输出文件名（禁止设备名/保留字符/过长UTF-8），重复call回读原对象后才返回。Host重新有界编译/同步，运行manifest已刷新；DB再次六表保全通过。Ground/LLM仍mock，不因此声称真实云账户已验。
