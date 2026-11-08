# Tasks

## 1. OpenSpec 映射表

- [x] 1.1 新建 change `official-agent-gallery-import`（proposal/design/tasks）
- [x] 1.2 固化 20 个映射到 `assets/index.json`（key/名称/类型/KB/可迁/批次）
- [x] 1.3 写明字段映射与非目标

## 2. Ground 导入草稿通路

- [x] 2.1 批次 A 资产落入 `src/official-agent/assets/`
- [x] 2.2 幂等 upsert 草稿（按 key；不覆盖已发布管理员内容）
- [x] 2.3 Admin import API + 本地脚本；发布仍走现有 publish

## 3. 批次 A 上架

- [x] 3.1 导入并发布 mammoth / c3274112ed041
- [x] 3.2 华为试点 ACTIVE grant（固定 version_id）
- [x] 3.3 保留润色/答疑不动

## 4. 广场展示对齐

- [x] 4.1 确认 publicCard 露出 openingQuestions
- [x] 4.2 卡片展示 name/summary；无图用占位/首字

## 5. 开聊验收

- [x] 5.1 华为账号广场可见批次 A 两卡
- [x] 5.2 resolve + 模型回复；证据 `/tmp/mmp-gallery-batch-a/`


## 验收记录（2026-11-06 Asia/Shanghai）

- 导入脚本：`node scripts/import-official-agent-assets.mjs --publish-batch-a --grant-huawei`
- mammoth versionId=`cmw41rwg90008gtksi45r79q1`；命名大师=`cmw41rwfn0002gtksr2teey2m`；华为 ACTIVE
- 华为员工 13900001002：list 4 卡（含批次 A + 润色/答疑）；resolve + chat/completions PASS
- 证据：`/tmp/mmp-gallery-batch-a/`

## 6. 批次 B：9 个通用内容向上架

- [x] 6.1 growth/sifu/xhs/live/copy/pyq/video/trans/qc 补真系统提示词（550–670 字，各含角色/追问假设/步骤/格式/合规边界）+ 3 条开场问题，toolScope=[]
- [x] 6.2 导入脚本新增 `--publish-batch-b`；幂等，PUBLISHED 不覆盖
- [x] 6.3 发布 v1 + 华为 ACTIVE grant（固定 versionId）
- [x] 6.4 华为 list 13 卡；9 个 resolve PASS；xhs/live/qc/growth chat PASS；证据 `/tmp/mmp-gallery-batch-b/`
- [x] 6.5 Dev 开聊绑定核查：根因为卡片按钮同名致自动化点到首卡；加 aria-label/data-agent-key + 单测

versionId：growth=cmw47t9xv0008gtbtah3obdd6 sifu=cmw47t9yz000wgtbtjvddh9vu xhs=cmw47t9zr001egtbtw2y705ft live=cmw47t9y5000egtbtzan8gqpl copy=cmw47t9xe0002gtbt296w9v8j pyq=cmw47t9yg000kgtbtkwm2mst7 video=cmw47t9zi0018gtbtmm3c6g03 trans=cmw47t9z70012gtbt7xeil39g qc=cmw47t9yp000qgtbtjdpy9zku

限制：无联网/工具；提示词为产品自撰（latest 仅一行 roleDesc）；未做 Dev 重启 UI 复验；avatar 仍首字占位。


## 7. 工具对齐（联网 web_search）

- [x] 7.1 盘点：Host 官方会话仅放行 `enterprise_knowledge`；Harness 有 `web_search` 包但需桌面密钥；Ground 原无搜索；latest 有多源 SearchService（需独立 key）
- [x] 7.2 复用平台已配置 DeepSeek 厂商 Key，Ground `POST /official-agents/:id/search` 代理 `https://api.deepseek.com/v1/tools/search`（密钥不下发桌面）
- [x] 7.3 Host `toolScope` 放行：声明 `web_search` 才注册/执行；未声明与未知工具拒绝
- [x] 7.4 仅猛犸 AI 发 v2（toolScope=`["web_search"]`）并**显式**升级华为 grant；其它智能体仍 `[]`
- [x] 7.5 定向测试 + 真机矩阵：Host 13/13；Ground 搜索 200/8 hits；命名/润色/猛犸 v1/小米均为 403
- [x] 7.6 证据 `/tmp/mmp-gallery-tools/`；数据分析师/竞品仍缺专用工具不上架

versionId：mammoth v2=`cmw4dtv550001fqc678ly67ea`（华为 ACTIVE；旧 v1=`cmw41rwg90008gtksi45r79q1`）
provider：`deepseek-tools-search`

## 8. Admin 批量运营与审计

- [x] 8.1 盘点：单条 CRUD/publish/offline/grant/revoke、`POST import-assets`、三表与 per-op audit 已有；Admin 页仅单条；`/admin/audit` 已有但缺官方智能体标签与前缀筛选
- [x] 8.2 补批量 API：`GET asset-catalog`、`POST bulk-offline`、`POST :id/grants/bulk`、`POST :id/grants/bulk-revoke`；import 返回 summary/errors（未知 key）
- [x] 8.3 Admin UI：多选批量下架、导入资产对话框、多企业开通/批量撤销、运营审计抽屉；完整审计页支持 actionPrefix / 官方智能体过滤
- [x] 8.4 审计标签写入 `@mammoth/shared`；meta 不含 systemPrompt；读侧脱敏加强
- [x] 8.5 临时智能体演练 import/publish/bulk grant/revoke/offline + 成员/企业管理员 403；清理后仍 13 卡；证据 `/tmp/mmp-gallery-admin-ops/`

测试：`node --import tsx --test test/official-agent-admin-bulk.api.test.ts` PASS；真机矩阵 16/16 PASS

## 9a. 全员可见公共目录（紧急修正，历史；执行策略已废弃）

> **历史记录**：当时只修「能看见」。其中 **9.3 / 9.5「执行仍按 ACTIVE grant / 权益」已被下方任务9正式决策废弃**，勿再当现行口径。

- [x] 9.1 `OfficialAgentService.list` 改为已发布公共目录；不要求企业上下文；附 `executionGranted`
- [x] 9.2 Host/UI：卡片类型与 Zod 接受 `executionGranted`；未开通提示「暂未开通」；错误文案区分登录失效
- [x] 9.3 ~~resolve/retrieve/search/create 仍按 ACTIVE grant；小米/平台工作区执行拒绝~~ **（已废弃 → 见任务9 §9.A）**
- [x] 9.4 五角色矩阵 API 验收 13 卡；公开字段无 prompt/toolScope；证据 `/tmp/mmp-gallery-public-catalog/`
- [x] 9.5 ~~用户拍板写入 design：全员可见，执行仍按权益~~ **（已废弃 → 见任务9；价格/套餐仍属第二阶段）**

根因（当时）：平台工作区 `GET /api/official-agents` → 400「请先选择企业」；前端一律显示登录异常。


## 9. 全员可用 + 官方知识库批次 C（任务9 · 现行）

- [x] 9.A 执行侧取消 ACTIVE grant 前置：已发布官方智能体对全体有效登录用户可 resolve/开聊；平台工作区可用；grant 表保留供第二阶段套餐
- [x] 9.B `executionGranted` 对已发布卡恒为 true；Host 仍保留未开通分支供未来定价
- [x] 9.C 新增 `official_kb_document` / `official_kb_chunk`（非企业私库）；按 agentId 隔离检索与出处
- [x] 9.D 迁入并发布 ip/gzh/niche/sell/method/interview；toolScope=`enterprise_knowledge`（Host 工具名，检索走官方库）
- [x] 9.E 验收 19 卡四角色；官方检索命中；跨 agent source 拒绝；企业私库不串；证据 `/tmp/mmp-gallery-official-kb/`

**现行决策**（覆盖 9a.9.3 / 9a.9.5）：第一阶段「能看见也能开聊」；套餐/单个定价第二阶段再做。


## 10. 高级能力智能体（data / spy / boss）

- [x] 10.1 能力盘点：缺 tabular / web_fetch / 编排；证据 `/tmp/mmp-gallery-advanced/INVENTORY.md`
- [x] 10.2 Ground `tabular_analyze`：CSV/JSON 确定性汇总/分组/IQR；拒路径与公式；API `/analyze-tabular`
- [x] 10.3 Ground `web_fetch`：公开 http(s)、防 SSRF、限大小；API `/fetch-url`；与 `web_search` 组合
- [x] 10.4 Ground `delegate_official_agent`：单层 allowlist 委派；子工具服务端执行；深度=1；禁递归 boss
- [x] 10.5 Host official-agent-gallery 按 toolScope 注册三工具；定向单测
- [x] 10.6 资产批次 D：data/spy/boss 导入发布；广场 22 卡全员可聊
- [x] 10.7 验收矩阵：tabular/fetch/search/delegate/deny/chat；证据 `/tmp/mmp-gallery-advanced/`

versionId：data=`cmw4gyoq60006i8333269scyr` spy=`cmw4gyoto0049i833sasbmjyn` boss=`cmw4gyopj0002i8337oconzda`


### 10.8 复核修复（城市分组）

- [x] 根因：delegate→data 未传 groupBy；EVIDENCE 过度宣称
- [x] `goal→groupBy` 确定性推断 + 可选 API 字段（兼容旧客户端）
- [x] data v2=`cmw4h5epk0001i8omufs8r9zb`；boss v2=`cmw4h5eq50004i8omly0toiu4`
- [x] 程序断言证据 `/tmp/mmp-gallery-advanced/review-fix/`


### 10.9 Desktop UI E2E：重建 Host lib 前后

- [x] **pre-fix FAIL（保留）**：`/tmp/mmp-gallery-advanced-ui/pre-fix-archive/` — 广场可开聊 data/spy/boss，但会话工具未执行（DSML/`<tool_call>` 原文；spy 仅 web_search）。根因：Electron 加载的 `packages/preset/official-agent-gallery/lib/index.js` 旧包只注册 knowledge+web_search；src 已有三工具但未 bundle；Vitest 走源码故单测 PASS。
- [x] **重建**：`pnpm --filter @mammoth-ai/mmp-official-agent-gallery run bundle`；最小 TS 修复（`z.record` 双参、exactOptional 传参、`goal?`）；终止原 `dev:desktop`（PID45128 树），`tsx scripts/dev.ts --skip-build` 重启同 userDataDir；Ground3100/Web3080/5201 保留。
- [x] **post-fix PASS（校正）**：`/tmp/mmp-gallery-advanced-ui/post-fix/` — data 城市 140/90/160 总 **390**（brief 330 为算术误）；spy Example Domain + accessedAt；boss 总15/上海12/北京3 + 工具轨迹。versionId：data/boss v2、spy v1 如上 10.8。
- [x] **防回归**：改 Host gallery 包必须重建 lib 并重启 Dev；发版同依赖 tsdown 产物；勿把「源码单测」当成「Electron 已加载新工具」。


## 12. 一期最终全矩阵验收（跳过任务11套餐·第二阶段）

> 用户确认：任务11会员套餐/单智能体定价挪到第二阶段；本任务只验收第一阶段「全员可浏览可开聊」终态。本地开发，不 commit / push / 发版。

- [x] 12.1 四角色 list PASS（platform_super_admin/huawei_admin/huawei_member/xiaomi_member）；**platform_admin = NOT_TESTED**（无试点账号，未自建）
- [x] 12.2 全部 22 个 PUBLISHED agent：逐一 resolve + 真实 chat/completions（看 content，不缩抽样）
- [x] 12.3 官方 KB 六个（ip/gzh/niche/sell/method/interview）：retrieve 命中 + 真实 chat 出处；同 agent source 200；跨 agent source 404；企业私库不串
- [x] 12.4 高级工具：data tabular 正确 sum/分组；spy fetch example.com + 来源/accessedAt；boss delegate→data 真实 child
- [x] 12.5 拒绝矩阵：未认证 / OFFLINE / 版本不属于 agent / 未声明工具 / 私库跨企业
- [x] 12.6 Admin：临时 tmp-task12-* create→publish→grant→revoke→offline + import 未知 key + 审计 meta 无 systemPrompt；清理自造数据，不碰正式 22 卡
- [x] 12.7 测试门禁：backend official-agent suite + admin；frontend typecheck；host gallery suites + lib-bundle；业务工具包单测
- [x] 12.8 证据 `/tmp/mmp-gallery-final/`：SUMMARY.json failCount=0 才可标 PASS；OpenSpec 勾选与限制写入


### 12.9 验收记录（2026-11-06 Asia/Shanghai · 复核校正）

- 证据：`/tmp/mmp-gallery-final/` — SUMMARY **failCount=0**，但 **phase1FullReady=false**
- 角色：实测 4；platform_admin **NOT_TESTED**（不可宣称五角色 PASS / equivalence PASS）
- delegate：修复返回 `child.tabular.groupSummary`；程序断言 toolTrace tabular + 上海140 + 合计525
- KB：六卡 grounded chat（注入 retrieve）均引用真实文档名；gzh→「公众号改写知识库」
- EPA v18 正式提示词保留；该句是当时旧测试的表现。现已由 §12.11 改为专属 tmp agent，execution 测试不再写正式卡
- 任务11仍跳过；未 commit/发版；完整 ready 待 main 决定是否补 platform_admin 试点账号

### 12.10 UI 真机与 Admin 读屏（并行 executor · 2026-11-06 Asia/Shanghai）

- [x] **MMP Dev CDP**：广场 22 卡 `[data-agent-key]` 逐卡开聊；绑定 gallery version 对齐当时 `/tmp/mmp-gallery-final/agents-22.json`；含 niche/method/interview 真聊 + data/spy/boss 工具卡；**22/22 PASS**
- [x] **Web 3080**：华为成员 niche/method/interview/mammoth + 小米成员 niche/mammoth；Cookie SSO（不截密码）；无登录失效/manifest 红屏；**6/6 PASS**
- [x] **Admin 5201**：平台超管官方智能体列表/资产导入/运营审计读屏；华为企业管理员写操作 403；裸 Vite 5202 缺 `/admin/api` 代理（验收走网关）
- 证据：`/tmp/mmp-gallery-final-ui/`（SUMMARY.json failCount=0；EVIDENCE.md；shots/dev|web|admin）
- 版本策略：除 advanced 与 KB 已发布卡外按开跑 list 当前值；润色 summary 污染交隔离流恢复（预计 v6），本流未改正式 prompt / 未 publish
- 角色：与 API 流一致四角色实测；**platform_admin=NOT_TESTED**；未宣称五角色
- Dev 状态：Electron PID71604 CDP9222 仍在线；未清库、未发版、未 commit


### 12.11 测试隔离完成（backend executor · 2026-11-06 13:30 Asia/Shanghai）

> 本段只记录**测试隔离**落地；不覆盖 GUI §12.10；不宣称任务12 / 自动检索「全部完成」。method 等 KB 自动检索复核若仍由其他 agent 进行，以其证据为准。

- [x] 12.11.1 execution / admin API 改为专属临时 agent（`tmp-exec-*` / `tmp-admin-*` + 临时租户资料 fixtures）；**从现在起不写正式 EPA / 不写正式 22 卡**（取代旧表述「EPA 收尾自动还原」）
- [x] 12.11.2 `copy-polish-master` 公开恢复原 prompt/summary；online **v6** `cmw4j5nu000gei8bui4ckxutp`；华为 ACTIVE grant **仍钉 v1** `cmw3h03n60002gtu3f3c6j5zb`
- [x] 12.11.3 连续两次 formal22 快照 hash 不变 `8b1d7263…e7619`；tmp leftover=0
- [x] 12.11.4 gallery `tsc -b --force` prebundle + runtime lib smoke PASS
- 证据主目录：`/tmp/mmp-gallery-final-review/`（EVIDENCE.md / ISOLATION-REPORT.json）
- 当前公开 22 卡登记（只读快照）：`/tmp/mmp-gallery-final-current-agents.json`（**勿**把 `/tmp/mmp-gallery-final/agents-22.json` 当最新——彼时含 copy-polish **v5**，属历史点）
- 范围 caveat：`platform_admin=NOT_TESTED`；phase1 **scoped 完成 ≠ production full-ready / 五角色全覆盖**；未 commit / 未发版

### 12.10.1 UI KB 自动检索更正（2026-11-06 Asia/Shanghai）

- **问题**：Web method 案例曾「诚实未命中」——整句/`方法论·智囊`（间隔号）retrieve hits=0；UI 仅角色说明不算 grounded。
- **修复**：`lexicalQueryVariants`（official-kb + enterprise knowledge）归一化间隔号、问句切词 OR、CJK 滑窗；**未**改正式 PUBLISHED prompt、**未**注入 retrieve。
- **复核证据**：`/tmp/mmp-gallery-final-ui/review-method/`（BEFORE 保留；method 3/3 Ground `/retrieve` 200 + UI《方法论·智囊 v1.0》；niche/interview 同样自动 retrieve + 资料名）。
- Playwright 页面网络可能看不见 Host 出站 retrieve；以 Ground `http.finish` 日志 + UI 文档名/ID 为工具证据。

### 12.12 一轮收口（2026-11-06 13:50 Asia/Shanghai）

- [x] 12.12.1 正式公开目录当前 **22 卡、无 tmp 卡、无测试 summary**；copy-polish 当前 v6 与 §12.11 一致
- [x] 12.12.2 自动 KB 复核 §12.10.1 完成：method 3/3、niche/interview 实测有 Ground retrieve + 页面真实资料名；此前 UI 的「方法未检索」已修正，不能只靠人工注入的资料宣称自动检索
- [x] 12.12.3 Ground 3100 / Web 3080 / Admin 5201 / Dev CDP 9222 本地端口在线（首路径分别为 404 / 303 / 302 / 200，未把工作区登录跳转误记为服务故障）
- [x] 12.12.4 **在现有四个试点账号范围内，任务12功能验收完成**：API 102 PASS/0 FAIL、Dev 22/22、Web 6/6；自动检索复核 0 FAIL；测试隔离两轮 hash 不变/tmp=0
- [ ] **唯一矩阵未覆盖项**：platform_admin 没有试点账号，仍是 NOT_TESTED，不是失败也不等于通过。未获用户授权不新建账号，未来拿到账号只补此角色矩阵
- 复核证据：`/tmp/mmp-gallery-final-ui/review-method/`（含 `lexical-query.unit.log` 11pass）、`/tmp/mmp-gallery-final-review/`、`/tmp/mmp-gallery-final-current-agents.json`、`/tmp/mmp-gallery-final-ui/FINAL-REVIEW.md`
- 无 commit、无 push、无 PR、无发版；四类本地开发服务保留运行

### 12.13 lexicalQueryVariants 单测（2026-11-06 Asia/Shanghai）

- [x] `test/official-kb-query.unit.test.ts`：**11 pass / 0 fail**（`node --import tsx --test`）；export `lexicalQueryVariants`（official-kb + enterprise）；证据 `/tmp/mmp-gallery-final-ui/review-method/lexical-query.unit.log`

## 13. 广场分类 + 新版卡片（展示层，不发新 prompt 版本）

- [x] 13.1 父级 `OfficialAgent.category` / `capabilities` + migration `20261106153000_official_agent_gallery_category`
- [x] 13.2 公开卡派生能力标签（toolScope→中文；合并父级能力；≤3）；Admin/导入可改 presentation，不创建 OfficialAgentVersion
- [x] 13.3 Web UI：标题+副文案、横向分类 chips、能力标签卡、推荐问题开聊；保留 data-agent-key
- [x] 13.4 22 卡真实分类 counts：common1 / productivity2 / content9 / sales5 / expertise4 / analytics1
- [x] 13.5 真机 Web 3080 accept 28/28；prompt hash 不变；证据 `/tmp/mmp-gallery-redesign/`

## 14. Admin 列表头像与只读查看（2026-11-06）

- [x] 14.1 Admin present 增加 `avatarUrl`（复用 gallery-avatars；无图 null）
- [x] 14.2 Admin `/admin/official-agents` 表格名称旁 36px 头像/首字；操作列「查看」只读弹窗（草稿默认，可切版本号/发布时间）
- [x] 14.3 单测 `official-agent-admin-avatar.unit.test.ts`；完整 e2e 留给秋池
